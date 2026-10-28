# Apps Script tracker (Pass 2: logging)

Bound Google Sheets script. Program tab is the source of truth; `buildSession()` writes the Session tab for the current week.

## Files
| File | Role |
|---|---|
| `Config.gs` | Constants: tab names, headers, RIR ladder, dropdown lists |
| `Setup.gs` | `setupWorkbook()`, menu, validation, protection, phone trigger |
| `SessionBuilder.gs` | `planSessionRows()` (pure) and `buildSession()` (sheet I/O) |
| `Logger.gs` | `planLogRows()` (pure) and `completeSession()` (appends completed Session rows to Log) |
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
- Session is left as is after logging (Clear Session / next-week rollover handles it).
- After pulling this version into an existing Sheet, run **Set up workbook** once (Session gained an **Actual RIR** column, so later columns moved) and rebuild the Session.
