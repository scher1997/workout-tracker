/**
 * MuscleSummaryTests.gs — tests for Pass 7 (Muscle Summary + Trends).
 * runMuscleSummaryTests() is called from runPureTests() in Tests.gs, so Workout > Run tests and run-node.js include it.
 * muscleSummarySheetTests() runs against the live Sheet, called from runSheetTests() with its helpers.
 * Expected numbers are counted by hand in the comments, not derived from the code under test.
 */

function runMuscleSummaryTests() {
  var results = [];
  var check = function (name, actual, expected) {
    var a = JSON.stringify(actual), x = JSON.stringify(expected);
    results.push({ name: name, pass: a === x, detail: a === x ? '' : 'expected ' + x + ' got ' + a });
  };
  var logRow = function (week, day, exercise, weight, reps, fb) {
    var r = [];
    for (var i = 0; i < LOG_HEADERS.length; i++) r.push('');
    r[0] = 'D'; r[SESSION_COLS.WEEK] = week; r[SESSION_COLS.DAY] = day; r[SESSION_COLS.EXERCISE] = exercise;
    r[SESSION_COLS.ACTUAL_WEIGHT] = weight;
    reps.forEach(function (n, i) { r[SESSION_COLS.S1 + i] = n; });
    Object.keys(fb || {}).forEach(function (k) { r[SESSION_COLS[k]] = fb[k]; });
    return r;
  };
  var facts = function (rows, label) { return historyFacts([], rows, label || 'Meso 1'); };
  var byName = function (plan) {
    var out = {};
    plan.rows.forEach(function (r) { out[r.name] = r.values; });
    return out;
  };
  var none = { includeSecondary: false, includeTertiary: false };
  var sec = { includeSecondary: true, includeTertiary: false, secondaryWeight: 0.5, tertiaryWeight: 0.25 };
  var ter = { includeSecondary: false, includeTertiary: true, secondaryWeight: 0.5, tertiaryWeight: 0.25 };
  var both = { includeSecondary: true, includeTertiary: true, secondaryWeight: 0.5, tertiaryWeight: 0.25 };

  var map = [
    ['Zork Curl', 'Zorceps', 'Forezorks', ''],
    ['Wibble Press', 'Wibbles', 'Zorceps', 'Shoulderz'],
    ['Plonk Row', 'Plonks', 'Zorceps, Wibbles', ''],
    ['', 'Orphan', '', ''],            // no exercise: ignored
    ['No Muscle', '', 'Zorceps', '']   // no primary: ignored
  ];

  // Parsing the map
  check('muscle list splits commas / semicolons, trims, drops blanks', parseMuscleList(' Triceps ,Front  delts;; lats , '), ['Triceps', 'Front delts', 'lats']);
  var built = buildMuscleRoles(map);
  check('muscle groups = union of all three columns, in map order',
    built.muscles, ['Zorceps', 'Forezorks', 'Wibbles', 'Shoulderz', 'Plonks']);
  check('rows without exercise or primary are ignored', Object.keys(built.roles), ['zork curl', 'wibble press', 'plonk row']);
  check('roles parsed', built.roles['plonk row'], { primary: 'Plonks', secondary: ['Zorceps', 'Wibbles'], tertiary: [] });

  // Sample week, counted by hand: Zork Curl Mon 3 sets + Wed 2 sets, Wibble Press Tue 4 sets, Plonk Row Thu 2 sets
  var week1 = [
    logRow(1, 'Mon', 'Zork Curl', 20, [10, 9, 8], { MUSCLE: 'Zorceps' }),
    logRow(1, 'Tue', 'Wibble Press', 50, [12, 11, 10, 9], { MUSCLE: 'Wibbles' }),
    logRow(1, 'Wed', 'Zork Curl', 15, [10, 10], { MUSCLE: 'Zorceps' }),
    logRow(1, 'Thu', 'Plonk Row', 40, [8, 8], { MUSCLE: 'Plonks' })
  ];
  var f1 = facts(week1);
  var p0 = planMuscleSummary(f1, map, none);
  check('hand count, primary only: Zorceps 3+2, Wibbles 4, Plonks 2, others 0',
    byName(p0), { Zorceps: [5], Forezorks: [0], Wibbles: [4], Shoulderz: [0], Plonks: [2] });
  check('total row = 11 sets', p0.grid[p0.grid.length - 1], ['Total', 11]);
  check('header row and mesocycle row', [p0.grid[0], p0.grid[1]], [['Muscle Group', 1], ['Mesocycle', 'Meso 1']]);
  check('grid is rectangular', p0.grid.every(function (r) { return r.length === 2; }), true);

  // Secondary / tertiary: curl 5 sets, press 4 sets, row 2 sets
  check('secondary on (x0.5): Zorceps 5+2+1, Forezorks 2.5, Wibbles 4+1',
    byName(planMuscleSummary(f1, map, sec)), { Zorceps: [8], Forezorks: [2.5], Wibbles: [5], Shoulderz: [0], Plonks: [2] });
  check('secondary total 17.5', planMuscleSummary(f1, map, sec).grid.slice(-1)[0], ['Total', 17.5]);
  check('tertiary only (x0.25): Shoulderz 4 x 0.25 = 1, secondary ignored',
    byName(planMuscleSummary(f1, map, ter)), { Zorceps: [5], Forezorks: [0], Wibbles: [4], Shoulderz: [1], Plonks: [2] });
  check('both on: total 18.5', planMuscleSummary(f1, map, both).grid.slice(-1)[0], ['Total', 18.5]);
  check('weights are editable: secondary x1',
    byName(planMuscleSummary(f1, map, { includeSecondary: true, secondaryWeight: 1 })).Forezorks, [5]);
  check('weight 0 switches a role off', byName(planMuscleSummary(f1, map, { includeSecondary: true, secondaryWeight: 0 })).Forezorks, [0]);
  check('default weights apply when none given',
    byName(planMuscleSummary(f1, map, { includeSecondary: true })).Forezorks, [2.5]);

  // One muscle in several roles of the same exercise counts once, at the highest role switched on
  var dupMap = [['Dupe Lift', 'Zorceps', 'zorceps, Forezorks', 'Forezorks']];
  var dupFacts = facts([logRow(1, 'Mon', 'Dupe Lift', 10, [8, 8], { MUSCLE: 'Zorceps' })]);
  check('role overlap: primary once, secondary beats tertiary',
    byName(planMuscleSummary(dupFacts, dupMap, both)), { Zorceps: [2], Forezorks: [1] });
  check('role overlap: secondary off lets the tertiary credit through',
    byName(planMuscleSummary(dupFacts, dupMap, ter)), { Zorceps: [2], Forezorks: [0.5] });

  // Names are matched case / space-insensitively
  check('map match ignores case and spacing',
    byName(planMuscleSummary(facts([logRow(1, 'Mon', 'zork   CURL', 20, [10, 10, 10], {})]), [[' Zork Curl ', 'Zorceps', '', '']], none)), { Zorceps: [3] });

  // A new exercise in the lookup table: no code change, earlier unmapped rows follow the map
  var mystery = facts([logRow(1, 'Mon', 'Zork Curl', 20, [10, 10, 10], { MUSCLE: 'Zorceps' }),
    logRow(1, 'Tue', 'Mystery Lift', 30, [10, 10, 10], { MUSCLE: UNKNOWN_MUSCLE })]);
  var before = planMuscleSummary(mystery, map, none);
  check('unmapped exercise gets its own last row so totals reconcile',
    [before.muscles.slice(-1)[0], byName(before)[UNKNOWN_MUSCLE], before.grid.slice(-1)[0]], [UNKNOWN_MUSCLE, [3], ['Total', 6]]);
  var after = planMuscleSummary(mystery, map.concat([['Mystery Lift', 'Zorceps', '', '']]), none);
  check('add Mystery Lift to the map: its 3 sets move to Zorceps, unknown row gone',
    [byName(after).Zorceps, byName(after)[UNKNOWN_MUSCLE], after.grid.slice(-1)[0]], [[6], undefined, ['Total', 6]]);
  var removed = planMuscleSummary(facts([logRow(1, 'Mon', 'Gone Lift', 20, [10, 10], { MUSCLE: 'Oldmuscle' })]), map, none);
  check('exercise no longer in the map keeps the muscle stored on its Log row', byName(removed).Oldmuscle, [2]);

  // A new muscle group (Adductors): appears from the map alone, then counts
  var addMap = map.concat([['Squeeze Machine', 'Adductors', '', '']]);
  check('new muscle group shows with zeros before anything is logged',
    byName(planMuscleSummary(f1, addMap, none)).Adductors, [0]);
  check('new muscle group counts once logged',
    byName(planMuscleSummary(f1.concat(facts([logRow(1, 'Fri', 'Squeeze Machine', 40, [12, 12, 12], { MUSCLE: 'Adductors' })])), addMap, none)).Adductors, [3]);
  check('adductors as a secondary-only muscle still gets a row',
    planMuscleSummary([], [['Hip Thing', 'Glutes', 'Adductors', '']], none).muscles, ['Glutes', 'Adductors']);

  // Weeks: Archive history + current Log, deload header, gaps, duplicate label
  var prev = [logRow(1, 'Mon', 'Zork Curl', 20, [10, 10, 10], { MUSCLE: 'Zorceps' }),
    logRow(2, 'Mon', 'Zork Curl', 20, [10, 10], { MUSCLE: 'Zorceps', FLAGS: DELOAD.flags.deload })];
  var archBody = archiveRows(prev, 'Meso 1', 0);
  var current = [logRow(1, 'Mon', 'Zork Curl', 22.5, [10, 10, 10, 10], { MUSCLE: 'Zorceps' })];
  var merged = planMuscleSummary(historyFacts(archBody, current, 'Meso 2'), map, none);
  check('Archive + Log: weeks continue (1, 2, then 3)', [merged.grid[0], byName(merged).Zorceps], [['Muscle Group', 1, 2, 3], [3, 2, 4]]);
  check('mesocycle row labels each week, deload marked', merged.grid[1], ['Mesocycle', 'Meso 1', 'Meso 1 · Deload', 'Meso 2']);
  check('Log already archived under this label is not counted twice',
    byName(planMuscleSummary(historyFacts(archBody, prev, 'Meso 1'), map, none)).Zorceps, [3, 2]);
  var gap = planMuscleSummary(facts([logRow(1, 'Mon', 'Zork Curl', 20, [10], {}), logRow(3, 'Mon', 'Zork Curl', 20, [10, 10], {})]), map, none);
  check('a skipped week is a column of zeros', [gap.weeks, byName(gap).Zorceps], [[1, 2, 3], [1, 0, 2]]);
  var empty = planMuscleSummary([], map, none);
  check('no history: muscles listed, no week columns',
    [empty.weeks, empty.grid[0], empty.muscles.length, empty.grid.slice(-1)[0]], [[], ['Muscle Group'], 5, ['Total']]);
  check('volume measure: weight x reps (20 x 27 + 15 x 20 = 840)', byName(planMuscleSummary(f1, map, none, 'volume')).Zorceps, [840]);
  check('caption names what is counted',
    [countingCaption(none).indexOf('primary.') > -1, countingCaption(both).indexOf('secondary x0.5 + tertiary x0.25') > -1], [true, true]);

  // Trends: dropdown items and series
  check('item list: muscles then exercises',
    trendItems(['Chest'], ['Bench']), ['Muscle: Chest', 'Exercise: Bench']);
  check('item text parses back', [parseTrendItem(' Muscle:  Chest '), parseTrendItem('Exercise: Bench'), parseTrendItem('Bench')],
    [{ kind: 'muscle', name: 'Chest' }, { kind: 'exercise', name: 'Bench' }, null]);
  check('exercise names: map order, then history-only', exerciseNames(facts([logRow(1, 'Mon', 'Gone Lift', 1, [1], {})]), map),
    ['Zork Curl', 'Wibble Press', 'Plonk Row', 'Gone Lift']);
  var hist = historyFacts(archBody, current, 'Meso 2');
  var s1 = trendSeries(hist, map, none, 'Muscle: Zorceps', 'Sets');
  check('muscle series: sets per overall week', [s1.labels, s1.values, s1.metric, s1.note], [['W1', 'W2', 'W3'], [3, 2, 4], 'Sets', '']);
  check('muscle series: volume (600, 400, 900)', trendSeries(hist, map, none, 'Muscle: Zorceps', 'Volume').values, [600, 400, 900]);
  var fall = trendSeries(hist, map, none, 'Muscle: Zorceps', 'Top weight');
  check('muscle + weight metric falls back to Sets with a note', [fall.metric, fall.values, fall.note.indexOf('showing Sets') > -1], ['Sets', [3, 2, 4], true]);
  check('exercise series: top weight', trendSeries(hist, map, none, 'Exercise: Zork Curl', 'Top weight').values, [20, 20, 22.5]);
  check('exercise series: avg reps', trendSeries(hist, map, none, 'Exercise: Zork Curl', 'Avg reps').values, [10, 10, 10]);
  check('exercise series: sets and volume', [trendSeries(hist, map, none, 'Exercise: zork curl', 'Sets').values,
    trendSeries(hist, map, none, 'Exercise: Zork Curl', 'Volume').values], [[3, 2, 4], [600, 400, 900]]);
  var sparse = facts([logRow(1, 'Mon', 'Zork Curl', 20, [10], {}), logRow(3, 'Mon', 'Plonk Row', 40, [8], {})]);
  check('exercise series: week without it = 0 sets, blank weight and reps',
    [trendSeries(sparse, map, none, 'Exercise: Zork Curl', 'Sets').values, trendSeries(sparse, map, none, 'Exercise: Zork Curl', 'Top weight').values,
      trendSeries(sparse, map, none, 'Exercise: Zork Curl', 'Avg reps').values], [[1, 0, 0], [20, '', ''], [10, '', '']]);
  check('same exercise on two days: sets add, top weight is the max, reps weighted by sets',
    [trendSeries(facts([logRow(1, 'Mon', 'Zork Curl', 20, [10, 10, 10], {}), logRow(1, 'Wed', 'Zork Curl', 25, [6], {})]), map, none, 'Exercise: Zork Curl', 'Sets').values,
      trendSeries(facts([logRow(1, 'Mon', 'Zork Curl', 20, [10, 10, 10], {}), logRow(1, 'Wed', 'Zork Curl', 25, [6], {})]), map, none, 'Exercise: Zork Curl', 'Top weight').values,
      trendSeries(facts([logRow(1, 'Mon', 'Zork Curl', 20, [10, 10, 10], {}), logRow(1, 'Wed', 'Zork Curl', 25, [6], {})]), map, none, 'Exercise: Zork Curl', 'Avg reps').values],
    [[4], [25], [9]]);
  check('muscle series follows the secondary toggle', trendSeries(f1, map, sec, 'Muscle: Forezorks', 'Sets').values, [2.5]);
  check('unknown item -> null', trendSeries(f1, map, none, 'Nonsense', 'Sets'), null);
  check('empty history: no weeks', trendSeries([], map, none, 'Muscle: Zorceps', 'Sets').labels, []);

  // Constants stay in sync
  check('map headers: primary, secondary, tertiary', MAP_HEADERS.slice(1), ['Muscle Group', 'Secondary Muscles', 'Tertiary Muscles']);
  check('settings rows are unique',
    Object.keys(SETTINGS_ROWS).map(function (k) { return SETTINGS_ROWS[k]; }).filter(function (v, i, a) { return a.indexOf(v) !== i; }), []);
  return results;
}

/**
 * Live-Sheet tests. Replaces Exercise Map with invented rows for the duration and restores it,
 * the summary options and the Trends dropdowns afterwards (runSheetTests restores Log, Archive, Program, Session).
 */
function muscleSummarySheetTests(ss, check, h) {
  var settings = ss.getSheetByName(TABS.SETTINGS);
  var mapSheet = ss.getSheetByName(TABS.MAP);
  var summary = ss.getSheetByName(TABS.SUMMARY);
  var trends = ss.getSheetByName(TABS.TRENDS);
  var cell = function (row) { return settings.getRange(row, 2); };
  var optionRows = [SETTINGS_ROWS.INCL_SECONDARY, SETTINGS_ROWS.INCL_TERTIARY, SETTINGS_ROWS.SECONDARY_WEIGHT, SETTINGS_ROWS.TERTIARY_WEIGHT];
  var optionBackup = optionRows.map(function (r) { return cell(r).getValue(); });
  var mapBackup = h.rowsOf(mapSheet, MAP_HEADERS.length);
  var trendBackup = [trends.getRange(1, 2).getValue(), trends.getRange(2, 2).getValue()];
  var wasPaused = SUMMARY_STATE.paused;
  var L = TRENDS_LAYOUT;
  var setMap = function (rows) {
    clearBody(mapSheet, MAP_HEADERS.length);
    mapSheet.getRange(2, 1, rows.length, MAP_HEADERS.length).setValues(rows);
  };
  var pivot = function () {
    var vals = summary.getDataRange().getValues(), rows = {};
    vals.forEach(function (r, i) { if (i >= 2 && r[0] !== '') rows[r[0]] = r.slice(1); });
    return { header: vals[0], meso: vals[1], rows: rows };
  };
  var refresh = function () { SUMMARY_STATE.paused = false; return refreshSummarySafe(ss); };   // programmatic edits don't fire onEdit
  try {
    SUMMARY_STATE.paused = false;   // this section tests the hooks
    cell(SETTINGS_ROWS.WEEK).setValue(1);
    cell(SETTINGS_ROWS.MESO_WEEKS).setValue(6);
    cell(SETTINGS_ROWS.INCL_SECONDARY).setValue(false);
    cell(SETTINGS_ROWS.INCL_TERTIARY).setValue(false);
    cell(SETTINGS_ROWS.SECONDARY_WEIGHT).setValue(SUMMARY.secondaryWeight);
    cell(SETTINGS_ROWS.TERTIARY_WEIGHT).setValue(SUMMARY.tertiaryWeight);
    clearBody(ss.getSheetByName(TABS.LOG), LOG_HEADERS.length);
    clearBody(ss.getSheetByName(TABS.ARCHIVE), ARCHIVE_HEADERS.length);
    setMap([['ZZ Curl', 'Zz Biceps', 'Zz Forearms', ''], ['ZZ Press', 'Zz Chest', 'Zz Triceps', 'Zz Shoulders'], ['ZZ Row', 'Zz Back', 'Zz Biceps', '']]);

    // Hand count: ZZ Curl Mon 3 sets + Wed 2 sets, ZZ Press Tue 4 sets
    h.writeProgram([['Mon', 'ZZ Curl', 3, 20, 8, 12], ['Tue', 'ZZ Press', 4, 50, 8, 12], ['Wed', 'ZZ Curl', 2, 15, 8, 12]]);
    h.buildAndRead();
    h.enter(2, { S1: 10, S2: 9, S3: 8 });
    h.enter(3, { S1: 12, S2: 11, S3: 10, S4: 9 });
    h.enter(4, { S1: 10, S2: 10 });
    completeSession({ interactive: false });   // refreshes the summary through its hook
    var p = pivot();
    check('summary: A1 and week header', [p.header[0], p.header[1]], ['Muscle Group', 1]);
    check('summary: hand count Biceps 3+2, Chest 4, Back 0, Total 9',
      [p.rows['Zz Biceps'], p.rows['Zz Chest'], p.rows['Zz Back'], p.rows[SUMMARY.totalLabel]], [[5], [4], [0], [9]]);
    check('summary: secondary/tertiary muscles listed at zero while the options are off',
      [p.rows['Zz Forearms'], p.rows['Zz Triceps'], p.rows['Zz Shoulders']], [[0], [0], [0]]);

    // Include secondary / tertiary (Settings checkboxes), then the credit weight
    cell(SETTINGS_ROWS.INCL_SECONDARY).setValue(true);
    refresh();
    p = pivot();
    check('summary: secondary on, Forearms 2.5, Triceps 2, Total 13.5', [p.rows['Zz Forearms'], p.rows['Zz Triceps'], p.rows[SUMMARY.totalLabel]], [[2.5], [2], [13.5]]);
    cell(SETTINGS_ROWS.INCL_TERTIARY).setValue(true);
    refresh();
    p = pivot();
    check('summary: tertiary on, Shoulders 1, Total 14.5', [p.rows['Zz Shoulders'], p.rows[SUMMARY.totalLabel]], [[1], [14.5]]);
    cell(SETTINGS_ROWS.SECONDARY_WEIGHT).setValue(1);
    refresh();
    p = pivot();
    check('summary: secondary credit 1 -> Forearms 5', p.rows['Zz Forearms'], [5]);
    cell(SETTINGS_ROWS.SECONDARY_WEIGHT).setValue(SUMMARY.secondaryWeight);
    cell(SETTINGS_ROWS.INCL_SECONDARY).setValue(false);
    cell(SETTINGS_ROWS.INCL_TERTIARY).setValue(false);

    // New muscle group (Adductors) and a new exercise, with no code change
    setMap([['ZZ Curl', 'Zz Biceps', 'Zz Forearms', ''], ['ZZ Press', 'Zz Chest', 'Zz Triceps', 'Zz Shoulders'],
      ['ZZ Row', 'Zz Back', 'Zz Biceps', ''], ['ZZ Adductor', 'Adductors', '', '']]);
    refresh();
    check('summary: Adductors appears from the map alone, at zero', pivot().rows.Adductors, [0]);
    h.writeProgram([['Mon', 'ZZ Curl', 3, 20, 8, 12], ['Tue', 'ZZ Press', 4, 50, 8, 12], ['Wed', 'ZZ Curl', 2, 15, 8, 12],
      ['Thu', 'ZZ Adductor', 3, 30, 8, 12], ['Fri', 'ZZ Later', 2, 10, 8, 12]]);
    var rolled = h.completeWeek({ interactive: false });
    check('summary: week 2 built for the new exercises', rolled.ok, true);
    h.enter(5, { S1: 12, S2: 12, S3: 11 });   // ZZ Adductor, 3 sets
    h.enter(6, { S1: 10, S2: 10 });           // ZZ Later (not in the map yet), 2 sets
    completeSession({ interactive: false });
    p = pivot();
    check('summary: week 2 column added, Adductors 3', [p.header.slice(0, 3), p.rows.Adductors], [['Muscle Group', 1, 2], [0, 3]]);
    check('summary: unmapped exercise lands in the unknown row', p.rows[UNKNOWN_MUSCLE], [0, 2]);
    setMap([['ZZ Curl', 'Zz Biceps', 'Zz Forearms', ''], ['ZZ Press', 'Zz Chest', 'Zz Triceps', 'Zz Shoulders'],
      ['ZZ Row', 'Zz Back', 'Zz Biceps', ''], ['ZZ Adductor', 'Adductors', '', ''], ['ZZ Later', 'Zz Glutes', '', '']]);
    refresh();
    p = pivot();
    check('summary: adding ZZ Later to the map moves its sets to Zz Glutes, unknown row gone',
      [p.rows['Zz Glutes'], p.rows[UNKNOWN_MUSCLE]], [[0, 2], undefined]);
    check('summary: Total row week 1 and 2 (9, 5)', p.rows[SUMMARY.totalLabel], [9, 5]);

    // Trends: dropdown list, data block, chart
    var setTrend = function (item, metric) {
      trends.getRange(1, L.VALUE_COL).setValue(item);
      trends.getRange(2, L.VALUE_COL).setValue(metric);
      onTrendsEdit(trends.getRange(1, L.VALUE_COL));
    };
    var block = function () { return trends.getRange(1, L.DATA_COL, 3, 2).getValues(); };
    var items = trends.getRange(2, L.ITEMS_COL, trends.getLastRow(), 1).getValues().map(function (r) { return r[0]; });
    check('trends: dropdown lists new muscle and exercise', [items.indexOf('Muscle: Adductors') > -1, items.indexOf('Exercise: ZZ Adductor') > -1], [true, true]);
    setTrend('Muscle: Zz Biceps', 'Sets');
    check('trends: muscle sets block', block(), [['Week', 'Sets'], ['W1', 5], ['W2', 0]]);
    check('trends: one chart on the tab', trends.getCharts().length, 1);
    setTrend('Exercise: ZZ Curl', 'Top weight');
    check('trends: exercise top weight (20 lb, then none logged)', block(), [['Week', 'Top weight'], ['W1', 20], ['W2', '']]);
    check('trends: still one chart after a redraw', trends.getCharts().length, 1);
    setTrend('Muscle: Zz Biceps', 'Top weight');
    check('trends: muscle + weight falls back to Sets with a note',
      [block()[0][1], String(trends.getRange(L.NOTE_ROW, L.VALUE_COL).getValue()).indexOf('showing Sets') > -1], ['Sets', true]);
  } finally {
    setMap(mapBackup.length ? mapBackup : [['', '', '', '']]);
    optionRows.forEach(function (r, i) { cell(r).setValue(optionBackup[i]); });
    trends.getRange(1, L.VALUE_COL).setValue(trendBackup[0]);
    trends.getRange(2, L.VALUE_COL).setValue(trendBackup[1]);
    SUMMARY_STATE.paused = wasPaused;
  }
}
