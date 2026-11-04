/**
 * ProgramTemplates.gs — ready-made programs that Workout > Load program writes into the Program tab.
 * Each day lists its exercises in superset pairs (rows 1+2, 3+4, ...): antagonists where one exists (chest/back,
 * biceps/triceps, quads/hamstrings, hip abduction/adduction, spinal extension/flexion), otherwise muscles that don't compete.
 * Rows are [Exercise, Sets, Rep Min, Rep Max]. Start Weight is left blank: type the weight you use in Actual Weight in week 1.
 * Every exercise name must exist in the exercise library (a test checks it). focus = 'upper' or 'lower' (a test checks the muscles).
 * Add another program by adding an entry to PROGRAM_TEMPLATES.
 */
var PROGRAM_TEMPLATES = [
  {
    name: 'Upper/Lower 4-day',
    days: [
      { day: 'Mon', focus: 'upper', rows: [   // Upper A
        ['Barbell Bench Press', 4, 6, 10], ['Chest-Supported T-Bar Row', 3, 8, 12],
        ['Low Incline Dumbbell Press', 3, 8, 12], ['Wide-Grip Lat Pulldown', 3, 8, 12],
        ['Overhead Cable Triceps Extension', 3, 10, 15], ['Incline Dumbbell Curl', 3, 10, 15],
        ['Cable Lateral Raise', 3, 12, 20], ['Reverse Pec Deck', 3, 12, 20]
      ] },
      { day: 'Tue', focus: 'lower', rows: [   // Lower A, quad bias
        ['Back Squat', 4, 5, 8], ['Lying Leg Curl', 3, 8, 12],
        ['Romanian Deadlift', 3, 8, 10], ['Leg Extension', 3, 10, 15],
        ['Standing Calf Raise', 4, 10, 15], ['Cable Trunk Rotation', 3, 10, 15],
        ['45-Degree Hyperextension (Spine Focus)', 3, 10, 15], ['Cable Crunch', 3, 10, 15]
      ] },
      { day: 'Thu', focus: 'upper', rows: [   // Upper B
        ['Seated Dumbbell Shoulder Press', 3, 8, 12], ['Neutral-Grip Lat Pulldown', 3, 8, 12],
        ['Machine Chest Press', 3, 8, 12], ['Cable Seated Row', 3, 8, 12],
        ['Triceps Rope Pushdown', 3, 10, 15], ['EZ-Bar Preacher Curl', 3, 10, 15],
        ['Rope Face Pull', 3, 12, 20], ['Machine Lateral Raise', 3, 12, 20]
      ] },
      { day: 'Fri', focus: 'lower', rows: [   // Lower B, hip and hamstring bias
        ['Leg Press', 3, 10, 15], ['Seated Leg Curl', 3, 10, 15],
        ['Barbell Hip Thrust', 3, 8, 12], ['Dumbbell Bulgarian Split Squat', 3, 8, 12],
        ['Hip Abduction Machine', 3, 12, 20], ['Hip Adduction Machine', 3, 12, 20],
        ['Seated Calf Raise', 3, 10, 15], ['GHD Side Bend', 3, 10, 15]
      ] }
    ]
  }
];

/** A template by name (case/space-insensitive); no name -> the first one. null when not found. */
function findProgramTemplate(name) {
  if (!name) return PROGRAM_TEMPLATES[0] || null;
  var key = normalizeName(name);
  for (var i = 0; i < PROGRAM_TEMPLATES.length; i++) if (normalizeName(PROGRAM_TEMPLATES[i].name) === key) return PROGRAM_TEMPLATES[i];
  return null;
}

/** Program rows (PROGRAM_HEADERS order: Day, Exercise, Sets, Start Weight, Rep Min, Rep Max) for a template. Start Weight blank. */
function templateProgramRows(template) {
  var out = [];
  template.days.forEach(function (d) {
    d.rows.forEach(function (r) { out.push([d.day, r[0], r[1], '', r[2], r[3]]); });
  });
  return out;
}

/** Exercises of a template that are not in the given Exercise Map names (any case/spacing). */
function templateMissingExercises(template, mapNames) {
  var have = {};
  mapNames.forEach(function (n) { have[normalizeName(n)] = true; });
  var missing = [];
  templateProgramRows(template).forEach(function (r) {
    if (!have[normalizeName(r[1])] && missing.indexOf(r[1]) === -1) missing.push(r[1]);
  });
  return missing;
}

// ---- Sheet side -------------------------------------------------------------------------------------------------

/**
 * Replace the Program tab with a template, then build Sessions for the current week.
 * Exercises the template needs that Exercise Map lacks are added by loading the library first.
 * opts.name (default: the first template), opts.interactive (default true) asks before replacing a Program that has rows.
 */
function loadProgramTemplate(opts) {
  var interactive = !opts || opts.interactive !== false;
  var ss = SpreadsheetApp.getActive();
  var program = ss.getSheetByName(TABS.PROGRAM), map = ss.getSheetByName(TABS.MAP);
  if (!program || !map || !ss.getSheetByName(TABS.SESSION)) {
    setStatus(ss, 'Run Setup first (Workout menu > Set up workbook).');
    return { ok: false };
  }
  var template = findProgramTemplate(opts && opts.name);
  if (!template) {
    setStatus(ss, 'No program called "' + (opts && opts.name) + '".');
    return { ok: false };
  }
  if (interactive && program.getLastRow() > 1) {
    var ui = SpreadsheetApp.getUi();
    var ask = 'This REPLACES the Program tab with "' + template.name + '" and rebuilds Sessions for the current week.\n\nContinue?';
    if (ui.alert('Load program?', ask, ui.ButtonSet.YES_NO) !== ui.Button.YES) return { ok: false, cancelled: true };
  }
  var mapNames = readMapBody(map).map(function (r) { return r[0]; });
  if (templateMissingExercises(template, mapNames).length) loadExerciseLibrary({ interactive: false });

  var rows = templateProgramRows(template);
  if (program.getLastRow() > 1) program.getRange(2, 1, program.getLastRow() - 1, PROGRAM_HEADERS.length).clearContent();
  program.getRange(2, 1, rows.length, PROGRAM_HEADERS.length).setValues(rows);
  buildSession({ interactive: interactive });

  var built = String(ss.getSheetByName(TABS.SETTINGS).getRange(SETTINGS_ROWS.STATUS, 2).getValue());
  var done = 'Program "' + template.name + '" loaded (' + rows.length + ' exercises over ' + template.days.length + ' days). '
    + built + ' Start Weight is blank: enter the weight you use in Actual Weight.';
  setStatus(ss, done);
  ss.toast('Program "' + template.name + '" loaded', 'Workout Tracker', 6);
  return { ok: true, rows: rows.length };
}

function loadProgramUpperLower() { return loadProgramTemplate({ name: 'Upper/Lower 4-day' }); }
