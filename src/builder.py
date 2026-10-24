"""
Build the workout-tracker Google Sheet via the Sheets API.
One function per tab; main entry is build_spreadsheet().
"""
from __future__ import annotations
from typing import Any

# ---------------------------------------------------------------------------
# Colour palette (RGB as dicts for the API)
# ---------------------------------------------------------------------------
CLR_HEADER    = {"red": 0.18, "green": 0.29, "blue": 0.44}   # dark blue
CLR_SUBHEADER = {"red": 0.42, "green": 0.62, "blue": 0.82}   # mid blue
CLR_ACCENT    = {"red": 0.97, "green": 0.73, "blue": 0.28}   # amber
CLR_WHITE     = {"red": 1,    "green": 1,    "blue": 1}
CLR_LIGHT     = {"red": 0.93, "green": 0.96, "blue": 1.0}    # pale blue
CLR_FLAG      = {"red": 1.0,  "green": 0.85, "blue": 0.80}   # salmon

FONT_DEFAULT = "Arial"
FONT_SIZE    = 10

# Sheet IDs (assigned at creation; we map tab names → ids after creation)
_SHEET_IDS: dict[str, int] = {}

# Config tab row indices (0-based) — single source of truth shared by
# build_config() (for data placement) and build_named_ranges() (for range
# definitions). Change a value here and both stay in sync.
_CFG_ROW_WEIGHT_INC   = 5   # weight_increment_lb  → named range CFG_WEIGHT_INC
_CFG_ROW_REP_CEILING  = 6   # rep_ceiling (soft)   → named range CFG_REP_CEILING
_CFG_ROW_VOL_COUNTING = 7   # volume_counting      → named range CFG_VOLUME_COUNTING
_CFG_RIR_DATA_START   = 11  # first RIR data row   → named range CFG_RIR_LADDER (start)
_CFG_RIR_DATA_END     = 21  # exclusive; covers up to 10 weeks


# ---------------------------------------------------------------------------
# Low-level helpers
# ---------------------------------------------------------------------------

def _cell(row: int, col: int) -> dict:
    return {"rowIndex": row, "columnIndex": col}


def _range(sheet_id: int, r1: int, c1: int, r2: int, c2: int) -> dict:
    return {
        "sheetId": sheet_id,
        "startRowIndex": r1,
        "endRowIndex": r2,
        "startColumnIndex": c1,
        "endColumnIndex": c2,
    }


def _header_fmt(sheet_id: int, r1: int, c1: int, r2: int, c2: int,
                bg=CLR_HEADER, bold=True, font_size=FONT_SIZE) -> dict:
    return {
        "repeatCell": {
            "range": _range(sheet_id, r1, c1, r2, c2),
            "cell": {
                "userEnteredFormat": {
                    "backgroundColor": bg,
                    "textFormat": {
                        "foregroundColor": CLR_WHITE,
                        "bold": bold,
                        "fontSize": font_size,
                        "fontFamily": FONT_DEFAULT,
                    },
                    "horizontalAlignment": "CENTER",
                    "verticalAlignment": "MIDDLE",
                    "wrapStrategy": "WRAP",
                }
            },
            "fields": "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,wrapStrategy)",
        }
    }


def _freeze(sheet_id: int, rows: int = 1, cols: int = 0) -> dict:
    return {
        "updateSheetProperties": {
            "properties": {
                "sheetId": sheet_id,
                "gridProperties": {"frozenRowCount": rows, "frozenColumnCount": cols},
            },
            "fields": "gridProperties.frozenRowCount,gridProperties.frozenColumnCount",
        }
    }


def _col_width(sheet_id: int, col: int, width_px: int) -> dict:
    return {
        "updateDimensionProperties": {
            "range": {
                "sheetId": sheet_id,
                "dimension": "COLUMNS",
                "startIndex": col,
                "endIndex": col + 1,
            },
            "properties": {"pixelSize": width_px},
            "fields": "pixelSize",
        }
    }


def _row_height(sheet_id: int, row: int, height_px: int) -> dict:
    return {
        "updateDimensionProperties": {
            "range": {
                "sheetId": sheet_id,
                "dimension": "ROWS",
                "startIndex": row,
                "endIndex": row + 1,
            },
            "properties": {"pixelSize": height_px},
            "fields": "pixelSize",
        }
    }


def _dropdown(sheet_id: int, r1: int, c1: int, r2: int, c2: int,
              values: list[str]) -> dict:
    return {
        "setDataValidation": {
            "range": _range(sheet_id, r1, c1, r2, c2),
            "rule": {
                "condition": {
                    "type": "ONE_OF_LIST",
                    "values": [{"userEnteredValue": v} for v in values],
                },
                "showCustomUi": True,
                "strict": True,
            },
        }
    }


def _rows_data(sheet_id: int, start_row: int, rows: list[list[Any]]) -> dict:
    """Build an updateCells request for a 2-D grid of plain values."""
    def _cell_val(v):
        if v is None:
            return {}
        if isinstance(v, bool):
            return {"userEnteredValue": {"boolValue": v}}
        if isinstance(v, (int, float)):
            return {"userEnteredValue": {"numberValue": v}}
        s = str(v)
        if s.startswith("="):
            return {"userEnteredValue": {"formulaValue": s}}
        return {"userEnteredValue": {"stringValue": s}}

    return {
        "updateCells": {
            "start": {"sheetId": sheet_id, "rowIndex": start_row, "columnIndex": 0},
            "rows": [{"values": [_cell_val(c) for c in row]} for row in rows],
            "fields": "userEnteredValue",
        }
    }


def _source_range(sheet_id: int, r1: int, c1: int, r2: int, c2: int) -> dict:
    """Grid range used as a chart data source (different schema from _range)."""
    return {
        "sheetId": sheet_id,
        "startRowIndex": r1,
        "endRowIndex": r2,
        "startColumnIndex": c1,
        "endColumnIndex": c2,
    }


def _chart(sheet_id: int, anchor_row: int, anchor_col: int,
           width_px: int, height_px: int, spec: dict) -> dict:
    """Add an embedded chart anchored at (anchor_row, anchor_col)."""
    return {
        "addChart": {
            "chart": {
                "spec": spec,
                "position": {
                    "overlayPosition": {
                        "anchorCell": {
                            "sheetId": sheet_id,
                            "rowIndex": anchor_row,
                            "columnIndex": anchor_col,
                        },
                        "widthPixels": width_px,
                        "heightPixels": height_px,
                    }
                },
            }
        }
    }


def _merge(sheet_id: int, r1: int, c1: int, r2: int, c2: int) -> dict:
    return {
        "mergeCells": {
            "range": _range(sheet_id, r1, c1, r2, c2),
            "mergeType": "MERGE_ALL",
        }
    }


def _bg(sheet_id: int, r1: int, c1: int, r2: int, c2: int, color: dict) -> dict:
    return {
        "repeatCell": {
            "range": _range(sheet_id, r1, c1, r2, c2),
            "cell": {"userEnteredFormat": {"backgroundColor": color}},
            "fields": "userEnteredFormat.backgroundColor",
        }
    }


# ---------------------------------------------------------------------------
# Tab builders — return (tab_spec, requests)
# ---------------------------------------------------------------------------

def _tab_spec(title: str, tab_color: dict | None = None) -> dict:
    props: dict = {"title": title}
    if tab_color:
        props["tabColorStyle"] = {"rgbColor": tab_color}
    return {"addSheet": {"properties": props}}


# ── CONFIG ──────────────────────────────────────────────────────────────────

def build_config(sid: int, cfg: dict) -> list[dict]:
    """Populate the Config tab with all tunable parameters."""
    weeks       = cfg["mesocycle"]["length_weeks"]
    ladder      = cfg["rir_ladder"]
    rmin        = cfg["rep_range"]["default_min"]
    rmax        = cfg["rep_range"]["default_max"]
    inc         = cfg["weight"]["increment_lb"]
    bump_pct    = cfg["weight"]["bump_pct"]
    ceil1       = cfg["weight"]["rep_ceiling"]
    ceil2       = cfg["weight"]["rep_hard_ceiling"]
    deload      = cfg["mesocycle"]["deload_week"]
    vol_count   = cfg["volume_counting"]

    requests = []

    # --- header row ---
    requests.append(_rows_data(sid, 0, [["Workout Tracker — Configuration"]]))
    requests.append(_header_fmt(sid, 0, 0, 1, 6, bg=CLR_HEADER, font_size=12))
    requests.append(_merge(sid, 0, 0, 1, 6))

    # --- section: Mesocycle ---
    # volume_counting is at row index 7, col B → sheet cell Config!B8
    requests.append(_rows_data(sid, 2, [
        ["MESOCYCLE SETTINGS", "", "", "", "", ""],
        ["mesocycle_weeks",     weeks,      "", "deload_week",      str(deload).upper(), ""],
        ["rep_min",             rmin,       "", "rep_max",          rmax,                ""],
        ["weight_increment_lb", inc,        "", "weight_bump_pct",  f"{int(bump_pct*100)}%", ""],
        ["rep_ceiling",         ceil1,      "", "rep_hard_ceiling", ceil2,               ""],
        ["volume_counting",     vol_count,  "", "Options: full | fractional",            "", ""],
    ]))
    requests.append(_header_fmt(sid, 2, 0, 3, 6, bg=CLR_SUBHEADER))
    requests.append(_merge(sid, 2, 0, 3, 6))
    # Dropdown for volume_counting
    r = _CFG_ROW_VOL_COUNTING
    requests.append(_dropdown(sid, r, 1, r + 1, 2, ["full", "fractional"]))

    # --- section: RIR ladder ---
    rir_header_row = _CFG_RIR_DATA_START - 2  # section title row
    rir_col_hdr    = _CFG_RIR_DATA_START - 1  # column headers row
    requests.append(_rows_data(sid, rir_header_row, [
        ["RIR LADDER", "", "", "", "", ""],
        ["Week", "Target RIR"],
    ]))
    requests.append(_header_fmt(sid, rir_header_row, 0, rir_header_row + 1, 6, bg=CLR_SUBHEADER))
    requests.append(_merge(sid, rir_header_row, 0, rir_header_row + 1, 6))
    requests.append(_header_fmt(sid, rir_col_hdr, 0, rir_col_hdr + 1, 2, bg=CLR_LIGHT, bold=True))
    rir_rows = [[i + 1, ladder[i] if i < len(ladder) else 0] for i in range(weeks)]
    requests.append(_rows_data(sid, _CFG_RIR_DATA_START, rir_rows))

    # --- section: Feedback adjustment lookup ---
    fb_row = _CFG_RIR_DATA_START + weeks + 2
    requests.append(_rows_data(sid, fb_row, [
        ["FEEDBACK ADJUSTMENT RULES"],
        ["Rating", "Category", "Effect"],
        ["great",    "pump",        "+1 rep"],
        ["mid",      "pump",        "+1 rep"],
        ["none",     "pump",        "+2 reps"],
        ["bad",      "tendon",      "hold weight, -1 set, no rep push"],
        ["neutral",  "tendon",      "normal progression"],
        ["good",     "tendon",      "normal progression"],
        ["great",    "connection",  "normal"],
        ["good",     "connection",  "normal"],
        ["not_at_all", "connection", "flag technique; flag swap if 2 weeks in a row"],
        ["none",     "soreness",    "normal"],
        ["mild",     "soreness",    "normal"],
        ["still_sore", "soreness",  "+1 RIR, hold sets; trim set if 2 weeks in a row"],
    ]))
    requests.append(_header_fmt(sid, fb_row, 0, fb_row + 1, 6, bg=CLR_SUBHEADER))
    requests.append(_merge(sid, fb_row, 0, fb_row + 1, 6))
    requests.append(_header_fmt(sid, fb_row + 1, 0, fb_row + 2, 3, bg=CLR_LIGHT, bold=True))

    # --- column widths ---
    for col, px in [(0, 200), (1, 100), (2, 350), (3, 200), (4, 100), (5, 50)]:
        requests.append(_col_width(sid, col, px))

    requests.append(_freeze(sid, 1))
    return requests


# ── NAMED RANGES ────────────────────────────────────────────────────────────

def build_named_ranges(cfg_sid: int) -> list[dict]:
    """Register symbolic Named Ranges for Config cells referenced in cross-tab formulas.

    Formulas use e.g. CFG_WEIGHT_INC instead of Config!$B$6, so a Config row
    insertion only requires updating the _CFG_ROW_* constants above — no formula
    strings need touching.
    """
    def _nr(name: str, r1: int, c1: int, r2: int, c2: int) -> dict:
        return {"addNamedRange": {"namedRange": {
            "name": name,
            "range": _range(cfg_sid, r1, c1, r2, c2),
        }}}

    return [
        _nr("CFG_WEIGHT_INC",      _CFG_ROW_WEIGHT_INC,   1, _CFG_ROW_WEIGHT_INC + 1,   2),
        _nr("CFG_REP_CEILING",     _CFG_ROW_REP_CEILING,  1, _CFG_ROW_REP_CEILING + 1,  2),
        _nr("CFG_VOLUME_COUNTING", _CFG_ROW_VOL_COUNTING, 1, _CFG_ROW_VOL_COUNTING + 1, 2),
        _nr("CFG_RIR_LADDER",      _CFG_RIR_DATA_START,   0, _CFG_RIR_DATA_END,          2),
    ]


# ── EXERCISE LIBRARY ────────────────────────────────────────────────────────

# (Exercise, Primary, Secondary, Tertiary)  — Secondary/Tertiary may be empty string
EXERCISE_LIBRARY: list[tuple[str, str, str, str]] = [
    ("Barbell Back Squat",    "Quads",      "Glutes",     "Hamstrings"),
    ("Leg Press",             "Quads",      "Glutes",     ""),
    ("Bulgarian Split Squat", "Quads",      "Glutes",     "Hamstrings"),
    ("Romanian Deadlift",     "Hamstrings", "Glutes",     "Back"),
    ("Leg Curl",              "Hamstrings", "",           ""),
    ("Hip Thrust",            "Glutes",     "Hamstrings", ""),
    ("Barbell Bench Press",   "Chest",      "Triceps",    "Shoulders"),
    ("Incline DB Press",      "Chest",      "Triceps",    "Shoulders"),
    ("Cable Fly",             "Chest",      "Shoulders",  ""),
    ("Pull-Up",               "Back",       "Biceps",     "Rear Delts"),
    ("Barbell Row",           "Back",       "Biceps",     "Rear Delts"),
    ("Cable Row",             "Back",       "Biceps",     ""),
    ("Lat Pulldown",          "Back",       "Biceps",     ""),
    ("Overhead Press",        "Shoulders",  "Triceps",    ""),
    ("Lateral Raise",         "Shoulders",  "",           ""),
    ("Face Pull",             "Rear Delts", "Shoulders",  ""),
    ("Barbell Curl",          "Biceps",     "",           ""),
    ("Incline DB Curl",       "Biceps",     "",           ""),
    ("Cable Curl",            "Biceps",     "",           ""),
    ("Tricep Pushdown",       "Triceps",    "",           ""),
    ("Overhead Tricep Ext.",  "Triceps",    "",           ""),
    ("Skull Crusher",         "Triceps",    "",           ""),
    ("Calf Raise",            "Calves",     "",           ""),
    ("Ab Wheel",              "Abs",        "",           ""),
    ("Cable Crunch",          "Abs",        "",           ""),
]


def build_exercise_library(sid: int) -> list[dict]:
    requests = []
    requests.append(_rows_data(sid, 0, [["Exercise", "Primary", "Secondary", "Tertiary"]]))
    requests.append(_header_fmt(sid, 0, 0, 1, 4))
    rows = [[name, primary, secondary, tertiary]
            for name, primary, secondary, tertiary in EXERCISE_LIBRARY]
    requests.append(_rows_data(sid, 1, rows))
    for col, px in [(0, 240), (1, 140), (2, 140), (3, 140)]:
        requests.append(_col_width(sid, col, px))
    requests.append(_freeze(sid, 1))
    return requests


# ── PROGRAM ─────────────────────────────────────────────────────────────────

SAMPLE_PROGRAM: list[tuple] = [
    # (exercise, muscle_group, rep_min, rep_max, starting_weight_lb, starting_sets)
    ("Barbell Back Squat",   "Quads",      8, 12, 135, 4),
    ("Romanian Deadlift",    "Hamstrings", 8, 12, 115, 3),
    ("Incline DB Press",     "Chest",      8, 12,  60, 3),
    ("Cable Row",            "Back",       8, 12,  80, 3),
    ("Overhead Press",       "Shoulders",  8, 12,  75, 3),
    ("Barbell Curl",         "Biceps",     8, 12,  55, 3),
    ("Tricep Pushdown",      "Triceps",    8, 12,  50, 3),
]


def build_program(sid: int) -> list[dict]:
    headers = ["Exercise", "Muscle Group", "Rep Min", "Rep Max",
               "Starting Weight (lb)", "Starting Sets"]
    requests = []
    requests.append(_rows_data(sid, 0, [headers]))
    requests.append(_header_fmt(sid, 0, 0, 1, len(headers)))
    rows = [list(r) for r in SAMPLE_PROGRAM]
    requests.append(_rows_data(sid, 1, rows))
    for col, px in [(0, 220), (1, 150), (2, 90), (3, 90), (4, 170), (5, 130)]:
        requests.append(_col_width(sid, col, px))
    requests.append(_freeze(sid, 1))
    return requests


# ── SESSION ──────────────────────────────────────────────────────────────────
# Wide-format training log. One row per exercise; weeks run across columns.
# Column layout: Exercise | Day | (Wk1 Wt | Wk1 Reps | Wk1 Sets) × N_weeks
# First 2 columns and header row are frozen so exercise names stay visible on mobile.

# Day groupings that pre-populate the Session tab.
# Tuple: (exercise_name, starting_weight_lb, starting_reps, starting_sets)
SESSION_DAYS: list[tuple[str, list]] = [
    ("Day A", [
        ("Barbell Back Squat", 135, 10, 4),
        ("Romanian Deadlift",  115, 10, 3),
    ]),
    ("Day B", [
        ("Incline DB Press",   60, 10, 3),
        ("Cable Row",          80, 10, 3),
        ("Overhead Press",     75, 10, 3),
    ]),
    ("Day C", [
        ("Barbell Curl",       55, 10, 3),
        ("Tricep Pushdown",    50, 10, 3),
    ]),
]

_DAY_COLORS = [
    {"red": 0.13, "green": 0.55, "blue": 0.35},  # green  — Day A
    {"red": 0.13, "green": 0.37, "blue": 0.68},  # blue   — Day B
    {"red": 0.65, "green": 0.28, "blue": 0.16},  # rust   — Day C
]


def build_session(sid: int, cfg: dict) -> list[dict]:
    weeks = cfg["mesocycle"]["length_weeks"]
    requests = []

    # ── Header row ──────────────────────────────────────────────────────────
    wk_headers = []
    for w in range(1, weeks + 1):
        wk_headers += [f"Wk{w} Wt (lb)", f"Wk{w} Reps", f"Wk{w} Sets"]
    headers = ["Exercise", "Day"] + wk_headers
    n_cols = len(headers)

    requests.append(_rows_data(sid, 0, [headers]))
    # Alternating dark/light header bands per week block
    requests.append(_header_fmt(sid, 0, 0, 1, 2))
    for w in range(weeks):
        col = 2 + w * 3
        bg = CLR_HEADER if w % 2 == 0 else CLR_SUBHEADER
        requests.append(_header_fmt(sid, 0, col, 1, col + 3, bg=bg))

    # ── Day sections ────────────────────────────────────────────────────────
    row_idx = 1
    for (day, exercises), day_color in zip(SESSION_DAYS, _DAY_COLORS):
        # Day section header — full-width colored bar
        requests.append(_rows_data(sid, row_idx, [[day] + [""] * (n_cols - 1)]))
        requests.append({
            "repeatCell": {
                "range": _range(sid, row_idx, 0, row_idx + 1, n_cols),
                "cell": {
                    "userEnteredFormat": {
                        "backgroundColor": day_color,
                        "textFormat": {
                            "foregroundColor": CLR_WHITE,
                            "bold": True,
                            "fontSize": 11,
                            "fontFamily": FONT_DEFAULT,
                        },
                        "horizontalAlignment": "LEFT",
                        "verticalAlignment": "MIDDLE",
                    }
                },
                "fields": "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)",
            }
        })
        # No merge here — merging across all columns conflicts with the 2-column freeze.
        # The repeatCell background colour already spans the full row visually.
        row_idx += 1

        for ex_name, start_wt, start_reps, start_sets in exercises:
            # Week 1 pre-filled with sample data; rest blank
            row = [ex_name, day, start_wt, start_reps, start_sets]
            row += [""] * ((weeks - 1) * 3)
            requests.append(_rows_data(sid, row_idx, [row]))
            row_idx += 1

    # ── Column widths ────────────────────────────────────────────────────────
    requests.append(_col_width(sid, 0, 220))
    requests.append(_col_width(sid, 1, 80))
    for w in range(weeks):
        base = 2 + w * 3
        requests.append(_col_width(sid, base,     90))   # weight
        requests.append(_col_width(sid, base + 1, 65))   # reps
        requests.append(_col_width(sid, base + 2, 65))   # sets

    requests.append(_freeze(sid, 1, 2))
    return requests


# ── FEEDBACK ────────────────────────────────────────────────────────────────

def build_feedback(sid: int) -> list[dict]:
    # Col E=Soreness, F=Pump, G=Tendon, H=Connection — keep these stable; formulas reference them by letter.
    # Col I=Actual RIR (numeric, added at the end so existing column references don't shift).
    headers = ["Date", "Week", "Exercise", "Muscle Group",
               "Soreness (before)", "Pump (after)", "Tendon/Joint (after)", "Connection (after)",
               "Actual RIR"]
    requests = []
    requests.append(_rows_data(sid, 0, [headers]))
    requests.append(_header_fmt(sid, 0, 0, 1, len(headers)))

    sample = [
        ["2026-11-03", 1, "Barbell Back Squat", "Quads", "none",  "great", "good",    "great", 3],
        ["2026-11-03", 1, "Incline DB Press",   "Chest", "mild",  "mid",   "neutral", "good",  2],
    ]
    requests.append(_rows_data(sid, 1, sample))

    # Dropdowns (rows 1..500)
    requests.append(_dropdown(sid, 1, 4, 500, 5, ["none", "mild", "still_sore"]))
    requests.append(_dropdown(sid, 1, 5, 500, 6, ["great", "mid", "none"]))
    requests.append(_dropdown(sid, 1, 6, 500, 7, ["good", "neutral", "bad"]))
    requests.append(_dropdown(sid, 1, 7, 500, 8, ["great", "good", "not_at_all"]))

    for col, px in [(0, 110), (1, 60), (2, 220), (3, 150), (4, 150), (5, 120), (6, 170), (7, 160), (8, 100)]:
        requests.append(_col_width(sid, col, px))
    requests.append(_freeze(sid, 1))
    return requests


# ── NEXT WEEK ───────────────────────────────────────────────────────────────

def build_next_week(sid: int, cfg: dict) -> list[dict]:
    """
    Next Week tab.
    Column layout: A=Exercise | B=Muscle | C=Last Wk Reps | D=Last Wk Weight |
                   E=Target RIR | F=Rec. Weight (amber, editable) | G=Rec. Reps |
                   H=Rec. Sets | I=Flags    J=blank | K=label | L=Current Week

    Data source: Session tab (wide format) via OFFSET lookups.
    Config values accessed via named ranges (see build_named_ranges):
      CFG_WEIGHT_INC, CFG_REP_CEILING, CFG_RIR_LADDER
    """
    headers = [
        "Exercise", "Muscle Group",
        "Last Wk Reps", "Last Wk Weight (lb)",
        "Target RIR", "Rec. Weight (lb)", "Rec. Reps", "Rec. Sets",
        "Flags / Notes"
    ]
    requests = []
    # Header row with "Current Week" control embedded at the end
    requests.append(_rows_data(sid, 0, [headers + ["", "Current Week →", 1]]))
    requests.append(_header_fmt(sid, 0, 0, 1, 9))

    # ── Config cell constants ───────────────────────────────────────────────
    CW        = "$L$1"              # current week (user editable)
    CFG_INC   = "CFG_WEIGHT_INC"   # named range → Config weight_increment_lb
    CFG_RCEIL = "CFG_REP_CEILING"  # named range → Config rep_ceiling (soft)

    # ── Per-exercise formula builder ────────────────────────────────────────
    def exercise_row(row: int, ex: str, muscle: str) -> list:
        r = row + 1  # 1-based sheet row

        # Session!$C$2 = top-left data cell (Wk1 Weight for first exercise row).
        # MATCH finds the exercise's position in Session col A (rows 2..200).
        # OFFSET then jumps to the correct week's block:
        #   col offset for last-week weight = (CW-2)*3
        #   col offset for last-week reps   = (CW-2)*3 + 1
        #   col offset for last-week sets   = (CW-2)*3 + 2
        # IFERROR silently returns "" when CW=1 (no previous week yet).
        mx = f"(MATCH(A{r},Session!$A$2:$A$200,0)-1)"
        last_reps   = f'=IFERROR(OFFSET(Session!$C$2,{mx},({CW}-2)*3+1),"")'
        last_weight = f'=IFERROR(OFFSET(Session!$C$2,{mx},({CW}-2)*3),"")'
        last_sets_x =  f'IFERROR(OFFSET(Session!$C$2,{mx},({CW}-2)*3+2),0)'  # inline, no leading =

        # Target RIR from Config ladder; +1 if still sore this week
        soreness_f = f'IFERROR(INDEX(Feedback!E:E,MATCH(1,(Feedback!D:D=B{r})*(Feedback!B:B={CW}),0)),"")'
        target_rir = (
            f'=IFERROR(VLOOKUP({CW},CFG_RIR_LADDER,2,FALSE),0)'
            f'+IF({soreness_f}="still_sore",1,0)'
        )

        # Feedback lookups for this exercise / current week
        pump_f   = f'IFERROR(INDEX(Feedback!F:F,MATCH(1,(Feedback!C:C=A{r})*(Feedback!B:B={CW}),0)),"")'
        tendon_f = f'IFERROR(INDEX(Feedback!G:G,MATCH(1,(Feedback!C:C=A{r})*(Feedback!B:B={CW}),0)),"")'

        # Rep addition from pump (inline expression embedded in formulas below)
        pump_add = f'IF({pump_f}="none",2,1)'

        # Candidate reps = last reps + pump bonus; drives the weight-bump decision
        cand_reps = f'(C{r}+{pump_add})'

        # Rec. Weight: bump if candidate reps hit the ceiling; else hold
        rec_weight = (
            f'=IFERROR(IF({tendon_f}="bad",D{r},'
            f'IF({cand_reps}>={CFG_RCEIL},'
            f'MAX(ROUND(D{r}*1.05/{CFG_INC},0)*{CFG_INC},D{r}+{CFG_INC}),'
            f'D{r})),"")'
        )

        # Rec. Reps: volume-matched to new weight if bump fired; else pump-based
        rec_reps = (
            f'=IFERROR(IF({tendon_f}="bad",C{r},'
            f'IF(F{r}>D{r},'
            f'MAX(1,INT((D{r}*C{r})/F{r})),'
            f'C{r}+{pump_add})),"")'
        )

        # Rec. Sets: drop 1 if tendon bad, else carry forward last week's sets
        rec_sets = f'=IFERROR(IF({tendon_f}="bad",MAX(1,{last_sets_x}-1),{last_sets_x}),"")'

        # Flags
        flags = (
            f'=IFERROR(TEXTJOIN(", ",TRUE,'
            f'IF({tendon_f}="bad","⚠ TENDON: maintenance",""),'
            f'IF({pump_f}="none","↑ LOW PUMP",""),'
            f'IF({soreness_f}="still_sore","😴 STILL SORE","")'
            f'),"")'
        )
        return [ex, muscle, last_reps, last_weight, target_rir,
                rec_weight, rec_reps, rec_sets, flags]

    # Build one row per exercise, in the same day order as Session tab
    exercises = [
        (ex, muscle)
        for _, exercises in SESSION_DAYS
        for ex, *_ in exercises
        for muscle in [next(
            (p for n, p, *_ in EXERCISE_LIBRARY if n == ex), ""
        )]
    ]
    prog_rows = [exercise_row(i + 1, ex, m) for i, (ex, m) in enumerate(exercises)]
    requests.append(_rows_data(sid, 1, prog_rows))

    # Amber = user-editable weight override
    requests.append(_bg(sid, 1, 5, len(prog_rows) + 1, 6, CLR_ACCENT))
    note_row = len(prog_rows) + 2
    requests.append(_rows_data(sid, note_row, [
        ["", "", "", "", "", "← edit amber cells to override weight; reps recalculate", "", "", ""]
    ]))

    for col, px in [(0, 220), (1, 140), (2, 110), (3, 140), (4, 100),
                    (5, 140), (6, 100), (7, 100), (8, 300)]:
        requests.append(_col_width(sid, col, px))
    requests.append(_freeze(sid, 1))
    return requests


# ── WEEKLY VOLUME ────────────────────────────────────────────────────────────

def build_weekly_volume(sid: int, cfg: dict) -> list[dict]:
    """
    Pivot: rows = muscle groups, columns = weeks.
    Counting mode is read live from Config!B8 ("full" or "fractional").
      full       — primary/secondary/tertiary each count as 1 set
      fractional — primary=1.0, secondary=0.5, tertiary=0.25
    """
    weeks = cfg["mesocycle"]["length_weeks"]

    # Include every muscle that appears in any column of the library
    muscle_groups = sorted({
        m
        for _, primary, secondary, tertiary in EXERCISE_LIBRARY
        for m in (primary, secondary, tertiary)
        if m
    })

    headers = ["Muscle Group"] + [f"Wk {w+1}" for w in range(weeks)] + ["Total"]
    requests = []
    requests.append(_rows_data(sid, 0, [headers]))
    requests.append(_header_fmt(sid, 0, 0, 1, len(headers)))

    # Named range for volume_counting (dropdown: full | fractional)
    CFG_VOL = "CFG_VOLUME_COUNTING"

    # Session tab sets columns: Wk1 Sets=E, Wk2 Sets=H, Wk3 Sets=K, ...
    # Col index (0-based): 2 + (w-1)*3 + 2 = w*3 + 1  → sheet col letter = chr(69 + (w-1)*3)
    # (chr(69)='E', chr(72)='H', chr(75)='K', chr(78)='N', chr(81)='Q', chr(84)='T')

    rows = []
    for mg in muscle_groups:
        week_cells = []
        for w in range(1, weeks + 1):
            EL       = "'Exercise Library'"
            A_range  = "Session!$A$2:$A$200"
            sets_col = chr(69 + (w - 1) * 3)  # E for wk1, H for wk2, …
            sets_rng = f"IFERROR(Session!${sets_col}$2:${sets_col}$200*1,0)"

            match_pri = f'(IFERROR(VLOOKUP({A_range},{EL}!$A:$B,2,FALSE),"")="{mg}")'
            match_sec = f'(IFERROR(VLOOKUP({A_range},{EL}!$A:$C,3,FALSE),"")="{mg}")'
            match_ter = f'(IFERROR(VLOOKUP({A_range},{EL}!$A:$D,4,FALSE),"")="{mg}")'

            full_sp = (
                f'IFERROR(SUMPRODUCT({sets_rng}*(({match_pri}+{match_sec}+{match_ter})>0)),0)'
            )
            frac_sp = (
                f'IFERROR(SUMPRODUCT({sets_rng}*({match_pri}*1+{match_sec}*0.5+{match_ter}*0.25)),0)'
            )
            formula = f'=IF({CFG_VOL}="fractional",{frac_sp},{full_sp})'
            week_cells.append(formula)

        end_col = chr(ord("B") + weeks - 1)
        total   = f"=SUM(B{len(rows)+2}:{end_col}{len(rows)+2})"
        rows.append([mg] + week_cells + [total])

    requests.append(_rows_data(sid, 1, rows))
    requests.append(_header_fmt(sid, 1, 0, len(rows) + 1, 1, bg=CLR_LIGHT, bold=True))

    for col, px in [(0, 160)] + [(c + 1, 70) for c in range(weeks)] + [(weeks + 1, 70)]:
        requests.append(_col_width(sid, col, px))
    requests.append(_freeze(sid, 1, 1))
    return requests


# ── HELP ────────────────────────────────────────────────────────────────────

def build_help(sid: int) -> list[dict]:
    """
    User guide tab. Two-column layout: Label (col A) | Explanation (col B).
    Section headers span both columns.
    """
    requests = []

    # Content: ("label", "explanation") or ("HEADER", title) or ("NOTE", text)
    content = [
        ("HEADER", "Workout Tracker — User Guide"),

        ("HEADER", "How to use this sheet each session"),
        ("1. Before training",   "Open the Feedback tab → add a row for each exercise you plan to do → set the Soreness dropdown for that muscle group."),
        ("2. During training",   "Use the Next Week tab to see your target weight, reps, and sets. After each exercise, update the Session tab — find your exercise row and fill in the current week's Weight, Reps, and Sets columns."),
        ("3. After each exercise", "Return to the Feedback tab → fill in the Pump, Tendon/Joint, Connection, and Actual RIR for that exercise."),
        ("4. End of week",       "Update the Current Week number in the Next Week tab (cell L1) to the next week number. All recommendations recalculate automatically."),
        ("5. End of mesocycle",  "Re-run the Python script to generate a fresh sheet for the next block. See the README for instructions."),

        ("HEADER", "Tab guide"),
        ("Help (this tab)",      "Reference guide — you are here."),
        ("Config",               "All rules and numeric settings. Edit values here to tune progression without touching formulas."),
        ("Exercise Library",     "Maps exercises to muscle groups. Add any exercise you use here before referencing it in Program or Log."),
        ("Program",              "Your current mesocycle's exercises with rep ranges, starting weight, and sets."),
        ("Session",              "Your training log. One row per exercise, days grouped with colored headers, weeks across columns. Fill in Weight, Reps, and Sets for the current week's columns."),
        ("Future Plan",         "Planning scratchpad for your next mesocycle. Fill this in while the current block is running so you're ready to go when you regenerate the sheet."),
        ("Feedback",             "Record how each exercise felt: soreness before training, pump/tendon/connection after each exercise."),
        ("Next Week",            "Auto-calculated targets for next session. Amber weight cells are editable — reps recalculate from your override."),
        ("Weekly Volume",        "Total sets per muscle group per week. Use this to spot under- or over-training across the mesocycle."),

        ("HEADER", "Dropdown options"),
        ("Soreness (before) — none",        "No soreness in the muscle. Train as planned."),
        ("Soreness (before) — mild",         "Some soreness but not limiting. Train as planned."),
        ("Soreness (before) — still_sore",   "Muscle hasn't recovered. Target RIR is one step easier and set count is held. Two weeks in a row trims a set."),
        ("Pump (after) — great",             "Strong muscle pump. +1 rep added to next week's target."),
        ("Pump (after) — mid",               "Decent pump. +1 rep added to next week's target."),
        ("Pump (after) — none",              "No pump. +2 reps added to push stimulus harder."),
        ("Tendon/Joint (after) — good",      "No issues. Normal progression."),
        ("Tendon/Joint (after) — neutral",   "Nothing notable. Normal progression."),
        ("Tendon/Joint (after) — bad",       "Pain or discomfort. Triggers a maintenance week: hold weight, drop one set, no rep push."),
        ("Connection (after) — great",       "Felt the target muscle working clearly. Normal progression."),
        ("Connection (after) — good",        "Decent mind-muscle connection. Normal progression."),
        ("Connection (after) — not_at_all",  "Couldn't feel the target muscle. Flags for a technique check. Two weeks in a row flags for an exercise swap."),

        ("HEADER", "Reading the Next Week tab"),
        ("Current Week (cell L1)", "Update this each week — it drives all the recommendations. Week 1 = first week of the mesocycle."),
        ("Last Wk Avg Reps",       "Average reps across all logged sets for that exercise last week."),
        ("Last Wk Weight",         "The highest weight logged for that exercise last week."),
        ("Target RIR",             "How hard to push this week. Lower = harder (0 = all-out/failure)."),
        ("Rec. Weight (amber)",    "Recommended weight for next week. This cell is editable — type your override and Rec. Reps will recalculate automatically from that weight."),
        ("Rec. Reps",              "Target reps. Volume-matched to the recommended weight if the weight changed; pump-based if weight held."),
        ("Rec. Sets",              "Target sets. May be lower than last week if tendon pain was reported."),
        ("Flags / Notes",          "Warnings from last week's feedback. Always read these before training."),

        ("HEADER", "Flags explained"),
        ("⚠ TENDON: maintenance",           "You reported joint/tendon pain last week. Hold the weight, drop one set, and don't push reps this week."),
        ("↑ LOW PUMP",                        "Pump was 'none' last week. Rep target is bumped +2 to push the stimulus."),
        ("😴 STILL SORE",                     "The muscle group wasn't recovered before last session. Target RIR is one step easier this week."),
        ("CONNECTION: check technique",       "You couldn't feel the target muscle last week. Review your form before adding load."),
        ("CONNECTION: consider swap",         "Two weeks in a row with poor connection. Consider swapping to a different exercise for this muscle."),
        ("UNDER_RECOVERED: trim a set",       "The muscle group was still sore two weeks running. Consider dropping one set to allow more recovery."),

        ("HEADER", "Mobile tips"),
        ("Use the dropdowns",        "Tap the cell and choose from the list — don't type values manually. The formulas only recognise the exact dropdown text."),
        ("Frozen headers",           "Every tab has frozen header rows so the column labels stay visible as you scroll down."),
        ("Where you spend most time","Log and Feedback during a session. Next Week before you start lifting."),
        ("Amber = editable",         "Only the amber Rec. Weight cells and the Current Week cell (L1) in Next Week are meant to be overridden. Everything else is formula-driven."),
        ("Offline",                  "Google Sheets on iOS caches the sheet for offline use after you open it on a connection. Changes sync when you're back online."),
    ]

    # Build rows + formatting requests
    row_idx = 0
    col_a_width = 260
    col_b_width = 520

    for item in content:
        kind, text = item[0], item[1]

        if kind == "HEADER":
            requests.append(_rows_data(sid, row_idx, [[text, ""]]))
            requests.append(_header_fmt(sid, row_idx, 0, row_idx + 1, 2,
                                        bg=CLR_HEADER, font_size=11))
            requests.append(_merge(sid, row_idx, 0, row_idx + 1, 2))
            row_idx += 1
        else:
            requests.append(_rows_data(sid, row_idx, [[kind, text]]))
            # Alternate light background every other content row
            if row_idx % 2 == 0:
                requests.append(_bg(sid, row_idx, 0, row_idx + 1, 2, CLR_LIGHT))
            # Bold the label in col A
            requests.append({
                "repeatCell": {
                    "range": _range(sid, row_idx, 0, row_idx + 1, 1),
                    "cell": {
                        "userEnteredFormat": {
                            "textFormat": {"bold": True, "fontFamily": FONT_DEFAULT,
                                           "fontSize": FONT_SIZE},
                            "wrapStrategy": "WRAP",
                            "verticalAlignment": "TOP",
                        }
                    },
                    "fields": "userEnteredFormat(textFormat,wrapStrategy,verticalAlignment)",
                }
            })
            # Wrap the explanation in col B
            requests.append({
                "repeatCell": {
                    "range": _range(sid, row_idx, 1, row_idx + 1, 2),
                    "cell": {
                        "userEnteredFormat": {
                            "wrapStrategy": "WRAP",
                            "verticalAlignment": "TOP",
                            "textFormat": {"fontFamily": FONT_DEFAULT, "fontSize": FONT_SIZE},
                        }
                    },
                    "fields": "userEnteredFormat(wrapStrategy,verticalAlignment,textFormat)",
                }
            })
            row_idx += 1

    requests.append(_col_width(sid, 0, col_a_width))
    requests.append(_col_width(sid, 1, col_b_width))
    # Auto-height isn't directly settable; set a generous default row height
    requests.append({
        "updateDimensionProperties": {
            "range": {"sheetId": sid, "dimension": "ROWS",
                      "startIndex": 0, "endIndex": row_idx},
            "properties": {"pixelSize": 48},
            "fields": "pixelSize",
        }
    })
    # Header rows are single-line — shrink them back
    for i, item in enumerate(content):
        if item[0] == "HEADER":
            requests.append(_row_height(sid, i, 36))

    requests.append(_freeze(sid, 1))
    return requests


# ── VOLUME VISUAL ────────────────────────────────────────────────────────────

def build_volume_visual(sid: int, cfg: dict) -> list[dict]:
    """
    Two charts sourced from Weekly Volume tab:
      Chart 1 (line)  — sets per week per muscle group (trend over the mesocycle)
      Chart 2 (bar)   — total sets per muscle group (full mesocycle summary)

    A transposed data table and a totals table live in this tab so the charts
    have a clean local source rather than cross-tab range gymnastics.
    """
    weeks = cfg["mesocycle"]["length_weeks"]
    muscle_groups = sorted({
        m for _, p, s, t in EXERCISE_LIBRARY for m in (p, s, t) if m
    })
    n_m = len(muscle_groups)
    wv_sid = _SHEET_IDS["Weekly Volume"]

    requests = []

    # ── Title ────────────────────────────────────────────────────────────────
    requests.append(_rows_data(sid, 0, [["Weekly Volume Dashboard"]]))
    requests.append(_header_fmt(sid, 0, 0, 1, n_m + 2, bg=CLR_HEADER, font_size=12))
    requests.append(_merge(sid, 0, 0, 1, n_m + 2))

    # ── Per-week transposed data table ────────────────────────────────────────
    # Rows: weeks (X-axis for line chart)
    # Cols: muscle groups (one series each)
    # Source: formula refs into Weekly Volume tab
    #   Weekly Volume layout: row 0=headers, rows 1..n_m=data
    #   Col 0=Muscle Group, cols 1..weeks=week data, col weeks+1=Total
    PW_START = 2   # row index of per-week section header
    PW_HDR   = 3   # row index of column headers
    PW_DATA  = 4   # first data row

    requests.append(_rows_data(sid, PW_START, [["PER-WEEK SETS BY MUSCLE GROUP"]]))
    requests.append(_header_fmt(sid, PW_START, 0, PW_START + 1, n_m + 1, bg=CLR_SUBHEADER))
    requests.append(_merge(sid, PW_START, 0, PW_START + 1, n_m + 1))

    pw_header = ["Week"] + [f"='Weekly Volume'!A{i + 2}" for i in range(n_m)]
    requests.append(_rows_data(sid, PW_HDR, [pw_header]))
    requests.append(_header_fmt(sid, PW_HDR, 0, PW_HDR + 1, n_m + 1, bg=CLR_LIGHT, bold=True))

    week_rows = []
    for w in range(1, weeks + 1):
        wv_col = chr(ord("B") + w - 1)   # B=Wk1, C=Wk2, …
        row = [f"Wk {w}"] + [f"='Weekly Volume'!{wv_col}{i + 2}" for i in range(n_m)]
        week_rows.append(row)
    requests.append(_rows_data(sid, PW_DATA, week_rows))

    # ── Total-sets summary table ──────────────────────────────────────────────
    total_col = chr(ord("B") + weeks)     # col letter for the Total column in Weekly Volume
    TOT_START = PW_DATA + weeks + 1
    TOT_HDR   = TOT_START + 1
    TOT_DATA  = TOT_START + 2

    requests.append(_rows_data(sid, TOT_START, [["TOTAL SETS PER MUSCLE GROUP (MESOCYCLE)"]]))
    requests.append(_header_fmt(sid, TOT_START, 0, TOT_START + 1, 2, bg=CLR_SUBHEADER))
    requests.append(_merge(sid, TOT_START, 0, TOT_START + 1, 2))

    requests.append(_rows_data(sid, TOT_HDR, [["Muscle Group", "Total Sets"]]))
    requests.append(_header_fmt(sid, TOT_HDR, 0, TOT_HDR + 1, 2, bg=CLR_LIGHT, bold=True))

    tot_rows = [
        [f"='Weekly Volume'!A{i + 2}", f"='Weekly Volume'!{total_col}{i + 2}"]
        for i in range(n_m)
    ]
    requests.append(_rows_data(sid, TOT_DATA, tot_rows))

    # ── Chart 1: line chart — sets per week per muscle group ──────────────────
    # Domain: per-week table, col 0 (week labels), rows PW_HDR..PW_DATA+weeks
    # Series: one per muscle group
    domain_end = PW_DATA + weeks
    c1_domain = _source_range(sid, PW_HDR, 0, domain_end + 1, 1)
    c1_series = [
        _source_range(sid, PW_HDR, i + 1, domain_end + 1, i + 2)
        for i in range(n_m)
    ]
    requests.append(_chart(sid, 1, 0, 620, 340, {
        "title": "Sets per Week by Muscle Group",
        "basicChart": {
            "chartType": "LINE",
            "legendPosition": "BOTTOM_LEGEND",
            "axis": [
                {"position": "BOTTOM_AXIS", "title": "Week"},
                {"position": "LEFT_AXIS",   "title": "Sets"},
            ],
            "domains": [{"domain": {"sourceRange": {"sources": [c1_domain]}}}],
            "series": [
                {"series": {"sourceRange": {"sources": [s]}}, "targetAxis": "LEFT_AXIS"}
                for s in c1_series
            ],
            "headerCount": 1,
        },
    }))

    # ── Chart 2: horizontal bar chart — total sets per muscle group ───────────
    # Domain: totals table col 0 (muscle names), rows TOT_HDR..TOT_DATA+n_m
    # Series: col 1 (total sets)
    c2_domain = _source_range(sid, TOT_HDR, 0, TOT_DATA + n_m, 1)
    c2_series = _source_range(sid, TOT_HDR, 1, TOT_DATA + n_m, 2)
    requests.append(_chart(sid, 1, 9, 460, 340, {
        "title": "Total Sets per Muscle Group",
        "basicChart": {
            "chartType": "BAR",
            "legendPosition": "NO_LEGEND",
            "axis": [
                {"position": "BOTTOM_AXIS", "title": "Sets"},
                {"position": "LEFT_AXIS",   "title": "Muscle Group"},
            ],
            "domains": [{"domain": {"sourceRange": {"sources": [c2_domain]}}}],
            "series": [
                {"series": {"sourceRange": {"sources": [c2_series]}}, "targetAxis": "BOTTOM_AXIS"}
            ],
            "headerCount": 1,
        },
    }))

    requests.append(_col_width(sid, 0, 90))
    for i in range(n_m):
        requests.append(_col_width(sid, i + 1, 80))

    requests.append(_freeze(sid, 1))
    return requests


# ── DASHBOARD ─────────────────────────────────────────────────────────────────

def build_dashboard(sid: int, cfg: dict) -> list[dict]:
    """
    Exercise-level progress dashboard.
    Cell B2 = exercise selector dropdown.
    Rows 4-9 = dynamic data table (OFFSET formulas → Session tab).
    Two line charts (weight trend, volume trend) update when B2 changes.
    """
    weeks = cfg["mesocycle"]["length_weeks"]
    requests = []

    # ── Title + selector ─────────────────────────────────────────────────────
    requests.append(_rows_data(sid, 0, [["Exercise Progress Dashboard"]]))
    requests.append(_header_fmt(sid, 0, 0, 1, 5, bg=CLR_HEADER, font_size=12))
    requests.append(_merge(sid, 0, 0, 1, 5))

    requests.append(_rows_data(sid, 1, [["Select Exercise:", "Barbell Back Squat", "", "", ""]]))
    requests.append({
        "repeatCell": {
            "range": _range(sid, 1, 0, 2, 1),
            "cell": {"userEnteredFormat": {"textFormat": {"bold": True, "fontFamily": FONT_DEFAULT}}},
            "fields": "userEnteredFormat.textFormat",
        }
    })
    # Dropdown populated from Exercise Library
    all_exercises = [ex for ex, *_ in EXERCISE_LIBRARY]
    requests.append(_dropdown(sid, 1, 1, 2, 2, all_exercises))

    # ── Data table ────────────────────────────────────────────────────────────
    # Row 3: headers    Row 4..4+weeks-1: data (week 1..N)
    DATA_HDR  = 3
    DATA_ROW0 = 4
    DATA_END  = DATA_ROW0 + weeks   # exclusive row index

    requests.append(_rows_data(sid, DATA_HDR,
        [["Week", "Weight (lb)", "Reps", "Sets", "Volume (lb · reps · sets)"]]))
    requests.append(_header_fmt(sid, DATA_HDR, 0, DATA_HDR + 1, 5))

    EX = "$B$2"   # selected exercise cell
    data_rows = []
    for w in range(1, weeks + 1):
        r  = DATA_ROW0 + w            # 1-based sheet row
        mx = f"(MATCH({EX},Session!$A$2:$A$200,0)-1)"
        co = (w - 1) * 3             # column offset into Session week block
        wt   = f"=IFERROR(OFFSET(Session!$C$2,{mx},{co})*1,0)"
        reps = f"=IFERROR(OFFSET(Session!$C$2,{mx},{co}+1)*1,0)"
        sets = f"=IFERROR(OFFSET(Session!$C$2,{mx},{co}+2)*1,0)"
        vol  = f"=IFERROR(B{r}*C{r}*D{r},0)"
        data_rows.append([w, wt, reps, sets, vol])
    requests.append(_rows_data(sid, DATA_ROW0, data_rows))

    # ── Charts ────────────────────────────────────────────────────────────────
    domain = _source_range(sid, DATA_HDR, 0, DATA_END, 1)   # Week col incl. header

    # Chart 1: weight over weeks
    requests.append(_chart(sid, DATA_END + 1, 0, 440, 300, {
        "title": "Weight Progression",
        "basicChart": {
            "chartType": "LINE",
            "legendPosition": "NO_LEGEND",
            "axis": [
                {"position": "BOTTOM_AXIS", "title": "Week"},
                {"position": "LEFT_AXIS",   "title": "Weight (lb)"},
            ],
            "domains": [{"domain": {"sourceRange": {"sources": [domain]}}}],
            "series": [{
                "series": {"sourceRange": {"sources": [_source_range(sid, DATA_HDR, 1, DATA_END, 2)]}},
                "targetAxis": "LEFT_AXIS",
            }],
            "headerCount": 1,
        },
    }))

    # Chart 2: volume over weeks
    requests.append(_chart(sid, DATA_END + 1, 5, 440, 300, {
        "title": "Volume Progression  (weight × reps × sets)",
        "basicChart": {
            "chartType": "LINE",
            "legendPosition": "NO_LEGEND",
            "axis": [
                {"position": "BOTTOM_AXIS", "title": "Week"},
                {"position": "LEFT_AXIS",   "title": "Volume"},
            ],
            "domains": [{"domain": {"sourceRange": {"sources": [domain]}}}],
            "series": [{
                "series": {"sourceRange": {"sources": [_source_range(sid, DATA_HDR, 4, DATA_END, 5)]}},
                "targetAxis": "LEFT_AXIS",
            }],
            "headerCount": 1,
        },
    }))

    for col, px in [(0, 65), (1, 120), (2, 80), (3, 80), (4, 220)]:
        requests.append(_col_width(sid, col, px))

    requests.append(_freeze(sid, 1))
    return requests


# ── HISTORY ───────────────────────────────────────────────────────────────────

def build_history(sid: int) -> list[dict]:
    """
    Long-format archive of past mesocycles, populated by src/archive.py.
    Schema: one row per exercise per week per mesocycle.
    """
    requests = []
    headers = [
        "Mesocycle", "Archived Date", "Exercise", "Day", "Primary Muscle",
        "Week", "Weight (lb)", "Reps", "Sets", "Volume (lb·reps·sets)",
    ]
    n = len(headers)

    title = "Mesocycle History  —  run: uv run python src/archive.py"
    requests.append(_rows_data(sid, 0, [[title] + [""] * (n - 1)]))
    requests.append(_header_fmt(sid, 0, 0, 1, n, bg=CLR_HEADER, font_size=11))
    requests.append(_merge(sid, 0, 0, 1, n))

    requests.append(_rows_data(sid, 1, [headers]))
    requests.append(_header_fmt(sid, 1, 0, 2, n))

    for col, px in [
        (0, 160), (1, 120), (2, 220), (3, 80), (4, 140),
        (5, 60),  (6, 110), (7, 70),  (8, 70), (9, 180),
    ]:
        requests.append(_col_width(sid, col, px))

    requests.append(_freeze(sid, 2))
    return requests


# ── FUTURE PLAN ──────────────────────────────────────────────────────────────

def build_future_plan(sid: int) -> list[dict]:
    """
    Planning scratchpad for the next mesocycle.
    Fill this in while working through the current block, then use it as the
    basis for regenerating the sheet at the start of a new mesocycle.
    """
    requests = []
    title = "Next Mesocycle Plan — fill this in before your current block ends"
    headers = ["Exercise", "Day", "Rep Min", "Rep Max",
               "Starting Weight (lb)", "Starting Sets", "Notes"]
    n = len(headers)

    requests.append(_rows_data(sid, 0, [[title] + [""] * (n - 1)]))
    requests.append(_header_fmt(sid, 0, 0, 1, n, bg=CLR_HEADER, font_size=11))
    requests.append(_merge(sid, 0, 0, 1, n))

    requests.append(_rows_data(sid, 1, [headers]))
    requests.append(_header_fmt(sid, 1, 0, 2, n))

    # 20 blank rows for the user to fill in
    requests.append(_rows_data(sid, 2, [[""] * n for _ in range(20)]))

    # Light alternating rows
    for row in range(2, 22):
        if row % 2 == 0:
            requests.append(_bg(sid, row, 0, row + 1, n, CLR_LIGHT))

    for col, px in [(0, 220), (1, 80), (2, 80), (3, 80), (4, 150), (5, 110), (6, 240)]:
        requests.append(_col_width(sid, col, px))

    requests.append(_freeze(sid, 2))  # freeze title + header
    return requests


# ---------------------------------------------------------------------------
# Main assembler
# ---------------------------------------------------------------------------

def build_spreadsheet(service, cfg: dict) -> str:
    """
    Create the spreadsheet, build all tabs, apply formatting.
    Returns the spreadsheet URL.
    """
    # 1. Create blank spreadsheet with all tabs
    tab_titles = [
        "Help", "Config", "Exercise Library", "Program",
        "Session", "Feedback", "Next Week", "Weekly Volume",
        "Volume Visual", "Dashboard", "History", "Future Plan",
    ]
    tab_colors = [
        {"red": 0.4,  "green": 0.76, "blue": 0.64},   # teal    — Help
        CLR_SUBHEADER,                                  # blue    — Config
        None,                                           # default — Exercise Library
        CLR_ACCENT,                                     # amber   — Program
        {"red": 0.13, "green": 0.55, "blue": 0.35},   # green   — Session
        CLR_ACCENT,                                     # amber   — Feedback
        {"red": 0.2,  "green": 0.7,  "blue": 0.3},    # green   — Next Week
        CLR_SUBHEADER,                                  # blue    — Weekly Volume
        {"red": 0.85, "green": 0.35, "blue": 0.35},   # red     — Volume Visual
        {"red": 0.2,  "green": 0.55, "blue": 0.85},   # sky     — Dashboard
        {"red": 0.5,  "green": 0.5,  "blue": 0.5},    # grey    — History
        {"red": 0.58, "green": 0.39, "blue": 0.72},   # purple  — Future Plan
    ]

    create_body = {
        "properties": {"title": "Workout Tracker"},
        "sheets": [
            {
                "properties": {
                    "title": title,
                    **({"tabColorStyle": {"rgbColor": color}} if color else {}),
                    "gridProperties": {"rowCount": 1000, "columnCount": 20},
                }
            }
            for title, color in zip(tab_titles, tab_colors)
        ],
    }

    result = service.spreadsheets().create(body=create_body).execute()
    spreadsheet_id = result["spreadsheetId"]
    spreadsheet_url = result["spreadsheetUrl"]

    # Map tab name → sheetId
    for sheet in result["sheets"]:
        _SHEET_IDS[sheet["properties"]["title"]] = sheet["properties"]["sheetId"]

    # 2. Collect all formatting/data requests
    all_requests: list[dict] = []
    all_requests += build_named_ranges(    _SHEET_IDS["Config"])
    all_requests += build_help(            _SHEET_IDS["Help"])
    all_requests += build_config(          _SHEET_IDS["Config"],           cfg)
    all_requests += build_exercise_library(_SHEET_IDS["Exercise Library"])
    all_requests += build_program(         _SHEET_IDS["Program"])
    all_requests += build_session(         _SHEET_IDS["Session"],          cfg)
    all_requests += build_feedback(        _SHEET_IDS["Feedback"])
    all_requests += build_next_week(       _SHEET_IDS["Next Week"],        cfg)
    all_requests += build_weekly_volume(   _SHEET_IDS["Weekly Volume"],    cfg)
    all_requests += build_volume_visual(   _SHEET_IDS["Volume Visual"],    cfg)
    all_requests += build_dashboard(       _SHEET_IDS["Dashboard"],        cfg)
    all_requests += build_history(         _SHEET_IDS["History"])
    all_requests += build_future_plan(     _SHEET_IDS["Future Plan"])

    # 3. Fire in one batch (Sheets API allows up to 500 requests per call;
    #    split if needed)
    batch_size = 400
    for i in range(0, len(all_requests), batch_size):
        service.spreadsheets().batchUpdate(
            spreadsheetId=spreadsheet_id,
            body={"requests": all_requests[i : i + batch_size]},
        ).execute()

    return spreadsheet_url
