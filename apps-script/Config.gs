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
  ACTUAL_WEIGHT: 16, PUMP: 17, TENDON: 18, CONNECTION: 19, NOTES: 20
};
var SESSION_HEADERS = [
  'Week', 'Day', 'Exercise', 'Muscle Group', 'Sets', 'Rec Weight', 'Rep Range',
  'Rep Target', 'Target RIR', 'Soreness', 'S1', 'S2', 'S3', 'S4', 'S5',
  'Actual Weight', 'Pump', 'Tendon', 'Connection', 'Notes'
];
// Cells the user fills while training; a rebuild asks before wiping these.
var SESSION_ENTRY_COLS = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
// Script-managed (warning-protected) columns.
var SESSION_PROTECTED_COLS = [1, 2, 3, 4, 5, 7, 9];

var LOG_HEADERS = ['Date'].concat(SESSION_HEADERS);

// Settings tab: label in column A, value in column B.
var SETTINGS_ROWS = {
  WEEK: 2, MESO_WEEKS: 3, RIR_LADDER: 4, REP_MIN: 5, REP_MAX: 6, BUILD_BOX: 7, STATUS: 8
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
