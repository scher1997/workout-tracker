# Apps Script tracker (Pass 3: Complete Week)

Bound Google Sheets script. Program tab is the source of truth; `buildSession()` writes the Session tab for the current week.

## Files
| File | Role |
|---|---|
| `Config.gs` | Constants: tab names, headers, RIR ladder, dropdown lists |
| `Setup.gs` | `setupWorkbook()`, menu, validation, protection, phone trigger |
| `SessionBuilder.gs` | `planSessionRows()` (pure) and `buildSession()` (sheet I/O) |
| `Logger.gs` | `planLogRows()` (pure) and `completeSession()` (appends completed Session rows to Log) |
| `Rollover.gs` | Progression rules, `planNextWeek()` (pure) and `completeWeek()`; Rec Weight edit hook |
| `Utils.gs` | Name/number helpers |
| `Tests.gs` | `runPureTests()`, `runAllTests()` |

## Local tests
```
node gs-tests/run-node.js
```

## clasp
```
clasp login
clasp create --type sheets --title "Workout Tracker" --rootDir apps-script
clasp push
```
Then open the Sheet and run **Workout > Set up workbook** (authorize once).

## Building the Session
- Desktop: **Workout > Build session**.
- Phone: tick the **Build Session** checkbox on the Settings tab (installable onEdit trigger). Result appears in Settings > Status.
- Custom menus and drawing-assigned scripts are not expected to run in the iPhone Sheets app; the checkbox is the mobile path. Offline ticks run once the edit syncs.

## Logging a session
- Desktop: **Workout > Complete session (log it)**. Phone: tick **Complete Session** on Settings.
- An exercise is logged once any of S1–S5 has reps. Untouched exercises are skipped; blank Actual Weight logs the Rec Weight.
- One Log row per exercise, keyed by week + day + exercise. Already-logged exercises are skipped; the menu asks before logging them again, the phone checkbox just skips.
- Clear Session and Build Session (phone checkbox) refuse while completed exercises are not in Log; the menu versions warn and ask first.
- Session is left as is after logging (Clear Session / next-week rollover handles it).
- After pulling this version into an existing Sheet, run **Set up workbook** once (Session gained an **Actual RIR** column, so later columns moved) and rebuild the Session.

## Complete Week (rollover)
- Desktop: **Workout > Complete week (roll to next week)**. Phone: tick **Complete Week** on Settings. Never runs on its own.
- Logs any completed Session exercises first, then builds next week's Session and bumps Settings > Current week. Program is not modified.
- Refuses when nothing is logged for the current week (blocks double-ticks) and when the current week is the last of the mesocycle.
- Rules (numbers in `PROGRESSION`, Config.gs): reps = average over sets entered.
  - Reps >= 15: weight +5% rounded to 2.5 lb, minimum +2.5 lb; reps = prev weight x prev reps / new weight, capped at 13.
  - Otherwise: same weight, rep target = reps + 1 (at least Rep Min, at most 13 or Rep Max).
  - Target RIR comes from the Settings ladder (3, 2, 1, 0).
  - Exercise skipped this week: repeats its latest logged weight/reps. Never logged: Program start weight.
- Editing **Rec Weight** on Session recalculates **Rep Target** so weight x reps matches last week's logged volume (uses the installable onEdit trigger from Set up workbook).
- Existing Sheet: run **Set up workbook** once to add the Complete Week checkbox row.

## Feedback rules (Pass 4; code in `Feedback.gs`, numbers and flag wording in `FEEDBACK`, Config.gs)
Ratings are the Session dropdowns (Soreness, Pump, Tendon, Connection). A blank rating counts as neutral. Messages land in the script-managed **Flags** column (last column of Session and Log).
- **Pump** (applies to the same-weight path): great/mid -> rep target = reps + 1; none -> reps + 2. Capped at the rep ceiling. The weight-increase path (15+ reps) keeps its volume-matched reps.
- **Tendon**: bad -> maintenance next week: weight held, Program sets minus 1 (min 1), reps = last reps (no push), no weight increase. Flag "Maintenance". Maintenance is derived from the latest logged tendon rating, so one neutral/good (or blank) week ends it: the following week progresses normally from the same weight with the Program set count.
- **Connection**: "not at all" -> "Technique check" flag; in 2 consecutive weeks -> "Swap suggested". A good/great week or a skipped week resets the count. Progression is not changed.
- **Soreness** (per muscle group, per day; entered before training): "still sore" -> that session's Target RIR is one step easier (1 -> 2) and the rating spreads to the other rows with the same Day + Muscle Group. Sets are never changed. Still sore this week and last week -> "Under-recovered ... consider trimming a set" flag. Runs on the Session onEdit trigger (works from the phone once online); setting it back to none/mild restores the ladder RIR.
- Existing Sheet: run **Set up workbook** once (Session and Log gain a **Flags** column) and rebuild Session.
