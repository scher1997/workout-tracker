/**
 * SheetBaseTests.gs — the first live-Sheet checks (split out of SheetTests.gs): tabs, headers, Settings labels and
 * dropdowns (structureSheetTests), then build, log, rebuild/clear and Complete Week (buildFlowSheetTests).
 * Both are called from runSheetTests() with its helpers; they restore nothing themselves, runSheetTests does.
 */

function structureSheetTests(ss, check) {
  // 1. Every tab exists with the right headers
  var expectedHeaders = {};
  expectedHeaders[TABS.PROGRAM] = PROGRAM_HEADERS;
  expectedHeaders[TABS.MAP] = MAP_HEADERS;
  expectedHeaders[TABS.SESSION] = SESSION_HEADERS;
  expectedHeaders[TABS.LOG] = LOG_HEADERS;
  expectedHeaders[TABS.ARCHIVE] = ARCHIVE_HEADERS;
  expectedHeaders[TABS.SUMMARY] = [SUMMARY.headerLabel];
  Object.keys(TABS).forEach(function (k) {
    var sh = ss.getSheetByName(TABS[k]);
    check('tab exists: ' + TABS[k], !!sh, true);
    var h = expectedHeaders[TABS[k]];
    if (sh && h) check('headers: ' + TABS[k], sh.getRange(1, 1, 1, h.length).getValues()[0], h);
  });

  // Settings tab: section titles and every label sit on their configured rows
  var settingsTab = ss.getSheetByName(TABS.SETTINGS);
  check('settings: section titles', SETTINGS_SECTIONS.map(function (s) { return settingsTab.getRange(s.row, 1).getValue(); }),
    SETTINGS_SECTIONS.map(function (s) { return s.title; }));
  check('settings: labels on their rows', Object.keys(SETTINGS_LABELS).filter(function (k) {
    return settingsTab.getRange(SETTINGS_ROWS[k], 1).getValue() !== SETTINGS_LABELS[k];
  }), []);

  // 2. Feedback dropdowns on Session
  var session = ss.getSheetByName(TABS.SESSION);
  var listOf = function (col) {
    var dv = session.getRange(2, col).getDataValidation();
    return dv ? dv.getCriteriaValues()[0] : null;
  };
  check('dropdown soreness', listOf(SESSION_COLS.SORENESS), OPTIONS.soreness);
  check('dropdown pump', listOf(SESSION_COLS.PUMP), OPTIONS.pump);
  check('dropdown tendon', listOf(SESSION_COLS.TENDON), OPTIONS.tendon);
  check('dropdown connection', listOf(SESSION_COLS.CONNECTION), OPTIONS.connection);
}

/** h: the runSheetTests helpers (writeProgram, buildAndRead, enter, enterOnly, rowsOf, exA/exB and their muscles). */
function buildFlowSheetTests(ss, check, h) {
  var session = ss.getSheetByName(TABS.SESSION);
  var logSheet = ss.getSheetByName(TABS.LOG);
  var settingsSheet = ss.getSheetByName(TABS.SETTINGS);
  var writeProgram = h.writeProgram, buildAndRead = h.buildAndRead, enter = h.enter, rowsOf = h.rowsOf;
  var exA = h.exA, exB = h.exB, muscleA = h.muscleA, muscleB = h.muscleB;

  // 3. Two exercises across two days
  writeProgram([['Mon', exA, 3, 20, 8, 12], ['Tue', exB, 4, '', '', '']]);
  var typed = buildAndRead();
  var week = typed.length ? typed[0][SESSION_COLS.WEEK - 1] : null;
  var rir = rirForWeek(readSettings(ss).rirLadder, week);
  check('two-day build: row count', typed.length, 2);
  check('two-day build: day/exercise/muscle',
    typed.map(function (r) { return [r[1], r[2], r[3]]; }), [['Mon', exA, muscleA], ['Tue', exB, muscleB]]);
  check('two-day build: sets', typed.map(function (r) { return r[SESSION_COLS.SETS - 1]; }), [3, 4]);
  check('two-day build: rec weight', typed.map(function (r) { return r[SESSION_COLS.REC_WEIGHT - 1]; }), [20, '']);
  check('two-day build: rep range', typed.map(function (r) { return r[SESSION_COLS.REP_RANGE - 1]; }), ['8–12', '8–12']);
  check('two-day build: target RIR', typed.map(function (r) { return r[SESSION_COLS.RIR - 1]; }), [rir, rir]);

  // 4. Same plan "pasted" messy: stray spaces, wrong case, text numbers, spacer rows
  writeProgram([[' Mon ', ' ' + exA.toUpperCase() + '  ', '3', '20', '8', '12'],
                ['', '', '', '', '', ''],
                ['Tue', exB.toLowerCase(), '4', '', '', '']]);
  var pasted = buildAndRead();
  check('pasted plan equals typed plan except exercise casing', stripName(pasted), stripName(typed));
  check('pasted plan keeps map muscles', pasted.map(function (r) { return r[3]; }), [muscleA, muscleB]);
  // 5. Pass 2: completing a session logs rows once
  writeProgram([['Mon', exA, 3, 20, 8, 12], ['Tue', exB, 4, 50, 8, 12], ['Wed', exA, 2, 15, 8, 12]]);
  buildAndRead();
  enter(2, { S1: 10, S2: 9, S3: 8, ACTUAL_RIR: 2, ACTUAL_WEIGHT: 22.5, PUMP: 'great', NOTES: 'felt good' });
  enter(3, { S1: 12, S2: 11, S3: 10, S4: 9, ACTUAL_RIR: 1 });   // row 4 left untouched
  clearBody(logSheet, LOG_HEADERS.length);
  var first = completeSession({ interactive: false });
  var logged = rowsOf(logSheet, LOG_HEADERS.length).map(logRowFromSheet);   // code rows: r[SESSION_COLS.X] indexing
  check('log: 2 of 3 exercises appended', logged.length, 2);
  check('log: result counts', [first.logged, first.notCompleted], [2, 1]);
  check('log: exercise/week/sets', logged.map(function (r) { return [r[SESSION_COLS.WEEK], r[SESSION_COLS.EXERCISE], r[SESSION_COLS.SETS]]; }),
    [[week, exA, 3], [week, exB, 4]]);
  check('log: reps, RIR, weight row 1', [logged[0][SESSION_COLS.S1], logged[0][SESSION_COLS.S2], logged[0][SESSION_COLS.S3],
    logged[0][SESSION_COLS.ACTUAL_RIR], logged[0][SESSION_COLS.ACTUAL_WEIGHT]], [10, 9, 8, 2, 22.5]);
  check('log: weight falls back to rec', logged[1][SESSION_COLS.ACTUAL_WEIGHT], 50);
  check('log: feedback carried', [logged[0][SESSION_COLS.PUMP], logged[0][SESSION_COLS.NOTES]], ['great', 'felt good']);
  check('log: date is today', logged[0][0] instanceof Date, true);
  var second = completeSession({ interactive: false });
  check('log: second complete adds nothing', [second.logged, second.duplicatesSkipped, rowsOf(logSheet, LOG_HEADERS.length).length], [0, 2, 2]);

  // 6. Phone path: rebuild logs unlogged exercises and refuses; clear logs them first, then clears
  clearBody(logSheet, LOG_HEADERS.length);
  check('unlogged count', countUnlogged(ss), 2);
  buildSession({ interactive: false });
  check('rebuild refused but exercises logged first', [session.getRange(2, SESSION_COLS.S1).getValue(), countUnlogged(ss)], [10, 0]);
  check('status explains refusal', String(ss.getSheetByName(TABS.SETTINGS).getRange(SETTINGS_ROWS.STATUS, 2).getValue()).indexOf('Pick Clear Session') > -1, true);
  clearBody(logSheet, LOG_HEADERS.length);
  clearSession({ interactive: false });
  check('clear logs unlogged exercises first, then clears', [rowsOf(session, SESSION_HEADERS.length).length, rowsOf(logSheet, LOG_HEADERS.length).length], [0, 2]);

  // 7. Pass 3: Complete Week rolls the plan forward
  var weekCell = settingsSheet.getRange(SETTINGS_ROWS.WEEK, 2);
  weekCell.setValue(1);
  settingsSheet.getRange(SETTINGS_ROWS.MESO_WEEKS, 2).setValue(6);
  writeProgram([['Mon', exA, 3, 15, 8, 12], ['Tue', exB, 3, 100, 8, 12], ['Wed', exA, 3, 40, 8, 12]]);
  clearBody(logSheet, LOG_HEADERS.length);
  buildAndRead();
  enter(2, { S1: 12, S2: 12, S3: 12 });   // Rep Max 12 reached -> weight up, reps reset to Rep Min
  enter(3, { S1: 10, S2: 10, S3: 10 });   // holds weight, +1 rep
  var rolled = completeWeek({ interactive: false });   // row 4 never touched
  var week2 = rowsOf(session, SESSION_HEADERS.length);
  check('rollover: ok, auto-logged the 2 completed exercises', [rolled.ok, rowsOf(logSheet, LOG_HEADERS.length).length], [true, 2]);
  check('rollover: Settings week advanced', weekCell.getValue(), 2);
  check('rollover: week 2 rows carry RIR 2', week2.map(function (r) { return [r[SESSION_COLS.WEEK - 1], r[SESSION_COLS.RIR - 1]]; }),
    [[2, 2], [2, 2], [2, 2]]);
  check('rollover: weights 15->17.5, 100 held, unlogged back to Program',
    week2.map(function (r) { return r[SESSION_COLS.REC_WEIGHT - 1]; }), [17.5, 100, 40]);
  check('rollover: rep targets 8 (reset to Rep Min), 11, rep min',
    week2.map(function (r) { return r[SESSION_COLS.REP_TARGET - 1]; }), [8, 11, 8]);
  check('rollover: the new week is prefilled with its Rep Target and holds no ratings or notes',
    week2.every(function (r) {
      return r[SESSION_COLS.S1 - 1] === r[SESSION_COLS.REP_TARGET - 1] && r[SESSION_COLS.PUMP - 1] === '' && r[SESSION_COLS.NOTES - 1] === '';
    }), true);

  // Overriding Rec Weight recalculates Rep Target (programmatic edits don't fire the trigger, so call it)
  session.getRange(2, SESSION_COLS.REC_WEIGHT).setValue(20);
  recalcRepsForWeightEdit(session.getRange(2, SESSION_COLS.REC_WEIGHT), 17.5);
  check('override 17.5 -> 20 lb: reps 8 -> 9 (15 lb x 12 reps last week = 180 volume)', session.getRange(2, SESSION_COLS.REP_TARGET).getValue(), 9);

  // A second tick with nothing logged for week 2 must not skip ahead
  var again = completeWeek({ interactive: false });
  check('second Complete Week refused, week stays 2', [again.ok, weekCell.getValue()], [false, 2]);

  // Last week of the mesocycle does not roll when "Deload after last week" is off
  settingsSheet.getRange(SETTINGS_ROWS.MESO_WEEKS, 2).setValue(2);
  settingsSheet.getRange(SETTINGS_ROWS.DELOAD_AT_END, 2).setValue(false);
  enter(2, { S1: 10, S2: 10, S3: 10 });
  check('last mesocycle week refused (deload toggle off)', [completeWeek({ interactive: false }).ok, weekCell.getValue()], [false, 2]);
}
