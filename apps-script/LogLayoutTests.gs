/**
 * LogLayoutTests.gs — tests for Pass 10A (Primary / Secondary / Tertiary muscle columns in Log and Archive).
 * runLogLayoutTests() is called from runPureTests() in Tests.gs, so Workout > Run tests and run-node.js include it.
 * logLayoutSheetTests() runs against the live Sheet, called from runSheetTests() with its helpers.
 * Test fixtures use real exercise names on purpose; production code never names an exercise or muscle.
 * Expected numbers are counted by hand in the comments, not derived from the code under test.
 */

// Exercise Map rows: [exercise, primary, secondary, tertiary]
var LAYOUT_TEST_MAP = [
  ['Bench Press', 'Chest', 'Triceps, Front Delts', ''],
  ['Squat', 'Quads', 'Glutes', 'Hamstrings'],
  ['Bicep Curl', 'Biceps', '', '']
];

function runLogLayoutTests() {
  var results = [];
  var check = function (name, actual, expected) {
    var a = JSON.stringify(actual), x = JSON.stringify(expected);
    results.push({ name: name, pass: a === x, detail: a === x ? '' : 'expected ' + x + ' got ' + a });
  };
  var roles = buildMuscleRoles(LAYOUT_TEST_MAP).roles;
  var sessionRow = function (day, exercise, primary, sets, reps) {
    var r = [];
    for (var i = 0; i < SESSION_HEADERS.length; i++) r.push('');
    r[SESSION_COLS.WEEK - 1] = 1; r[SESSION_COLS.DAY - 1] = day; r[SESSION_COLS.EXERCISE - 1] = exercise;
    r[SESSION_COLS.MUSCLE - 1] = primary; r[SESSION_COLS.SETS - 1] = sets; r[SESSION_COLS.REC_WEIGHT - 1] = 50;
    reps.forEach(function (n, i) { r[SESSION_COLS.S1 - 1 + i] = n; });
    r[SESSION_COLS.PUMP - 1] = 'mid'; r[SESSION_COLS.TENDON - 1] = 'neutral'; r[SESSION_COLS.CONNECTION - 1] = 'good';   // rated = done = logged
    return r;
  };
  var byName = function (plan) {
    var out = {};
    plan.rows.forEach(function (r) { out[r.name] = r.values; });
    return out;
  };

  // Layout constants
  check('log headers: Date, then the three muscle columns where Muscle Group was',
    LOG_HEADERS.slice(0, 9), ['Date', 'Week', 'Day', 'Exercise', 'Primary Muscle', 'Secondary Muscles', 'Tertiary Muscles', 'Sets', 'Rec Weight']);
  check('log headers: two more than Date + Session columns', LOG_HEADERS.length, 1 + SESSION_HEADERS.length + 2);
  check('archive headers and columns stay in sync', [ARCHIVE_HEADERS.length, Object.keys(ARCHIVE_COLS).length], [21, 21]);
  check('archive: three muscle columns side by side',
    [ARCHIVE_HEADERS[ARCHIVE_COLS.MUSCLE - 1], ARCHIVE_HEADERS[ARCHIVE_COLS.SECONDARY - 1], ARCHIVE_HEADERS[ARCHIVE_COLS.TERTIARY - 1]], MUSCLE_HEADERS);
  check('archive: every column index is unique and inside the header list',
    Object.keys(ARCHIVE_COLS).map(function (k) { return ARCHIVE_COLS[k]; }).sort(function (a, b) { return a - b; }).join(','),
    ARCHIVE_HEADERS.map(function (h, i) { return i + 1; }).join(','));

  // Code row <-> sheet row
  var code = [];
  for (var i = 0; i < LOG_HEADERS.length; i++) code.push('c' + i);
  var sheetRow = logRowToSheet(code);
  check('sheet row: primary, secondary, tertiary at columns 5-7',
    sheetRow.slice(4, 7), [code[SESSION_COLS.MUSCLE], code[LOG_ROW.SECONDARY], code[LOG_ROW.TERTIARY]]);
  check('sheet row: Sets follows Tertiary, Flags is last',
    [sheetRow[7], sheetRow[sheetRow.length - 1], sheetRow.length], [code[SESSION_COLS.SETS], code[SESSION_COLS.FLAGS], LOG_HEADERS.length]);
  check('code row survives a round trip', logRowFromSheet(sheetRow), code);
  check('a code row without the two extra cells still writes (blank secondary / tertiary)',
    logRowToSheet(code.slice(0, 1 + SESSION_HEADERS.length)).slice(5, 7), ['', '']);

  // The Logger fills secondary / tertiary from the Exercise Map
  var logged = planLogRows([
    sessionRow('Mon', 'Bench Press', 'Chest', 4, [8, 8, 8, 8]),
    sessionRow('Tue', 'Squat', 'Quads', 3, [5, 5, 5]),
    sessionRow('Wed', 'Bicep Curl', 'Biceps', 3, [12, 12, 12]),
    sessionRow('Thu', 'Mystery Lift', '?? not in Exercise Map', 3, [10, 10, 10])
  ], {}, 'D', roles).rows;
  var muscles = function (r) { return [r[SESSION_COLS.MUSCLE], r[LOG_ROW.SECONDARY], r[LOG_ROW.TERTIARY]]; };
  check('log row: compound lift lists secondary muscles', muscles(logged[0]), ['Chest', 'Triceps, Front Delts', '']);
  check('log row: three-muscle lift lists all three', muscles(logged[1]), ['Quads', 'Glutes', 'Hamstrings']);
  check('log row: isolation lift has only a primary', muscles(logged[2]), ['Biceps', '', '']);
  check('log row: exercise not in the map has blank secondary / tertiary', [logged[3][LOG_ROW.SECONDARY], logged[3][LOG_ROW.TERTIARY]], ['', '']);
  check('log row: no roles given (old callers) still plans', planLogRows([sessionRow('Mon', 'Squat', 'Quads', 3, [5])], {}, 'D').rows[0][LOG_ROW.SECONDARY], '');

  // Archive rows carry the three columns
  var archived = archiveRows(logged, 'Meso 1', 0);
  check('archive: primary / secondary / tertiary copied from the Log row',
    archived.slice(0, 3).map(function (r) { return [r[ARCHIVE_COLS.MUSCLE - 1], r[ARCHIVE_COLS.SECONDARY - 1], r[ARCHIVE_COLS.TERTIARY - 1]]; }),
    [['Chest', 'Triceps, Front Delts', ''], ['Quads', 'Glutes', 'Hamstrings'], ['Biceps', '', '']]);
  check('archive: sets done after the muscle columns',
    archived.slice(0, 3).map(function (r) { return r[ARCHIVE_COLS.SETS_DONE - 1]; }), [4, 3, 3]);

  // Counting workflow, hand counted. Week 1: Bench Press 4 sets, Squat 3 sets, Bicep Curl 3 sets.
  var facts = historyFacts([], logged.slice(0, 3), 'Meso 1');
  var primaryOnly = { includeSecondary: false, includeTertiary: false };
  var fullCredit = { includeSecondary: true, includeTertiary: true, secondaryWeight: 1, tertiaryWeight: 1 };
  var partial = { includeSecondary: true, includeTertiary: true, secondaryWeight: 0.5, tertiaryWeight: 0.25 };
  // Primary only: Chest 4, Quads 3, Biceps 3, the rest 0; total 10
  var p0 = planMuscleSummary(facts, LAYOUT_TEST_MAP, primaryOnly);
  check('primary only: Chest 4, Quads 3, Biceps 3, supporting muscles 0',
    byName(p0), { Chest: [4], Triceps: [0], 'Front Delts': [0], Quads: [3], Glutes: [0], Hamstrings: [0], Biceps: [3] });
  check('primary only: total 10', p0.grid.slice(-1)[0], ['Total', 10]);
  // Full credit (every listed muscle = 1 set): bench 4 -> Chest, Triceps, Front Delts; squat 3 -> Quads, Glutes, Hamstrings; curl 3 -> Biceps
  var p1 = planMuscleSummary(facts, LAYOUT_TEST_MAP, fullCredit);
  check('full credit: bench is 4 sets for chest AND triceps AND front delts, squat 3 for all three',
    byName(p1), { Chest: [4], Triceps: [4], 'Front Delts': [4], Quads: [3], Glutes: [3], Hamstrings: [3], Biceps: [3] });
  check('full credit: curl counts biceps only; total 4+4+4+3+3+3+3 = 24', p1.grid.slice(-1)[0], ['Total', 24]);
  // Partial (secondary 0.5, tertiary 0.25): Triceps 4x0.5 = 2, Front Delts 2, Glutes 3x0.5 = 1.5, Hamstrings 3x0.25 = 0.75
  var p2 = planMuscleSummary(facts, LAYOUT_TEST_MAP, partial);
  check('partial: bench 1 / 0.5 / 0.5, squat 1 / 0.5 / 0.25, curl biceps only',
    byName(p2), { Chest: [4], Triceps: [2], 'Front Delts': [2], Quads: [3], Glutes: [1.5], Hamstrings: [0.75], Biceps: [3] });
  check('partial: total 4+2+2+3+1.5+0.75+3 = 16.25', p2.grid.slice(-1)[0], ['Total', 16.25]);
  // Exercise no longer in the map: the Secondary / Tertiary stored on its Log row still count
  var gone = planMuscleSummary(facts, [], partial);
  check('exercise removed from the map: muscles stored on the Log row keep counting',
    byName(gone), { Chest: [4], Triceps: [2], 'Front Delts': [2], Quads: [3], Glutes: [1.5], Hamstrings: [0.75], Biceps: [3] });

  // Migration of an old Log / Archive (single Muscle Group column)
  var oldHeader = ['Date', 'Week', 'Day', 'Exercise', 'Muscle Group', 'Sets'];
  check('migration: old single muscle column is detected', needsMuscleColumns(oldHeader, 5), true);
  check('migration: new layout is left alone (idempotent)',
    needsMuscleColumns(['Date', 'Week', 'Day', 'Exercise', 'Primary Muscle', 'Secondary Muscles', 'Tertiary Muscles'], 5), false);
  check('migration: a brand-new empty tab is left alone', needsMuscleColumns([], 5), false);
  check('migration: backfill from the map by exercise name',
    planMuscleBackfill(['bench  press', 'Squat', 'Bicep Curl', 'Gone Lift'], roles),
    [['Triceps, Front Delts', ''], ['Glutes', 'Hamstrings'], ['', ''], ['', '']]);
  return results;
}

/**
 * Live-Sheet tests: the 10A workflow end to end. Replaces Exercise Map with bench / squat / curl for the duration and restores it,
 * the summary options and the Summary tab afterwards (runSheetTests restores Log, Archive, Program, Session).
 */
function logLayoutSheetTests(ss, check, h) {
  var settings = ss.getSheetByName(TABS.SETTINGS);
  var mapSheet = ss.getSheetByName(TABS.MAP);
  var summary = ss.getSheetByName(TABS.SUMMARY);
  var logSheet = ss.getSheetByName(TABS.LOG);
  var cell = function (row) { return settings.getRange(row, 2); };
  var optionRows = [SETTINGS_ROWS.INCL_SECONDARY, SETTINGS_ROWS.INCL_TERTIARY, SETTINGS_ROWS.SECONDARY_WEIGHT, SETTINGS_ROWS.TERTIARY_WEIGHT];
  var optionBackup = optionRows.map(function (r) { return cell(r).getValue(); });
  var mapBackup = h.rowsOf(mapSheet, MAP_HEADERS.length);
  var wasPaused = SUMMARY_STATE.paused;
  var setOptions = function (secondary, tertiary, secondaryWeight, tertiaryWeight) {
    cell(SETTINGS_ROWS.INCL_SECONDARY).setValue(secondary);
    cell(SETTINGS_ROWS.INCL_TERTIARY).setValue(tertiary);
    cell(SETTINGS_ROWS.SECONDARY_WEIGHT).setValue(secondaryWeight);
    cell(SETTINGS_ROWS.TERTIARY_WEIGHT).setValue(tertiaryWeight);
    SUMMARY_STATE.paused = false;   // programmatic edits don't fire onEdit, so refresh by hand
    refreshSummarySafe(ss);
  };
  var pivot = function () {
    var rows = {};
    summary.getDataRange().getValues().forEach(function (r, i) { if (i >= 2 && r[0] !== '') rows[r[0]] = r.slice(1); });
    return rows;
  };
  try {
    SUMMARY_STATE.paused = false;
    cell(SETTINGS_ROWS.WEEK).setValue(1);
    cell(SETTINGS_ROWS.MESO_WEEKS).setValue(6);
    clearBody(logSheet, LOG_HEADERS.length);
    clearBody(ss.getSheetByName(TABS.ARCHIVE), ARCHIVE_HEADERS.length);
    clearBody(mapSheet, MAP_HEADERS.length);
    mapSheet.getRange(2, 1, LAYOUT_TEST_MAP.length, MAP_HEADERS.length).setValues(LAYOUT_TEST_MAP);

    // Week 1: Bench Press 4 sets (Mon), Squat 3 sets (Tue), Bicep Curl 3 sets (Wed)
    h.writeProgram([['Mon', 'Bench Press', 4, 60, 8, 12], ['Tue', 'Squat', 3, 80, 5, 8], ['Wed', 'Bicep Curl', 3, 15, 10, 15]]);
    h.buildAndRead();
    h.enter(2, { S1: 8, S2: 8, S3: 8, S4: 8 });
    h.enter(3, { S1: 5, S2: 5, S3: 5 });
    h.enter(4, { S1: 12, S2: 12, S3: 12 });
    withSummaryPaused(function () { completeSession({ interactive: false }); });

    // The sheet itself shows three muscle columns
    var sheetRows = h.rowsOf(logSheet, LOG_HEADERS.length);
    check('log sheet: 3 rows logged', sheetRows.length, 3);
    check('log sheet: Primary / Secondary / Tertiary columns hold the map roles',
      sheetRows.map(function (r) { return r.slice(3, 7); }),
      [['Bench Press', 'Chest', 'Triceps, Front Delts', ''], ['Squat', 'Quads', 'Glutes', 'Hamstrings'], ['Bicep Curl', 'Biceps', '', '']]);
    check('log sheet: Sets column follows the muscle columns', sheetRows.map(function (r) { return r[7]; }), [4, 3, 3]);
    var archived = archiveRows(readLogRows(logSheet), 'Layout Test', 0);
    check('log -> archive rows keep the three muscle columns',
      archived.map(function (r) { return [r[ARCHIVE_COLS.MUSCLE - 1], r[ARCHIVE_COLS.SECONDARY - 1], r[ARCHIVE_COLS.TERTIARY - 1]]; }),
      [['Chest', 'Triceps, Front Delts', ''], ['Quads', 'Glutes', 'Hamstrings'], ['Biceps', '', '']]);

    // Compounds and isolation, primary only: Chest 4, Quads 3, Biceps 3 = 10
    setOptions(false, false, SUMMARY.secondaryWeight, SUMMARY.tertiaryWeight);
    var p = pivot();
    check('counting, primary only: compounds and curl all count their primary muscle only',
      [p.Chest, p.Quads, p.Biceps, p.Triceps, p.Glutes, p['Front Delts'], p.Hamstrings, p[SUMMARY.totalLabel]], [[4], [3], [3], [0], [0], [0], [0], [10]]);

    // Full credit: every listed muscle gets the whole set. Bench 4 -> chest, triceps, front delts; squat 3 -> quads, glutes, hamstrings; curl 3 -> biceps. Total 24
    setOptions(true, true, 1, 1);
    p = pivot();
    check('counting, full credit: bench counts 4 sets for chest and triceps and front delts',
      [p.Chest, p.Triceps, p['Front Delts']], [[4], [4], [4]]);
    check('counting, full credit: squat counts 3 for quads, glutes, hamstrings; curl biceps only; total 24',
      [p.Quads, p.Glutes, p.Hamstrings, p.Biceps, p[SUMMARY.totalLabel]], [[3], [3], [3], [3], [24]]);

    // Partial credit: Triceps 4 x 0.5 = 2, Front Delts 2, Glutes 3 x 0.5 = 1.5, Hamstrings 3 x 0.25 = 0.75. Total 16.25
    setOptions(true, true, 0.5, 0.25);
    p = pivot();
    check('counting, partial: bench = chest 4, triceps 2, front delts 2',
      [p.Chest, p.Triceps, p['Front Delts']], [[4], [2], [2]]);
    check('counting, partial: squat = quads 3, glutes 1.5, hamstrings 0.75; curl biceps 3; total 16.25',
      [p.Quads, p.Glutes, p.Hamstrings, p.Biceps, p[SUMMARY.totalLabel]], [[3], [1.5], [0.75], [3], [16.25]]);
  } finally {
    clearBody(mapSheet, MAP_HEADERS.length);
    if (mapBackup.length) mapSheet.getRange(2, 1, mapBackup.length, MAP_HEADERS.length).setValues(mapBackup);
    optionRows.forEach(function (r, i) { cell(r).setValue(optionBackup[i]); });
    SUMMARY_STATE.paused = wasPaused;
  }
}
