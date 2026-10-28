/**
 * Config.gs — constants only. No exercise or muscle-group names live in code;
 * those come from the "Exercise Map" tab.
 */

var TABS = {
  SETTINGS: 'Settings',
  PROGRAM: 'Program',
  MAP: 'Exercise Map',
  SESSION: 'Session',
  LOG: 'Log',
  SUMMARY: 'Muscle Summary'
};

var PROGRAM_HEADERS = ['Day', 'Exercise', 'Sets', 'Start Weight', 'Rep Min', 'Rep Max'];
var MAP_HEADERS = ['Exercise', 'Muscle Group'];

// 1-based column index of each Session column. Header order is derived from this.
var SESSION_COLS = {
  WEEK: 1, DAY: 2, EXERCISE: 3, MUSCLE: 4, SETS: 5, REC_WEIGHT: 6, REP_RANGE: 7,
  REP_TARGET: 8, RIR: 9, SORENESS: 10, S1: 11, S2: 12, S3: 13, S4: 14, S5: 15,
  ACTUAL_RIR: 16, ACTUAL_WEIGHT: 17, PUMP: 18, TENDON: 19, CONNECTION: 20, NOTES: 21, FLAGS: 22
};
var SESSION_HEADERS = [
  'Week', 'Day', 'Exercise', 'Muscle Group', 'Sets', 'Rec Weight', 'Rep Range',
  'Rep Target', 'Target RIR', 'Soreness', 'S1', 'S2', 'S3', 'S4', 'S5',
  'Actual RIR', 'Actual Weight', 'Pump', 'Tendon', 'Connection', 'Notes', 'Flags'
];
// Cells the user fills while training; a rebuild asks before wiping these.
var SESSION_ENTRY_COLS = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21];
// Rep cells; an exercise counts as completed once any of these has a number.
var SESSION_REP_COLS = [11, 12, 13, 14, 15];
// Script-managed (warning-protected) columns.
var SESSION_PROTECTED_COLS = [1, 2, 3, 4, 5, 7, 9, 22];

var LOG_HEADERS = ['Date'].concat(SESSION_HEADERS);

// Settings tab: label in column A, value in column B.
var SETTINGS_ROWS = {
  WEEK: 2, MESO_WEEKS: 3, RIR_LADDER: 4, REP_MIN: 5, REP_MAX: 6, BUILD_BOX: 7, STATUS: 8, CLEAR_BOX: 9, COMPLETE_BOX: 10,
  WEEK_BOX: 11
};

// Rollover rules (Rollover.gs). "Reps" for an exercise = average over the sets entered, rounded.
var PROGRESSION = {
  increasePct: 0.05,   // weight bump when it is time to go up
  weightStep: 2.5,     // bumps round to the nearest step (lb)
  minBump: 2.5,        // never bump by less than this, even if 5% rounds to zero
  repCeiling: 13,      // next-week rep target stops here (or Rep Max if higher)
  increaseAtReps: 15   // reps at or above this -> raise weight instead of chasing reps
};

// Feedback rules (Feedback.gs). Rating strings must match OPTIONS below (compared case-insensitively).
// A blank rating counts as the neutral one: mid pump, neutral tendon, no connection flag, no soreness.
var FEEDBACK = {
  pumpRepBump: { great: 1, mid: 1, none: 2 },  // next-week rep target = reps performed + this
  tendonBad: 'bad',                            // -> maintenance: hold weight, drop sets, no rep push
  maintenanceSetDrop: 1,
  connectionMiss: 'not at all',                // 1 week -> technique check, swapAfterWeeks in a row -> swap
  swapAfterWeeks: 2,
  stillSore: 'still sore',                     // Session target RIR gets this much easier
  sorenessRirStep: 1,
  underRecoveredWeeks: 2,                      // still sore this many weeks in a row -> trim-a-set flag
  flags: {
    maintain: 'Maintenance (tendon): weight held, one set fewer, no rep push',
    technique: 'Technique check: no muscle connection last week',
    swap: 'Swap suggested: no muscle connection 2 weeks in a row',
    recovery: 'Under-recovered: still sore 2 weeks in a row, consider trimming a set'
  }
};

var DEFAULTS = {
  week: 1,
  mesoWeeks: 6,
  rirLadder: [3, 2, 1, 0],
  repMin: 8,
  repMax: 12,
  sets: 3
};

var OPTIONS = {
  soreness: ['none', 'mild', 'still sore'],
  pump: ['great', 'mid', 'none'],
  tendon: ['bad', 'neutral', 'good'],
  connection: ['great', 'good', 'not at all']
};

var UNKNOWN_MUSCLE = '?? not in Exercise Map';

// Starter rows written to a brand-new Exercise Map tab only. Edit the tab, not this.
var SEED_EXERCISE_MAP = [
  ['Barbell Bench Press', 'Chest'],
  ['Incline Dumbbell Press', 'Chest'],
  ['Lat Pulldown', 'Back'],
  ['Seated Cable Row', 'Back'],
  ['Barbell Squat', 'Quads'],
  ['Romanian Deadlift', 'Hamstrings'],
  ['Overhead Press', 'Shoulders'],
  ['Lateral Raise', 'Shoulders'],
  ['Dumbbell Curl', 'Biceps'],
  ['Triceps Pushdown', 'Triceps'],
  ['Standing Calf Raise', 'Calves']
];
