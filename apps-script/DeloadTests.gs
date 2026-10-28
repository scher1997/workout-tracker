/**
 * DeloadTests.gs — tests for Pass 5 (stall detection, deload recommendation, deload week).
 * runDeloadTests() is called from runPureTests() in Tests.gs, so Workout > Run tests and run-node.js include it.
 * deloadSheetTests() runs against the live Sheet, called from runSheetTests() with its helpers.
 */

function runDeloadTests() {
  var results = [];
  var check = function (name, actual, expected) {
    var a = JSON.stringify(actual), x = JSON.stringify(expected);
    results.push({ name: name, pass: a === x, detail: a === x ? '' : 'expected ' + x + ' got ' + a });
  };
  var lookup = buildMuscleLookup([['Zork Curl', 'Zorceps'], ['Wibble Press', 'Wibbles']]);
  var ladder = [3, 2, 1, 0];
  var logRow = function (week, day, exercise, weight, reps, fb) {
    var r = [];
    for (var i = 0; i < LOG_HEADERS.length; i++) r.push('');
    r[0] = 'D'; r[SESSION_COLS.WEEK] = week; r[SESSION_COLS.DAY] = day; r[SESSION_COLS.EXERCISE] = exercise;
    r[SESSION_COLS.ACTUAL_WEIGHT] = weight;
    reps.forEach(function (n, i) { r[SESSION_COLS.S1 + i] = n; });
    Object.keys(fb || {}).forEach(function (k) { r[SESSION_COLS[k]] = fb[k]; });
    return r;
  };
  var curl = function (week, weight, reps, fb) { return logRow(week, 'Mon', 'Zork Curl', weight, [reps, reps, reps], fb); };
  var press = function (week, weight, reps, fb) { return logRow(week, 'Tue', 'Wibble Press', weight, [reps, reps, reps], fb); };
  var key = overrideKey('Mon', 'Zork Curl');
  var streak = function (rows) { return exerciseStallStreak(exerciseHistory(rows, key, 99)); };
  var prog = [['Mon', 'Zork Curl', 3, 15, 8, 12]];
  var prog2 = [['Mon', 'Zork Curl', 3, 15, 8, 12], ['Tue', 'Wibble Press', 3, 40, 8, 12]];
  var settingsFor = function (week, deload) {
    return { week: week, rirLadder: ladder, repMin: 8, repMax: 12, deload: !!deload };
  };
  var plan = function (log, week, program, deload) {
    return planNextWeek(program || prog, log, lookup, settingsFor(week || 1, deload));
  };
  var cell = function (p, c, i) { return p.rows[i || 0][SESSION_COLS[c] - 1]; };
  var DL = DELOAD.flags.deload;

  // Deload week contents
  check('deloadSets: half, rounded up, min 1', [1, 2, 3, 4, 5].map(deloadSets), [1, 1, 2, 2, 3]);
  var d = plan([curl(1, 20, 10)], 1, prog, true);
  check('deload week: half sets, weight held, reps held', [cell(d, 'SETS'), cell(d, 'REC_WEIGHT'), cell(d, 'REP_TARGET')], [2, 20, 10]);
  check('deload week: week number, easy RIR and flag', [cell(d, 'WEEK'), cell(d, 'RIR'), cell(d, 'FLAGS')], [2, DELOAD.rir, DL]);
  check('deload week: no weight increase even at 15+ reps', [cell(plan([curl(1, 20, 15)], 1, prog, true), 'REC_WEIGHT')], [20]);
  check('deload week: reps clamped into range', [cell(plan([curl(1, 20, 5)], 1, prog, true), 'REP_TARGET')], [8]);
  var fresh = plan([], 1, prog, true);
  check('deload week: never-logged uses Program weight, half sets',
    [cell(fresh, 'REC_WEIGHT'), cell(fresh, 'SETS'), cell(fresh, 'RIR'), fresh.summary.fresh.length], [15, 2, DELOAD.rir, 1]);
  check('deload week: one set stays one', cell(plan([curl(1, 20, 10)], 1, [['Mon', 'Zork Curl', 1, 15, 8, 12]], true), 'SETS'), 1);
  check('deload week: tendon-bad exercise also deloads with weight held',
    [cell(plan([curl(1, 20, 10, { TENDON: 'bad' })], 1, prog, true), 'SETS'), cell(plan([curl(1, 20, 10, { TENDON: 'bad' })], 1, prog, true), 'REC_WEIGHT')], [2, 20]);
  check('deload week: summary lists the exercise and has every bucket', [d.summary.deload.length, d.summary.increase, d.summary.stalled], [1, [], []]);
  check('planSessionRows: ov.rir overrides the ladder',
    planSessionRows(prog, lookup, settingsFor(1), (function () { var o = {}; o[key] = { rir: 5 }; return o; })()).rows[0][SESSION_COLS.RIR - 1], 5);

  // Deload marker
  check('isDeloadFlags: segment anywhere in the cell', [isDeloadFlags(DL), isDeloadFlags('Technique check: x | ' + DL), isDeloadFlags(''), isDeloadFlags('Maintenance (tendon): x')],
    [true, true, false, false]);

  // Stall streak
  check('stall: flat weight and reps for 4 weeks -> 3', streak([curl(1, 20, 10), curl(2, 20, 10), curl(3, 20, 10), curl(4, 20, 10)]), 3);
  check('stall: a rep gain ends the run', streak([curl(1, 20, 10), curl(2, 20, 10), curl(3, 20, 11), curl(4, 20, 11)]), 1);
  check('stall: a weight gain ends the run', streak([curl(1, 20, 10), curl(2, 22.5, 10), curl(3, 22.5, 10), curl(4, 22.5, 10)]), 2);
  check('stall: gain on the latest week -> 0', streak([curl(1, 20, 10), curl(2, 20, 10), curl(3, 20, 10), curl(4, 20, 11)]), 0);
  check('stall: lower reps or weight still counts as stalled', streak([curl(1, 20, 10), curl(2, 20, 9), curl(3, 17.5, 9)]), 2);
  check('stall: single entry -> 0', streak([curl(1, 20, 10)]), 0);
  check('stall: skipped week breaks the run', streak([curl(1, 20, 10), curl(2, 20, 10), curl(4, 20, 10)]), 0);
  check('stall: maintenance week is skipped, not counted or breaking',
    streak([curl(1, 20, 10), curl(2, 20, 10, { TENDON: 'bad' }), curl(3, 20, 10), curl(4, 20, 10)]), 2);
  check('stall: unreadable weight ends the run', streak([curl(1, 20, 10), curl(2, '', 10), curl(3, 20, 10)]), 0);
  check('stall: tracked per exercise', exerciseStallStreak(exerciseHistory([curl(1, 20, 10), curl(2, 20, 10), press(1, 40, 8), press(2, 40, 9)], overrideKey('Tue', 'Wibble Press'), 99)), 0);

  // Recommendation threshold
  check('recommendation: 1 of 1 and 1 of 2 are below the minimum/share', [deloadRecommendation(1, 1), deloadRecommendation(1, 2)], [false, false]);
  check('recommendation: 2 of 2, 2 of 3, 3 of 6 recommend', [deloadRecommendation(2, 2), deloadRecommendation(2, 3), deloadRecommendation(3, 6)], [true, true, true]);
  check('recommendation: 2 of 6 and 0 of 4 do not', [deloadRecommendation(2, 6), deloadRecommendation(0, 4)], [false, false]);

  // Stall flag and advice in planNextWeek
  var stalled2 = [];
  for (var w = 1; w <= 4; w++) { stalled2.push(curl(w, 20, 10)); stalled2.push(press(w, 40, 10)); }
  var s = plan(stalled2, 4, prog2);
  check('planNextWeek: stalled flag on both rows', [cell(s, 'FLAGS', 0), cell(s, 'FLAGS', 1)], [stalledFlag(3), stalledFlag(3)]);
  check('planNextWeek: advice recommends a deload', [s.summary.stalled.length, s.summary.deloadAdvice], [2, { stalled: 2, logged: 2, recommended: true }]);
  var one = plan(stalled2.filter(function (r) { return r[SESSION_COLS.DAY] === 'Mon'; }), 4);
  check('planNextWeek: one stalled exercise -> flag but no recommendation', [cell(one, 'FLAGS'), one.summary.deloadAdvice.recommended], [stalledFlag(3), false]);
  check('planNextWeek: progression is unaffected by the stall flag', [cell(s, 'REC_WEIGHT'), cell(s, 'REP_TARGET')], [20, 11]);
  check('planNextWeek: 3 flat weeks is not yet stalled (needs 3 comparisons)', cell(plan([curl(1, 20, 10), curl(2, 20, 10), curl(3, 20, 10)], 3), 'FLAGS'), '');
  check('planNextWeek: never-logged exercises are not counted in advice', plan(stalled2.filter(function (r) { return r[SESSION_COLS.DAY] === 'Mon'; }), 4, prog2).summary.deloadAdvice.logged, 1);

  // Deload weeks in the Log
  var afterDeload = plan([curl(1, 20, 10), curl(2, 20, 10, { FLAGS: DL })], 2);
  check('after a deload: progresses from the last working week, not carry',
    [cell(afterDeload, 'REC_WEIGHT'), cell(afterDeload, 'REP_TARGET'), cell(afterDeload, 'SETS'), afterDeload.summary.carry.length, afterDeload.summary.hold.length], [20, 11, 3, 0, 1]);
  var long = [curl(1, 20, 10), curl(2, 20, 10), curl(3, 20, 10), curl(4, 20, 10), curl(5, 20, 10, { FLAGS: DL })];
  check('after a deload: stall count restarts', cell(plan(long, 5), 'FLAGS'), '');
  var postFlat = function (last) {
    var rows = long.slice();
    for (var wk = 6; wk <= last; wk++) rows.push(curl(wk, 20, 10));
    return cell(plan(rows, last), 'FLAGS');
  };
  check('after a deload: 3 flat weeks are not yet stalled, 4 are', [postFlat(8), postFlat(9)], ['', stalledFlag(3)]);
  check('lastWorkingWeek / lastDeloadWeek', [lastWorkingWeek(long, 5), lastWorkingWeek(long, 4), lastDeloadWeek(long, 5), lastDeloadWeek(long, 4)], [4, 4, 5, 0]);
  check('deload planned after a deload still uses the working weight',
    [cell(plan([curl(1, 20, 10), curl(2, 25, 12, { FLAGS: DL })], 2, prog, true), 'REC_WEIGHT')], [20]);

  // Soreness on a deload row keeps the deload RIR base
  var row = planSessionRows(prog, lookup, settingsFor(1), (function () { var o = {}; o[key] = { rir: DELOAD.rir, flags: DL }; return o; })()).rows;
  row[0][SESSION_COLS.SORENESS - 1] = 'still sore';
  check('soreness on a deload row: base RIR is the deload RIR, one step easier',
    planSorenessUpdate(row, [0], ladder, []).rows[0][SESSION_COLS.RIR - 1], DELOAD.rir + FEEDBACK.sorenessRirStep);

  return results;
}

/**
 * Pass 5 checks against the live Sheet. Uses the first two Exercise Map rows; the caller restores
 * Program, Session, Log and Settings (week, mesocycle length, deload toggle).
 */
function deloadSheetTests(ss, check, h) {
  var session = ss.getSheetByName(TABS.SESSION);
  var logSheet = ss.getSheetByName(TABS.LOG);
  var settings = ss.getSheetByName(TABS.SETTINGS);
  var weekCell = settings.getRange(SETTINGS_ROWS.WEEK, 2);
  var mesoCell = settings.getRange(SETTINGS_ROWS.MESO_WEEKS, 2);
  var statusText = function () { return String(settings.getRange(SETTINGS_ROWS.STATUS, 2).getValue()); };
  var col = function (c) {
    return h.rowsOf(session, SESSION_HEADERS.length).map(function (r) { return r[SESSION_COLS[c] - 1]; });
  };
  var flat = function () {
    h.enter(2, { S1: 10, S2: 10, S3: 10 });
    h.enter(3, { S1: 10, S2: 10, S3: 10 });
  };
  var start = function (week, meso) {
    weekCell.setValue(week);
    mesoCell.setValue(meso);
    h.writeProgram([['Mon', h.exA, 3, 20, 8, 12], ['Tue', h.exB, 3, 50, 8, 12]]);
    clearBody(logSheet, LOG_HEADERS.length);
    h.buildAndRead();
  };

  check('deload settings: rows labelled',
    [settings.getRange(SETTINGS_ROWS.DELOAD_AT_END, 1).getValue(), settings.getRange(SETTINGS_ROWS.DELOAD_BOX, 1).getValue()],
    ['Deload after last week (on/off)', 'Deload this week (tick)']);

  // Completing the last working week appends a deload week; the deload week ends the mesocycle
  settings.getRange(SETTINGS_ROWS.DELOAD_AT_END, 2).setValue(true);
  start(1, 2);
  flat();
  check('deload: week 1 -> 2 rolls normally', [h.completeWeek({ interactive: false }).ok, weekCell.getValue()], [true, 2]);
  flat();
  var end = h.completeWeek({ interactive: false });
  check('deload: completing the last week appends a deload week', [end.ok, weekCell.getValue()], [true, 3]);
  check('deload week: half sets, weight held, reps held', [col('SETS'), col('REC_WEIGHT'), col('REP_TARGET')], [[2, 2], [20, 50], [10, 10]]);
  check('deload week: week, easy RIR and flag', [col('WEEK'), col('RIR'), col('FLAGS')], [[3, 3], [DELOAD.rir, DELOAD.rir], [DELOAD.flags.deload, DELOAD.flags.deload]]);
  check('deload week: status says so', statusText().indexOf('deload week') > -1, true);
  flat();
  var done = h.completeWeek({ interactive: false });
  check('deload week ends the mesocycle: Complete Week refused, week stays 3', [done.ok, weekCell.getValue()], [false, 3]);
  check('deload week refusal says the mesocycle is complete', statusText().indexOf('mesocycle is complete') > -1, true);

  // Stall recommendation, then converting the current week
  start(1, 8);
  for (var w = 1; w <= 4; w++) {
    flat();
    check('stall: week ' + w + ' rolls', h.completeWeek({ interactive: false }).ok, true);
  }
  check('stall: 3 flat weeks -> flags on week 5 rows',
    col('FLAGS').map(function (f) { return f.indexOf(DELOAD.stalledPrefix + ' 3 weeks') === 0; }), [true, true]);
  check('stall: status recommends a deload', statusText().indexOf('Deload recommended') > -1, true);

  var conv = makeDeloadWeek();
  check('convert: Session becomes a deload week', [conv.ok, weekCell.getValue(), col('SETS'), col('RIR'), col('REC_WEIGHT')],
    [true, 5, [2, 2], [DELOAD.rir, DELOAD.rir], [20, 50]]);
  check('convert: deload flag replaces the stall flag', col('FLAGS'), [DELOAD.flags.deload, DELOAD.flags.deload]);
  check('convert: second tick refused (already a deload)', [makeDeloadWeek().ok, col('SETS')], [false, [2, 2]]);

  // After the deload: progression resumes from the last working week and stall counting restarts
  flat();
  check('after deload: Complete Week ok', [h.completeWeek({ interactive: false }).ok, weekCell.getValue()], [true, 6]);
  check('after deload: Program sets back, weight held, normal +1 rep, no stall flag',
    [col('SETS'), col('REC_WEIGHT'), col('REP_TARGET'), col('FLAGS')], [[3, 3], [20, 50], [11, 11], ['', '']]);

  // Conversion refuses once the week is started
  start(1, 6);
  h.enter(2, { S1: 10 });
  check('convert: refused when Session has entries', [makeDeloadWeek().ok, col('SETS')], [false, [3, 3]]);
}
