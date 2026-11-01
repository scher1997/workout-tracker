/**
 * WeekFlowTests.gs — tests for Pass 10B: the Sessions tab reads as one table per day, and a whole week is logged
 * in one Complete Week, whether every programmed exercise was done or not (an incomplete week only warns).
 * runWeekFlowTests() is called from runPureTests() in Tests.gs; weekFlowSheetTests() from runSheetTests() with its helpers.
 */

function runWeekFlowTests() {
  var results = [];
  var check = function (name, actual, expected) {
    var a = JSON.stringify(actual), x = JSON.stringify(expected);
    results.push({ name: name, pass: a === x, detail: a === x ? '' : 'expected ' + x + ' got ' + a });
  };
  var C = SESSION_DAY_COLORS;

  // Day colours: one per day, in order of first appearance, kept when a day's rows are not together
  check('day colours: blocks alternate', dayBackgrounds(['Mon', 'Mon', 'Tue', 'Tue', 'Thu']), [C[0], C[0], C[1], C[1], C[0]]);
  check('day colours: same day elsewhere keeps its colour, case/space-insensitive',
    dayBackgrounds(['Mon', 'Tue', ' mon ', 'Wed']), [C[0], C[1], C[0], C[0]]);
  check('day colours: no rows', dayBackgrounds([]), []);

  // Week gaps: done = all ratings, started-but-unrated stops Complete Week, untouched only warns
  var RATED = { PUMP: 'mid', TENDON: 'neutral', CONNECTION: 'good' };
  var row = function (day, exercise, sets, vals) {
    var r = [];
    for (var i = 0; i < SESSION_HEADERS.length; i++) r.push('');
    r[SESSION_COLS.DAY - 1] = day; r[SESSION_COLS.EXERCISE - 1] = exercise; r[SESSION_COLS.SETS - 1] = sets; r[SESSION_COLS.REP_TARGET - 1] = 10;
    r = fillSessionDefaults([r])[0];   // as built; then what the person did on top of it
    Object.keys(vals || {}).forEach(function (k) { r[SESSION_COLS[k] - 1] = vals[k]; });
    return r;
  };
  var withRatings = function (extra) { var v = {}; Object.keys(RATED).forEach(function (k) { v[k] = RATED[k]; }); Object.keys(extra || {}).forEach(function (k) { v[k] = extra[k]; }); return v; };
  var full = [row('Mon', 'Bench', 3, withRatings()), row('Mon', 'Row', 3, withRatings({ S4: 9 })), row('', '', '', {})];
  check('gaps: a full week has none, extra sets are fine, blank rows ignored',
    [weekGaps(full), gapWarning(weekGaps(full))], [{ notDone: [], unfinished: [], short: [], total: 2 }, '']);
  var partial = [row('Mon', 'Bench', 3, withRatings()), row('Tue', 'Squat', 4, withRatings({ S3: '', S4: '' })),
    row('Thu', 'Curl', 3, {}), row('', 'Plank', 2, {}), row('Fri', 'Row', 3, { S1: 7 })];
  var gaps = weekGaps(partial);
  check('gaps: untouched = not done, ratings but fewer sets = short, changed reps without ratings = unfinished',
    gaps, { notDone: ['Thu Curl', 'Plank'], unfinished: ['Fri Row (pump, tendon, connection)'], short: ['Tue Squat 2/4 sets'], total: 5 });
  check('gaps: warning names the untouched and the short ones',
    gapWarning(gaps), 'Warning: 2 of 5 exercise(s) were not done and will not be logged: Thu Curl, Plank. Fewer sets than planned: Tue Squat 2/4 sets.');
  check('gaps: the refusal names the exercise and the missing ratings',
    unfinishedMessage(gaps), '1 exercise(s) are started but missing feedback. Fill in Pump, Tendon and Connection for: Fri Row (pump, tendon, connection). Then try again.');
  check('gaps: a set cleared in the middle counts as one set short',
    weekGaps([row('Mon', 'Bench', 3, withRatings({ S2: '' }))]).short, ['Mon Bench 2/3 sets']);
  return results;
}

/**
 * Pass 10B checks against the live Sheet, called from runSheetTests() with its helpers. Both weeks come from
 * loadSampleWeek() (SampleWeek.gs), the same loader as the Workout > Load sample week menu items. The caller restores
 * Program, Session, Log, Archive and Settings; the Exercise Map is restored here.
 */
function weekFlowSheetTests(ss, check, h) {
  var session = ss.getSheetByName(TABS.SESSION);
  var logSheet = ss.getSheetByName(TABS.LOG);
  var mapSheet = ss.getSheetByName(TABS.MAP);
  var settings = ss.getSheetByName(TABS.SETTINGS);
  var weekCell = settings.getRange(SETTINGS_ROWS.WEEK, 2);
  var mapBackup = h.rowsOf(mapSheet, MAP_HEADERS.length);
  var wasPaused = SUMMARY_STATE.paused;
  var status = function () { return String(settings.getRange(SETTINGS_ROWS.STATUS, 2).getValue()); };
  var logged = function () { return h.rowsOf(logSheet, LOG_HEADERS.length).map(logRowFromSheet); };   // code rows: r[SESSION_COLS.X]
  var sessionCol = function (c) { return h.rowsOf(session, SESSION_HEADERS.length).map(function (r) { return r[SESSION_COLS[c] - 1]; }); };
  var color = function (row) { return session.getRange(row, 1).getBackground(); };
  var C = SESSION_DAY_COLORS;
  SUMMARY_STATE.paused = true;
  try {
    settings.getRange(SETTINGS_ROWS.MESO_WEEKS, 2).setValue(6);

    // A. Full week: every exercise done, different sets and reps, feedback on every row, logged in one Complete Week
    var loadedFull = loadSampleWeek({ kind: 'full', interactive: false });
    check('sample week (full): loaded, all 12 rows filled, nothing logged yet',
      [loadedFull.ok, loadedFull.filled, logged().length, countUnlogged(ss)], [true, 12, 0, 12]);
    check('upper/lower: 4 days x 3 exercises built',
      sessionCol('DAY'), ['Mon', 'Mon', 'Mon', 'Tue', 'Tue', 'Tue', 'Thu', 'Thu', 'Thu', 'Fri', 'Fri', 'Fri']);
    check('sessions: each day is one colour block, the next day the next colour, blank below',
      [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14].map(color),
      [C[0], C[0], C[0], C[1], C[1], C[1], C[0], C[0], C[0], C[1], C[1], C[1], SESSION_BLANK_COLOR]);
    var full = completeWeek({ interactive: false });
    check('full week: Complete Week ok, nothing missing', [full.ok, full.gaps.notDone, full.gaps.short], [true, [], []]);
    check('full week: no warning in the status', status().indexOf('Warning') > -1, false);
    var log1 = logged();
    check('full week: all 12 exercises in Log, 3 per day',
      [log1.length, ['Mon', 'Tue', 'Thu', 'Fri'].map(function (d) {
        return log1.filter(function (r) { return r[SESSION_COLS.DAY] === d; }).length;
      })], [12, [3, 3, 3, 3]]);
    check('full week: sets as done (4, 3, 4, 5 ...), weights fall back to the recommendation',
      [log1.map(function (r) { return SESSION_REP_COLS.filter(function (c) { return parseNumber(r[c]) !== null; }).length; }),
       log1[0][SESSION_COLS.ACTUAL_WEIGHT], log1[3][SESSION_COLS.ACTUAL_WEIGHT]],
      [[4, 3, 4, 5, 3, 3, 3, 3, 3, 3, 3, 4], 135, 190]);
    check('full week: feedback and notes reach the Log',
      [log1[0][SESSION_COLS.NOTES], log1[7][SESSION_COLS.CONNECTION], log1[10][SESSION_COLS.TENDON], log1[8][SESSION_COLS.PUMP]],
      ['solid top set', 'not at all', 'bad', 'none']);
    check('full week: rolled to week 2 with all 12 rows, recoloured', [weekCell.getValue(), sessionCol('WEEK'), color(2), color(5), color(14)],
      [2, [2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2], C[0], C[1], SESSION_BLANK_COLOR]);
    var wk2 = h.rowsOf(session, SESSION_HEADERS.length);
    var at = function (i, c) { return wk2[i][SESSION_COLS[c] - 1]; };
    check('full week: calf raise hit Rep Max 15 -> 105 lb at 10 reps; bench held with +1 rep',
      [at(5, 'REC_WEIGHT'), at(5, 'REP_TARGET'), at(0, 'REC_WEIGHT'), at(0, 'REP_TARGET')], [105, 10, 135, 8]);
    check('full week: tendon "bad" -> maintenance (one set fewer); no connection -> technique flag',
      [at(10, 'SETS'), String(at(10, 'FLAGS')).indexOf(FEEDBACK.flags.maintain) > -1, String(at(7, 'FLAGS')).indexOf(FEEDBACK.flags.technique) > -1], [2, true, true]);

    // B. Incomplete week: untouched days and exercises, one short exercise. Still logged and rolled; a warning only
    // Mon complete, Tue two of three, Thu skipped, Fri Leg Press 2 of 3 sets (UPPER_LOWER_PARTIAL)
    var loadedPartial = loadSampleWeek({ kind: 'partial', interactive: false });
    check('sample week (incomplete): loaded, 6 exercises filled, week 1', [loadedPartial.ok, loadedPartial.filled, weekCell.getValue()], [true, 6, 1]);
    var partial = completeWeek({ interactive: false });
    check('incomplete week: still ok, rolled to week 2', [partial.ok, weekCell.getValue()], [true, 2]);
    check('incomplete week: the 6 exercises that were rated are logged (Mon 3, Tue 2, Fri 1)',
      logged().map(function (r) { return r[SESSION_COLS.DAY] + ' ' + r[SESSION_COLS.EXERCISE]; }),
      ['Mon Barbell Bench Press', 'Mon Chest-Supported Row', 'Mon Overhead Press', 'Tue Back Squat', 'Tue Romanian Deadlift', 'Fri Leg Press']);
    check('incomplete week: gaps name what was missed',
      [partial.gaps.notDone, partial.gaps.short],
      [['Tue Standing Calf Raise', 'Thu Incline Dumbbell Press', 'Thu Lat Pulldown', 'Thu Dumbbell Curl', 'Fri Seated Leg Curl', 'Fri Hip Thrust'],
       ['Fri Leg Press 2/3 sets']]);
    check('incomplete week: the status warns instead of refusing',
      [status().indexOf('Warning: 6 of 12 exercise(s) were not done and will not be logged') > -1,
       status().indexOf('Fri Leg Press 2/3 sets') > -1], [true, true]);
    check('incomplete week: week 2 still has all 12 rows; missed exercises back at Program weights',
      [sessionCol('EXERCISE').length, sessionCol('REC_WEIGHT').slice(5)],
      [12, [100, 50, 110, 30, 282.5, 90, 185]]);   // Leg Press averaged its Rep Max 15 on two sets: weight up
  } finally {
    clearBody(mapSheet, MAP_HEADERS.length);
    if (mapBackup.length) mapSheet.getRange(2, 1, mapBackup.length, MAP_HEADERS.length).setValues(mapBackup);
    SUMMARY_STATE.paused = wasPaused;
  }
}
