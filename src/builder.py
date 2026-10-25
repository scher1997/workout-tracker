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


def _rows_data(sheet_id: int, start_row: int, rows: list[list[Any]],
               start_col: int = 0) -> dict:
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
            "start": {"sheetId": sheet_id, "rowIndex": start_row, "columnIndex": start_col},
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
    """Register symbolic Named Ranges for Config cells referenced in cross-tab formulas."""
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
    # ── Chest ──────────────────────────────────────────────────────────────
    ("Barbell Bench Press",        "Chest",      "Triceps",    "Shoulders"),
    ("Incline DB Press",           "Chest",      "Triceps",    "Shoulders"),
    ("Incline Barbell Press",      "Chest",      "Triceps",    "Shoulders"),
    ("Dumbbell Bench Press",       "Chest",      "Triceps",    "Shoulders"),
    ("Cable Fly",                  "Chest",      "Shoulders",  ""),
    ("Dumbbell Fly",               "Chest",      "Shoulders",  ""),
    ("Low-to-High Cable Fly",      "Chest",      "Shoulders",  ""),
    ("High-to-Low Cable Fly",      "Chest",      "Shoulders",  ""),
    ("Chest Dip",                  "Chest",      "Triceps",    "Shoulders"),
    ("Machine Chest Press",        "Chest",      "Triceps",    ""),
    ("Pec Deck",                   "Chest",      "",           ""),
    # ── Back ───────────────────────────────────────────────────────────────
    ("Pull-Up",                    "Back",       "Biceps",     "Rear Delts"),
    ("Barbell Row",                "Back",       "Biceps",     "Rear Delts"),
    ("Cable Row",                  "Back",       "Biceps",     ""),
    ("Lat Pulldown",               "Back",       "Biceps",     ""),
    ("Chest-Supported Row",        "Back",       "Biceps",     "Rear Delts"),
    ("Seal Row",                   "Back",       "Biceps",     ""),
    ("Dumbbell Row",               "Back",       "Biceps",     ""),
    ("T-Bar Row",                  "Back",       "Biceps",     ""),
    ("Pendlay Row",                "Back",       "Biceps",     ""),
    ("Meadows Row",                "Back",       "Biceps",     ""),
    ("Cable Pullover",             "Back",       "Chest",      ""),
    ("Straight-Arm Pulldown",      "Back",       "",           ""),
    ("Machine Row",                "Back",       "Biceps",     ""),
    ("Machine Pulldown",           "Back",       "Biceps",     ""),
    ("Conventional Deadlift",      "Back",       "Hamstrings", "Glutes"),
    ("Rack Pull",                  "Back",       "Glutes",     "Hamstrings"),
    # ── Shoulders ──────────────────────────────────────────────────────────
    ("Overhead Press",             "Shoulders",  "Triceps",    ""),
    ("Dumbbell Overhead Press",    "Shoulders",  "Triceps",    ""),
    ("Arnold Press",               "Shoulders",  "Triceps",    ""),
    ("Lateral Raise",              "Shoulders",  "",           ""),
    ("Cable Lateral Raise",        "Shoulders",  "",           ""),
    ("Machine Lateral Raise",      "Shoulders",  "",           ""),
    ("Upright Row",                "Shoulders",  "Biceps",     ""),
    # ── Rear Delts ─────────────────────────────────────────────────────────
    ("Face Pull",                  "Rear Delts", "Shoulders",  ""),
    ("Rear Delt Fly",              "Rear Delts", "Shoulders",  ""),
    ("Rear Delt Cable Fly",        "Rear Delts", "Shoulders",  ""),
    ("Machine Rear Delt Fly",      "Rear Delts", "",           ""),
    ("Band Pull-Apart",            "Rear Delts", "Shoulders",  ""),
    # ── Biceps ─────────────────────────────────────────────────────────────
    ("Barbell Curl",               "Biceps",     "",           ""),
    ("EZ-Bar Curl",                "Biceps",     "",           ""),
    ("Incline DB Curl",            "Biceps",     "",           ""),
    ("Cable Curl",                 "Biceps",     "",           ""),
    ("Hammer Curl",                "Biceps",     "",           ""),
    ("Preacher Curl",              "Biceps",     "",           ""),
    ("Spider Curl",                "Biceps",     "",           ""),
    ("Machine Curl",               "Biceps",     "",           ""),
    ("Concentration Curl",         "Biceps",     "",           ""),
    ("Zottman Curl",               "Biceps",     "Forearms",   ""),
    # ── Triceps ────────────────────────────────────────────────────────────
    ("Tricep Pushdown",            "Triceps",    "",           ""),
    ("Overhead Tricep Ext.",       "Triceps",    "",           ""),
    ("Skull Crusher",              "Triceps",    "",           ""),
    ("Close-Grip Bench Press",     "Triceps",    "Chest",      "Shoulders"),
    ("Cable Overhead Tricep Ext.", "Triceps",    "",           ""),
    ("Machine Tricep Extension",   "Triceps",    "",           ""),
    ("Tricep Kickback",            "Triceps",    "",           ""),
    ("JM Press",                   "Triceps",    "Chest",      ""),
    ("Dip",                        "Triceps",    "Chest",      "Shoulders"),
    # ── Quads ──────────────────────────────────────────────────────────────
    ("Barbell Back Squat",         "Quads",      "Glutes",     "Hamstrings"),
    ("Front Squat",                "Quads",      "Glutes",     "Hamstrings"),
    ("Hack Squat",                 "Quads",      "Glutes",     ""),
    ("Leg Press",                  "Quads",      "Glutes",     ""),
    ("Bulgarian Split Squat",      "Quads",      "Glutes",     "Hamstrings"),
    ("Goblet Squat",               "Quads",      "Glutes",     ""),
    ("Smith Machine Squat",        "Quads",      "Glutes",     ""),
    ("Walking Lunge",              "Quads",      "Glutes",     "Hamstrings"),
    ("Step-Up",                    "Quads",      "Glutes",     ""),
    ("Leg Extension",              "Quads",      "",           ""),
    ("Sissy Squat",                "Quads",      "",           ""),
    # ── Hamstrings ─────────────────────────────────────────────────────────
    ("Romanian Deadlift",          "Hamstrings", "Glutes",     "Back"),
    ("Stiff-Leg Deadlift",         "Hamstrings", "Glutes",     "Back"),
    ("Good Morning",               "Hamstrings", "Back",       "Glutes"),
    ("Single-Leg RDL",             "Hamstrings", "Glutes",     ""),
    ("Leg Curl",                   "Hamstrings", "",           ""),
    ("Seated Leg Curl",            "Hamstrings", "",           ""),
    ("Lying Leg Curl",             "Hamstrings", "",           ""),
    ("Nordic Curl",                "Hamstrings", "",           ""),
    # ── Glutes ─────────────────────────────────────────────────────────────
    ("Hip Thrust",                 "Glutes",     "Hamstrings", ""),
    ("Single-Leg Hip Thrust",      "Glutes",     "Hamstrings", ""),
    ("Sumo Deadlift",              "Glutes",     "Hamstrings", "Back"),
    ("Cable Kickback",             "Glutes",     "",           ""),
    ("Abductor Machine",           "Glutes",     "",           ""),
    ("45-Degree Hip Extension",    "Glutes",     "Hamstrings", "Back"),
    # ── Calves ─────────────────────────────────────────────────────────────
    ("Calf Raise",                 "Calves",     "",           ""),
    ("Seated Calf Raise",          "Calves",     "",           ""),
    ("Donkey Calf Raise",          "Calves",     "",           ""),
    ("Leg Press Calf Raise",       "Calves",     "",           ""),
    # ── Abs ────────────────────────────────────────────────────────────────
    ("Ab Wheel",                   "Abs",        "",           ""),
    ("Cable Crunch",               "Abs",        "",           ""),
    ("Hanging Leg Raise",          "Abs",        "",           ""),
    ("Decline Crunch",             "Abs",        "",           ""),
    ("Reverse Crunch",             "Abs",        "",           ""),
    ("Russian Twist",              "Abs",        "",           ""),
    ("Pallof Press",               "Abs",        "",           ""),
    ("Plank",                      "Abs",        "",           ""),
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


# ── LOG ──────────────────────────────────────────────────────────────────────
# Replaces the old Session + Feedback tabs with a single log.
# One row per exercise per workout. Per-set reps (S1–S4) captured so
# declining-rep sets are tracked. Pump/Tendon/Connection/Soreness are
# in the same row — no tab-switching during training.
#
# Column layout (0-indexed):
#   A(0)  Date          B(1)  Wk             C(2)  Day (dropdown)
#   D(3)  Exercise      E(4)  Wt (lb)
#   F(5)  S1  G(6) S2  H(7) S3  I(8) S4
#   J(9)  Avg Reps ▾ (ARRAYFORMULA — do not edit)
#   K(10) Num Sets ▾  (ARRAYFORMULA — do not edit)
#   L(11) Pump  M(12) Tendon  N(13) Connection  O(14) Soreness Before
#   P(15) Notes

_DAY_LABELS = ["Day A", "Day B", "Day C"]

# Sample data pre-populates two weeks so formulas in Next Week have live examples.
# Tuple: (date, week, day, exercise, weight, s1, s2, s3, s4,
#          pump, tendon, connection, soreness_before, notes)
LOG_SAMPLE_DATA: list[tuple] = [
    ("2026-10-27", 1, "Day A", "Barbell Back Squat",  135, 12, 10, 10, 9, "mid",   "good",    "great",     "none", ""),
    ("2026-10-27", 1, "Day A", "Romanian Deadlift",   115, 12, 10,  9, 0, "mid",   "good",    "good",      "none", ""),
    ("2026-10-28", 1, "Day B", "Incline DB Press",     60, 12, 11, 10, 0, "great", "good",    "great",     "mild", ""),
    ("2026-10-28", 1, "Day B", "Cable Row",             80, 12, 10,  9, 0, "mid",   "good",    "great",     "none", ""),
    ("2026-10-28", 1, "Day B", "Overhead Press",        75, 10,  9,  8, 0, "mid",   "neutral", "good",      "none", ""),
    ("2026-10-30", 1, "Day C", "Barbell Curl",          55, 12, 10,  9, 0, "great", "good",    "great",     "none", ""),
    ("2026-10-30", 1, "Day C", "Tricep Pushdown",       50, 12, 11, 10, 0, "mid",   "good",    "good",      "none", ""),
    ("2026-11-03", 2, "Day A", "Barbell Back Squat",   135, 13, 11, 10, 9, "great", "good",    "great",     "none", ""),
    ("2026-11-03", 2, "Day A", "Romanian Deadlift",    115, 12, 11, 10, 0, "mid",   "good",    "good",      "mild", ""),
]


def build_log(sid: int, cfg: dict) -> list[dict]:
    """
    Combined training log (replaces Session + Feedback tabs).
    Cols J and K (Avg Reps, Num Sets) are ARRAYFORMULA-computed.
    Sample data rows are written in two passes (A–I then L–P) so that the
    ARRAYFORMULA cells in J–K are never overwritten by an explicit value.
    """
    headers = [
        "Date", "Wk", "Day", "Exercise", "Wt (lb)",
        "S1", "S2", "S3", "S4",
        "Avg Reps ▾", "Num Sets ▾",
        "Pump", "Tendon", "Connection", "Soreness Before", "Notes",
    ]
    requests = []
    requests.append(_rows_data(sid, 0, [headers]))
    requests.append(_header_fmt(sid, 0, 0, 1, len(headers)))

    # ARRAYFORMULA for Avg Reps (col J=9) and Num Sets (col K=10).
    # Placed in row index 1 (sheet row 2), starting at column 9.
    # These are the only values written to cols J and K; all other rows
    # in those columns are computed by the spill.
    avg_reps_f = (
        '=ARRAYFORMULA(IFERROR('
        'MMULT(IF(F2:I2000>0,F2:I2000,0),{1;1;1;1})'
        '/MMULT(IF(F2:I2000>0,1,0),{1;1;1;1}),""))'
    )
    num_sets_f = (
        '=ARRAYFORMULA(IF(MMULT((F2:I2000>0)*1,{1;1;1;1})=0,"",'
        'MMULT((F2:I2000>0)*1,{1;1;1;1})))'
    )
    requests.append(_rows_data(sid, 1, [[avg_reps_f, num_sets_f]], start_col=9))

    # Sample data — write A–I (cols 0–8) and L–P (cols 11–15) in separate
    # requests so we never clobber the ARRAYFORMULA spill in cols J and K.
    for i, row in enumerate(LOG_SAMPLE_DATA):
        sheet_r = 1 + i
        (date_, week, day, exercise, weight,
         s1, s2, s3, s4, pump, tendon, connection, soreness, notes) = row
        # Left block: Date → S4
        requests.append(_rows_data(sid, sheet_r, [[
            date_, week, day, exercise, weight,
            s1 if s1 else "", s2 if s2 else "",
            s3 if s3 else "", s4 if s4 else "",
        ]]))
        # Right block: Pump → Notes (start_col=11 skips J and K)
        requests.append(_rows_data(sid, sheet_r,
            [[pump, tendon, connection, soreness, notes]], start_col=11))

    n_data = 2000
    all_exercises = [ex for ex, *_ in EXERCISE_LIBRARY]

    # Dropdowns
    requests.append(_dropdown(sid, 1, 2,  n_data, 3,  _DAY_LABELS))
    requests.append(_dropdown(sid, 1, 3,  n_data, 4,  all_exercises))
    requests.append(_dropdown(sid, 1, 11, n_data, 12, ["great", "mid", "none"]))
    requests.append(_dropdown(sid, 1, 12, n_data, 13, ["good", "neutral", "bad"]))
    requests.append(_dropdown(sid, 1, 13, n_data, 14, ["great", "good", "not_at_all"]))
    requests.append(_dropdown(sid, 1, 14, n_data, 15, ["none", "mild", "still_sore"]))

    # Light grey background on computed cols J, K — signals "auto, don't edit"
    computed_bg = {"red": 0.90, "green": 0.90, "blue": 0.90}
    requests.append(_bg(sid, 0, 9, n_data, 11, computed_bg))

    # Column widths
    for col, px in [
        (0, 100), (1,  40), (2,  70), (3, 200), (4, 70),
        (5,  40), (6,  40), (7,  40), (8,  40),
        (9,  85), (10, 80),
        (11, 75), (12, 75), (13, 105), (14, 120), (15, 180),
    ]:
        requests.append(_col_width(sid, col, px))

    # Freeze header row + first 4 cols so Exercise stays visible while
    # scrolling right to fill in set-rep and feedback columns on mobile.
    requests.append(_freeze(sid, 1, 4))
    return requests


# ── NEXT WEEK ───────────────────────────────────────────────────────────────

def build_next_week(sid: int, cfg: dict) -> list[dict]:
    """
    Next Week tab — auto-calculated targets for the coming session.
    Sources last-week data from the Log tab (long format) via AVERAGEIFS.
    Sources current-week feedback (pump/tendon/soreness) from Log via INDEX/MATCH.
    Column layout: A=Exercise | B=Muscle | C=Last Wk Avg Reps | D=Last Wk Weight |
                   E=Target RIR | F=Rec. Weight (amber, editable) | G=Rec. Reps |
                   H=Rec. Sets | I=Flags    J=blank | K=label | L=Current Week
    """
    headers = [
        "Exercise", "Muscle Group",
        "Last Wk Avg Reps", "Last Wk Weight (lb)",
        "Target RIR", "Rec. Weight (lb)", "Rec. Reps", "Rec. Sets",
        "Flags / Notes"
    ]
    requests = []
    requests.append(_rows_data(sid, 0, [headers + ["", "Current Week →", 1]]))
    requests.append(_header_fmt(sid, 0, 0, 1, 9))

    # ── Config cell constants ────────────────────────────────────────────────
    CW        = "$L$1"
    CFG_INC   = "CFG_WEIGHT_INC"
    CFG_RCEIL = "CFG_REP_CEILING"

    # ── Per-exercise formula builder ─────────────────────────────────────────
    def exercise_row(row: int, ex: str, muscle: str) -> list:
        r = row + 1  # 1-based sheet row

        # Log columns: B=Week, D=Exercise, E=Weight, J=Avg Reps, K=Num Sets
        #              L=Pump, M=Tendon, N=Connection, O=Soreness Before
        last_weight = f'=IFERROR(AVERAGEIFS(Log!$E:$E,Log!$D:$D,A{r},Log!$B:$B,{CW}-1),"")'
        last_reps   = f'=IFERROR(AVERAGEIFS(Log!$J:$J,Log!$D:$D,A{r},Log!$B:$B,{CW}-1),"")'
        last_sets_x = f'IFERROR(AVERAGEIFS(Log!$K:$K,Log!$D:$D,A{r},Log!$B:$B,{CW}-1),0)'

        # Current week feedback — soreness and pump/tendon are now per-exercise in Log
        soreness_f = (
            f'IFERROR(INDEX(Log!$O$2:$O$500,'
            f'MATCH(1,(Log!$D$2:$D$500=A{r})*(Log!$B$2:$B$500={CW}),0)),"")'
        )
        pump_f = (
            f'IFERROR(INDEX(Log!$L$2:$L$500,'
            f'MATCH(1,(Log!$D$2:$D$500=A{r})*(Log!$B$2:$B$500={CW}),0)),"")'
        )
        tendon_f = (
            f'IFERROR(INDEX(Log!$M$2:$M$500,'
            f'MATCH(1,(Log!$D$2:$D$500=A{r})*(Log!$B$2:$B$500={CW}),0)),"")'
        )

        # Rep addition from pump (inline, embedded in formulas below)
        pump_add  = f'IF({pump_f}="none",2,1)'
        cand_reps = f'(C{r}+{pump_add})'

        # Target RIR from Config ladder; +1 if still sore this week
        target_rir = (
            f'=IFERROR(VLOOKUP({CW},CFG_RIR_LADDER,2,FALSE),0)'
            f'+IF({soreness_f}="still_sore",1,0)'
        )

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
            f'IF({soreness_f}="still_sore","\U0001f634 STILL SORE","")'
            f'),"")'
        )
        return [ex, muscle, last_reps, last_weight, target_rir,
                rec_weight, rec_reps, rec_sets, flags]

    # Build one row per exercise using SAMPLE_PROGRAM as the source of truth
    exercises = [(ex, mg) for ex, mg, *_ in SAMPLE_PROGRAM]
    prog_rows = [exercise_row(i + 1, ex, m) for i, (ex, m) in enumerate(exercises)]
    requests.append(_rows_data(sid, 1, prog_rows))

    # Amber = user-editable weight override
    requests.append(_bg(sid, 1, 5, len(prog_rows) + 1, 6, CLR_ACCENT))
    note_row = len(prog_rows) + 2
    requests.append(_rows_data(sid, note_row, [
        ["", "", "", "", "", "← edit amber cells to override weight; reps recalculate", "", "", ""]
    ]))

    for col, px in [(0, 220), (1, 140), (2, 120), (3, 140), (4, 100),
                    (5, 140), (6, 100), (7, 100), (8, 300)]:
        requests.append(_col_width(sid, col, px))
    requests.append(_freeze(sid, 1))
    return requests


# ── WEEKLY VOLUME ────────────────────────────────────────────────────────────

def build_weekly_volume(sid: int, cfg: dict) -> list[dict]:
    """
    Pivot: rows = muscle groups, columns = weeks.
    Counting mode is read live from Config!B8 ("full" or "fractional").
    Sources set counts from Log!K (Num Sets, ARRAYFORMULA-computed).
    """
    weeks = cfg["mesocycle"]["length_weeks"]

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

    CFG_VOL  = "CFG_VOLUME_COUNTING"
    EL       = "'Exercise Library'"
    D_range  = "Log!$D$2:$D$2000"
    B_range  = "Log!$B$2:$B$2000"
    K_range  = "IFERROR(Log!$K$2:$K$2000*1,0)"

    rows = []
    for mg in muscle_groups:
        week_cells = []
        for w in range(1, weeks + 1):
            match_pri  = f'(IFERROR(VLOOKUP({D_range},{EL}!$A:$B,2,FALSE),"")="{mg}")'
            match_sec  = f'(IFERROR(VLOOKUP({D_range},{EL}!$A:$C,3,FALSE),"")="{mg}")'
            match_ter  = f'(IFERROR(VLOOKUP({D_range},{EL}!$A:$D,4,FALSE),"")="{mg}")'
            week_match = f'({B_range}={w})'

            full_sp = (
                f'IFERROR(SUMPRODUCT({K_range}*{week_match}*'
                f'(({match_pri}+{match_sec}+{match_ter})>0)),0)'
            )
            frac_sp = (
                f'IFERROR(SUMPRODUCT({K_range}*{week_match}*'
                f'({match_pri}*1+{match_sec}*0.5+{match_ter}*0.25)),0)'
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

    content = [
        ("HEADER", "Workout Tracker — User Guide"),

        ("HEADER", "How to use this sheet each session"),
        ("1. Before training",     "Open the Log tab → add a row for each exercise in today's workout → fill in Date, Wk, Day, Exercise, target Weight, and Soreness Before."),
        ("2. Check targets",       "Open the Next Week tab to see your target weight, reps, and sets for each exercise. Return to Log if you want to start with a different weight."),
        ("3. During training",     "After each exercise, go back to its row in the Log tab → fill in S1, S2, S3, S4 with reps you got per set. Then fill in Pump, Tendon, and Connection in the same row. No tab switching needed."),
        ("4. End of week",         "Update the Current Week number in the Next Week tab (cell L1) to the next week number. All recommendations recalculate automatically."),
        ("5. End of mesocycle",    "Re-run the Python script to generate a fresh sheet for the next block. See the README for instructions."),

        ("HEADER", "Tab guide"),
        ("Help (this tab)",        "Reference guide — you are here."),
        ("Config",                 "All rules and numeric settings. Edit values here to tune progression without touching formulas."),
        ("Exercise Library",       "Maps exercises to muscle groups. Add any exercise you use here before referencing it in Program or Log."),
        ("Program",                "Your current mesocycle's exercises with rep ranges, starting weight, and sets."),
        ("Log",                    "Combined training log. One row per exercise per workout. Fill in Date, Week, Day, Exercise, weight, and per-set reps (S1–S4). Log pump, tendon, and connection feedback in the same row. The grey Avg Reps and Num Sets columns auto-calculate from S1–S4 — do not type in them."),
        ("Next Week",              "Auto-calculated targets for next session. Amber weight cells are editable — reps recalculate from your override. Update Current Week (L1) each week."),
        ("Weekly Volume",          "Total sets per muscle group per week. Use this to spot under- or over-training across the mesocycle."),
        ("Volume Visual",          "Charts sourced from Weekly Volume: sets per week by muscle (line), and total sets per muscle (bar)."),
        ("Dashboard",              "Exercise-level progress: select an exercise from the dropdown to see weight and volume trends week over week."),
        ("History",                "Long-format archive of past mesocycles, populated by running: uv run python src/archive.py"),
        ("Future Plan",            "Planning scratchpad for your next mesocycle. Fill this in while the current block is running so you’re ready to go when you regenerate the sheet."),

        ("HEADER", "Per-set reps — the key feature"),
        ("S1, S2, S3, S4",         "Fill in each set’s actual reps as you complete them. It’s normal for reps to decrease each set (e.g. 12, 10, 9, 8). Leave unused set columns blank if you did fewer sets."),
        ("Avg Reps (grey column)",  "Auto-calculated average of your non-zero set reps for that exercise row. Do not type here."),
        ("Num Sets (grey column)",  "Auto-calculated count of sets you logged (non-zero S1–S4). Do not type here."),
        ("How it drives Next Week", "Avg Reps and Num Sets feed directly into the Next Week tab recommendations. If avg reps hit the ceiling, weight bumps. If pump was low, rep target increases. If tendon pain was reported, weight holds and a set is dropped."),

        ("HEADER", "Dropdown options"),
        ("Soreness Before — none",        "No soreness in the muscle. Train as planned."),
        ("Soreness Before — mild",         "Some soreness but not limiting. Train as planned."),
        ("Soreness Before — still_sore",   "Muscle hasn’t recovered. Target RIR is one step easier and set count is held. Two weeks in a row trims a set."),
        ("Pump — great",                   "Strong muscle pump. +1 rep added to next week’s target."),
        ("Pump — mid",                     "Decent pump. +1 rep added to next week’s target."),
        ("Pump — none",                    "No pump. +2 reps added to push stimulus harder."),
        ("Tendon/Joint — good",            "No issues. Normal progression."),
        ("Tendon/Joint — neutral",         "Nothing notable. Normal progression."),
        ("Tendon/Joint — bad",             "Pain or discomfort. Triggers a maintenance week: hold weight, drop one set, no rep push."),
        ("Connection — great",             "Felt the target muscle working clearly. Normal progression."),
        ("Connection — good",              "Decent mind-muscle connection. Normal progression."),
        ("Connection — not_at_all",        "Couldn’t feel the target muscle. Flags for a technique check. Two weeks in a row flags for an exercise swap."),

        ("HEADER", "Reading the Next Week tab"),
        ("Current Week (cell L1)",  "Update this each week — it drives all the recommendations. Week 1 = first week of the mesocycle."),
        ("Last Wk Avg Reps",        "Average reps across all logged sets for that exercise last week."),
        ("Last Wk Weight",          "The weight logged for that exercise last week."),
        ("Target RIR",              "How hard to push this week. Lower = harder (0 = all-out/failure)."),
        ("Rec. Weight (amber)",     "Recommended weight for next week. This cell is editable — type your override and Rec. Reps will recalculate automatically from that weight."),
        ("Rec. Reps",               "Target reps. Volume-matched to the recommended weight if the weight changed; pump-based if weight held."),
        ("Rec. Sets",               "Target sets. May be lower than last week if tendon pain was reported."),
        ("Flags / Notes",           "Warnings from last week’s feedback. Always read these before training."),

        ("HEADER", "Flags explained"),
        ("⚠ TENDON: maintenance",          "You reported joint/tendon pain last week. Hold the weight, drop one set, and don’t push reps this week."),
        ("↑ LOW PUMP",                     "Pump was ‘none’ last week. Rep target is bumped +2 to push the stimulus."),
        ("\U0001f634 STILL SORE",               "The muscle wasn’t recovered before last session. Target RIR is one step easier this week."),
        ("CONNECTION: check technique",         "You couldn’t feel the target muscle last week. Review your form before adding load."),
        ("CONNECTION: consider swap",           "Two weeks in a row with poor connection. Consider swapping to a different exercise for this muscle."),
        ("UNDER_RECOVERED: trim a set",         "The muscle group was still sore two weeks running. Consider dropping one set to allow more recovery."),

        ("HEADER", "Mobile tips (iOS Google Sheets)"),
        ("Log tab first",            "The Log tab is your primary tab during a workout. Add one row per exercise at the start of the session, then fill in set reps and feedback as you go."),
        ("Frozen columns",           "The Log tab freezes the first 4 columns (Date, Wk, Day, Exercise) so exercise names stay visible as you scroll right to fill in S1–S4 and feedback."),
        ("Use the dropdowns",        "Tap the cell and choose from the list — don’t type values manually. The formulas only recognise the exact dropdown text."),
        ("Amber = editable",         "Only the amber Rec. Weight cells and the Current Week cell (L1) in Next Week are meant to be overridden. Everything else is formula-driven."),
        ("Grey = auto",              "The grey Avg Reps and Num Sets columns in the Log tab are calculated automatically. Do not type in them."),
        ("Offline",                  "Google Sheets on iOS caches the sheet for offline use after you open it on a connection. Changes sync when you’re back online."),
    ]

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
            if row_idx % 2 == 0:
                requests.append(_bg(sid, row_idx, 0, row_idx + 1, 2, CLR_LIGHT))
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
    requests.append({
        "updateDimensionProperties": {
            "range": {"sheetId": sid, "dimension": "ROWS",
                      "startIndex": 0, "endIndex": row_idx},
            "properties": {"pixelSize": 48},
            "fields": "pixelSize",
        }
    })
    for i, item in enumerate(content):
        if item[0] == "HEADER":
            requests.append(_row_height(sid, i, 36))

    requests.append(_freeze(sid, 1))
    return requests


# ── VOLUME VISUAL ────────────────────────────────────────────────────────────

def build_volume_visual(sid: int, cfg: dict) -> list[dict]:
    """
    Two charts sourced from Weekly Volume tab:
      Chart 1 (line)  — sets per week per muscle group
      Chart 2 (bar)   — total sets per muscle group (full mesocycle)
    """
    weeks = cfg["mesocycle"]["length_weeks"]
    muscle_groups = sorted({
        m for _, p, s, t in EXERCISE_LIBRARY for m in (p, s, t) if m
    })
    n_m = len(muscle_groups)
    wv_sid = _SHEET_IDS["Weekly Volume"]

    requests = []

    requests.append(_rows_data(sid, 0, [["Weekly Volume Dashboard"]]))
    requests.append(_header_fmt(sid, 0, 0, 1, n_m + 2, bg=CLR_HEADER, font_size=12))
    requests.append(_merge(sid, 0, 0, 1, n_m + 2))

    PW_START = 2
    PW_HDR   = 3
    PW_DATA  = 4

    requests.append(_rows_data(sid, PW_START, [["PER-WEEK SETS BY MUSCLE GROUP"]]))
    requests.append(_header_fmt(sid, PW_START, 0, PW_START + 1, n_m + 1, bg=CLR_SUBHEADER))
    requests.append(_merge(sid, PW_START, 0, PW_START + 1, n_m + 1))

    pw_header = ["Week"] + [f"='Weekly Volume'!A{i + 2}" for i in range(n_m)]
    requests.append(_rows_data(sid, PW_HDR, [pw_header]))
    requests.append(_header_fmt(sid, PW_HDR, 0, PW_HDR + 1, n_m + 1, bg=CLR_LIGHT, bold=True))

    week_rows = []
    for w in range(1, weeks + 1):
        wv_col = chr(ord("B") + w - 1)
        row = [f"Wk {w}"] + [f"='Weekly Volume'!{wv_col}{i + 2}" for i in range(n_m)]
        week_rows.append(row)
    requests.append(_rows_data(sid, PW_DATA, week_rows))

    total_col = chr(ord("B") + weeks)
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

    # Chart 1: line chart — sets per week per muscle group
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

    # Chart 2: horizontal bar chart — total sets per muscle group
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
    Rows 4-9 = dynamic data table (AVERAGEIFS formulas → Log tab).
    Two line charts (weight trend, volume trend) update when B2 changes.
    """
    weeks = cfg["mesocycle"]["length_weeks"]
    requests = []

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
    all_exercises = [ex for ex, *_ in EXERCISE_LIBRARY]
    requests.append(_dropdown(sid, 1, 1, 2, 2, all_exercises))

    DATA_HDR  = 3
    DATA_ROW0 = 4
    DATA_END  = DATA_ROW0 + weeks

    requests.append(_rows_data(sid, DATA_HDR,
        [["Week", "Weight (lb)", "Avg Reps", "Sets", "Volume (lb · avg reps · sets)"]]))
    requests.append(_header_fmt(sid, DATA_HDR, 0, DATA_HDR + 1, 5))

    EX = "$B$2"
    data_rows = []
    for w in range(1, weeks + 1):
        r    = DATA_ROW0 + w
        wt   = f"=IFERROR(AVERAGEIFS(Log!$E:$E,Log!$D:$D,{EX},Log!$B:$B,{w})*1,0)"
        reps = f"=IFERROR(AVERAGEIFS(Log!$J:$J,Log!$D:$D,{EX},Log!$B:$B,{w})*1,0)"
        sets = f"=IFERROR(AVERAGEIFS(Log!$K:$K,Log!$D:$D,{EX},Log!$B:$B,{w})*1,0)"
        vol  = f"=IFERROR(B{r}*C{r}*D{r},0)"
        data_rows.append([w, wt, reps, sets, vol])
    requests.append(_rows_data(sid, DATA_ROW0, data_rows))

    domain = _source_range(sid, DATA_HDR, 0, DATA_END, 1)

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

    requests.append(_chart(sid, DATA_END + 1, 5, 440, 300, {
        "title": "Volume Progression  (weight × avg reps × sets)",
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

    for col, px in [(0, 65), (1, 120), (2, 90), (3, 80), (4, 230)]:
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
        "Week", "Weight (lb)", "Avg Reps", "Sets", "Volume (lb·avg reps·sets)",
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
        (5, 60),  (6, 110), (7, 80),  (8, 70), (9, 200),
    ]:
        requests.append(_col_width(sid, col, px))

    requests.append(_freeze(sid, 2))
    return requests


# ── FUTURE PLAN ──────────────────────────────────────────────────────────────

def build_future_plan(sid: int) -> list[dict]:
    """
    Planning scratchpad for the next mesocycle.
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

    requests.append(_rows_data(sid, 2, [[""] * n for _ in range(20)]))

    for row in range(2, 22):
        if row % 2 == 0:
            requests.append(_bg(sid, row, 0, row + 1, n, CLR_LIGHT))

    for col, px in [(0, 220), (1, 80), (2, 80), (3, 80), (4, 150), (5, 110), (6, 240)]:
        requests.append(_col_width(sid, col, px))

    requests.append(_freeze(sid, 2))
    return requests


# ---------------------------------------------------------------------------
# Main assembler
# ---------------------------------------------------------------------------

def build_spreadsheet(service, cfg: dict) -> str:
    """
    Create the spreadsheet, build all tabs, apply formatting.
    Returns the spreadsheet URL.
    """
    tab_titles = [
        "Help", "Config", "Exercise Library", "Program",
        "Log", "Next Week", "Weekly Volume",
        "Volume Visual", "Dashboard", "History", "Future Plan",
    ]
    tab_colors = [
        {"red": 0.4,  "green": 0.76, "blue": 0.64},   # teal   — Help
        CLR_SUBHEADER,                                  # blue   — Config
        None,                                           # default — Exercise Library
        CLR_ACCENT,                                     # amber  — Program
        {"red": 0.13, "green": 0.55, "blue": 0.35},   # green  — Log
        {"red": 0.2,  "green": 0.7,  "blue": 0.3},    # green  — Next Week
        CLR_SUBHEADER,                                  # blue   — Weekly Volume
        {"red": 0.85, "green": 0.35, "blue": 0.35},   # red    — Volume Visual
        {"red": 0.2,  "green": 0.55, "blue": 0.85},   # sky    — Dashboard
        {"red": 0.5,  "green": 0.5,  "blue": 0.5},    # grey   — History
        {"red": 0.58, "green": 0.39, "blue": 0.72},   # purple — Future Plan
    ]

    create_body = {
        "properties": {"title": "Workout Tracker"},
        "sheets": [
            {
                "properties": {
                    "title": title,
                    **({"tabColorStyle": {"rgbColor": color}} if color else {}),
                    "gridProperties": {"rowCount": 2100, "columnCount": 20},
                }
            }
            for title, color in zip(tab_titles, tab_colors)
        ],
    }

    result = service.spreadsheets().create(body=create_body).execute()
    spreadsheet_id = result["spreadsheetId"]
    spreadsheet_url = result["spreadsheetUrl"]

    for sheet in result["sheets"]:
        _SHEET_IDS[sheet["properties"]["title"]] = sheet["properties"]["sheetId"]

    all_requests: list[dict] = []
    all_requests += build_named_ranges(    _SHEET_IDS["Config"])
    all_requests += build_help(            _SHEET_IDS["Help"])
    all_requests += build_config(          _SHEET_IDS["Config"],           cfg)
    all_requests += build_exercise_library(_SHEET_IDS["Exercise Library"])
    all_requests += build_program(         _SHEET_IDS["Program"])
    all_requests += build_log(             _SHEET_IDS["Log"],              cfg)
    all_requests += build_next_week(       _SHEET_IDS["Next Week"],        cfg)
    all_requests += build_weekly_volume(   _SHEET_IDS["Weekly Volume"],    cfg)
    all_requests += build_volume_visual(   _SHEET_IDS["Volume Visual"],    cfg)
    all_requests += build_dashboard(       _SHEET_IDS["Dashboard"],        cfg)
    all_requests += build_history(         _SHEET_IDS["History"])
    all_requests += build_future_plan(     _SHEET_IDS["Future Plan"])

    batch_size = 400
    for i in range(0, len(all_requests), batch_size):
        service.spreadsheets().batchUpdate(
            spreadsheetId=spreadsheet_id,
            body={"requests": all_requests[i : i + batch_size]},
        ).execute()

    return spreadsheet_url
