/**
 * SessionLayoutTests.gs — tests for Pass 10C/10D: prefilled sets and Actual cells (gray until changed), "done" means
 * every rating is filled in, number-pad cells, Exercise as the one frozen column.
 * runSessionLayoutTests() is called from runPureTests() in Tests.gs; sessionLayoutSheetTests() from runSheetTests().
 */

function runSessionLayoutTests() {
  var results = [];
  var check = function (name, actual, expected) {
    var a = JSON.stringify(actual), x = JSON.stringify(expected);
    results.push({ name: name, pass: a === x, detail: a === x ? '' : 'expected ' + x + ' got ' + a });
  };
  var row = function (vals) {
    var r = [];
    for (var i = 0; i < SESSION_HEADERS.length; i++) r.push('');
    Object.keys(vals).forEach(function (k) { r[SESSION_COLS[k] - 1] = vals[k]; });
    return r;
  };
  var A = SESSION_COLS.ACTUAL_RIR - 1, W = SESSION_COLS.ACTUAL_WEIGHT - 1, S = function (n) { return SESSION_COLS['S' + n] - 1; };
  var RATED = { PUMP: 'mid', TENDON: 'neutral', CONNECTION: 'good' };
  var plain = function (extra) {
    var built = fillSessionDefaults([row({ EXERCISE: 'Bench', SETS: 3, REC_WEIGHT: 135, REP_TARGET: 10, RIR: 3 })])[0];   // as built
    Object.keys(extra || {}).forEach(function (k) { built[SESSION_COLS[k] - 1] = extra[k]; });                          // then what the person did
    return built;
  };

  // Prefill
  var rows = [row({ EXERCISE: 'Bench', SETS: 3, RIR: 3, REC_WEIGHT: 135, REP_TARGET: 10 }),
    row({ EXERCISE: 'Row', SETS: 5, RIR: 2, REC_WEIGHT: '', REP_TARGET: 12 }),
    row({ EXERCISE: 'Curl', SETS: 3, RIR: 2, REC_WEIGHT: 30, REP_TARGET: 8, S1: 9, ACTUAL_RIR: 1, ACTUAL_WEIGHT: 32.5 }),
    row({ EXERCISE: 'Fly', SETS: 8, RIR: 2, REC_WEIGHT: 20, REP_TARGET: 15 })];
  var filled = fillSessionDefaults(rows);
  check('prefill: S1..S<Sets> take the Rep Target, the rest stay blank',
    [[0, 1, 2, 3, 4].map(function (i) { return filled[0][S(i + 1)]; }), [0, 1, 2, 3, 4].map(function (i) { return filled[1][S(i + 1)]; })],
    [[10, 10, 10, '', ''], [12, 12, 12, 12, 12]]);
  check('prefill: more sets than set columns fills the five', [0, 1, 2, 3, 4].map(function (i) { return filled[3][S(i + 1)]; }), [15, 15, 15, 15, 15]);
  check('prefill: Actual RIR / Weight take Target RIR / Rec Weight; no Rec Weight means no default weight',
    [[filled[0][A], filled[0][W]], [filled[1][A], filled[1][W]]], [[3, 135], [2, '']]);
  check('prefill: values the user already typed are kept', [filled[2][S(1)], filled[2][S(2)], filled[2][A], filled[2][W]], [9, 8, 1, 32.5]);
  check('prefill: input rows are not changed', [rows[0][S(1)], rows[0][A], rows[0][W]], ['', '', '']);

  // Done / started / unfinished
  var d = plain();
  check('untouched prefilled row: not started, not done, not unfinished', [rowStarted(d), rowIsDone(d), rowUnfinished(d)], [false, false, false]);
  check('all three ratings -> done, even with every set exactly as prescribed', [rowStarted(plain(RATED)), rowIsDone(plain(RATED)), rowUnfinished(plain(RATED))], [true, true, false]);
  check('changed reps without ratings -> started but unfinished', [rowStarted(plain({ S2: 8 })), rowIsDone(plain({ S2: 8 })), rowUnfinished(plain({ S2: 8 }))], [true, false, true]);
  check('missing ratings are named', missingRatings(plain({ PUMP: 'great' })), ['tendon', 'connection']);
  check('one or two ratings -> unfinished', [rowUnfinished(plain({ PUMP: 'great' })), rowUnfinished(plain({ PUMP: 'great', TENDON: 'good' }))], [true, true]);
  check('a different Actual Weight or RIR starts the row', [rowStarted(plain({ ACTUAL_WEIGHT: 140 })), rowStarted(plain({ ACTUAL_RIR: 1 }))], [true, true]);
  check('typing the prefilled value again changes nothing', [rowStarted(plain({ S1: 10, ACTUAL_WEIGHT: 135, ACTUAL_RIR: 3 }))], [false]);
  check('a cleared planned set starts the row (fewer sets done)', rowStarted(plain({ S3: '' })), true);
  check('a set beyond the planned ones starts the row', rowStarted(plain({ S4: 9 })), true);
  check('notes start the row', rowStarted(plain({ NOTES: 'felt heavy' })), true);
  check('soreness alone does not start a row, but it is user input (a rebuild must ask)',
    [rowStarted(plain({ SORENESS: 'mild' })), rowHasUserInput(plain({ SORENESS: 'mild' })), rowHasUserInput(d)], [false, true, false]);
  check('no Rep Target: any typed set starts the row', [rowStarted(row({ EXERCISE: 'X', SETS: 2 })), rowStarted(row({ EXERCISE: 'X', SETS: 2, S1: 5 }))], [false, true]);
  check('a blank row is never started or done', [rowStarted(row({})), rowIsDone(row({}))], [false, false]);
  check('log rule: isExerciseCompleted is "done"', [isExerciseCompleted(plain(RATED)), isExerciseCompleted(plain({ S2: 8 })), isExerciseCompleted(d)], [true, false, false]);

  // Gray-while-default rules
  check('format rule: Actual RIR vs Target RIR (P vs I), Actual Weight vs Rec Weight (Q vs F), sets vs Rep Target (K..O vs H)',
    defaultLookPairs().map(function (p) { return defaultLookFormula(p[0], p[1]); }),
    ['=AND($P2<>"",$P2=$I2)', '=AND($Q2<>"",$Q2=$F2)', '=AND($K2<>"",$K2=$H2)', '=AND($L2<>"",$L2=$H2)',
     '=AND($M2<>"",$M2=$H2)', '=AND($N2<>"",$N2=$H2)', '=AND($O2<>"",$O2=$H2)']);
  check('column letters', [colLetter(1), colLetter(26), colLetter(27), colLetter(52)], ['A', 'Z', 'AA', 'AZ']);
  check('layout: Exercise is the one frozen column (Week and Day hidden), Rep Range / Rep Target hidden',
    [SESSION_FROZEN_COLS, SESSION_HIDDEN_COLS], [3, [1, 2, 7, 8]]);

  // A soreness change moves Target RIR; a default Actual RIR follows, a typed one stays
  var base = function (actualRir) {
    return row({ WEEK: 1, DAY: 'Mon', EXERCISE: 'Bench', MUSCLE: 'Chest', RIR: 3, SORENESS: 'still sore', ACTUAL_RIR: actualRir, ACTUAL_WEIGHT: '' });
  };
  var followed = planSorenessUpdate([base(3)], [0], DEFAULTS.rirLadder, []).rows[0];
  var kept = planSorenessUpdate([base(1)], [0], DEFAULTS.rirLadder, []).rows[0];
  check('soreness: Target RIR rises one and a default Actual RIR follows it', [followed[SESSION_COLS.RIR - 1], followed[A]], [4, 4]);
  check('soreness: a typed Actual RIR stays', [kept[SESSION_COLS.RIR - 1], kept[A]], [4, 1]);
  check('soreness: blank Actual RIR stays blank', planSorenessUpdate([base('')], [0], DEFAULTS.rirLadder, []).rows[0][A], '');
  return results;
}

/**
 * Pass 10C/10D checks against the live Sheet, called from runSheetTests() with its helpers. Uses the sample week
 * (SampleWeek.gs); the caller restores Program, Session, Log, Archive and Settings, the Exercise Map is restored here.
 */
function sessionLayoutSheetTests(ss, check, h) {
  var session = ss.getSheetByName(TABS.SESSION);
  var logSheet = ss.getSheetByName(TABS.LOG);
  var mapSheet = ss.getSheetByName(TABS.MAP);
  var settings = ss.getSheetByName(TABS.SETTINGS);
  var weekCell = settings.getRange(SETTINGS_ROWS.WEEK, 2);
  var mapBackup = h.rowsOf(mapSheet, MAP_HEADERS.length);
  var wasPaused = SUMMARY_STATE.paused;
  var cellAt = function (row, key) { return session.getRange(row, SESSION_COLS[key]).getValue(); };
  var setCell = function (row, key, v) { session.getRange(row, SESSION_COLS[key]).setValue(v); };
  var status = function () { return String(settings.getRange(SETTINGS_ROWS.STATUS, 2).getValue()); };
  var logged = function () { return h.rowsOf(logSheet, LOG_HEADERS.length).map(logRowFromSheet); };
  var repsOf = function (row) { return ['S1', 'S2', 'S3', 'S4', 'S5'].map(function (k) { return cellAt(row, k); }); };
  var RATED = { PUMP: 'mid', TENDON: 'neutral', CONNECTION: 'good' };
  SUMMARY_STATE.paused = true;
  try {
    settings.getRange(SETTINGS_ROWS.MESO_WEEKS, 2).setValue(6);
    loadSampleWeek({ kind: 'partial', interactive: false });   // Bench (row 2) and Squat (row 5) done, Incline (row 8) untouched
    setCell(5, 'ACTUAL_WEIGHT', 190);                          // Squat: 190 lb instead of the 185 recommended
    var targetRir = rirForWeek(readSettings(ss).rirLadder, 1);

    // Layout
    check('sessions: Exercise is the one frozen column, Week / Day / Rep Range / Rep Target hidden',
      [session.getFrozenColumns(), session.getColumnWidth(SESSION_COLS.EXERCISE),
       SESSION_HIDDEN_COLS.map(function (c) { return session.isColumnHiddenByUser(c); }),
       [SESSION_COLS.EXERCISE, SESSION_COLS.S1, SESSION_COLS.ACTUAL_RIR].map(function (c) { return session.isColumnHiddenByUser(c); })],
      [3, 150, [true, true, true, true], [false, false, false]]);
    var rules = session.getConditionalFormatRules();
    check('sessions: gray-while-default rules on the sets, Actual RIR and Actual Weight',
      [rules.map(function (r) { return r.getRanges()[0].getColumn(); }), rules.map(function (r) { return r.getBooleanCondition().getCriteriaValues()[0]; })],
      [defaultLookPairs().map(function (p) { return p[0]; }), defaultLookPairs().map(function (p) { return defaultLookFormula(p[0], p[1]); })]);
    var numeric = ['REC_WEIGHT', 'REP_TARGET', 'S1', 'S2', 'S3', 'S4', 'S5', 'ACTUAL_RIR', 'ACTUAL_WEIGHT'];
    check('sessions: every number cell is number-only (phone shows the number pad)',
      numeric.filter(function (k) {
        var dv = session.getRange(2, SESSION_COLS[k]).getDataValidation();
        return !dv || String(dv.getCriteriaType()) !== 'NUMBER_BETWEEN';
      }), []);

    // Prefill on the built week: week 1 uses the Rep Min (8 for Incline's 8-12 range) for its 3 planned sets
    check('prefill: untouched Incline holds its recommendation (3 sets of the Rep Min, Actual RIR and Weight)',
      [repsOf(8), cellAt(8, 'ACTUAL_RIR'), cellAt(8, 'ACTUAL_WEIGHT')], [[8, 8, 8, '', ''], targetRir, 50]);
    check('prefill: Bench has 4 planned sets, typed reps replaced the prefill, Actual RIR typed',
      [repsOf(2), cellAt(2, 'ACTUAL_RIR'), cellAt(2, 'ACTUAL_WEIGHT'), cellAt(5, 'ACTUAL_WEIGHT')], [[8, 8, 8, 8, ''], 2, 135, 190]);

    // Moving the recommendation moves an untouched default, not a typed value
    setCell(8, 'SORENESS', 'still sore'); setCell(2, 'SORENESS', 'still sore');
    applySorenessEdit(session.getRange(8, SESSION_COLS.SORENESS));
    applySorenessEdit(session.getRange(2, SESSION_COLS.SORENESS));
    var eased = sorenessRir(targetRir, 'still sore');
    check('soreness: untouched Actual RIR follows the new Target RIR; the typed one stays',
      [cellAt(8, 'RIR'), cellAt(8, 'ACTUAL_RIR'), cellAt(2, 'RIR'), cellAt(2, 'ACTUAL_RIR')], [eased, eased, eased, 2]);
    setCell(8, 'REC_WEIGHT', 55);
    followRecWeightEdit(session.getRange(8, SESSION_COLS.REC_WEIGHT), 50);
    setCell(5, 'REC_WEIGHT', 200);
    followRecWeightEdit(session.getRange(5, SESSION_COLS.REC_WEIGHT), 185);
    check('rec weight edit: untouched Actual Weight follows it; the typed 190 stays',
      [cellAt(8, 'ACTUAL_WEIGHT'), cellAt(5, 'ACTUAL_WEIGHT')], [55, 190]);
    setCell(8, 'REC_WEIGHT', 50); setCell(8, 'ACTUAL_WEIGHT', 50);

    // A fresh build is only defaults: it is not "entered data", a rebuild is not refused, and nothing counts as done
    clearBody(session, SESSION_HEADERS.length);
    buildSession({ interactive: false });
    check('fresh build: defaults only, so not "entered data"', sessionHasUserInput(session), false);
    buildSession({ interactive: false });
    check('fresh build: building again is not refused', status().indexOf('Not rebuilt') > -1, false);
    check('fresh build: no exercise is done and none is unfinished',
      [countUnlogged(ss), weekGaps(readSessionBody(session)).unfinished.length, weekGaps(readSessionBody(session)).notDone.length], [0, 0, 12]);

    // Typing the prescribed number again changes nothing; a different one is entered data
    setCell(3, 'ACTUAL_WEIGHT', cellAt(3, 'REC_WEIGHT'));
    check('typing the recommended weight again changes nothing', sessionHasUserInput(session), false);
    setCell(3, 'ACTUAL_WEIGHT', cellAt(3, 'REC_WEIGHT') + 5);
    check('a different Actual Weight is entered data', sessionHasUserInput(session), true);
    setCell(3, 'ACTUAL_WEIGHT', cellAt(3, 'REC_WEIGHT'));

    // Started but unrated: Complete Week refuses and names what is missing; nothing is logged or changed
    h.enterOnly(8, { S2: 7 });
    check('unfinished: the changed row needs its ratings', weekGaps(readSessionBody(session)).unfinished.length, 1);
    var blocked = completeWeek({ interactive: false });
    check('unfinished: Complete Week refuses, names the exercise and what is missing, logs nothing, stays on week 1',
      [blocked.ok, status().indexOf('Incline Dumbbell Press (pump, tendon, connection)') > -1, logged().length, weekCell.getValue()], [false, true, 0, 1]);
    var cleared = (function () { clearSession({ interactive: false }); return status().indexOf('Not cleared') > -1; })();
    check('unfinished: Clear Session (phone) refuses too, and the row is still there', [cleared, cellAt(8, 'S2')], [true, 7]);

    // The ratings are the done signal: filling them (and nothing else) on an untouched row logs the prefilled reps
    setCell(8, 'S2', 8);
    h.enterOnly(9, RATED);   // Lat Pulldown: exactly as prescribed
    setCell(8, 'PUMP', 'great'); setCell(8, 'TENDON', 'good'); setCell(8, 'CONNECTION', 'good');   // Incline: ratings, reps back to 8
    var week = completeWeek({ interactive: false });
    var byName = {};
    logged().forEach(function (r) { byName[r[SESSION_COLS.EXERCISE]] = r; });
    var incline = byName['Incline Dumbbell Press'], pulldown = byName['Lat Pulldown'];
    check('rated rows log with their prefilled values (exactly as prescribed)',
      [week.ok, logged().length, incline && [incline[SESSION_COLS.S1], incline[SESSION_COLS.S2], incline[SESSION_COLS.S3], incline[SESSION_COLS.S4], incline[SESSION_COLS.ACTUAL_RIR], incline[SESSION_COLS.ACTUAL_WEIGHT]],
       pulldown && [pulldown[SESSION_COLS.S3], pulldown[SESSION_COLS.PUMP], pulldown[SESSION_COLS.CONNECTION]]],
      [true, 2, [8, 8, 8, '', targetRir, 50], [8, 'mid', 'good']]);
    check('untouched rows were not logged; the warning names them',
      [Object.keys(byName).sort(), status().indexOf('were not done and will not be logged') > -1, status().indexOf('Mon Barbell Bench Press') > -1],
      [['Incline Dumbbell Press', 'Lat Pulldown'], true, true]);
    check('the next week is prefilled from the progression: Incline hit its Rep Min, so reps go up one',
      [weekCell.getValue(), cellAt(8, 'WEEK'), repsOf(8)], [2, 2, [9, 9, 9, '', '']]);
  } finally {
    clearBody(mapSheet, MAP_HEADERS.length);
    if (mapBackup.length) mapSheet.getRange(2, 1, mapBackup.length, MAP_HEADERS.length).setValues(mapBackup);
    SUMMARY_STATE.paused = wasPaused;
  }
}
