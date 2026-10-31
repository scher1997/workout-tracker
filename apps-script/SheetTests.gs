/**
 * SheetTests.gs — Pass 1 tests that run against the live Sheet (Workout > Run sheet tests).
 * Program and Session contents are backed up and restored; exercise names come from Exercise Map.
 */

function runSheetTests() {
  var ss = SpreadsheetApp.getActive();
  var results = [];
  var check = function (name, actual, expected) {
    var a = JSON.stringify(actual), x = JSON.stringify(expected);
    results.push({ name: name, pass: a === x, detail: a === x ? '' : 'expected ' + x + ' got ' + a });
  };
  var rowsOf = function (sh, width) {
    // getLastRow() also counts rows that only carry dropdowns, so drop fully empty rows.
    var rows = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, width).getValues() : [];
    return rows.filter(function (r) { return r.some(function (c) { return c !== ''; }); });
  };

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

  // 2. Feedback dropdowns on Session
  var session = ss.getSheetByName(TABS.SESSION);
  var program = ss.getSheetByName(TABS.PROGRAM);
  var listOf = function (col) {
    var dv = session.getRange(2, col).getDataValidation();
    return dv ? dv.getCriteriaValues()[0] : null;
  };
  check('dropdown soreness', listOf(SESSION_COLS.SORENESS), OPTIONS.soreness);
  check('dropdown pump', listOf(SESSION_COLS.PUMP), OPTIONS.pump);
  check('dropdown tendon', listOf(SESSION_COLS.TENDON), OPTIONS.tendon);
  check('dropdown connection', listOf(SESSION_COLS.CONNECTION), OPTIONS.connection);

  // Back up user data, then run build tests on a clean slate
  var progBackup = rowsOf(program, PROGRAM_HEADERS.length);
  var sessBackup = rowsOf(session, SESSION_HEADERS.length);
  var logSheet = ss.getSheetByName(TABS.LOG);
  var logBackup = rowsOf(logSheet, LOG_HEADERS.length);
  var settingsSheet = ss.getSheetByName(TABS.SETTINGS);
  var weekBackup = settingsSheet.getRange(SETTINGS_ROWS.WEEK, 2).getValue();
  var mesoBackup = settingsSheet.getRange(SETTINGS_ROWS.MESO_WEEKS, 2).getValue();
  var deloadAtEndBackup = settingsSheet.getRange(SETTINGS_ROWS.DELOAD_AT_END, 2).getValue();
  var nameBackup = settingsSheet.getRange(SETTINGS_ROWS.MESO_NAME, 2).getValue();
  var archiveSheet = ss.getSheetByName(TABS.ARCHIVE);
  var archiveBackup = archiveSheet ? rowsOf(archiveSheet, ARCHIVE_HEADERS.length) : [];
  SUMMARY_STATE.paused = true;   // keep the earlier sections fast; the Muscle Summary section turns it back on
  try {
    var mapRows = rowsOf(ss.getSheetByName(TABS.MAP), 2).filter(function (r) { return r[0] && r[1]; });
    if (mapRows.length < 2) throw new Error('Exercise Map needs at least 2 rows to run build tests');
    var exA = mapRows[0][0], exB = mapRows[1][0];
    var muscleA = mapRows[0][1], muscleB = mapRows[1][1];

    var writeProgram = function (rows) {
      clearBody(program, PROGRAM_HEADERS.length);
      program.getRange(2, 1, rows.length, PROGRAM_HEADERS.length).setValues(rows);
    };
    var buildAndRead = function () {
      clearBody(session, SESSION_HEADERS.length);
      buildSession({ interactive: false });
      return rowsOf(session, SESSION_HEADERS.length);
    };

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
    var enter = function (r, vals) {
      Object.keys(vals).forEach(function (k) { session.getRange(r, SESSION_COLS[k]).setValue(vals[k]); });
    };
    enter(2, { S1: 10, S2: 9, S3: 8, ACTUAL_RIR: 2, ACTUAL_WEIGHT: 22.5, PUMP: 'great', NOTES: 'felt good' });
    enter(3, { S1: 12, S2: 11, S3: 10, S4: 9, ACTUAL_RIR: 1 });   // row 4 left untouched
    clearBody(logSheet, LOG_HEADERS.length);
    var first = completeSession({ interactive: false });
    var logged = rowsOf(logSheet, LOG_HEADERS.length);
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

    // 6. Clear / rebuild refuse (phone path) while completed exercises are unlogged
    clearBody(logSheet, LOG_HEADERS.length);
    check('unlogged count', countUnlogged(ss), 2);
    clearSession({ interactive: false });
    check('clear refused while unlogged', rowsOf(session, SESSION_HEADERS.length).length, 3);
    buildSession({ interactive: false });
    check('rebuild refused while unlogged', session.getRange(2, SESSION_COLS.S1).getValue(), 10);
    check('status explains refusal', String(ss.getSheetByName(TABS.SETTINGS).getRange(SETTINGS_ROWS.STATUS, 2).getValue()).indexOf('not logged yet') > -1, true);
    completeSession({ interactive: false });
    check('unlogged count after logging', countUnlogged(ss), 0);
    clearSession({ interactive: false });
    check('clear allowed once logged', rowsOf(session, SESSION_HEADERS.length).length, 0);

    // 7. Pass 3: Complete Week rolls the plan forward
    var weekCell = settingsSheet.getRange(SETTINGS_ROWS.WEEK, 2);
    weekCell.setValue(1);
    settingsSheet.getRange(SETTINGS_ROWS.MESO_WEEKS, 2).setValue(6);
    writeProgram([['Mon', exA, 3, 15, 8, 12], ['Tue', exB, 3, 100, 8, 12], ['Wed', exA, 3, 40, 8, 12]]);
    clearBody(logSheet, LOG_HEADERS.length);
    buildAndRead();
    enter(2, { S1: 15, S2: 15, S3: 15 });   // 15 reps -> weight up (Rec Weight logged)
    enter(3, { S1: 10, S2: 10, S3: 10 });   // holds weight, +1 rep
    var rolled = completeWeek({ interactive: false });   // row 4 never touched
    var week2 = rowsOf(session, SESSION_HEADERS.length);
    check('rollover: ok, auto-logged the 2 completed exercises', [rolled.ok, rowsOf(logSheet, LOG_HEADERS.length).length], [true, 2]);
    check('rollover: Settings week advanced', weekCell.getValue(), 2);
    check('rollover: week 2 rows carry RIR 2', week2.map(function (r) { return [r[SESSION_COLS.WEEK - 1], r[SESSION_COLS.RIR - 1]]; }),
      [[2, 2], [2, 2], [2, 2]]);
    check('rollover: weights 15->17.5, 100 held, unlogged back to Program',
      week2.map(function (r) { return r[SESSION_COLS.REC_WEIGHT - 1]; }), [17.5, 100, 40]);
    check('rollover: rep targets 13 (volume match), 11, rep min',
      week2.map(function (r) { return r[SESSION_COLS.REP_TARGET - 1]; }), [13, 11, 8]);
    check('rollover: entry cells empty', week2.every(function (r) { return r[SESSION_COLS.S1 - 1] === ''; }), true);

    // Overriding Rec Weight recalculates Rep Target (programmatic edits don't fire the trigger, so call it)
    session.getRange(2, SESSION_COLS.REC_WEIGHT).setValue(20);
    recalcRepsForWeightEdit(session.getRange(2, SESSION_COLS.REC_WEIGHT), 17.5);
    check('override 17.5 -> 20 lb: reps 13 -> 11', session.getRange(2, SESSION_COLS.REP_TARGET).getValue(), 11);

    // A second tick with nothing logged for week 2 must not skip ahead
    var again = completeWeek({ interactive: false });
    check('second Complete Week refused, week stays 2', [again.ok, weekCell.getValue()], [false, 2]);

    // Last week of the mesocycle does not roll when "Deload after last week" is off
    settingsSheet.getRange(SETTINGS_ROWS.MESO_WEEKS, 2).setValue(2);
    settingsSheet.getRange(SETTINGS_ROWS.DELOAD_AT_END, 2).setValue(false);
    enter(2, { S1: 10, S2: 10, S3: 10 });
    check('last mesocycle week refused (deload toggle off)', [completeWeek({ interactive: false }).ok, weekCell.getValue()], [false, 2]);

    var helpers = { writeProgram: writeProgram, buildAndRead: buildAndRead, enter: enter, rowsOf: rowsOf,
      completeWeek: completeWeek, exA: exA, exB: exB };
    // 8. Pass 4: pump, tendon, connection, soreness (FeedbackTests.gs)
    feedbackSheetTests(ss, check, helpers);
    // 9. Pass 5: stall recommendation and deload weeks (DeloadTests.gs)
    deloadSheetTests(ss, check, helpers);
    // 10. Pass 6: Archive and Start New Mesocycle (ArchiveTests.gs)
    archiveSheetTests(ss, check, helpers);
    // 11. Pass 7: Muscle Summary and Trends (MuscleSummaryTests.gs)
    muscleSummarySheetTests(ss, check, helpers);
  } catch (e) {
    check('sheet tests ran without error', String(e), '');
  } finally {
    // Restore the user's own data
    settingsSheet.getRange(SETTINGS_ROWS.WEEK, 2).setValue(weekBackup);
    settingsSheet.getRange(SETTINGS_ROWS.MESO_WEEKS, 2).setValue(mesoBackup);
    settingsSheet.getRange(SETTINGS_ROWS.DELOAD_AT_END, 2).setValue(deloadAtEndBackup);
    settingsSheet.getRange(SETTINGS_ROWS.MESO_NAME, 2).setValue(nameBackup);
    if (archiveSheet) {
      clearBody(archiveSheet, ARCHIVE_HEADERS.length);
      if (archiveBackup.length) archiveSheet.getRange(2, 1, archiveBackup.length, ARCHIVE_HEADERS.length).setValues(archiveBackup);
    }
    clearBody(program, PROGRAM_HEADERS.length);
    if (progBackup.length) program.getRange(2, 1, progBackup.length, PROGRAM_HEADERS.length).setValues(progBackup);
    clearBody(logSheet, LOG_HEADERS.length);
    if (logBackup.length) logSheet.getRange(2, 1, logBackup.length, LOG_HEADERS.length).setValues(logBackup);
    clearBody(session, SESSION_HEADERS.length);
    if (sessBackup.length) session.getRange(2, 1, sessBackup.length, SESSION_HEADERS.length).setValues(sessBackup);
    SUMMARY_STATE.paused = false;
    refreshSummarySafe(ss);   // the summary follows the restored Log / Archive / Exercise Map
  }

  var failed = results.filter(function (r) { return !r.pass; });
  failed.forEach(function (r) { Logger.log('FAIL ' + r.name + ': ' + r.detail); });
  var summary = (results.length - failed.length) + '/' + results.length + ' sheet tests passed';
  Logger.log(summary);
  ss.toast(summary + (failed.length ? ' (see Execution log)' : ''), 'Sheet tests', 8);
  return results;
}

function clearBody(sh, width) {
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, width).clearContent();
}

/** Session rows with the Exercise name column blanked (casing differs by design). */
function stripName(rows) {
  return rows.map(function (r) {
    var c = r.slice();
    c[SESSION_COLS.EXERCISE - 1] = normalizeName(c[SESSION_COLS.EXERCISE - 1]);
    return c;
  });
}
