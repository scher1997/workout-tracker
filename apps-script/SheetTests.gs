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
  expectedHeaders[TABS.SUMMARY] = ['Muscle Group'];
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
  } catch (e) {
    check('sheet tests ran without error', String(e), '');
  } finally {
    // Restore the user's own data
    clearBody(program, PROGRAM_HEADERS.length);
    if (progBackup.length) program.getRange(2, 1, progBackup.length, PROGRAM_HEADERS.length).setValues(progBackup);
    clearBody(session, SESSION_HEADERS.length);
    if (sessBackup.length) session.getRange(2, 1, sessBackup.length, SESSION_HEADERS.length).setValues(sessBackup);
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
