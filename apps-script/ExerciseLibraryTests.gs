/**
 * ExerciseLibraryTests.gs — tests for the exercise library (ExerciseLibrary.gs) and the program templates (ProgramTemplates.gs).
 * runExerciseLibraryTests() is pure and is called from runPureTests() in Tests.gs.
 * exerciseLibrarySheetTests() runs against the sheet from runSheetTests() (SheetTests.gs, part 1) and restores what it touches.
 */

function runExerciseLibraryTests() {
  var results = [];
  var check = function (name, actual, expected) {
    var a = JSON.stringify(actual), x = JSON.stringify(expected);
    results.push({ name: name, pass: a === x, detail: a === x ? '' : 'expected ' + x + ' got ' + a });
  };
  var lib = exerciseLibrary();
  var allMuscles = LIBRARY_MUSCLES.upper.concat(LIBRARY_MUSCLES.lower, LIBRARY_MUSCLES.spine);
  var isMuscle = function (m) { return allMuscles.indexOf(m) > -1; };

  // The library itself
  check('library: 100 or more exercises', lib.length >= 100, true);
  var seen = {}, dupes = [];
  lib.forEach(function (r) { var k = normalizeName(r[0]); if (seen[k]) dupes.push(r[0]); seen[k] = true; });
  check('library: exercise names are unique (case and spacing ignored)', dupes, []);
  check('library: every row has a name and a primary muscle from the muscle list',
    lib.filter(function (r) { return !cleanName(r[0]) || !isMuscle(cleanName(r[1])); }).map(function (r) { return r[0]; }), []);
  check('library: secondary and tertiary muscles are on the muscle list',
    lib.filter(function (r) { return parseMuscleList(r[2]).concat(parseMuscleList(r[3])).some(function (m) { return !isMuscle(m); }); })
      .map(function (r) { return r[0]; }), []);
  check('library: a muscle is not its own helper and not listed twice in one row',
    lib.filter(function (r) {
      var all = [cleanName(r[1])].concat(parseMuscleList(r[2]), parseMuscleList(r[3]));
      return all.some(function (m, i) { return all.indexOf(m) !== i; });
    }).map(function (r) { return r[0]; }), []);
  check('library: at most one Secondary muscle per row (the rest are Tertiary)',
    lib.filter(function (r) { return parseMuscleList(r[2]).length > 1; }).map(function (r) { return r[0]; }), []);
  var counts = {};
  lib.forEach(function (r) { counts[r[1]] = (counts[r[1]] || 0) + 1; });
  check('library: every muscle group has at least 3 exercises', allMuscles.filter(function (m) { return !(counts[m] >= 3); }), []);
  var built = buildMuscleRoles(lib);
  check('library: Muscle Summary order = the muscle list, spine groups last', built.muscles, allMuscles);
  var banned = /push-?up|pull-?up|chin-?up|plank|ab wheel|rollout|bodyweight|burpee|mountain climber|jump|\bdip\b|sit-?up|hanging|inverted/i;
  check('library: no bodyweight-only movements (dips and sit-ups only as Machine / Weighted)',
    lib.filter(function (r) { return banned.test(r[0]) && !/\b(machine|weighted)\b/i.test(r[0]); }).map(function (r) { return r[0]; }), []);
  var roleOf = function (name) { return built.roles[normalizeName(name)]; };
  check('library: Bulgarian split squat exists as barbell, dumbbell and Smith machine',
    ['Barbell', 'Dumbbell', 'Smith Machine'].map(function (e) { return !!roleOf(e + ' Bulgarian Split Squat'); }), [true, true, true]);
  check('library: hinges credit Spinal Extension as a secondary',
    ['Romanian Deadlift', 'Barbell Good Morning', 'Conventional Deadlift', 'Stiff-Leg Deadlift'].map(function (n) {
      return roleOf(n).secondary.indexOf('Spinal Extension') > -1;
    }), [true, true, true, true]);
  check('library: pad-high hyperextension is Spinal Extension, pad-low (Glute Focus) is Glutes',
    [roleOf('45-Degree Hyperextension (Spine Focus)').primary, roleOf('45-Degree Hyperextension (Glute Focus)').primary,
      roleOf('GHD Back Extension (Pad High)').primary], ['Spinal Extension', 'Glutes', 'Spinal Extension']);
  check('library: rotation and side bend examples', [roleOf('Cable Trunk Rotation').primary, roleOf('GHD Side Bend').primary, roleOf('Farmer\'s Carry').primary],
    ['Spinal Rotation', 'Spinal Side Bend', 'Spinal Side Bend']);

  // Merging into an Exercise Map (invented names)
  var small = [['Zork Press', 'Chest', 'Triceps', ''], ['Wibble Row', 'Lats', '', '']];
  var fresh = planLibraryMerge([], small);
  check('merge: empty map -> the library, all added', [fresh.rows, fresh.added, fresh.updated, fresh.kept, fresh.changed],
    [[['Zork Press', 'Chest', 'Triceps', ''], ['Wibble Row', 'Lats', '', '']], 2, 0, 0, true]);
  var mine = [['wibble  row', 'Back', '', ''], ['My Lift', 'Biceps', '', ''], ['', '', '', ''], ['zork press', 'Chest', 'Triceps', '']];
  var merged = planLibraryMerge(mine, small);
  check('merge: library first in library order, your own rows after, library wins on a same-name row',
    merged.rows.map(function (r) { return r.slice(0, 2).join(':'); }), ['Zork Press:Chest', 'Wibble Row:Lats', 'My Lift:Biceps']);
  check('merge: counts', [merged.added, merged.updated, merged.kept, merged.changed], [0, 1, 1, true]);
  check('merge: running it again changes nothing', planLibraryMerge(merged.rows, small).changed, false);
  check('merge: a reordered map counts as a change', planLibraryMerge([small[1], small[0]], small).changed, true);
  check('merge: nothing of yours is dropped', planLibraryMerge(mine, small).rows.length, 3);

  // Primaries first in the Muscle Summary even when a helper muscle shows up earlier (hinge before calves, spine last)
  check('muscle order: a secondary-only muscle never jumps ahead of a later primary',
    buildMuscleRoles([['A', 'Hamstrings', 'Spinal Extension', ''], ['B', 'Calves', '', '']]).muscles, ['Hamstrings', 'Calves', 'Spinal Extension']);

  // Program templates
  var tpl = findProgramTemplate();
  check('template: first template is the Upper/Lower 4-day', [tpl.name, tpl.days.map(function (d) { return d.day; })], ['Upper/Lower 4-day', ['Mon', 'Tue', 'Thu', 'Fri']]);
  check('template: lookup ignores case and spacing, unknown name -> null',
    [findProgramTemplate(' upper/lower  4-DAY ') === tpl, findProgramTemplate('Nope')], [true, null]);
  var progRows = templateProgramRows(tpl);
  check('template: Program rows have six cells and a blank Start Weight',
    [progRows.every(function (r) { return r.length === PROGRAM_HEADERS.length && r[3] === ''; }), progRows[0]],
    [true, ['Mon', 'Barbell Bench Press', 4, '', 6, 10]]);
  check('template: every exercise is in the library', templateMissingExercises(tpl, lib.map(function (r) { return r[0]; })), []);
  check('template: an empty map is missing every distinct exercise', templateMissingExercises(tpl, []).length, 32);
  var dayKeys = {}, dupRows = [];
  progRows.forEach(function (r) { var k = overrideKey(r[0], r[1]); if (dayKeys[k]) dupRows.push(k); dayKeys[k] = true; });
  check('template: no exercise twice on a day', dupRows, []);
  check('template: sets 1-6 and a rep range of 5-20 with min below max',
    progRows.filter(function (r) { return !(r[2] >= 1 && r[2] <= 6 && r[4] >= 5 && r[5] <= 20 && r[4] < r[5]); }).map(function (r) { return r[1]; }), []);

  var primaryOf = function (name) { return roleOf(name).primary; };
  var upperSet = LIBRARY_MUSCLES.upper, lowerSet = LIBRARY_MUSCLES.lower.concat(LIBRARY_MUSCLES.spine);
  check('template: eight exercises a day, in pairs whose two muscles differ',
    tpl.days.map(function (d) {
      var ok = d.rows.length === 8;
      for (var i = 0; i + 1 < d.rows.length; i += 2) if (primaryOf(d.rows[i][0]) === primaryOf(d.rows[i + 1][0])) ok = false;
      return ok;
    }), [true, true, true, true]);
  check('template: upper days train only upper-body muscles, lower days only lower body, abs and spine',
    tpl.days.map(function (d) {
      var allowed = d.focus === 'upper' ? upperSet : lowerSet;
      return d.rows.every(function (r) { return allowed.indexOf(primaryOf(r[0])) > -1; });
    }), [true, true, true, true]);
  var weekly = {};
  progRows.forEach(function (r) { weekly[primaryOf(r[1])] = (weekly[primaryOf(r[1])] || 0) + r[2]; });
  var main = ['Chest', 'Lats', 'Upper Back', 'Side Delts', 'Rear Delts', 'Biceps', 'Triceps', 'Quads', 'Hamstrings', 'Glutes', 'Calves'];
  check('template: the main muscles get 6-16 direct sets a week',
    main.filter(function (m) { return !(weekly[m] >= 6 && weekly[m] <= 16); }).map(function (m) { return m + '=' + weekly[m]; }), []);
  return results;
}

/**
 * Sheet side: load the library into an empty map, load it again, merge with your own rows, load the program (which
 * builds Sessions), then log one exercise that has no Start Weight and roll the week. Backs up and restores everything.
 */
function exerciseLibrarySheetTests(ss, check, helpers) {
  var map = ss.getSheetByName(TABS.MAP), program = ss.getSheetByName(TABS.PROGRAM), session = ss.getSheetByName(TABS.SESSION);
  var settingsSheet = ss.getSheetByName(TABS.SETTINGS), logSheet = ss.getSheetByName(TABS.LOG);
  var lib = exerciseLibrary();
  var backup = captureTestBackup(ss);
  var statusOf = function () { return String(settingsSheet.getRange(SETTINGS_ROWS.STATUS, 2).getValue()); };
  try {
    clearBody(map, MAP_HEADERS.length);
    var first = loadExerciseLibrary({ interactive: false });
    var rows = helpers.rowsOf(map, MAP_HEADERS.length);
    check('library load: an empty Exercise Map gets the whole library in order',
      [first.ok, first.added, rows.length, rows[0][0], rows[rows.length - 1][0]], [true, lib.length, lib.length, lib[0][0], lib[lib.length - 1][0]]);
    var again = loadExerciseLibrary({ interactive: false });
    check('library load: a second load changes nothing and says so', [again.changed, statusOf().indexOf('already has') > -1], [false, true]);

    var edited = rows.map(function (r) { return r.slice(); });
    var pec = edited.map(function (r) { return r[0]; }).indexOf('Pec Deck Fly');
    edited[pec][1] = 'Back';
    edited.push(['My Cable Thing', 'Biceps', '', '']);
    clearBody(map, MAP_HEADERS.length);
    map.getRange(2, 1, edited.length, MAP_HEADERS.length).setValues(edited);
    var merged = loadExerciseLibrary({ interactive: false });
    var after = helpers.rowsOf(map, MAP_HEADERS.length);
    check('library load: a changed muscle is updated, your own row is kept after the library',
      [merged.updated, merged.kept, merged.added, after[pec][1], after[after.length - 1][0]], [1, 1, 0, 'Chest', 'My Cable Thing']);

    clearBody(map, MAP_HEADERS.length);
    clearBody(program, PROGRAM_HEADERS.length);
    clearBody(session, SESSION_HEADERS.length);
    settingsSheet.getRange(SETTINGS_ROWS.WEEK, 2).setValue(1);
    settingsSheet.getRange(SETTINGS_ROWS.MESO_WEEKS, 2).setValue(6);
    var loaded = loadProgramTemplate({ interactive: false });
    var prog = helpers.rowsOf(program, PROGRAM_HEADERS.length);
    var sess = helpers.rowsOf(session, SESSION_HEADERS.length);
    var col = function (c) { return sess.map(function (r) { return r[c - 1]; }); };
    check('program load: the library came along, Program holds 32 rows, Sessions are built for week 1',
      [loaded.ok, helpers.rowsOf(map, MAP_HEADERS.length).length, prog.length, sess.length, sess[0][SESSION_COLS.WEEK - 1]], [true, lib.length, 32, 32, 1]);
    check('program load: four days in order, pairs side by side, nothing unknown',
      [col(SESSION_COLS.DAY).filter(function (d, i, a) { return a.indexOf(d) === i; }), sess[0][SESSION_COLS.EXERCISE - 1], sess[1][SESSION_COLS.EXERCISE - 1],
        sess[0][SESSION_COLS.MUSCLE - 1], col(SESSION_COLS.MUSCLE).indexOf(UNKNOWN_MUSCLE)],
      [['Mon', 'Tue', 'Thu', 'Fri'], 'Barbell Bench Press', 'Chest-Supported T-Bar Row', 'Chest', -1]);
    check('program load: Start Weight is blank and Status says so',
      [sess[0][SESSION_COLS.REC_WEIGHT - 1], statusOf().indexOf('Start Weight is blank') > -1], ['', true]);

    helpers.enter(2, { S1: 10, S2: 9, S3: 8, S4: 8, ACTUAL_WEIGHT: 135 });   // bench: no Start Weight, so the weight typed is what counts
    var rolled = completeWeek({ interactive: false });
    var week2 = helpers.rowsOf(session, SESSION_HEADERS.length);
    check('blank-weight week: Complete Week logs the typed weight and rolls to week 2 keeping it',
      [rolled.ok, settingsSheet.getRange(SETTINGS_ROWS.WEEK, 2).getValue(), helpers.rowsOf(logSheet, LOG_HEADERS.length).length, week2[0][SESSION_COLS.REC_WEIGHT - 1]],
      [true, 2, 1, 135]);
  } finally {
    restoreTestBackup(ss, backup);
  }
}
