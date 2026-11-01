/**
 * SessionLayoutTests.gs — tests for Pass 10C: Actual RIR / Actual Weight default to the recommendation (gray until
 * changed), number-pad entry cells, and frozen Week / Day / Exercise columns on Sessions.
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
  var A = SESSION_COLS.ACTUAL_RIR - 1, W = SESSION_COLS.ACTUAL_WEIGHT - 1;

  // Defaults
  var rows = [row({ EXERCISE: 'Bench', RIR: 3, REC_WEIGHT: 135 }), row({ EXERCISE: 'Row', RIR: 2, REC_WEIGHT: '' }),
    row({ EXERCISE: 'Curl', RIR: 2, REC_WEIGHT: 30, ACTUAL_RIR: 1, ACTUAL_WEIGHT: 32.5 })];
  var filled = fillActualDefaults(rows);
  check('defaults: blank Actual RIR / Weight take Target RIR / Rec Weight', [filled[0][A], filled[0][W]], [3, 135]);
  check('defaults: no Rec Weight means no default weight', [filled[1][A], filled[1][W]], [2, '']);
  check('defaults: values the user already typed are kept', [filled[2][A], filled[2][W]], [1, 32.5]);
  check('defaults: input rows are not changed', [rows[0][A], rows[0][W]], ['', '']);

  // What counts as entered data
  var d = filled[0];
  check('input: untouched defaults are not entered data', rowHasUserInput(d), false);
  var withVals = function (vals) { var r = d.slice(); Object.keys(vals).forEach(function (k) { r[SESSION_COLS[k] - 1] = vals[k]; }); return r; };
  check('input: reps typed', rowHasUserInput(withVals({ S1: 8 })), true);
  check('input: Actual Weight different from Rec Weight', rowHasUserInput(withVals({ ACTUAL_WEIGHT: 140 })), true);
  check('input: Actual RIR different from Target RIR', rowHasUserInput(withVals({ ACTUAL_RIR: 1 })), true);
  check('input: Actual equal to its default is still not entered data', rowHasUserInput(withVals({ ACTUAL_RIR: 3, ACTUAL_WEIGHT: 135 })), false);
  check('input: feedback or notes typed', [rowHasUserInput(withVals({ PUMP: 'great' })), rowHasUserInput(withVals({ NOTES: 'x' }))], [true, true]);
  check('input: an Actual Weight typed where there is no Rec Weight', rowHasUserInput(withVals({ REC_WEIGHT: '', ACTUAL_WEIGHT: 20 })), true);
  check('input: text where a number belongs counts as typed', rowHasUserInput(withVals({ ACTUAL_RIR: 'x' })), true);

  // Gray-while-default rule
  check('format rule: Actual RIR vs Target RIR (P vs I), Actual Weight vs Rec Weight (Q vs F)',
    [defaultLookFormula(SESSION_COLS.ACTUAL_RIR, SESSION_COLS.RIR), defaultLookFormula(SESSION_COLS.ACTUAL_WEIGHT, SESSION_COLS.REC_WEIGHT)],
    ['=AND($P2<>"",$P2=$I2)', '=AND($Q2<>"",$Q2=$F2)']);
  check('column letters', [colLetter(1), colLetter(26), colLetter(27), colLetter(52)], ['A', 'Z', 'AA', 'AZ']);
  check('frozen block is Week, Day and Exercise', SESSION_FROZEN_COLS, 3);

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
 * Pass 10C checks against the live Sheet, called from runSheetTests() with its helpers. Uses the sample week
 * (SampleWeek.gs); the caller restores Program, Session, Log, Archive and Settings, the Exercise Map is restored here.
 */
function sessionLayoutSheetTests(ss, check, h) {
  var session = ss.getSheetByName(TABS.SESSION);
  var logSheet = ss.getSheetByName(TABS.LOG);
  var mapSheet = ss.getSheetByName(TABS.MAP);
  var settings = ss.getSheetByName(TABS.SETTINGS);
  var mapBackup = h.rowsOf(mapSheet, MAP_HEADERS.length);
  var wasPaused = SUMMARY_STATE.paused;
  var cellAt = function (row, key) { return session.getRange(row, SESSION_COLS[key]).getValue(); };
  var status = function () { return String(settings.getRange(SETTINGS_ROWS.STATUS, 2).getValue()); };
  SUMMARY_STATE.paused = true;
  try {
    settings.getRange(SETTINGS_ROWS.MESO_WEEKS, 2).setValue(6);
    loadSampleWeek({ kind: 'partial', interactive: false });   // Bench (row 2) and Squat (row 5) done, Incline (row 8) untouched
    session.getRange(5, SESSION_COLS.ACTUAL_WEIGHT).setValue(190);   // Squat: 190 lb instead of the 185 recommended
    var ladder = readSettings(ss).rirLadder;
    var targetRir = rirForWeek(ladder, 1);

    // Layout
    check('sessions: Week, Day and Exercise are frozen',
      [session.getFrozenColumns(), session.getColumnWidth(SESSION_COLS.WEEK), session.getColumnWidth(SESSION_COLS.DAY), session.getColumnWidth(SESSION_COLS.EXERCISE)],
      [3, 44, 52, 150]);
    var rules = session.getConditionalFormatRules();
    check('sessions: gray-while-default rules on Actual RIR and Actual Weight',
      [rules.map(function (r) { return r.getRanges()[0].getColumn(); }), rules.map(function (r) { return r.getBooleanCondition().getCriteriaValues()[0]; })],
      [[SESSION_COLS.ACTUAL_RIR, SESSION_COLS.ACTUAL_WEIGHT],
       [defaultLookFormula(SESSION_COLS.ACTUAL_RIR, SESSION_COLS.RIR), defaultLookFormula(SESSION_COLS.ACTUAL_WEIGHT, SESSION_COLS.REC_WEIGHT)]]);
    var numeric = ['REC_WEIGHT', 'REP_TARGET', 'S1', 'S2', 'S3', 'S4', 'S5', 'ACTUAL_RIR', 'ACTUAL_WEIGHT'];
    check('sessions: every number cell is number-only (phone shows the number pad)',
      numeric.filter(function (k) {
        var dv = session.getRange(2, SESSION_COLS[k]).getDataValidation();
        return !dv || String(dv.getCriteriaType()) !== 'NUMBER_BETWEEN';
      }), []);

    // Defaults on the built week
    check('defaults: an untouched exercise shows its recommendation as Actual',
      [cellAt(8, 'ACTUAL_RIR'), cellAt(8, 'ACTUAL_WEIGHT'), cellAt(8, 'RIR'), cellAt(8, 'REC_WEIGHT')], [targetRir, 50, targetRir, 50]);
    check('defaults: typed values replace them (Bench RIR 2, Squat weight 190), the rest keep the default',
      [cellAt(2, 'ACTUAL_RIR'), cellAt(2, 'ACTUAL_WEIGHT'), cellAt(5, 'ACTUAL_WEIGHT')], [2, 135, 190]);

    // Moving the recommendation moves an untouched default, not a typed value
    session.getRange(8, SESSION_COLS.SORENESS).setValue('still sore');
    session.getRange(2, SESSION_COLS.SORENESS).setValue('still sore');
    applySorenessEdit(session.getRange(8, SESSION_COLS.SORENESS));
    applySorenessEdit(session.getRange(2, SESSION_COLS.SORENESS));
    var eased = sorenessRir(targetRir, 'still sore');
    check('soreness: untouched Actual RIR follows the new Target RIR; the typed one stays',
      [cellAt(8, 'RIR'), cellAt(8, 'ACTUAL_RIR'), cellAt(2, 'RIR'), cellAt(2, 'ACTUAL_RIR')], [eased, eased, eased, 2]);
    session.getRange(8, SESSION_COLS.REC_WEIGHT).setValue(55);
    followRecWeightEdit(session.getRange(8, SESSION_COLS.REC_WEIGHT), 50);
    session.getRange(5, SESSION_COLS.REC_WEIGHT).setValue(200);
    followRecWeightEdit(session.getRange(5, SESSION_COLS.REC_WEIGHT), 185);
    check('rec weight edit: untouched Actual Weight follows it; the typed 190 stays',
      [cellAt(8, 'ACTUAL_WEIGHT'), cellAt(5, 'ACTUAL_WEIGHT')], [55, 190]);

    // A fresh build holds only defaults: a rebuild is not refused, and typing something different is entered data
    clearBody(session, SESSION_HEADERS.length);
    buildSession({ interactive: false });
    check('fresh build: defaults only, so not "entered data"', sessionHasUserInput(session), false);
    buildSession({ interactive: false });
    check('fresh build: building again is not refused', status().indexOf('Not rebuilt') > -1, false);
    session.getRange(3, SESSION_COLS.ACTUAL_WEIGHT).setValue(cellAt(3, 'REC_WEIGHT'));
    check('typing the recommended weight again changes nothing', sessionHasUserInput(session), false);
    session.getRange(3, SESSION_COLS.ACTUAL_WEIGHT).setValue(cellAt(3, 'REC_WEIGHT') + 5);
    check('a different Actual Weight is entered data', sessionHasUserInput(session), true);
    session.getRange(3, SESSION_COLS.ACTUAL_WEIGHT).setValue(cellAt(3, 'REC_WEIGHT'));

    // Reps only: the exercise logs with the shown defaults
    h.enter(8, { S1: 10, S2: 10, S3: 9 });
    var week = completeWeek({ interactive: false });
    var incline = h.rowsOf(logSheet, LOG_HEADERS.length).map(logRowFromSheet).filter(function (r) { return r[SESSION_COLS.EXERCISE] === 'Incline Dumbbell Press'; })[0];
    check('log: reps only -> Actual RIR and Actual Weight log as the recommendation',
      [week.ok, incline && incline[SESSION_COLS.ACTUAL_RIR], incline && incline[SESSION_COLS.ACTUAL_WEIGHT]], [true, targetRir, 50]);
  } finally {
    clearBody(mapSheet, MAP_HEADERS.length);
    if (mapBackup.length) mapSheet.getRange(2, 1, mapBackup.length, MAP_HEADERS.length).setValues(mapBackup);
    SUMMARY_STATE.paused = wasPaused;
  }
}
