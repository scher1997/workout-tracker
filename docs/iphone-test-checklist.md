# iPhone test checklist (Google Sheets app)

Status: results below were filled in on a real iPhone (24/27 pass: steps 3, 24, 26 failed; step 6 passed but asked for a number pad). Round 2 changes are listed at the bottom; all five Round 2 re-tests (R1-R5) passed on the phone.

## How the phone path works (and what will not)

| Mechanism | Runs on iPhone? | What the tracker does |
|---|---|---|
| Custom menu (`Workout`) | **No.** The mobile app does not show Apps Script menus. | Not used on phone. Desktop only. |
| Button = drawing with assigned script | **No.** Tapping a drawing in the app does not run the script. | Not used anywhere. |
| Checkbox on Settings + installable onEdit trigger | **Yes** (a tick fires the trigger server-side; confirmed in an earlier pass, re-check in step 3). | The only phone action path. |
| Dialogs / alerts / confirmations | **No** (trigger context has no UI). | Phone paths refuse and write the reason to Settings > **Status** instead of asking. |

Where to look when something fails: Settings > Status cell first; then on desktop Extensions > Apps Script > **Executions** (error text, duration) and **Triggers** (exactly one `onSettingsEdit` / On edit).

## Before you start (once, on desktop)
1. `clasp push` is current (19 files), then **Workout > Set up workbook**, then **Run sheet tests** (expect 120/120).
2. Triggers page shows one `onSettingsEdit` trigger.
3. On the phone: open the Sheet, ⋮ > **Make available offline**. Without this, offline editing may not work at all.

## Checklist

Legend: Result = PASS / FAIL. Expected is what a pass looks like. Workaround is what to do if it fails.

### A. Layout and reading (online)
| # | Step | Expected | Result | Workaround if FAIL |
|---|---|---|---|---|
| 1 | Open Settings | The three tables (Actions, Program setup, Preferences) fit one screen width; no sideways scroll; checkboxes tappable with a thumb | PASS | Reduce column widths in `SettingsLayout.gs` `formatSettings`; or use landscape |
| 2 | Read the Status cell after any action | Message wraps fully, readable | TRUE | Raise row height / font in `formatSettings` |
| 3 | Tick **Build Session** | Box unticks itself within a few seconds; Status says session built for the current week |FAIL Instead of being "ticked" it goes to TRUE and stays there.  | If box stays ticked >30 s: check Executions on desktop; build the session from the desktop menu |
| 4 | Open Session | Rec Weight, Rep Range, Sets, Target RIR visible; scroll right reaches S1-S5, Actual RIR, feedback dropdowns, Flags (22 columns) | PASS | Freeze Day/Exercise columns; hide rarely used columns on the phone view |
| 5 | Open Muscle Summary | Frozen header row/first column hold while scrolling; week columns legible | PASS | Adjust widths/freeze in `writeSummaryGrid` |

### B. Logging a session (online)
| # | Step | Expected | Result | Workaround if FAIL |
|---|---|---|---|---|
| 6 | Enter reps in S1-S3 for two exercises; set ratings from dropdowns | Dropdowns open on tap; numbers accepted; no warning popups on Session |PASS but can we change the data type of the cell so I get a numpad popup on my phone instead of full keyboard? | If dropdowns misbehave, type the exact label text |
| 7 | Edit **Actual Weight** on one exercise | Value kept | Pass| none expected |
| 8 | Edit **Rec Weight** on one exercise | Rep Target recalculates within seconds | PASS | Type the Rep Target by hand (it is editable) |
| 9 | Set **Soreness** = still sore on one row | Target RIR eases one step for that muscle group/day; Flags update | PASS | Edit Target RIR by hand |
| 10 | Tick **Complete Session** | Box unticks; Status "logged N exercises"; Log tab has N new rows | PASS | Wait for sync, re-tick; on desktop use Workout > Complete session |
| 11 | Tick **Complete Session** again with nothing new | Status says nothing new / already logged (no duplicates) | PASS | none expected |

### C. Complete Week (online)
| # | Step | Expected | Result | Workaround if FAIL |
|---|---|---|---|---|
| 12 | Tick **Complete Week** | Box unticks; Current week +1; Session rebuilt with new weights/reps/RIR; Status summarises |PASS | Desktop: Workout > Complete week |
| 13 | Tick **Complete Week** again immediately | Refused (nothing logged for the new week); Current week unchanged | PASS | none expected |
| 14 | Open Session | Next-week values look right (same weight, reps +1 unless 15+ reps) | PASS | Edit by hand; report the exercise |
| 15 | Edit Rec Weight / Rep Target / Actual Weight on the new week | All stay editable, formulas elsewhere intact | PASS | none expected |

### D. Summary and trends (online)
| # | Step | Expected | Result | Workaround if FAIL |
|---|---|---|---|---|
| 16 | Muscle Summary after step 10/12 | New sets appear under the correct muscle group and week | PASS | Tick **Refresh Muscle Summary** |
| 17 | Change Trends B1 / B2 dropdown | Chart and data redraw within seconds | PASS | Tick **Refresh Muscle Summary** after changing them |
| 18 | Chart renders | Script-drawn chart visible and not clipped (width 640 may exceed the screen) | PASS | Narrow `drawTrendChart` width; read the data block J:K instead |
| 19 | Exercise Map: add an exercise or change a muscle | Summary / Trends item list updates | PASS | Tick **Refresh Muscle Summary**; or edit the map on desktop |
| 20 | Settings > Preferences: toggle secondary/tertiary, change a credit | Summary re-computes | PASS | Tick **Refresh Muscle Summary** |

### E. Poor signal / offline (the brief's hard constraint)
Airplane mode on, Sheet already open and available offline.
| # | Step | Expected | Result | Workaround if FAIL |
|---|---|---|---|---|
| 21 | Enter reps and weights on Session | Edits accepted locally | PASS | If the app blocks edits offline, log in the Notes app and enter later |
| 22 | Tick **Complete Session** offline | Box shows ticked (stays ticked, nothing happens yet) | PASS | none; wait |
| 23 | Reconnect, wait for sync | Box unticks, Log gets the rows, Status updated | PASS | Re-tick once online if the box is still ticked after a minute and Executions shows no run |
| 24 | Offline: tick **Complete Session** then **Complete Week**, reconnect | Runs in order: session logged, then week rolled once; Session shows next week | Complete Session PASS. Complete Week FAIL or took too long. I waited a minute then tried Complete Week with a connection. | Tick one box at a time, wait for it to clear before the next |
| 25 | Rapid double-tick of the same box | Second run is refused or harmless, no duplicate Log rows or double week advance | PASS | Tick once and wait; no locking exists yet, add `LockService` in `onSettingsEdit` if it fails |
| 26 | Trigger latency | Each action completes in under ~10 s online | FALSE for Complete Session/Week | Report the Executions duration |

### F. Protection
| # | Step | Expected | Result | Workaround if FAIL |
|---|---|---|---|---|
| 27 | Tap a script-managed cell (e.g. Flags, Muscle Summary grid) and edit | Warning shown or edit blocked; weight/reps/feedback cells are never blocked | PASS | If the app blocks editable cells: loosen the range protection in `Setup.gs` |

## Known limits to expect
- **Offline needs a prior open.** The file must be available offline, otherwise the app may not open it at all with no signal.
- **Triggers run server-side only.** Offline ticks do nothing until sync; this is expected, not a failure.
- **Script errors are not shown on the phone.** Only the Status cell, or desktop Executions. A summary-refresh failure is only logged, not shown.
- **Apps Script quotas.** 6-minute execution limit and daily trigger runtime; rapid repeated refreshes (Trends dropdown spam) cost runtime.
- **Unguarded concurrency.** Two near-simultaneous trigger runs are not serialized (no LockService). Step 25 tests whether this matters in practice.

## Round 2: changes made after these results (re-test on the phone after clasp push + Set up workbook)
| Finding | Change | Re-test (all PASS) |
|---|---|---|
| Step 3: tick stayed TRUE; ticks felt unreliable | Action checkboxes replaced by one **Action** dropdown (Settings row 4). The cell resets to "Choose action" first and Status shows "Working: ..." so you can see it started. Trigger start latency itself is Google-side and cannot be removed. | R1: pick each action; cell resets, Status updates |
| Steps 24/26: Complete Week took minutes | Timers added (Executions log shows where time goes); duplicate summary+chart refresh removed; Settings read in one call. Chart redraw may still be slow: send me the Executions log lines "completeWeek total ..." and "refreshAllSummaries total ...". | R2: time Complete Week; check Executions |
| Step 6: number pad | Number validation on weights, Rep Target, S1-S5, Actual RIR, Program numeric columns, numeric Settings. | R3: tap S1 / Actual Weight: number pad shown? If not, tell me and I will try formatting the cells as numbers instead |
| Complete Session removed | Complete Week logs every Sessions exercise with reps. Clear/Build on the phone log pending exercises first. | R4: enter reps, pick Clear Session: Log gets the rows, then Sessions empties |
| Session tab renamed | Tab is now **Sessions** (renamed in place). | R5: tab exists with data intact |

## Known limits
- If the Action dropdown also feels slow, the delay is the trigger (server-side), not the sheet. Workaround: pick the action, then check Status after a few seconds.
