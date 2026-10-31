# Apps Script tracker (Pass 3: Complete Week)

Bound Google Sheets script. Program tab is the source of truth; `buildSession()` writes the Session tab for the current week.

## Files
| File | Role |
|---|---|
| `Config.gs` | Constants: tab names, headers, RIR ladder, dropdown lists |
| `Setup.gs` | `setupWorkbook()`, menu, validation, protection, phone trigger |
| `SessionBuilder.gs` | `planSessionRows()` (pure) and `buildSession()` (sheet I/O) |
| `Logger.gs` | `planLogRows()` (pure) and `completeSession()` (appends completed Sessions rows to Log; run by Complete Week, no menu item or button of its own) |
| `Rollover.gs` | Progression rules, `planNextWeek()` (pure) and `completeWeek()`; Rec Weight edit hook |
| `Feedback.gs` | Pump, tendon, connection and soreness rules |
| `Deload.gs` | Stall detection, deload recommendation, deload week plan and `makeDeloadWeek()` |
| `Archive.gs` | Archive transform, start weights, `startNewMesocycle()` |
| `MuscleSummary.gs` | Muscle Summary pivot: roles from Exercise Map, `planMuscleSummary()` (pure), `refreshSummarySafe()` |
| `Trends.gs` | Trends dashboard: item/metric series (pure), chart, dropdown edit hook |
| `SettingsLayout.gs` | Settings tab layout: three tables, one-time move from the old single list |
| `Utils.gs` | Name/number helpers |
| `Tests.gs` | `runPureTests()`, `runAllTests()` |

## Settings tab (layout in `SETTINGS_ROWS` / `SETTINGS_SECTIONS`, Config.gs; code in `SettingsLayout.gs`)
Three tables, two columns (label, value), sized for a phone:
- **ACTIONS**: Current week, Status, and one **Action** dropdown. Pick Build Session, Complete Week, Clear Session, Deload this week, Refresh Muscle Summary or Start New Mesocycle; the cell resets to "Choose action" straight away and Status shows "Working: ..." until the result replaces it. List in `SETTINGS_ACTIONS`.
- **PROGRAM SETUP** (once per mesocycle): Mesocycle name, Mesocycle length, Target RIR by week, Default rep min / max.
- **PREFERENCES**: Deload after last week, Count secondary / tertiary muscles, and their credit per set (checkboxes stay for these on/off options).
Move a setting by changing its row in `SETTINGS_ROWS`; code only uses the names. Running **Set up workbook** on a Sheet with an older Settings layout (single list, or Pass 8 tick boxes) carries your values over once. The Session tab is now called **Sessions** (renamed in place by Set up workbook).
Number-only cells (weights, reps, RIR, Program sets/weights/reps, numeric Settings) have a number validation so the phone shows the number pad. Rep Range stays text.

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
- Phone: pick **Build Session** in the Settings Action dropdown (installable onEdit trigger). Result appears in Settings > Status.
- Custom menus and drawing-assigned scripts are not expected to run in the iPhone Sheets app; the checkbox is the mobile path. Offline picks run once the edit syncs.

## Logging a session
- There is no separate "complete session" action. Enter reps in **Sessions** as you train; **Complete Week** logs every Sessions exercise that has reps (then rolls the week).
- An exercise is logged once any of S1–S5 has reps. Untouched exercises are skipped; blank Actual Weight logs the Rec Weight.
- One Log row per exercise, keyed by week + day + exercise. Already-logged exercises are skipped.
- Clear Session and Build Session on the phone log any completed exercises first, so nothing is lost. Build Session still refuses if Sessions holds entries (Clear Session first); the menu versions ask first.
- After pulling an older version: run **Set up workbook** once and rebuild Sessions if columns moved.

## Complete Week (rollover)
- Desktop: **Workout > Complete week (roll to next week)**. Phone: pick **Complete Week** in the Settings Action dropdown. Never runs on its own.
- Logs any completed Session exercises first, then builds next week's Session and bumps Settings > Current week. Program is not modified.
- Refuses when nothing is logged for the current week (blocks double-ticks) and when the current week is the last of the mesocycle (unless a deload week follows, see Deload).
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

## Deload (Pass 5; code in `Deload.gs`, numbers in `DELOAD`, Config.gs)
A deload week = half the Program sets (rounded up, min 1), weight held, reps = last performed (no push), Target RIR 4, flag "Deload week". State is derived from the Log (a week is a deload if its rows carry the flag); nothing is stored.
- **Stall**: an exercise is stalled after 3 consecutive logged weeks with no weight or rep gain over the week before (flag "Stalled N weeks"). Maintenance (tendon) weeks are skipped, a skipped week ends the run, and counting restarts after a deload. Progression is not changed by the flag.
- **Recommendation**: when at least half of the logged exercises (minimum 2) are stalled, the Complete Week status says "Deload recommended". It never converts anything on its own.
- **Deload this week**: **Workout > Make this week a deload**, or pick **Deload this week** in the Settings Action dropdown. Rewrites the current, not-yet-started Session as a deload from Log history up to last week. Refuses if Session has entries or is already a deload.
- **End of mesocycle**: with Settings > **Deload after last week** on (default), Complete Week on the last working week builds the next week as a deload (week N+1). Completing that deload week is refused (mesocycle complete: use Start New Mesocycle, see below). Off = the old refusal.
- After a deload, progression resumes from the last working week (normal +1 rep at the same weight), not from the deload week's numbers. Soreness on a deload row eases from the deload RIR.
- Existing Sheet: run **Set up workbook** once to add the Deload settings.

## Archive and new mesocycle (Pass 6; code in `Archive.gs`, columns in `ARCHIVE_HEADERS`, Config.gs)
The **Archive** tab is a chart-ready, long-term view across mesocycles: one row per exercise per day per week. Columns: Mesocycle, Meso Week, Overall Week, Date, Week Type, Day, Exercise, Muscle Group, Sets Done, Weight, Avg Reps, Volume, Target RIR, Actual RIR, Soreness, Pump, Tendon, Connection, Flags.
- **Overall Week** keeps counting across mesocycles (meso week + the Archive's highest Overall Week), so it works as a time axis. **Date** is the week's earliest logged date. **Week Type** is Working or Deload.
- **Volume** = weight x total reps entered; **Avg Reps** is to one decimal; **Sets Done** counts S1-S5 entries. Notes and the raw S1-S5 reps stay out of Archive. A re-logged exercise keeps its latest row.
- **Start new mesocycle**: **Workout > Start new mesocycle (archive + reset)**, or pick **Start New Mesocycle** in the Settings Action dropdown. In order: log any completed Session exercises, append to Archive and verify the row count, set Program > Start Weight to each exercise's last working-week weight (deload weeks ignored; unlogged exercises keep theirs), clear Session and Log, advance **Mesocycle name** ("Meso 1" -> "Meso 2"), set Current week to 1 and build the week-1 Session. Log is only cleared after the Archive copy checks out.
- **Mesocycle name** (Settings > Program setup) is the Archive label. Archive refuses a label it already holds, so a double pick cannot duplicate rows.
- The phone checkbox only runs when the mesocycle is finished (the deload week is the current week, or the last week with the deload toggle off, or past the end). The menu item can end an unfinished mesocycle early after a confirmation.
- A pending progression bump is not applied to the start weight: it is the weight actually used in the last working week.
- Existing Sheet: run **Set up workbook** once (adds the Archive tab and the Mesocycle name and Start New Mesocycle settings; the name starts at "Meso 1").

## Muscle Summary and Trends (Pass 7; code in `MuscleSummary.gs` and `Trends.gs`, constants in `SUMMARY` / `TRENDS_LAYOUT`, Config.gs)
- **Muscle Summary** tab (script-written, warning-protected): rows = muscle groups, columns = Overall Week, cells = sets done. Row 2 names the mesocycle ("Meso 1 · Deload" on deload weeks), last row is Total, darker green = more sets. Skipped weeks show as zero columns.
- **Data**: Archive (past mesocycles) + the current Log, so the weeks keep counting after Start New Mesocycle. Sets = sets actually done (S1-S5 entries), same as Archive "Sets Done".
- **Exercise Map** has three muscle columns: **Muscle Group** (primary), **Secondary Muscles**, **Tertiary Muscles** (comma lists, optional). The muscle-group rows are every name in those columns, in map order; a new group such as Adductors appears as soon as it is typed into the map (zeros until logged). Nothing is named in code.
- The muscle of a logged exercise is looked up in the map when the summary refreshes, so adding an exercise to the map also fixes earlier `?? not in Exercise Map` rows. An exercise missing from the map keeps the muscle stored on its Log row; anything still unknown gets its own last row, so totals always add up.
- **Secondary / tertiary counting** (Settings > Preferences): tick *count secondary / tertiary muscles* and set the credit per set (defaults 0.5 and 0.25). Primary always counts 1. A muscle named in several roles of one exercise counts once, at the highest role that is switched on. Both boxes off = a plain primary-only hand count. A caption under the pivot says what is being counted. Total = sum of the rows, so it includes the fractional credit.
- **Trends** tab: pick an item in B1 (*Muscle: x* or *Exercise: x*) and a metric in B2 (Sets, Volume, Top weight, Avg reps). Chart below, data block in J:K, item list in M (script-managed). Muscles only have Sets and Volume (other metrics fall back to Sets, with a note); muscle Volume follows the same secondary/tertiary options.
- **Refresh** is automatic after Complete Week and Start New Mesocycle, and when you edit the Exercise Map, the Settings > Preferences options or the Trends dropdowns (same installable onEdit trigger, no new authorization). Manual: **Workout > Refresh muscle summary + trends**, or pick **Refresh Muscle Summary** in the Settings Action dropdown. A summary error is logged and never blocks logging.
- Existing Sheet: run **Set up workbook** once (adds the Trends tab, Exercise Map columns C-D and the new Settings options), then **Run sheet tests**.
