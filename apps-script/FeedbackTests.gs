/**
 * FeedbackTests.gs — pure tests for Pass 4 (pump, tendon, connection, soreness).
 * Called from runPureTests() in Tests.gs, so Workout > Run tests and run-node.js include them.
 */

function runFeedbackTests() {
  var results = [];
  var check = function (name, actual, expected) {
    var a = JSON.stringify(actual), x = JSON.stringify(expected);
    results.push({ name: name, pass: a === x, detail: a === x ? '' : 'expected ' + x + ' got ' + a });
  };
  var lookup = buildMuscleLookup([['Zork Curl', 'Zorceps'], ['Wibble Press', 'Wibbles'], ['Zork Row', 'Zorceps']]);
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
  var prog = [['Mon', 'Zork Curl', 3, 15, 8, 12]];
  var plan = function (log, week, program) {
    return planNextWeek(program || prog, log, lookup, { week: week || 1, rirLadder: ladder, repMin: 8, repMax: 12 });
  };
  var cell = function (p, c) { return p.rows[0][SESSION_COLS[c] - 1]; };

  // 4a: pump
  ['great', 'mid', 'none'].forEach(function (pump) {
    var p = plan([logRow(1, 'Mon', 'Zork Curl', 15, [10, 10, 10], { PUMP: pump })]);
    check('pump ' + pump + ': 10 reps -> target ' + (pump === 'none' ? 12 : 11), cell(p, 'REP_TARGET'), pump === 'none' ? 12 : 11);
  });
  check('pump: 8 reps -> mid 9, great 9, none 10',
    ['mid', 'great', 'none'].map(function (pump) {
      return cell(plan([logRow(1, 'Mon', 'Zork Curl', 15, [8, 8, 8], { PUMP: pump })]), 'REP_TARGET');
    }), [9, 9, 10]);
  check('pump: blank counts as mid (+1)', cell(plan([logRow(1, 'Mon', 'Zork Curl', 15, [8, 8, 8])]), 'REP_TARGET'), 9);
  check('pump: rating is case/space-insensitive', cell(plan([logRow(1, 'Mon', 'Zork Curl', 15, [8, 8, 8], { PUMP: ' None ' })]), 'REP_TARGET'), 10);
  check('pump: weight held for every rating', cell(plan([logRow(1, 'Mon', 'Zork Curl', 15, [8, 8, 8], { PUMP: 'none' })]), 'REC_WEIGHT'), 15);
  check('pump none: capped at rep ceiling', cell(plan([logRow(1, 'Mon', 'Zork Curl', 15, [12, 12, 12], { PUMP: 'none' })]), 'REP_TARGET'), 13);
  check('pump none: weight-increase path unchanged (volume match)',
    [cell(plan([logRow(1, 'Mon', 'Zork Curl', 15, [15, 15, 15], { PUMP: 'none' })]), 'REC_WEIGHT'),
     cell(plan([logRow(1, 'Mon', 'Zork Curl', 15, [15, 15, 15], { PUMP: 'none' })]), 'REP_TARGET')], [17.5, 13]);

  // 4b: tendon
  var bad = plan([logRow(1, 'Mon', 'Zork Curl', 20, [10, 10, 10], { TENDON: 'bad' })]);
  check('tendon bad: drops one set', cell(bad, 'SETS'), 2);
  check('tendon bad: weight held, no rep push', [cell(bad, 'REC_WEIGHT'), cell(bad, 'REP_TARGET')], [20, 10]);
  check('tendon bad: maintenance flag + summary', [cell(bad, 'FLAGS'), bad.summary.maintain.length], [FEEDBACK.flags.maintain, 1]);
  check('tendon bad: no weight increase even at 15+ reps',
    [cell(plan([logRow(1, 'Mon', 'Zork Curl', 20, [15, 15, 15], { TENDON: 'bad' })]), 'REC_WEIGHT'),
     cell(plan([logRow(1, 'Mon', 'Zork Curl', 20, [15, 15, 15], { TENDON: 'bad' })]), 'SETS')], [20, 2]);
  check('tendon bad: pump none does not push reps', cell(plan([logRow(1, 'Mon', 'Zork Curl', 20, [10, 10, 10], { TENDON: 'bad', PUMP: 'none' })]), 'REP_TARGET'), 10);
  check('tendon bad: one-set exercise stays at 1', cell(plan([logRow(1, 'Mon', 'Zork Curl', 20, [10], { TENDON: 'bad' })], 1,
    [['Mon', 'Zork Curl', 1, 15, 8, 12]]), 'SETS'), 1);
  check('tendon bad twice: still maintenance, sets not cumulative',
    cell(plan([logRow(1, 'Mon', 'Zork Curl', 20, [10, 10, 10], { TENDON: 'bad' }), logRow(2, 'Mon', 'Zork Curl', 20, [10, 10], { TENDON: 'bad' })], 2), 'SETS'), 2);
  ['neutral', 'good', ''].forEach(function (t) {
    var back = plan([logRow(1, 'Mon', 'Zork Curl', 20, [10, 10, 10], { TENDON: 'bad' }), logRow(2, 'Mon', 'Zork Curl', 20, [10, 10], { TENDON: t })], 2);
    check('tendon ' + (t || 'blank') + ' after maintenance: normal progression at same weight',
      [cell(back, 'REC_WEIGHT'), cell(back, 'REP_TARGET'), cell(back, 'SETS'), cell(back, 'FLAGS')], [20, 11, 3, '']);
  });
  check('tendon neutral/good alone: progress normally',
    [cell(plan([logRow(1, 'Mon', 'Zork Curl', 20, [10, 10, 10], { TENDON: 'good' })]), 'SETS'),
     cell(plan([logRow(1, 'Mon', 'Zork Curl', 20, [10, 10, 10], { TENDON: 'neutral' })]), 'REP_TARGET')], [3, 11]);
  check('tendon bad, week skipped: maintenance carries',
    [cell(plan([logRow(1, 'Mon', 'Zork Curl', 20, [10, 10, 10], { TENDON: 'bad' })], 2), 'SETS'),
     cell(plan([logRow(1, 'Mon', 'Zork Curl', 20, [10, 10, 10], { TENDON: 'bad' })], 2), 'REC_WEIGHT')], [2, 20]);

  // 4c: muscle connection
  var miss = function (week) { return logRow(week, 'Mon', 'Zork Curl', 20, [10, 10, 10], { CONNECTION: 'not at all' }); };
  var one = plan([miss(1)]);
  check('connection: one "not at all" -> technique check', [cell(one, 'FLAGS'), one.summary.technique.length, one.summary.swap.length], [FEEDBACK.flags.technique, 1, 0]);
  var two = plan([miss(1), miss(2)], 2);
  check('connection: two in a row -> swap suggestion', [cell(two, 'FLAGS'), two.summary.swap.length, two.summary.technique.length], [FEEDBACK.flags.swap, 1, 0]);
  check('connection: progression unaffected by the flag', [cell(one, 'REC_WEIGHT'), cell(one, 'REP_TARGET')], [20, 11]);
  check('connection: great/good -> no flag',
    ['great', 'good'].map(function (c) { return cell(plan([logRow(1, 'Mon', 'Zork Curl', 20, [10, 10, 10], { CONNECTION: c })]), 'FLAGS'); }), ['', '']);
  check('connection: good week breaks the run (miss, good, miss -> technique only)',
    cell(plan([miss(1), logRow(2, 'Mon', 'Zork Curl', 20, [10, 10, 10], { CONNECTION: 'good' }), miss(3)], 3), 'FLAGS'), FEEDBACK.flags.technique);
  check('connection: skipped week breaks the run (weeks 1 and 3)', cell(plan([miss(1), miss(3)], 3), 'FLAGS'), FEEDBACK.flags.technique);
  check('connection: recovered after miss -> flag clears',
    cell(plan([miss(1), logRow(2, 'Mon', 'Zork Curl', 20, [10, 10, 10], { CONNECTION: 'great' })], 2), 'FLAGS'), '');
  var both = plan([logRow(1, 'Mon', 'Zork Curl', 20, [10, 10, 10], { CONNECTION: 'not at all', TENDON: 'bad' })]);
  check('flags combine with " | "', cell(both, 'FLAGS'), FEEDBACK.flags.maintain + ' | ' + FEEDBACK.flags.technique);
  check('connection: tracked per exercise',
    [plan([miss(1)], 1, [['Mon', 'Zork Curl', 3, 15, 8, 12], ['Mon', 'Wibble Press', 3, 40, 8, 12]]).rows[1][SESSION_COLS.FLAGS - 1]], ['']);

  // Flags helper
  check('flag segment: add, replace, remove', [
    setFlagSegment('', 'Under', 'Under-x'),
    setFlagSegment('Technique check: a | Under-x', 'Under', 'Under-y'),
    setFlagSegment('Technique check: a | Under-x', 'Under', '')], ['Under-x', 'Technique check: a | Under-y', 'Technique check: a']);

  // 4d: soreness
  var sess = function (week) {
    return planSessionRows([
      ['Mon', 'Zork Curl', 3, 15, 8, 12], ['Mon', 'Zork Row', 4, 15, 8, 12],
      ['Mon', 'Wibble Press', 3, 40, 8, 12], ['Wed', 'Zork Curl', 3, 15, 8, 12]
    ], lookup, { week: week, rirLadder: ladder, repMin: 8, repMax: 12 }).rows;
  };
  var sore = function (rows, idx, value) { rows[idx][SESSION_COLS.SORENESS - 1] = value; return rows; };
  var col = function (rows, c) { return rows.map(function (r) { return r[SESSION_COLS[c] - 1]; }); };
  var rirOf = function (rows) { return col(rows, 'RIR'); };

  var w1 = planSorenessUpdate(sore(sess(1), 0, 'still sore'), [0], ladder, []);
  check('soreness: still sore -> RIR one step easier for that muscle + day only', rirOf(w1.rows), [4, 4, 3, 3]);
  check('soreness: set counts held', col(w1.rows, 'SETS'), [3, 4, 3, 3]);
  check('soreness: rating spreads to the muscle group that session', col(w1.rows, 'SORENESS'), ['still sore', 'still sore', '', '']);
  check('soreness: rows rewritten', w1.changed.sort(), [0, 1]);
  var w3 = planSorenessUpdate(sore(sess(3), 2, 'still sore'), [2], ladder, []);
  check('soreness: RIR 1 becomes 2', rirOf(w3.rows), [1, 1, 2, 1]);
  check('soreness: none/mild train as planned',
    ['none', 'mild'].map(function (v) { return rirOf(planSorenessUpdate(sore(sess(3), 0, v), [0], ladder, []).rows); }), [[1, 1, 1, 1], [1, 1, 1, 1]]);
  var back = sess(2);
  sore(back, 0, 'still sore');
  var changedRows = planSorenessUpdate(back, [0], ladder, []).rows;
  sore(changedRows, 0, 'mild');
  check('soreness: changing back to mild restores ladder RIR', rirOf(planSorenessUpdate(changedRows, [0], ladder, []).rows), [2, 2, 2, 2]);
  check('soreness: single flagged week -> no under-recovered flag', col(w1.rows, 'FLAGS'), ['', '', '', '']);

  var soreLog = function (week, soreness, muscle) {
    return logRow(week, 'Mon', 'Zork Curl', 15, [10, 10, 10], { SORENESS: soreness, MUSCLE: muscle || 'Zorceps' });
  };
  var consecutive = planSorenessUpdate(sore(sess(2), 0, 'still sore'), [0], ladder, [soreLog(1, 'still sore')]);
  check('soreness: two consecutive still-sore weeks -> under-recovered flag on that muscle',
    col(consecutive.rows, 'FLAGS'), [FEEDBACK.flags.recovery, FEEDBACK.flags.recovery, '', '']);
  check('soreness: two-week case still lowers RIR and holds sets', [rirOf(consecutive.rows), col(consecutive.rows, 'SETS')], [[3, 3, 2, 2], [3, 4, 3, 3]]);
  check('soreness: prior week mild -> no flag',
    col(planSorenessUpdate(sore(sess(2), 0, 'still sore'), [0], ladder, [soreLog(1, 'mild')]).rows, 'FLAGS'), ['', '', '', '']);
  check('soreness: prior week sore but other muscle -> no flag',
    col(planSorenessUpdate(sore(sess(2), 0, 'still sore'), [0], ladder, [soreLog(1, 'still sore', 'Wibbles')]).rows, 'FLAGS'), ['', '', '', '']);
  check('soreness: gap week breaks the run (weeks 1 and 3)',
    col(planSorenessUpdate(sore(sess(3), 0, 'still sore'), [0], ladder, [soreLog(1, 'still sore')]).rows, 'FLAGS'), ['', '', '', '']);
  var cleared = consecutive.rows;
  sore(cleared, 0, 'none');
  cleared[0][SESSION_COLS.FLAGS - 1] = FEEDBACK.flags.technique + ' | ' + FEEDBACK.flags.recovery;
  check('soreness: back to none removes only the recovery flag',
    planSorenessUpdate(cleared, [0], ladder, [soreLog(1, 'still sore')]).rows[0][SESSION_COLS.FLAGS - 1], FEEDBACK.flags.technique);
  check('soreness: streak counts back through consecutive weeks',
    [stillSoreStreak([soreLog(1, 'still sore'), soreLog(2, 'still sore'), soreLog(3, 'mild')], 'zorceps', 2),
     stillSoreStreak([soreLog(1, 'still sore'), soreLog(2, 'still sore'), soreLog(3, 'mild')], 'Zorceps', 3)], [2, 0]);
  var unk = sess(1);
  unk[2][SESSION_COLS.MUSCLE - 1] = UNKNOWN_MUSCLE; unk[3][SESSION_COLS.MUSCLE - 1] = UNKNOWN_MUSCLE; unk[3][SESSION_COLS.DAY - 1] = 'Mon';
  check('soreness: unknown-muscle rows do not share a rating', rirOf(planSorenessUpdate(sore(unk, 2, 'still sore'), [2], ladder, []).rows), [3, 3, 4, 3]);

  return results;
}

/**
 * Pass 4 checks against the live Sheet, called from runSheetTests() with its helpers.
 * Uses the first two Exercise Map rows; the caller restores Program, Session, Log and Settings.
 */
function feedbackSheetTests(ss, check, h) {
  var session = ss.getSheetByName(TABS.SESSION);
  var logSheet = ss.getSheetByName(TABS.LOG);
  var settings = ss.getSheetByName(TABS.SETTINGS);
  var cellOf = function (rows, i, c) { return rows[i][SESSION_COLS[c] - 1]; };

  settings.getRange(SETTINGS_ROWS.WEEK, 2).setValue(1);
  settings.getRange(SETTINGS_ROWS.MESO_WEEKS, 2).setValue(6);
  h.writeProgram([['Mon', h.exA, 3, 20, 8, 12], ['Tue', h.exB, 3, 50, 8, 12]]);
  clearBody(logSheet, LOG_HEADERS.length);
  h.buildAndRead();

  // Week 1: A has bad tendon, no connection and a sore muscle; B has no pump
  h.enter(2, { S1: 10, S2: 10, S3: 10, TENDON: 'bad', CONNECTION: 'not at all', SORENESS: 'still sore' });
  h.enter(3, { S1: 10, S2: 10, S3: 10, PUMP: 'none' });
  check('feedback: Complete Week ok', h.completeWeek({ interactive: false }).ok, true);
  var w2 = h.rowsOf(session, SESSION_HEADERS.length);
  check('tendon bad: sets 3 -> 2, weight held, no rep push',
    [cellOf(w2, 0, 'SETS'), cellOf(w2, 0, 'REC_WEIGHT'), cellOf(w2, 0, 'REP_TARGET')], [2, 20, 10]);
  check('tendon bad + connection: flags written',
    cellOf(w2, 0, 'FLAGS'), FEEDBACK.flags.maintain + ' | ' + FEEDBACK.flags.technique);
  check('pump none: rep target +2 (10 -> 12)', [cellOf(w2, 1, 'REP_TARGET'), cellOf(w2, 1, 'FLAGS')], [12, '']);

  // Week 2 soreness, entered before training (the onEdit trigger does not fire for script edits, so call the handler)
  var rir2 = rirForWeek(readSettings(ss).rirLadder, 2);
  var sorenessCell = session.getRange(2, SESSION_COLS.SORENESS);
  sorenessCell.setValue('still sore');
  applySorenessEdit(sorenessCell);
  var sore = h.rowsOf(session, SESSION_HEADERS.length);
  check('soreness: still sore raises Target RIR one step', cellOf(sore, 0, 'RIR'), rir2 + 1);
  check('soreness: sets unchanged', cellOf(sore, 0, 'SETS'), 2);
  check('soreness: second week in a row -> under-recovered flag appended',
    cellOf(sore, 0, 'FLAGS').indexOf(FEEDBACK.flags.recovery) > -1 && cellOf(sore, 0, 'FLAGS').indexOf(FEEDBACK.flags.maintain) === 0, true);
  sorenessCell.setValue('none');
  applySorenessEdit(sorenessCell);
  var cleared = h.rowsOf(session, SESSION_HEADERS.length);
  check('soreness: back to none restores RIR and removes only the recovery flag',
    [cellOf(cleared, 0, 'RIR'), cellOf(cleared, 0, 'FLAGS')], [rir2, FEEDBACK.flags.maintain + ' | ' + FEEDBACK.flags.technique]);

  // Week 2: neutral tendon ends maintenance, back to Program sets at the same weight
  h.enter(2, { S1: 10, S2: 10, TENDON: 'neutral', CONNECTION: 'not at all' });
  check('feedback: week 2 -> 3 ok', h.completeWeek({ interactive: false }).ok, true);
  var w3 = h.rowsOf(session, SESSION_HEADERS.length);
  check('tendon neutral after maintenance: normal progression, same weight, Program sets',
    [cellOf(w3, 0, 'SETS'), cellOf(w3, 0, 'REC_WEIGHT'), cellOf(w3, 0, 'REP_TARGET')], [3, 20, 11]);
  check('connection: second "not at all" in a row -> swap suggestion', cellOf(w3, 0, 'FLAGS'), FEEDBACK.flags.swap);
}
