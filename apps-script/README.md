# Workout Tracker (Google Sheets + Apps Script)

A workout logger that lives in one Google Sheet and works from a phone. You plan the program once; each week the script
builds a **Sessions** tab, you fill it in while training, and **Complete Week** logs it and builds the next week with
the progression rules applied. Everything is a bound Apps Script (`apps-script/`), pushed with clasp.

## Using it

**Each week**
1. Open the Sheet. The **Sessions** tab holds this week, one block per training day (rows tinted by day).
   Sets, Actual RIR and Actual Weight are prefilled with the plan and shown in gray; type over only what differed.
2. Before training, optionally pick **Soreness** for a muscle group. After each exercise pick **Pump**, **Tendon** and
   **Connection**; an exercise counts as **done** once all three are filled in. Notes are optional.
3. When the week is finished, pick **Complete Week**. It logs every done exercise and builds the next week.

**Running actions.** Desktop: the **Workout** menu. Phone: the Sheets app does not show Apps Script menus, so use the
**Action** dropdown at the top of the **Settings** tab (Build Session, Complete Week, Clear Session, Deload this week,
Refresh Muscle Summary, Start New Mesocycle). The dropdown resets to "Choose action" at once, and **Status** shows
"Working: ..." and then the result or the reason it refused. Picks run through one installable trigger
(`onSettingsEdit`, created by Set up workbook; there should be exactly one). Offline picks run once the edit syncs.
Two picks at once are serialised by a script lock: the second waits 5 seconds, then Status says "Busy, try again" and
nothing runs. Phone paths never show dialogs; where the menu would ask, they refuse and say why in Status.

**Complete Week** (menu "Complete week (roll to next week)")
- Logs the whole week at once: one Log row per done exercise, keyed by week + day + exercise (never twice). A blank
  Actual Weight logs the Rec Weight. Exercises logged with only the prefill log as shown (Actual RIR = Target RIR).
- **Untouched** exercises only warn ("N of M were not done and will not be logged"); the rest of the week still rolls.
  **Started but missing a rating** (you changed a set, weight, RIR, notes or a rating) stops it and names them.
  Soreness does not count as started (it is chosen before training). Nothing logged at all also refuses, which blocks double-ticks.
- Then it builds next week's Sessions from the Log and Program and bumps **Current week**. Program is not modified.
- Clear Session and Build Session (phone) log done exercises first so nothing is lost; Build refuses if Sessions holds
  entries. Start New Mesocycle and Clear refuse on started-but-unrated exercises too.

## Tabs

| Tab | What it is |
|---|---|
| **Settings** | Actions (Current week, Status, Action dropdown), Program setup (Mesocycle name and length, Target RIR by week, default rep min/max), Preferences (Deload after last week, count secondary / tertiary muscles and their credit per set). Rows live in `SETTINGS_ROWS`; code only uses the names. |
| **Program** | You edit this: Day, Exercise, Sets, Start Weight, Rep Min, Rep Max (blank rep cells use the Settings defaults). The source of truth for what a week contains. |
| **Exercise Map** | Exercise to **Muscle Group** (primary), optional **Secondary** and **Tertiary** muscles (comma lists). No exercise or muscle names live in code: add a row, or a new muscle group, and everything follows. A new workbook starts with the built-in library (below). |
| **Sessions** | The current week. Exercise is the one frozen column; Week, Day, Rep Range and Rep Target are hidden (still in the data; unhide from the column header, Set up workbook hides them again). Script-managed columns are warning-protected. |
| **Log** | One row per logged exercise: Date, Week, Day, Exercise, Primary / Secondary / Tertiary muscle, then the Sessions columns. Secondary / tertiary are copied from the map when logged. |
| **Archive** | Long-term, chart-ready view across mesocycles (below). |
| **Muscle Summary** | Sets per muscle group per week (below). Script-written. |
| **Trends** | Pick an item and a metric, get a chart (below). |

## Progression and feedback rules

Numbers are in `PROGRESSION`, `FEEDBACK`, `DELOAD` and `DEFAULTS` (Config.gs). "Reps" = the average over the sets entered.

- **Double progression** (`nextTarget`, Rollover.gs), per exercise, with that row's own Rep Range:
  average reps at or above **Rep Max** -> weight +5% (rounded to 2.5 lb, at least +2.5) and the rep target resets to **Rep Min**;
  below it -> weight held, rep target +1 (+2 after a "none" pump), capped at Rep Max.
  An exercise skipped this week repeats its latest logged weight and reps; one never logged starts at the Program Start Weight.
- **Target RIR** comes from the Settings ladder by *working* week (default 3, 2, 1, 0; weeks past the end repeat the last).
- **Rec Weight override.** Typing a different Rec Weight in Sessions recalculates Rep Target so weight x reps matches last
  week's logged volume (capped at Rep Max), and moves prefilled sets and an untouched Actual Weight with it.
- **Pump**: great / mid -> +1 rep, none -> +2 (on the hold path). **Tendon** "bad" -> maintenance next week: weight held,
  Program sets minus 1, no rep push, no increase (ends after one neutral / good week). **Connection** "not at all" ->
  "Technique check" flag; twice in a row -> "Swap suggested". **Soreness** "still sore" (per muscle group per day) -> that
  session's Target RIR one step easier, the rating spreads to rows with the same Day + muscle, sets never change; still
  sore two weeks running -> "Under-recovered, consider trimming a set". Blank ratings count as neutral. Messages land in
  the **Flags** column.

## Deload and mesocycle length

- **Mesocycle length counts working weeks** (default 7). A deload week uses neither a week of that length nor a step of
  the RIR ladder: after a deload at week 3 the next working week takes the RIR step the deload replaced, and the
  mesocycle still gets its full count of working weeks. Statuses say "working week x of N".
- A **deload week** = half the Program sets (rounded up), weight held, reps = last performed, Target RIR 4, flag
  "Deload week". It is derived from the Log (a week is a deload if its rows carry the flag); nothing else is stored.
- **Stalled**: no weight or rep gain for 3 logged weeks in a row (maintenance weeks are skipped, counting restarts after a
  deload) -> "Stalled N weeks" flag. When at least half the logged exercises (minimum 2) are stalled, the Complete Week
  status says "Deload recommended"; it never converts anything itself.
- **Deload this week** (menu "Make this week a deload", or the Action dropdown) rewrites the current, not-yet-started week
  from Log history up to last week. Refuses if Sessions has entries or is already a deload. After a deload, progression
  resumes from the last working week.
- **End of the mesocycle.** With **Deload after last week** on (default), completing the last working week builds the next
  week as a deload, and completing that deload ends the mesocycle (Complete Week refuses; use Start New Mesocycle).
  With it off, completing the last working week ends it.

## Archive and new mesocycle

**Start New Mesocycle** (menu, or the Action dropdown): logs done exercises, appends to Archive and verifies the row
count, raises Program > Start Weight with the same rule as progression (an exercise whose average reached its Rep Max
goes up a step; the status lists them; deloads are ignored; unlogged exercises keep theirs), clears Sessions and Log,
advances **Mesocycle name** ("Meso 1" -> "Meso 2"), sets Current week to 1 and builds week 1. The Log is cleared only
after the Archive copy checks out, and Archive refuses a label it already holds, so a double pick cannot duplicate rows.
The phone only runs it once the mesocycle is finished; the menu can end an unfinished one after a confirmation.

**Archive** has one row per exercise per day per week: Mesocycle, Meso Week, **Overall Week** (keeps counting across
mesocycles, a time axis), Date (the week's earliest logged date), Week Type (Working / Deload), Day, Exercise, the three
muscle columns, Sets Done, Weight, Avg Reps, **Volume** (weight x total reps), Target RIR, Actual RIR, the four ratings and
Flags. Notes and the raw S1-S5 reps stay out.

## Muscle Summary and Trends

- **Muscle Summary**: rows = muscle groups (every name in the Exercise Map's three muscle columns), columns = Overall
  Week, cells = **sets actually done**, plus a Total row; darker green = more sets. Data = Archive + the current Log, so
  weeks keep counting after a new mesocycle. The muscle comes from the Exercise Map when the summary refreshes (editing
  the map fixes old rows); an exercise no longer in the map keeps the muscle on its Log row; anything unknown gets its own
  last row so totals always add up.
- **Counting**: primary counts 1. Tick *Count secondary / tertiary muscles* in Settings and set the credit per set
  (defaults 0.5 and 0.25; 1 = a full set each). A muscle named in several roles of one exercise counts once, at the highest
  role switched on. A caption under the table says what is counted.
- **Trends**: pick an item in B1 (*Muscle: x* or *Exercise: x*) and a metric in B2 (Sets, Volume, Top weight, Avg reps).
  Muscles only have Sets and Volume (other metrics fall back to Sets with a note). Chart below, data in J:K, item list in M.
- **Refresh** is automatic after Complete Week and Start New Mesocycle, and when you edit the Exercise Map, the Settings
  preferences or the Trends dropdowns. Manual: menu "Refresh muscle summary + trends" or the Action dropdown. A refresh
  error is logged and never blocks logging.

## Exercise library and programs

- **Workout > Load exercise library** puts about 225 hypertrophy exercises into the Exercise Map. Names are equipment first
  (`Barbell`, `Dumbbell`, `Smith Machine Bulgarian Split Squat` are three different rows). No bodyweight-only movements; the GHD /
  45-degree hyperextension / side-bend family is the deliberate exception. The data is in `ExerciseLibraryUpper.gs` and
  `ExerciseLibraryLower.gs`.
- **Muscle groups (20), in Muscle Summary order:** Chest, Lats, Upper Back, Traps, Front Delts, Side Delts, Rear Delts, Biceps,
  Triceps, Forearms, Quads, Hamstrings, Glutes (hip abduction too), Adductors, Calves, Abs, then the spine groups **Spinal
  Extension, Spinal Flexion, Spinal Side Bend, Spinal Rotation** (lower-back work, not hypertrophy volume). Hinges (RDL, deadlift,
  good morning) credit Spinal Extension as a *secondary*. A pad-high GHD / 45-degree hyperextension is Spinal Extension primary;
  `45-Degree Hyperextension (Glute Focus)` (pad low) is Glutes primary. Crunches are Abs with Spinal Flexion as secondary.
- **One Secondary, the rest Tertiary.** Each library row names one Secondary muscle; further helpers go in Tertiary (bench:
  Triceps secondary, Front Delts tertiary). Hinges keep Spinal Extension as the Secondary, with Glutes in Tertiary.
- **The library wins on a merge.** Loading rewrites the Exercise Map as the library in library order, then your own exercises
  (names not in the library) after it. A same-name row takes the library's muscles. Nothing is deleted; it asks first when the tab
  already has rows, and a second load changes nothing. Muscle Summary lists every primary in map order first, then muscles that
  are only ever secondary / tertiary, which keeps the spine groups at the bottom.
- **Workout > Load program: Upper/Lower 4-day** replaces Program with a 4-day split (Mon Upper A, Tue Lower A, Thu Upper B, Fri
  Lower B; 8 exercises a day) and builds Sessions for the current week. If the Map lacks any of its exercises, the library loads
  first. Rows come in **superset pairs** (1+2, 3+4, ...): antagonists where one exists (chest/back, biceps/triceps,
  quads/hamstrings, hip abduction/adduction, spinal extension/flexion), otherwise muscles that don't compete. There is no
  Superset column; the order carries it. **Start Weight is blank**: type the weight you use in Actual Weight in week 1 and the
  rules take it from there.
- More programs: add an entry to `PROGRAM_TEMPLATES` in `ProgramTemplates.gs` (a test checks that every exercise exists in the
  library and that upper days stay upper). A menu item per program is one line in `Setup.gs`. Both loaders are menu-only
  (the iPhone does not run Apps Script menus); they are one-time desktop setup.
- A brand-new workbook (new Exercise Map tab) is filled from the library, and an empty Program from the first template.
- **Adding your own exercises:** type them in the next empty row of the Exercise Map (Exercise, Muscle Group, optional
  Secondary / Tertiary). That is all: the Program Exercise dropdown reads rows 2 to 1000 of the map (`MAP_LAST_ROW`), Sessions and Log
  look the muscles up by name, and the Muscle Summary and Trends refresh on the edit. A new muscle group works the same way:
  just type it (spell it the same way each time, or you get two groups). Reloading the library later keeps your rows, after the
  library.
- **No duplicates.** Typing an exercise that is already in the map (any case or spacing) is rejected. A paste or a script
  skips that rule, so a duplicate that gets in turns red and Status names it and its rows, on a Map edit and when Sessions are
  built. The first row is the one lookups use only by accident; delete or rename the other.
- **Partial credit for helper muscles:** tick **Count secondary muscles** / **Count tertiary muscles** in Settings > Preferences
  (credit per set 0.5 and 0.25 by default, editable). Then a bench set counts 1 for Chest, 0.5 for Triceps and 0.25 for Front Delts
  in the Muscle Summary, and its Total row sums credit, not sets done. Both are off until you tick them.

## Setup and upgrading

```
cd projects/04-workout-tracker
clasp push --force        # first time: clasp login, then clasp create --type sheets --title "Workout Tracker" --rootDir apps-script
```
Then open the Sheet and run **Workout > Set up workbook** (authorize once). It is idempotent and never wipes data:
creates missing tabs, headers, dropdowns, number-only validation (so the phone shows the number pad), protection, hiding of
the four Sessions columns and the phone trigger; fills a new Exercise Map from the library and seeds an empty Program (first
program template, else an even split of the map); and migrates older
layouts in place (single-list or tick-box Settings, the old *Session* tab name, the Log / Archive muscle columns).
Run it after every push that changes layout. `.claspignore` pushes only `*.gs` and `appsscript.json`.

## Testing

| What | How |
|---|---|
| Pure logic (rules, planning, layout, serialising) | `node gs-tests/run-node.js`, or **Workout > Run tests** |
| The whole Sheet flow on an in-memory SpreadsheetApp mock | `node gs-tests/run-sheet-tests.js` (`--verbose` for script logs, `MOCK_TRACE=1` for the cell and stack of a rejected write, `--part=1` / `--part=2` for one half) |
| The same flow on the real Sheet | **Workout > Run sheet tests 1 of 2**, then **2 of 2** |

Node lives at `C:\Program Files\nodejs`. A new `.gs` file must be added to `gs-tests/gs-files.js`. The mock enforces data
validation like Sheets does; it does not render charts, enforce protection, or fire onEdit triggers. The full in-Sheet suite
is about 8,000 Sheets calls and passes Apps Script's 6-minute limit, so it runs in two halves (section times go to
Extensions > Apps Script > Executions). At Pass 12: pure 336, in-Sheet 117 + 62 = 179, mock 194
(the extra 15 are checks only the runner can do: setup, the action lock, recovery of a killed run).

**The sheet tests overwrite Program, Sessions, Log, Archive, Exercise Map and Settings.** Before touching anything they save
a backup to a hidden **Test Backup** tab; a normal run restores from memory and deletes the tab, and the next run restores
from the tab first if the previous run was killed. **Load sample week** (menu) also replaces Map, Program, Sessions and Log
with no backup: use it on a copy of the workbook only.

## Files

| File | Role |
|---|---|
| `Config.gs` | Constants only: tabs, headers, Settings rows, rules, dropdown lists |
| `Utils.gs` | Name / number helpers, `stageTimer`, `withSummaryPaused` |
| `Setup.gs` | Menu, `setupWorkbook()`, protection, phone trigger, `onSettingsEdit` and the locked action dispatch |
| `SettingsLayout.gs` | Settings tab layout, migration from older layouts |
| `SessionBuilder.gs` | `planSessionRows()` (pure), `buildSession()`, `readSettings()` |
| `SessionLayout.gs` | Prefill, done / started rules, Sessions look (tints, frozen and hidden columns, gray defaults) |
| `Logger.gs` | `planLogRows()`, `weekGaps()`, `completeSession()` (internal: Complete Week, New Mesocycle, phone Clear / Build call it) |
| `LogLayout.gs` | Log sheet layout vs the code row (`[Date, ...Sessions, Secondary, Tertiary]`) |
| `Rollover.gs` | Progression rules, `planNextWeek()` (pure), `completeWeek()`, Rec Weight edit hook |
| `Feedback.gs` | Pump, tendon, connection and soreness rules |
| `Deload.gs` | Stall detection, deload plan, working-week numbering, `makeDeloadWeek()` |
| `Archive.gs` | Archive transform, start weights, `startNewMesocycle()` |
| `MuscleSummary.gs` | Summary pivot, roles from the Exercise Map, `refreshSummarySafe()` |
| `ExerciseLibraryUpper.gs`, `ExerciseLibraryLower.gs` | Data only: the exercise library rows (Exercise, Primary, Secondary, Tertiary) |
| `ExerciseLibrary.gs` | `LIBRARY_MUSCLES`, `planLibraryMerge()` (pure), `loadExerciseLibrary()` |
| `ExerciseMapGuard.gs` | `duplicateExercises()` (pure), `setupMapGuard()` (validation + red tint), `reportMapDuplicates()` |
| `ProgramTemplates.gs` | `PROGRAM_TEMPLATES` (superset-paired days), `loadProgramTemplate()` |
| `Trends.gs` | Trends series (pure), chart, dropdown hook |
| `SampleWeek.gs` | Sample-week loader (copy only); its data also drives the week-flow tests |
| `*Tests.gs`, `SheetBaseTests.gs`, `TestBackup.gs`, `Tests.gs` | Tests per area; `Tests.gs` collects the pure ones; `TestBackup.gs` protects your data during sheet tests |

## Notes for changing the code

- Pure logic goes above a "Sheet side" marker so Node covers it. When the real Sheet and the mock disagree, fix the mock first.
- A Log row in code is `[Date, ...Session columns, Secondary, Tertiary]`; anything reading the Log sheet directly must go
  through `logRowFromSheet` / `logRowToSheet`.
- No top-level code in one `.gs` file may read another file's globals (load order is not guaranteed): derived constants go in `Config.gs`.
- Rep Range and the hidden Sessions columns are hidden, not deleted, because the gray compare, progression and override
  recalculation use them.
- Phone checklist and results: `docs/iphone-test-checklist.md`. Ideas not scheduled: `docs/aspirations.md`.
