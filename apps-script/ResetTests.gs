/**
 * ResetTests.gs — tests for the Start Here guide (Guide.gs) and Reset for a new user (Reset.gs).
 * runResetTests() is pure and is called from runPureTests() in Tests.gs.
 * resetSheetTests() runs against the sheet from runSheetTests() (SheetTests.gs, part 1) and restores what it touches.
 */

function runResetTests() {
  var results = [];
  var check = function (name, actual, expected) {
    var a = JSON.stringify(actual), x = JSON.stringify(expected);
    results.push({ name: name, pass: a === x, detail: a === x ? '' : 'expected ' + x + ' got ' + a });
  };
  var lines = guideLines();
  var text = lines.map(function (l) { return l[0]; }).join('\n');
  check('guide: starts with a title and every line has a known style',
    [lines[0], lines.every(function (l) { return cleanName(l[0]) && ['title', 'h', 'p'].indexOf(l[1]) > -1; })], [['Start here', 'title'], true]);
  check('guide: a heading comes before the first paragraph block and the guide is one page of lines', [lines[1][1], lines.length >= 15 && lines.length <= 30], ['p', true]);
  check('guide: names the actions as the Settings dropdown spells them',
    [SETTINGS_ACTIONS.WEEK, SETTINGS_ACTIONS.BUILD, SETTINGS_ACTIONS.CLEAR, SETTINGS_ACTIONS.DELOAD, SETTINGS_ACTIONS.SUMMARY, SETTINGS_ACTIONS.NEW_MESO]
      .filter(function (a) { return text.indexOf(a) === -1; }), []);
  check('guide: names the two counting settings and the first program',
    [SETTINGS_LABELS.INCL_SECONDARY, SETTINGS_LABELS.INCL_TERTIARY, SETTINGS_LABELS.SECONDARY_WEIGHT, SETTINGS_LABELS.TERTIARY_WEIGHT, SETTINGS_LABELS.WEEK, 'Set up workbook', 'Load program: ' + PROGRAM_TEMPLATES[0].name]
      .filter(function (s) { return text.indexOf(s) === -1; }), []);
  check('guide: mentions every tab a new user touches', [TABS.SESSION, TABS.PROGRAM, TABS.MAP, TABS.SETTINGS].filter(function (t) { return text.indexOf(t) === -1; }), []);

  // Muscle spelling (ExerciseMapGuard.gs)
  check('levenshtein: kitten -> sitting is 3, equal strings 0', [levenshtein('kitten', 'sitting'), levenshtein('abc', 'abc'), levenshtein('', 'ab')], [3, 0, 2]);
  var base = [['A', 'Triceps'], ['B', 'Triceps'], ['C', 'Triceps'], ['D', 'Chest', 'Tricep', '']];
  check('typos: a rarely used name a letter from a common one is flagged', muscleTypos(base), [{ name: 'Tricep', near: 'Triceps' }]);
  check('typos: adding an unrelated new group (Neck) does not add a flag', muscleTypos(base.concat([['E', 'Neck']])).length, 1);
  check('typos: nothing flagged when the rare name is spelled like nothing else',
    muscleTypos([['A', 'Triceps'], ['B', 'Triceps'], ['C', 'Triceps'], ['D', 'Neck']]), []);
  check('typos: singular of a common group is flagged, case ignored',
    muscleTypos([['A', 'Quads'], ['B', 'quads'], ['C', 'Quads'], ['D', 'QUAD']]), [{ name: 'QUAD', near: 'Quads' }]);
  check('typos: two common names close together (Biceps / Triceps) are both left alone',
    muscleTypos([['A', 'Biceps'], ['B', 'Biceps'], ['C', 'Biceps'], ['D', 'Triceps'], ['E', 'Triceps'], ['F', 'Triceps']]), []);
  check('typos: a muscle in secondary and tertiary of one exercise counts once',
    muscleTypos([['A', 'Triceps'], ['B', 'Triceps'], ['C', 'Triceps'], ['D', 'Chest', 'Tricep', 'Tricep']]).length, 1);
  check('typos: rows without an exercise are ignored', muscleTypos([['', 'Tricep'], ['A', 'Triceps'], ['B', 'Triceps'], ['C', 'Triceps']]), []);
  check('typos: the whole library is clean', muscleTypos(exerciseLibrary()), []);
  check('typos: the Status line names the typo and what it looks like',
    [muscleTypoWarning(muscleTypos(base)), muscleTypoWarning([])],
    ['Check muscle spelling in Exercise Map: "Tricep" looks like "Triceps". Fix it, or ignore this if it is a new muscle group.', '']);
  return results;
}

/**
 * Seeds a used workbook (a logged row, an archived row, week 4, a custom map row, a ticked Preference), runs Reset for a new user
 * and checks what is gone and what stayed. Backs up and restores everything.
 */
function resetSheetTests(ss, check, helpers) {
  var map = ss.getSheetByName(TABS.MAP), program = ss.getSheetByName(TABS.PROGRAM), session = ss.getSheetByName(TABS.SESSION);
  var logSheet = ss.getSheetByName(TABS.LOG), archive = ss.getSheetByName(TABS.ARCHIVE), settings = ss.getSheetByName(TABS.SETTINGS);
  var lib = exerciseLibrary();
  var backup = captureTestBackup(ss);
  var setting = function (key) { return settings.getRange(SETTINGS_ROWS[key], 2); };
  try {
    var logRow = new Array(LOG_HEADERS.length).fill('');
    logRow[3] = 'Barbell Bench Press';
    logSheet.getRange(2, 1, 1, LOG_HEADERS.length).setValues([logRow]);
    var archiveRow = new Array(ARCHIVE_HEADERS.length).fill('');
    archiveRow[0] = 'Old meso';
    archive.getRange(2, 1, 1, ARCHIVE_HEADERS.length).setValues([archiveRow]);
    map.getRange(lib.length + 2, 1, 1, MAP_HEADERS.length).setValues([['My Cable Thing', 'Biceps', '', '']]);
    setting('WEEK').setValue(4);
    setting('MESO_NAME').setValue('Old name');
    setting('INCL_SECONDARY').setValue(true);

    var done = resetForNewUser({ interactive: false, keepTestBackup: true });
    var mapRows = helpers.rowsOf(map, MAP_HEADERS.length);
    check('reset: Log, Archive and Sessions are rebuilt clean',
      [done.ok, helpers.rowsOf(logSheet, LOG_HEADERS.length).length, helpers.rowsOf(archive, ARCHIVE_HEADERS.length).length,
        helpers.rowsOf(session, SESSION_HEADERS.length).length], [true, 0, 0, 32]);
    check('reset: Exercise Map is the library again (your own row gone), Program is the template',
      [mapRows.length, mapRows.some(function (r) { return r[0] === 'My Cable Thing'; }), helpers.rowsOf(program, PROGRAM_HEADERS.length).length], [lib.length, false, 32]);
    check('reset: week 1 and a fresh mesocycle name, Preferences stay',
      [setting('WEEK').getValue(), setting('MESO_NAME').getValue(), setting('INCL_SECONDARY').getValue()], [1, 'Meso 1', true]);
    check('reset: Status says it is ready, the guide is back and the muscle list follows the map',
      [String(setting('STATUS').getValue()).indexOf('Ready for a new user') === 0, ss.getSheetByName(TABS.GUIDE).getRange(1, 1).getValue(),
        map.getRange(2, MAP_MUSCLE_LIST.col).getValue()], [true, 'Start here', 'Chest']);
  } finally {
    restoreTestBackup(ss, backup);
  }
}
