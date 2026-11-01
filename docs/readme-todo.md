# README to-do

Running list of what `apps-script/README.md` still gets wrong or lacks. The README is rewritten once, at the end of the project; add a line here whenever a change makes it stale.

## Stale (describes the old behaviour)
- Lines ~60-61, 69: progression is now double progression. Weight goes up when the average reps reach the row's own Rep Max, and reps reset to Rep Min. There is no global ceiling of 13 or threshold of 15, and no volume matching on the weight-up path.
- Line ~64: editing Rec Weight still recalculates Rep Target (volume match), and now also moves prefilled sets that still hold the old target, and an untouched Actual Weight.
- Line ~91: Start New Mesocycle now applies the pending weight bump to Program > Start Weight (per exercise, using its Rep Max), and the status lists the exercises raised a step.

## Missing (new since the last README update)
- Complete Week: logs the whole week in one go. Warns about exercises never touched; refuses while an exercise is started but missing Pump / Tendon / Connection. Start New Mesocycle and the phone Clear refuse for the same reason.
- Sessions tab: rows tinted by day (blocks alternate by first appearance), Exercise is the one frozen column, Week / Day / Rep Range / Rep Target are hidden (unhide them from the column header; Set up workbook hides them again).
- Sessions prefill: sets S1..S<Sets> start at the Rep Target (week 1 = Rep Min), Actual RIR / Actual Weight at Target RIR / Rec Weight. Gray until typed over. Untouched defaults are not "entered data". Logged as shown.
- "Done" rule: an exercise counts as done once all three ratings are filled in. Soreness is chosen before training and does not count.
- Menu: Load sample week (full / incomplete), for use on a copy of the workbook only.
- Test tooling: `gs-tests/run-sheet-tests.js` and the mock SpreadsheetApp, `gs-files.js` as the shared file list, `MOCK_TRACE=1`.
- New files: LogLayout, SampleWeek, SessionLayout, WeekFlowTests, SessionLayoutTests (and their roles).
- Mid-meso deload (Pass 11): a deload week uses no step of the RIR ladder and no week of "Mesocycle length", which now counts working weeks (default 7, so the end deload is week 8; label "Mesocycle length (working weeks)"). The week after a deload takes the ladder step the deload replaced; the meso ends after the Nth working week plus the end deload. Messages say "working week x of N". Helpers `workingWeekNumber` / `workingWeeksDone` in Deload.gs. Existing workbooks keep their stored length (6 stays 6 until edited); the label updates on Set up workbook.
- Settings Action picks run under a script lock (`runSettingsAction`, Setup.gs): a second pick while one is running waits 5 s (`ACTION_LOCK_WAIT_MS`), then Status shows "Busy, try again" and nothing runs; the Action cell still resets. Only the Action dispatch is locked, not the Sessions-tab edit handlers.
- Archive's Actual RIR column now holds the Target RIR for exercises logged without an explicit Actual RIR.
