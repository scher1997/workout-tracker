/**
 * Tests.gs — pure-logic tests. Run in Sheets via Workout > Run tests, or locally:
 *   node tests/run-node.js
 */

function runPureTests() {
  var results = [];
  var check = function (name, actual, expected) {
    var a = JSON.stringify(actual), x = JSON.stringify(expected);
    results.push({ name: name, pass: a === x, detail: a === x ? '' : 'expected ' + x + ' got ' + a });
  };
  var base = { week: 1, rirLadder: [3, 2, 1, 0], repMin: 8, repMax: 12 };
  var col = function (rows, c) { return rows.map(function (r) { return r[c - 1]; }); };

  // RIR ladder
  check('RIR weeks 1-4', [1, 2, 3, 4].map(function (w) { return rirForWeek([3, 2, 1, 0], w); }), [3, 2, 1, 0]);
  check('RIR clamps past ladder', rirForWeek([3, 2, 1, 0], 7), 0);
  check('ladder parses text', parseRirLadder('3, 2 ,1;0'), [3, 2, 1, 0]);
  check('ladder bad text -> default', parseRirLadder('abc'), [3, 2, 1, 0]);

  // Lookup uses invented names: nothing is hard-coded in the script
  var lookup = buildMuscleLookup([['Zork Curl', 'Zorceps'], [' wibble  press ', 'Wibbles'], ['', 'x']]);
  var plan = planSessionRows([
    [' Mon ', 'zork curl', 3, 25, '', ''],
    ['Mon', 'Wibble Press', '4', '', 6, 10],
    ['', '', '', '', '', ''],            // spacer row
    ['Tue', 'Mystery Lift', '', '45 lb', 12, 8]
  ], lookup, base);
  check('rows built, blank skipped', plan.rows.length, 3);
  check('muscle from map, case/space-insensitive', col(plan.rows, SESSION_COLS.MUSCLE), ['Zorceps', 'Wibbles', UNKNOWN_MUSCLE]);
  check('day trimmed', plan.rows[0][SESSION_COLS.DAY - 1], 'Mon');
  check('default rep range', plan.rows[0][SESSION_COLS.REP_RANGE - 1], '8–12');
  check('custom rep range', plan.rows[1][SESSION_COLS.REP_RANGE - 1], '6–10');
  check('rep target = rep min', col(plan.rows, SESSION_COLS.REP_TARGET), [8, 6, 8]);
  check('start weight carried / blank', col(plan.rows, SESSION_COLS.REC_WEIGHT), [25, '', 45]);
  check('sets parsed, blank -> default', col(plan.rows, SESSION_COLS.SETS), [3, 4, 3]);
  check('RIR week 1', col(plan.rows, SESSION_COLS.RIR), [3, 3, 3]);
  check('unknown flagged not dropped', plan.unknown, ['Mystery Lift']);
  check('swapped reversed rep range', plan.rows[2][SESSION_COLS.REP_RANGE - 1], '8–12');
  check('warnings for bad sets + swap', plan.warnings.length, 2);

  // Week changes RIR; same program
  var w3 = planSessionRows([['Mon', 'Zork Curl', 3, 25, '', '']], lookup, { week: 3, rirLadder: [3, 2, 1, 0], repMin: 8, repMax: 12 });
  check('week 3 -> RIR 1', w3.rows[0][SESSION_COLS.RIR - 1], 1);
  check('week stamped on row', w3.rows[0][SESSION_COLS.WEEK - 1], 3);

  // Duplicates reported, kept
  var dup = planSessionRows([['Mon', 'Zork Curl', 3, '', '', ''], ['mon', 'zork curl', 2, '', '', '']], lookup, base);
  check('duplicates kept', dup.rows.length, 2);
  check('duplicates reported', dup.duplicates.length, 1);

  // Overrides hook (used by rollover pass)
  var ov = {};
  ov[overrideKey('Mon', 'Zork Curl')] = { weight: 30, repTarget: 10, sets: 2 };
  var o = planSessionRows([['Mon', 'Zork Curl', 3, 25, '', '']], lookup, base, ov);
  check('override applied', [o.rows[0][SESSION_COLS.REC_WEIGHT - 1], o.rows[0][SESSION_COLS.REP_TARGET - 1], o.rows[0][SESSION_COLS.SETS - 1]], [30, 10, 2]);

  // Empty program
  check('empty program', planSessionRows([], lookup, base).rows.length, 0);

  // Logger: completed exercises become Log rows
  var logSess = planSessionRows([
    ['Mon', 'Zork Curl', 3, 25, '', ''],
    ['Mon', 'Wibble Press', 4, 40, '', ''],
    ['Tue', 'Mystery Lift', 3, '', '', '']
  ], lookup, base).rows;
  var put = function (row, vals) { Object.keys(vals).forEach(function (k) { row[SESSION_COLS[k] - 1] = vals[k]; }); };
  put(logSess[0], { S1: 10, S2: 9, S3: 8, ACTUAL_RIR: 2, ACTUAL_WEIGHT: 27.5, PUMP: 'great' });
  put(logSess[1], { S1: 8, ACTUAL_RIR: 3 });   // blank Actual Weight -> falls back to rec weight
  var logPlan = planLogRows(logSess, {}, 'D');
  check('log: completed rows only', logPlan.rows.length, 2);
  check('log: untouched exercise counted as skipped', logPlan.skipped, 1);
  check('log: date leads, then session columns', logPlan.rows[0].length, LOG_HEADERS.length);
  check('log: row values', [logPlan.rows[0][0], logPlan.rows[0][SESSION_COLS.WEEK], logPlan.rows[0][SESSION_COLS.EXERCISE],
    logPlan.rows[0][SESSION_COLS.SETS], logPlan.rows[0][SESSION_COLS.S1], logPlan.rows[0][SESSION_COLS.S3],
    logPlan.rows[0][SESSION_COLS.ACTUAL_RIR], logPlan.rows[0][SESSION_COLS.ACTUAL_WEIGHT]], ['D', 1, 'Zork Curl', 3, 10, 8, 2, 27.5]);
  check('log: weight falls back to rec', logPlan.rows[1][SESSION_COLS.ACTUAL_WEIGHT], 40);
  var existing = {};
  existing[logKey(1, ' MON', 'zork  curl')] = true;
  var again = planLogRows(logSess, existing, 'D');
  check('log: already-logged goes to duplicates', [again.rows.length, again.duplicates.length], [1, 1]);
  check('log: repeated key inside one session', planLogRows([logSess[0], logSess[0]], {}, 'D').duplicates.length, 1);
  check('log: empty session', planLogRows([], {}, 'D').rows.length, 0);

  // Header / column constants stay in sync
  check('header count matches cols', SESSION_HEADERS.length, Object.keys(SESSION_COLS).length);
  check('col index matches header', SESSION_HEADERS[SESSION_COLS.PUMP - 1], 'Pump');
  return results;
}

function runAllTests() {
  var results = runPureTests();
  var failed = results.filter(function (r) { return !r.pass; });
  var summary = (results.length - failed.length) + '/' + results.length + ' passed';
  failed.forEach(function (r) { Logger.log('FAIL ' + r.name + ': ' + r.detail); });
  Logger.log(summary);
  try { SpreadsheetApp.getActive().toast(summary + (failed.length ? ' — see Executions log' : ''), 'Tests', 6); } catch (e) {}
  return results;
}
