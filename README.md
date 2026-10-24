# Workout Tracker

A Google Sheet workout tracker built through the Sheets API. Tracks sets, reps, and weight, and recommends next-week targets using Reps in Reserve (RIR) and your post-session feedback.

---

## Setup (one-time)

**1. Add your Google account as a test user**

1. Go to [console.cloud.google.com](https://console.cloud.google.com) and select your `workout-tracker` project
2. Left sidebar → **APIs & Services → OAuth consent screen**
3. Scroll to **Test users** → **+ Add users** → enter your Gmail → **Save**

**2. Install dependencies**
```
uv sync
```

**3. Create the sheet (run once)**
```
uv run python src/main.py
```

A browser tab opens for Google sign-in. After you approve, two things happen:
- `token.json` is saved locally — you won't be prompted to sign in again
- The script prints a URL to your new spreadsheet — **bookmark this URL**

> **The script creates a brand-new sheet every time it runs.** After the first run, you should work directly in Google Sheets and not re-run the script unless you intentionally want a fresh sheet (e.g. starting a new mesocycle). If you do run it again by accident, just delete the extra sheet from Google Drive.

---

## Credentials setup (if starting from scratch)

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a project → enable **Google Sheets API** and **Google Drive API**
3. **APIs & Services → Credentials → Create OAuth client ID** → Desktop app → download JSON
4. Rename the file to `credentials.json` and place it in the project root (it is git-ignored)

---

## Making changes

### Option A — Edit the sheet directly in Google Sheets (recommended for day-to-day use)

Most things you'll want to adjust can be done right in the sheet without touching any code:

| What to change | Where |
|---|---|
| Current week number | **Next Week** tab → cell `L1` (top-right) |
| Mesocycle length, rep ranges, weight increment | **Config** tab |
| RIR target per week | **Config** tab → RIR Ladder section |
| Add or rename exercises | **Exercise Library** tab (add row with exercise name + muscle group) |
| Change exercises for your program | **Program** tab (edit exercise names, rep ranges, starting weight) |
| Override a recommended weight | **Next Week** tab → amber cells in the `Rec. Weight` column — reps recalculate automatically |
| Log a set | **Session** tab → fill Weight, Reps, Sets in the current week's columns |
| Enter session feedback | **Feedback** tab → add a row with dropdowns |

Everything in **Next Week** and **Weekly Volume** recalculates automatically as you add rows to Log and Feedback.

### Option B — Regenerate the sheet from Python (for structural changes)

Use this path when you want to change the *structure* of the sheet — column layout, new tabs, formula logic, or rules. The workflow is:

1. **Change the rule value** → edit `config/defaults.yaml`
2. **Change the rule logic** → edit `src/progression.py`, update `tests/test_progression.py`, run `uv run pytest tests/` to confirm all tests pass, then mirror the change in `src/builder.py`
3. **Regenerate** → run `uv run python src/main.py`; bookmark the new URL

> Note: regenerating creates a fresh sheet and does not carry over any data you've already logged. If you're mid-mesocycle, stick to Option A until the block is done.

---

## Running tests

```
uv run pytest tests/ -v
```

36 tests covering all recommendation rules — weight rounding, volume math, pump/tendon/soreness/connection logic, and the master `recommend()` function.

---

## Training model

### Mesocycle / microcycle

A **mesocycle** is 6–8 weeks (default 6, set in `config/defaults.yaml`). Each week is a **microcycle**. An optional deload week can be appended after the last working week.

### RIR progression

Reps in Reserve (RIR) = how many more reps you *could* have done at the end of a set. Lower RIR = harder effort.

Default 6-week ladder:

| Week | Target RIR | Effort |
|------|-----------|--------|
| 1    | 3         | Easy   |
| 2    | 2         | Moderate |
| 3    | 1         | Hard   |
| 4    | 0         | All-out / failure |
| 5    | 3         | Easy (repeat) |
| 6    | 2         | Moderate |

Extend or modify the ladder in `config/defaults.yaml` → `rir_ladder`.

---

## Rules

All rules live in `src/progression.py` (pure Python, fully tested) and are mirrored as Google Sheets formulas in `src/builder.py`. The **Config** tab in the sheet shows each rule as a reference table.

### Pump rule
- `great` or `mid` → **+1 rep** next week
- `none` → **+2 reps** (push the stimulus harder)

### Rep ceiling and weight bump
- Reps ≥ 13 → sheet **recommends** a weight increase
- Reps ≥ 15 → weight increase is **mandatory**
- New weight = current × 1.05, rounded to nearest 2.5 lb, minimum +2.5 lb step
  - Example: 15 lb → 17.5 lb (never stays stuck at 15)
- When weight changes, reps are volume-matched: `floor(prev_weight × prev_reps / new_weight)`
  - Example: 15 lb × 15 reps = 225 → at 17.5 lb = 12 reps, at 20 lb = 11 reps
- Amber cells in **Next Week** are editable — override the weight for your available dumbbell sizes and reps recalculate from that override

### Tendon / joint pain rule
- `bad` → **maintenance week**: hold weight, drop one set, no rep push
- `neutral` or `good` → normal progression
- Returns to normal progression from the held weight after one neutral/good week

### Muscle connection rule
- `great` or `good` → normal
- `not_at_all` → flags the exercise for a **technique check**
- Two consecutive `not_at_all` weeks → flags for an **exercise swap**

### Soreness rule (per muscle group, entered before training)
- `none` or `mild` → train as planned
- `still_sore` → hold set count + target RIR one step easier (e.g. RIR 1 → 2)
- Two consecutive `still_sore` weeks → flags the muscle group as **under-recovered**, suggests trimming a set

---

## Sheet structure

| Tab | Purpose |
|-----|---------|
| **Config** | All tunable parameters and feedback rule lookup tables |
| **Exercise Library** | Exercise → muscle group lookup; add your own exercises here |
| **Program** | Exercises for the current mesocycle: name, rep range, starting weight, sets |
| **Session** | Training log: one row per exercise, grouped by day, with Weight / Reps / Sets columns for each week |
| **Feedback** | One row per exercise per session: soreness (before) + pump/tendon/connection (after) |
| **Next Week** | Auto-calculated recommendations: weight, reps, sets, target RIR, flags |
| **Weekly Volume** | Sets per muscle group per week across the mesocycle |
| **History** | Long-format archive of finished mesocycles, filled by `src/archive.py` |
| **Future Plan** | Scratchpad for planning the next mesocycle's exercises, rep ranges, and starting weights |

The sheet also includes **Help**, **Volume Visual**, and **Dashboard** tabs.

---

## Archiving a mesocycle and starting a new one

Do these in order. Archive **before** generating the new sheet.

### 1. Plan the next block (during the last week or two)

Fill in the **Future Plan** tab: exercise, day, rep range, starting weight, and starting sets for each exercise in the next mesocycle.

### 2. Archive the finished mesocycle

```
uv run python src/archive.py --label "Oct 2026 Hypertrophy"
```

If you omit `--label`, the script prompts for one. It:

1. Reads the **Session** tab and looks up each exercise's muscle group in **Exercise Library**
2. Converts it to long format: one row per exercise per week, with weight, reps, sets, and volume (weight × reps × sets)
3. Appends the rows to the **History** tab, tagged with your label and today's date

Notes:
- It targets the sheet whose ID is in `output/spreadsheet_id.txt`, which `main.py` writes each time it creates a sheet. That is the most recently generated sheet.
- It only appends and never overwrites existing History rows. **Running it twice for the same mesocycle duplicates the rows**, so run it once per block.
- Weeks with no data are skipped, so an unfinished block archives only the weeks you filled in.
- Check the **History** tab afterward to confirm the rows look right.

### 3. Generate the new sheet

1. Update `config/defaults.yaml` if you want different settings (e.g. 8 weeks, new RIR ladder)
2. Run `uv run python src/main.py`
3. Bookmark the new URL
4. Copy your exercises from the old **Future Plan** tab into the new sheet's **Program** tab

### What carries over

Generating a new sheet starts blank, and `output/spreadsheet_id.txt` now points to it. Your archived **History** stays in the *old* sheet, so keep that sheet in Google Drive and don't delete it. The next time you run `archive.py`, the new block's rows go into the new sheet's History tab, so your full history is spread across one sheet per mesocycle.
