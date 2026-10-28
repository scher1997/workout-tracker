# Apps Script tracker (Pass 1: skeleton)

Bound Google Sheets script. Program tab is the source of truth; `buildSession()` writes the Session tab for the current week.

## Files
| File | Role |
|---|---|
| `Config.gs` | Constants: tab names, headers, RIR ladder, dropdown lists |
| `Setup.gs` | `setupWorkbook()`, menu, validation, protection, phone trigger |
| `SessionBuilder.gs` | `planSessionRows()` (pure) and `buildSession()` (sheet I/O) |
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
