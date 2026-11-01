/**
 * WeekFlowTests.gs — tests for Pass 10B: the Sessions tab reads as one table per day, and a whole week is logged
 * in one Complete Week, whether every programmed exercise was done or not (an incomplete week only warns).
 * runWeekFlowTests() is called from runPureTests() in Tests.gs; weekFlowSheetTests() from runSheetTests() with its helpers.
 */

// Four-day upper/lower split, three exercises a day. [Exercise, Primary muscle, Secondary, Tertiary]
var UPPER_LOWER_MAP = [
  ['Barbell Bench Press', 'Chest', 'Triceps', ''], ['Chest-Supported Row', 'Back', 'Biceps', ''], ['Overhead Press', 'Shoulders', 'Triceps', ''],
  ['Back Squat', 'Quads', 'Glutes', ''], ['Romanian Deadlift', 'Hamstrings', 'Glutes', ''], ['Standing Calf Raise', 'Calves', '', ''],
  ['Incline Dumbbell Press', 'Chest', 'Shoulders', ''], ['Lat Pulldown', 'Back', 'Biceps', ''], ['Dumbbell Curl', 'Biceps', '', ''],
  ['Leg Press', 'Quads', 'Glutes', ''], ['Seated Leg Curl', 'Hamstrings', '', ''], ['Hip Thrust', 'Glutes', 'Hamstrings', '']
];
// Program rows: Day, Exercise, Sets, Start Weight, Rep Min, Rep Max
var UPPER_LOWER_PROGRAM = [
  ['Mon', 'Barbell Bench Press', 4, 135, 6, 10], ['Mon', 'Chest-Supported Row', 3, 90, 8, 12], ['Mon', 'Overhead Press', 3, 75, 8, 12],
  ['Tue', 'Back Squat', 4, 185, 5, 8], ['Tue', 'Romanian Deadlift', 3, 155, 8, 10], ['Tue', 'Standing Calf Raise', 3, 100, 10, 15],
  ['Thu', 'Incline Dumbbell Press', 3, 50, 8, 12], ['Thu', 'Lat Pulldown', 3, 110, 8, 12], ['Thu', 'Dumbbell Curl', 3, 30, 10, 12],
  ['Fri', 'Leg Press', 3, 270, 10, 15], ['Fri', 'Seated Leg Curl', 3, 90, 10, 15], ['Fri', 'Hip Thrust', 3, 185, 8, 12]
];
// One full week as a lifter might really log it: different set counts (some more or fewer than planned), reps, feedback.
// Same order as the Program rows. reps = S1.. as done.
var UPPER_LOWER_WEEK = [
  { reps: [8, 8, 7, 6], rir: 2, pump: 'great', tendon: 'good', connection: 'great', soreness: 'none', notes: 'solid top set' },
  { reps: [12, 11, 10], rir: 2, pump: 'mid', tendon: 'neutral', connection: 'good', soreness: 'mild' },
  { reps: [10, 9, 8, 8], rir: 1, pump: 'mid', tendon: 'neutral', connection: 'good', soreness: 'mild', notes: 'added a fourth set' },
  { reps: [6, 6, 6, 5, 5], weight: 190, rir: 2, pump: 'great', tendon: 'neutral', connection: 'good', soreness: 'none' },
  { reps: [10, 10, 9], rir: 2, pump: 'mid', tendon: 'good', connection: 'good', soreness: 'none' },
  { reps: [15, 15, 15], rir: 1, pump: 'great', tendon: 'neutral', connection: 'good', soreness: 'none' },
  { reps: [10, 10, 9], rir: 2, pump: 'mid', tendon: 'neutral', connection: 'good', soreness: 'none' },
  { reps: [12, 11, 10], rir: 2, pump: 'mid', tendon: 'neutral', connection: 'not at all', soreness: 'none' },
  { reps: [12, 12, 11], rir: 2, pump: 'none', tendon: 'neutral', connection: 'good', soreness: 'none' },
  { reps: [15, 14, 13], rir: 2, pump: 'great', tendon: 'neutral', connection: 'great', soreness: 'mild' },
  { reps: [12, 12, 10], rir: 2, pump: 'mid', tendon: 'bad', connection: 'good', soreness: 'none', notes: 'tendon grumbling' },
  { reps: [10, 10, 10, 10], rir: 2, pump: 'great', tendon: 'good', connection: 'great', soreness: 'none' }
];

/** Session cell values for one UPPER_LOWER_WEEK spec, keyed like SESSION_COLS (for h.enter). */
function weekSpecToEntry(spec) {
  var entry = { ACTUAL_RIR: spec.rir, PUMP: spec.pump, TENDON: spec.tendon, CONNECTION: spec.connection, SORENESS: spec.soreness };
  spec.reps.forEach(function (n, i) { entry['S' + (i + 1)] = n; });
  if (spec.weight !== undefined) entry.ACTUAL_WEIGHT = spec.weight;
  if (spec.notes) entry.NOTES = spec.notes;
  return entry;
}

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

  // Week gaps
  var row = function (day, exercise, sets, reps) {
    var r = [];
    for (var i = 0; i < SESSION_HEADERS.length; i++) r.push('');
    r[SESSION_COLS.DAY - 1] = day; r[SESSION_COLS.EXERCISE - 1] = exercise; r[SESSION_COLS.SETS - 1] = sets;
    reps.forEach(function (n, i) { r[SESSION_COLS.S1 - 1 + i] = n; });
    return r;
  };
  var full = [row('Mon', 'Bench', 3, [8, 8, 8]), row('Mon', 'Row', 3, [10, 10, 10, 9]), row('', '', '', [])];
  check('gaps: a full week has none, extra sets are fine, blank rows ignored',
    [weekGaps(full), gapWarning(weekGaps(full))], [{ notDone: [], short: [], total: 2 }, '']);
  var partial = [row('Mon', 'Bench', 3, [8, 8, 8]), row('Tue', 'Squat', 4, [6, 6]), row('Thu', 'Curl', 3, []), row('', 'Plank', 2, [])];
  var gaps = weekGaps(partial);
  check('gaps: no reps = not done, fewer sets than planned = short',
    gaps, { notDone: ['Thu Curl', 'Plank'], short: ['Tue Squat 2/4 sets'], total: 4 });
  check('gaps: warning names both',
    gapWarning(gaps), 'Warning: 2 of 4 exercise(s) have no reps and will not be logged: Thu Curl, Plank. Fewer sets than planned: Tue Squat 2/4 sets.');
  check('gaps: a set skipped in the middle counts as one set short',
    weekGaps([row('Mon', 'Bench', 3, [8, '', 8])]).short, ['Mon Bench 2/3 sets']);
  return results;
}

/**
 * Pass 10B checks against the live Sheet, called from runSheetTests() with its helpers. Swaps in the upper/lower map
 * and program, and the caller restores Program, Session, Log, Archive and Settings; the Exercise Map is restored here.
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
    clearBody(mapSheet, MAP_HEADERS.length);
    mapSheet.getRange(2, 1, UPPER_LOWER_MAP.length, MAP_HEADERS.length).setValues(UPPER_LOWER_MAP);
    settings.getRange(SETTINGS_ROWS.MESO_WEEKS, 2).setValue(6);
    var start = function () {
      weekCell.setValue(1);
      clearBody(logSheet, LOG_HEADERS.length);
      h.writeProgram(UPPER_LOWER_PROGRAM);
      return h.buildAndRead();
    };

    // A. Full week: every exercise done, different sets and reps, feedback on every row, logged in one Complete Week
    var built = start();
    check('upper/lower: 4 days x 3 exercises built',
      [built.length, built.map(function (r) { return r[SESSION_COLS.DAY - 1]; })],
      [12, ['Mon', 'Mon', 'Mon', 'Tue', 'Tue', 'Tue', 'Thu', 'Thu', 'Thu', 'Fri', 'Fri', 'Fri']]);
    check('sessions: each day is one colour block, the next day the next colour, blank below',
      [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14].map(color),
      [C[0], C[0], C[0], C[1], C[1], C[1], C[0], C[0], C[0], C[1], C[1], C[1], SESSION_BLANK_COLOR]);
    UPPER_LOWER_WEEK.forEach(function (spec, i) { h.enter(i + 2, weekSpecToEntry(spec)); });
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
    start();
    h.enter(2, weekSpecToEntry({ reps: [8, 8, 8, 8], rir: 2 }));     // Mon: all three
    h.enter(3, weekSpecToEntry({ reps: [12, 12, 12], rir: 2 }));
    h.enter(4, weekSpecToEntry({ reps: [10, 10, 10], rir: 2 }));
    h.enter(5, weekSpecToEntry({ reps: [6, 6, 6, 6], rir: 2 }));     // Tue: two of three
    h.enter(6, weekSpecToEntry({ reps: [10, 10, 10], rir: 2 }));
    h.enter(11, weekSpecToEntry({ reps: [15, 15], rir: 2 }));        // Fri: Leg Press with 2 of 3 sets, the rest untouched; Thu untouched
    var partial = completeWeek({ interactive: false });
    check('incomplete week: still ok, rolled to week 2', [partial.ok, weekCell.getValue()], [true, 2]);
    check('incomplete week: the 6 exercises with reps are logged (Mon 3, Tue 2, Fri 1)',
      logged().map(function (r) { return r[SESSION_COLS.DAY] + ' ' + r[SESSION_COLS.EXERCISE]; }),
      ['Mon Barbell Bench Press', 'Mon Chest-Supported Row', 'Mon Overhead Press', 'Tue Back Squat', 'Tue Romanian Deadlift', 'Fri Leg Press']);
    check('incomplete week: gaps name what was missed',
      [partial.gaps.notDone, partial.gaps.short],
      [['Tue Standing Calf Raise', 'Thu Incline Dumbbell Press', 'Thu Lat Pulldown', 'Thu Dumbbell Curl', 'Fri Seated Leg Curl', 'Fri Hip Thrust'],
       ['Fri Leg Press 2/3 sets']]);
    check('incomplete week: the status warns instead of refusing',
      [status().indexOf('Warning: 6 of 12 exercise(s) have no reps and will not be logged') > -1,
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
