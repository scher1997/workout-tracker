/**
 * Config.gs — constants only. No exercise or muscle-group names live in code;
 * those come from the "Exercise Map" tab.
 */

var TABS = {
  SETTINGS: 'Settings',
  PROGRAM: 'Program',
  MAP: 'Exercise Map',
  SESSION: 'Sessions',
  LOG: 'Log',
  ARCHIVE: 'Archive',
  SUMMARY: 'Muscle Summary',
  TRENDS: 'Trends'
};

var PROGRAM_HEADERS = ['Day', 'Exercise', 'Sets', 'Start Weight', 'Rep Min', 'Rep Max'];
// Muscle Group = primary muscle. Secondary/Tertiary are optional comma lists (counted when Settings says so).
var MAP_HEADERS = ['Exercise', 'Muscle Group', 'Secondary Muscles', 'Tertiary Muscles'];

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

// Archive tab (Archive.gs): chart-ready long format, one row per exercise per day per week, across mesocycles.
var ARCHIVE_COLS = {
  MESO: 1, MESO_WEEK: 2, OVERALL_WEEK: 3, DATE: 4, WEEK_TYPE: 5, DAY: 6, EXERCISE: 7, MUSCLE: 8,
  SETS_DONE: 9, WEIGHT: 10, AVG_REPS: 11, VOLUME: 12, TARGET_RIR: 13, ACTUAL_RIR: 14,
  SORENESS: 15, PUMP: 16, TENDON: 17, CONNECTION: 18, FLAGS: 19
};
var ARCHIVE_HEADERS = [
  'Mesocycle', 'Meso Week', 'Overall Week', 'Date', 'Week Type', 'Day', 'Exercise', 'Muscle Group',
  'Sets Done', 'Weight', 'Avg Reps', 'Volume', 'Target RIR', 'Actual RIR',
  'Soreness', 'Pump', 'Tendon', 'Connection', 'Flags'
];
var ARCHIVE_WEEK_TYPES = { working: 'Working', deload: 'Deload' };

// Settings tab (SettingsLayout.gs): label in column A, value in column B, three sections.
// To move a setting, change its row here; the code only ever uses these names.
var SETTINGS_ROWS = {
  // Actions: where you are, what happened, and one dropdown that runs an action
  WEEK: 2, STATUS: 3, ACTION: 4,
  // Program setup: set once per mesocycle
  MESO_NAME: 7, MESO_WEEKS: 8, RIR_LADDER: 9, REP_MIN: 10, REP_MAX: 11,
  // Preferences: persistent options
  DELOAD_AT_END: 14, INCL_SECONDARY: 15, INCL_TERTIARY: 16, SECONDARY_WEIGHT: 17, TERTIARY_WEIGHT: 18
};
// Section title rows (first row) and the last row of each table.
var SETTINGS_SECTIONS = [
  { row: 1, last: 4, title: 'ACTIONS', hint: 'Pick an action to run it' },
  { row: 6, last: 11, title: 'PROGRAM SETUP', hint: 'Set once per mesocycle' },
  { row: 13, last: 18, title: 'PREFERENCES', hint: 'Change any time' }
];
var SETTINGS_LABELS = {
  WEEK: 'Current week', STATUS: 'Status', ACTION: 'Action',
  MESO_NAME: 'Mesocycle name', MESO_WEEKS: 'Mesocycle length (weeks)', RIR_LADDER: 'Target RIR by week',
  REP_MIN: 'Default rep min', REP_MAX: 'Default rep max',
  DELOAD_AT_END: 'Deload after last week', INCL_SECONDARY: 'Count secondary muscles',
  INCL_TERTIARY: 'Count tertiary muscles', SECONDARY_WEIGHT: 'Secondary credit per set', TERTIARY_WEIGHT: 'Tertiary credit per set'
};
// Entries of the Settings > Action dropdown. The cell goes back to NONE as soon as an action starts.
var SETTINGS_ACTIONS = {
  NONE: 'Choose action', BUILD: 'Build Session', WEEK: 'Complete Week', CLEAR: 'Clear Session',
  DELOAD: 'Deload this week', SUMMARY: 'Refresh Muscle Summary', NEW_MESO: 'Start New Mesocycle'
};
// Row of each persistent value in older layouts; setup moves them to SETTINGS_ROWS once.
// Pre-Pass-8: one list with header "Setting". Pass 8: three tables with a checkbox per action.
var LEGACY_SETTINGS_ROWS = {
  WEEK: 2, MESO_WEEKS: 3, RIR_LADDER: 4, REP_MIN: 5, REP_MAX: 6, DELOAD_AT_END: 12, MESO_NAME: 14,
  INCL_SECONDARY: 16, INCL_TERTIARY: 17, SECONDARY_WEIGHT: 18, TERTIARY_WEIGHT: 19
};
var PASS8_SETTINGS_ROWS = {
  WEEK: 2, MESO_NAME: 13, MESO_WEEKS: 14, RIR_LADDER: 15, REP_MIN: 16, REP_MAX: 17,
  DELOAD_AT_END: 20, INCL_SECONDARY: 21, INCL_TERTIARY: 22, SECONDARY_WEIGHT: 23, TERTIARY_WEIGHT: 24
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

// Deload rules (Deload.gs). A deload week = half the Program sets, weight held, easy effort.
// Recommended when enough exercises stall; also appended after the last mesocycle week (Settings toggle).
var DELOAD = {
  stallWeeks: 3,       // an exercise is stalled after this many logged weeks with no weight or rep gain
  stallShare: 0.5,     // deload recommended when this share of logged exercises is stalled...
  minStalled: 2,       // ...and at least this many
  rir: 4,              // Target RIR for a deload week
  deloadPrefix: 'Deload',
  stalledPrefix: 'Stalled',
  flags: {
    deload: 'Deload week: half sets, weight held, easy effort'
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

// Muscle Summary + Trends (MuscleSummary.gs, Trends.gs). Sets = sets actually done (S1-S5 reps entered).
var SUMMARY = {
  secondaryWeight: 0.5,    // default share of a set credited to a secondary muscle (Settings > Preferences overrides)
  tertiaryWeight: 0.25,    // same for tertiary
  headerLabel: 'Muscle Group',
  mesoRowLabel: 'Mesocycle',
  totalLabel: 'Total',
  deloadSuffix: ' · Deload',
  weekPrefix: 'W',                              // chart axis label: W1, W2, ...
  musclePrefix: 'Muscle: ',                     // Trends item dropdown entries
  exercisePrefix: 'Exercise: ',
  metrics: ['Sets', 'Volume', 'Top weight', 'Avg reps'],
  muscleMetrics: ['Sets', 'Volume']             // weight and reps only make sense per exercise
};

// Trends tab cells (1-based). Chart data and the item list sit to the right of the chart.
var TRENDS_LAYOUT = {
  ITEM_ROW: 1, METRIC_ROW: 2, NOTE_ROW: 3, VALUE_COL: 2, CHART_ROW: 5,
  DATA_COL: 10, ITEMS_COL: 13
};

// Starter Program written by Set up workbook only when Program has no exercises: the Exercise Map rows, in map order,
// split evenly across these days. Start Weight and rep range stay blank (Settings defaults apply). Edit the Program tab, not this.
var SEED_PROGRAM = { days: ['Mon', 'Wed', 'Fri'], sets: 3 };

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
