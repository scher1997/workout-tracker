/**
 * SheetTests.gs — tests that run against the live Sheet. Program and Session contents are backed up and restored;
 * exercise names come from Exercise Map. The checks themselves live in SheetBaseTests.gs (structure, build flow)
 * and in the per-pass *Tests.gs files; this file backs up, runs them in order and restores.
 */

/**
 * Menu entries. On a real Sheet the whole suite takes longer than Apps Script's 6-minute execution limit, so it runs
 * in two halves; a run that is killed by the limit never reaches the restore step below.
 */
function runSheetTestsPart1() { return runSheetTests(1); }
function runSheetTestsPart2() { return runSheetTests(2); }

/**
 * part 1: structure, build flow, feedback, deload, archive. part 2: Muscle Summary, log layout, week flow, session layout.
 * No argument runs both (the mock runner does that). Section times go to the log (Extensions > Apps Script > Executions).
 */
function runSheetTests(part) {
  part = part === 1 || part === 2 ? part : 0;
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
  var t0 = Date.now(), lapStart = t0;
  var lap = function (name) {
    var now = Date.now();
    Logger.log('sheet tests ' + (part || 'all') + ': ' + name + ' ' + Math.round((now - lapStart) / 1000) + 's (total ' + Math.round((now - t0) / 1000) + 's)');
    lapStart = now;
  };

  var session = ss.getSheetByName(TABS.SESSION);
  var program = ss.getSheetByName(TABS.PROGRAM);

  // An earlier run killed by the time limit never restored: put its backup back before anything else.
  var leftover = loadTestBackup(ss);
  if (leftover) {
    restoreTestBackup(ss, leftover);
    dropTestBackup(ss);
    var note = 'A previous sheet-test run did not finish. Your data was restored from its backup (saved '
      + new Date(leftover.at).toLocaleString() + ').';
    Logger.log(note);
    ss.toast(note, 'Sheet tests', 10);
  }

  if (part !== 2) structureSheetTests(ss, check);
  lap('structure');

  // Back up user data (in memory and in the hidden Test Backup tab), then run build tests on a clean slate
  var backup = captureTestBackup(ss);
  saveTestBackup(ss, backup);
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
    var enterOnly = function (r, vals) {
      Object.keys(vals).forEach(function (k) { session.getRange(r, SESSION_COLS[k]).setValue(vals[k]); });
    };
    // An exercise counts as done once Pump, Tendon and Connection are filled in: unless a test sets them, enter the neutral
    // ratings (they act exactly like blank ones in the progression rules).
    var enter = function (r, vals) {
      var all = { PUMP: 'mid', TENDON: 'neutral', CONNECTION: 'good' };
      Object.keys(vals).forEach(function (k) { all[k] = vals[k]; });
      enterOnly(r, all);
    };
    var helpers = { writeProgram: writeProgram, buildAndRead: buildAndRead, enter: enter, enterOnly: enterOnly, rowsOf: rowsOf,
      completeWeek: completeWeek, exA: exA, exB: exB, muscleA: muscleA, muscleB: muscleB };

    if (part !== 2) {
      // 3-7. Build, log, rebuild/clear, Complete Week (SheetBaseTests.gs)
      buildFlowSheetTests(ss, check, helpers);
      lap('build flow');
      // 8. Pass 4: pump, tendon, connection, soreness (FeedbackTests.gs)
      feedbackSheetTests(ss, check, helpers);
      lap('feedback');
      // 9. Pass 5: stall recommendation and deload weeks (DeloadTests.gs)
      deloadSheetTests(ss, check, helpers);
      lap('deload');
      // 10. Pass 6: Archive and Start New Mesocycle (ArchiveTests.gs)
      archiveSheetTests(ss, check, helpers);
      lap('archive');
      // 10b. Pass 12: exercise library, program template, a week with no Start Weight (ExerciseLibraryTests.gs)
      exerciseLibrarySheetTests(ss, check, helpers);
      lap('exercise library');
    }
    if (part !== 1) {
      // 11. Pass 7: Muscle Summary and Trends (MuscleSummaryTests.gs)
      muscleSummarySheetTests(ss, check, helpers);
      lap('muscle summary');
      // 12. Pass 10A: Primary / Secondary / Tertiary columns, compound vs isolation counting (LogLayoutTests.gs)
      logLayoutSheetTests(ss, check, helpers);
      lap('log layout');
      // 13. Pass 10B: day-by-day Sessions tab and whole-week logging, complete and incomplete (WeekFlowTests.gs)
      weekFlowSheetTests(ss, check, helpers);
      lap('week flow');
      // 14. Pass 10C: Actual RIR / Weight defaults, number pad cells, frozen columns (SessionLayoutTests.gs)
      sessionLayoutSheetTests(ss, check, helpers);
      lap('session layout');
    }
  } catch (e) {
    check('sheet tests ran without error', String(e), '');
  } finally {
    // Restore the user's own data; the backup tab goes only after the restore went through (a throw leaves it for the next run)
    restoreTestBackup(ss, backup);
    SUMMARY_STATE.paused = false;
    refreshSummarySafe(ss);   // the summary follows the restored Log / Archive / Exercise Map
    dropTestBackup(ss);
    lap('restore');
  }

  var failed = results.filter(function (r) { return !r.pass; });
  failed.forEach(function (r) { Logger.log('FAIL ' + r.name + ': ' + r.detail); });
  var summary = (results.length - failed.length) + '/' + results.length + ' sheet tests passed'
    + (part ? ' (part ' + part + ' of 2)' : '');
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
