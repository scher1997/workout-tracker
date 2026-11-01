/**
 * SampleWeek.gs — a ready-made upper/lower week to look at on a COPY of the workbook (Workout menu > Load sample week).
 * Replaces Exercise Map, Program, Sessions and Log with a 4-day split (3 exercises a day) and fills Sessions with
 * one week of sets, reps and feedback, left unlogged: look it over, then pick Complete Week to log it.
 * The same data drives the sheet tests (WeekFlowTests.gs), so what you see is what is tested.
 */

// [Exercise, Primary muscle, Secondary, Tertiary]
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
// The same week with gaps (null = untouched): Mon complete, Tue two of three, Thu skipped, Fri one exercise two sets short, rest untouched.
var UPPER_LOWER_PARTIAL = [
  { reps: [8, 8, 8, 8], rir: 2, pump: 'mid', tendon: 'neutral', connection: 'good' },
  { reps: [12, 12, 12], rir: 2, pump: 'mid', tendon: 'neutral', connection: 'good' },
  { reps: [10, 10, 10], rir: 2, pump: 'great', tendon: 'neutral', connection: 'good' },
  { reps: [6, 6, 6, 6], rir: 2, pump: 'mid', tendon: 'neutral', connection: 'good' },
  { reps: [10, 10, 10], rir: 2, pump: 'mid', tendon: 'good', connection: 'good' }, null,
  null, null, null,
  { reps: [15, 15], rir: 2, pump: 'great', tendon: 'neutral', connection: 'good' }, null, null
];

/** Session cell values for one week spec, keyed like SESSION_COLS. Sets not in spec.reps were not done, so they are cleared. */
function weekSpecToEntry(spec) {
  var entry = { ACTUAL_RIR: spec.rir, PUMP: spec.pump, TENDON: spec.tendon, CONNECTION: spec.connection, SORENESS: spec.soreness };
  for (var i = 0; i < SESSION_REP_COLS.length; i++) entry['S' + (i + 1)] = i < spec.reps.length ? spec.reps[i] : '';
  if (spec.weight !== undefined) entry.ACTUAL_WEIGHT = spec.weight;
  if (spec.notes) entry.NOTES = spec.notes;
  return entry;
}

/**
 * Load the sample split and fill Sessions. opts.kind: 'full' (default) or 'partial'; opts.interactive (default true) asks first.
 * Overwrites Exercise Map, Program, Sessions and Log and sets week 1: use a copy. Nothing is logged here.
 */
function loadSampleWeek(opts) {
  var ss = SpreadsheetApp.getActive();
  var kind = opts && opts.kind === 'partial' ? 'partial' : 'full';
  var interactive = !opts || opts.interactive !== false;
  var map = ss.getSheetByName(TABS.MAP), program = ss.getSheetByName(TABS.PROGRAM);
  var session = ss.getSheetByName(TABS.SESSION), log = ss.getSheetByName(TABS.LOG);
  if (!map || !program || !session || !log) {
    setStatus(ss, 'Run Setup first (Workout menu > Set up workbook).');
    return { ok: false };
  }
  if (interactive) {
    var ui = SpreadsheetApp.getUi();
    var ask = 'This REPLACES Exercise Map, Program, Sessions and Log with a sample upper/lower week and sets Current week to 1.\n\n'
      + 'Only do this on a copy of the workbook. Continue?';
    if (ui.alert('Load sample week?', ask, ui.ButtonSet.YES_NO) !== ui.Button.YES) return { ok: false, cancelled: true };
  }
  var clearBodyOf = function (sh, width) { if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, width).clearContent(); };
  clearBodyOf(map, MAP_HEADERS.length);
  map.getRange(2, 1, UPPER_LOWER_MAP.length, MAP_HEADERS.length).setValues(UPPER_LOWER_MAP);
  clearBodyOf(program, PROGRAM_HEADERS.length);
  program.getRange(2, 1, UPPER_LOWER_PROGRAM.length, PROGRAM_HEADERS.length).setValues(UPPER_LOWER_PROGRAM);
  clearBodyOf(log, LOG_HEADERS.length);
  clearBodyOf(session, SESSION_HEADERS.length);
  ss.getSheetByName(TABS.SETTINGS).getRange(SETTINGS_ROWS.WEEK, 2).setValue(1);
  buildSession({ interactive: false });

  var specs = kind === 'partial' ? UPPER_LOWER_PARTIAL : UPPER_LOWER_WEEK;
  var filled = 0;
  specs.forEach(function (spec, i) {
    if (!spec) return;
    var entry = weekSpecToEntry(spec);
    Object.keys(entry).forEach(function (k) { if (entry[k] !== undefined) session.getRange(i + 2, SESSION_COLS[k]).setValue(entry[k]); });
    filled++;
  });
  refreshSummarySafe(ss);   // the Exercise Map changed
  var done = 'Sample week loaded (' + (kind === 'partial' ? 'incomplete' : 'full') + '): ' + specs.length + ' exercises over 4 days, '
    + filled + ' filled in, nothing logged yet. Look over Sessions, then pick Complete Week to log it.';
  setStatus(ss, done);
  ss.toast(done, 'Workout Tracker', 8);
  return { ok: true, kind: kind, filled: filled };
}

function loadSampleWeekFull() { return loadSampleWeek({ kind: 'full' }); }
function loadSampleWeekIncomplete() { return loadSampleWeek({ kind: 'partial' }); }
