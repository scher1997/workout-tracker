/**
 * ArchiveTests.gs — tests for Pass 6 (Archive tab and Start New Mesocycle).
 * runArchiveTests() is called from runPureTests() in Tests.gs, so Workout > Run tests and run-node.js include it.
 * archiveSheetTests() runs against the live Sheet, called from runSheetTests() with its helpers.
 */

function runArchiveTests() {
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
  var ac = function (row, c) { return row[ARCHIVE_COLS[c] - 1]; };
  var col = function (rows, c) { return rows.map(function (r) { return ac(r, c); }); };
  var DL = DELOAD.flags.deload;

  // Names
  check('nextMesoName: increments a trailing number, else appends 2, blank -> Meso 2',
    ['Meso 1', 'Meso 9', 'Block9', 'Oct Hypertrophy', '', '  Meso   3 '].map(nextMesoName),
    ['Meso 2', 'Meso 10', 'Block10', 'Oct Hypertrophy 2', 'Meso 2', 'Meso 4']);

  // Header / column constants stay in sync
  check('archive header count matches cols', ARCHIVE_HEADERS.length, Object.keys(ARCHIVE_COLS).length);
  check('archive col index matches header', [ARCHIVE_HEADERS[ARCHIVE_COLS.VOLUME - 1], ARCHIVE_HEADERS[ARCHIVE_COLS.FLAGS - 1]], ['Volume', 'Flags']);

  // Transform of one Log row
  var fb = { MUSCLE: 'Zorceps', SORENESS: 'mild', PUMP: 'great', TENDON: 'neutral', CONNECTION: 'good', RIR: 3, ACTUAL_RIR: 2, FLAGS: 'Stalled 3 weeks: x' };
  var one = archiveRows([logRow(1, ' Mon ', 'Zork Curl', 20, [10, 9, 8], fb)], 'Meso 1', 0)[0];
  check('archive row: where/what', [ac(one, 'MESO'), ac(one, 'MESO_WEEK'), ac(one, 'OVERALL_WEEK'), ac(one, 'WEEK_TYPE'), ac(one, 'DAY'), ac(one, 'EXERCISE'), ac(one, 'MUSCLE')],
    ['Meso 1', 1, 1, 'Working', 'Mon', 'Zork Curl', 'Zorceps']);
  check('archive row: sets done, weight, avg reps, volume', [ac(one, 'SETS_DONE'), ac(one, 'WEIGHT'), ac(one, 'AVG_REPS'), ac(one, 'VOLUME')], [3, 20, 9, 540]);
  check('archive row: RIR and feedback', [ac(one, 'TARGET_RIR'), ac(one, 'ACTUAL_RIR'), ac(one, 'SORENESS'), ac(one, 'PUMP'), ac(one, 'TENDON'), ac(one, 'CONNECTION'), ac(one, 'FLAGS')],
    [3, 2, 'mild', 'great', 'neutral', 'good', 'Stalled 3 weeks: x']);
  check('archive row: width matches headers', one.length, ARCHIVE_HEADERS.length);
  var odd = archiveRows([logRow(1, 'Mon', 'Zork Curl', 22.5, [11, 10], {})], 'M', 0)[0];
  check('archive row: avg reps to 1 decimal, volume = weight x total reps', [ac(odd, 'AVG_REPS'), ac(odd, 'VOLUME'), ac(odd, 'SETS_DONE')], [10.5, 472.5, 2]);
  var blank = archiveRows([logRow(1, 'Mon', 'Zork Curl', '', [], {})], 'M', 0)[0];
  check('archive row: no weight or reps -> blanks, 0 sets',
    [ac(blank, 'WEIGHT'), ac(blank, 'AVG_REPS'), ac(blank, 'VOLUME'), ac(blank, 'SETS_DONE'), ac(blank, 'ACTUAL_RIR')], ['', '', '', 0, '']);

  // Overall Week, week type, dates, order, duplicates
  var weeks = [logRow(2, 'Mon', 'Zork Curl', 20, [10, 10, 10], { FLAGS: DL }), logRow(1, 'Mon', 'Zork Curl', 20, [10, 10, 10], {})];
  var sorted = archiveRows(weeks, 'M', 12);
  check('archive: week order, overall week continues from the offset', [col(sorted, 'MESO_WEEK'), col(sorted, 'OVERALL_WEEK')], [[1, 2], [13, 14]]);
  check('archive: deload week typed Deload', col(sorted, 'WEEK_TYPE'), ['Working', 'Deload']);
  var d1 = new Date(2026, 0, 5), d2 = new Date(2026, 0, 7);
  var a = logRow(1, 'Mon', 'Zork Curl', 20, [10], {}), b = logRow(1, 'Tue', 'Wibble Press', 40, [10], {});
  a[0] = d2; b[0] = d1;
  check('archive: every row of a week carries that week\'s earliest date', col(archiveRows([a, b], 'M', 0), 'DATE'), [d1, d1]);
  var dup = archiveRows([logRow(1, 'Mon', 'Zork Curl', 20, [8], {}), logRow(1, 'Mon', 'Zork Curl', 25, [9], {})], 'M', 0);
  check('archive: re-logged exercise keeps the latest row', [dup.length, col(dup, 'WEIGHT')], [1, [25]]);
  check('archive: same exercise on two days stays two rows',
    archiveRows([logRow(1, 'Mon', 'Zork Curl', 20, [8], {}), logRow(1, 'Wed', 'Zork Curl', 20, [8], {})], 'M', 0).length, 2);
  check('archive: rows without an exercise or week are skipped',
    archiveRows([logRow(1, 'Mon', '', 20, [8], {}), logRow('', 'Mon', 'Zork Curl', 20, [8], {})], 'M', 0).length, 0);
  check('archive: empty Log -> no rows', archiveRows([], 'M', 0), []);

  // Archive bookkeeping
  check('maxOverallWeek: empty -> 0, else the highest', [maxOverallWeek([]), maxOverallWeek(archiveRows(weeks, 'M', 12))], [0, 14]);
  check('archiveHasLabel: case/space-insensitive', [archiveHasLabel(sorted, ' m '), archiveHasLabel(sorted, 'Meso 2')], [true, false]);

  // Is the mesocycle finished?
  var done = function (week, meso, atEnd, onDeload) { return mesoComplete({ week: week, mesoWeeks: meso, deloadAtEnd: atEnd }, onDeload); };
  check('mesoComplete: before the last week -> no', [done(5, 6, true, false), done(5, 6, false, false)], [false, false]);
  check('mesoComplete: last week with a deload still to come -> no', done(6, 6, true, false), false);
  check('mesoComplete: last week with deload toggle off -> yes', done(6, 6, false, false), true);
  check('mesoComplete: on the deload week (end or mid-meso at the last week) -> yes', [done(7, 6, true, true), done(6, 6, true, true)], [true, true]);
  check('mesoComplete: mid-meso deload week is not the end', done(3, 6, true, true), false);
  check('mesoComplete: past the end -> yes', done(7, 6, true, false), true);

  // Program start weights
  var prog = [['Mon', 'Zork Curl', 3, 15, 8, 12], ['Tue', 'Wibble Press', 3, 40, 8, 12], ['', '', '', '', '', ''], ['Wed', 'Zork Curl', 3, 15, 8, 12]];
  var logs = [logRow(1, 'Mon', 'Zork Curl', 20, [10], {}), logRow(2, 'Mon', 'Zork Curl', 22.5, [10], {}),
    logRow(3, 'Mon', 'Zork Curl', 10, [8], { FLAGS: DL })];
  var sw = planProgramStartWeights(prog, logs);
  check('start weights: last working weight (deload ignored), others keep theirs', sw.column, [[22.5], [40], [''], [15]]);
  check('start weights: updated list', sw.updated, ['Zork Curl']);
  var sw2 = planProgramStartWeights([['Mon', 'Zork Curl', 3, 15, 8, 12], ['Mon', 'Zork Curl', 3, 15, 8, 12]], logs);
  check('start weights: duplicate Program rows both update, listed once', [sw2.column, sw2.updated], [[[22.5], [22.5]], ['Zork Curl']]);
  check('start weights: unreadable weight keeps the Program value',
    planProgramStartWeights([['Mon', 'Zork Curl', 3, 15, 8, 12]], [logRow(1, 'Mon', 'Zork Curl', '', [10], {})]).column, [[15]]);
  check('start weights: empty Log changes nothing', planProgramStartWeights(prog, []).column, [[15], [40], [''], [15]]);

  return results;
}

/**
 * Pass 6 checks against the live Sheet, called from runSheetTests() with its helpers. Uses the first two Exercise Map
 * rows; the caller restores Program, Session, Log, Archive and Settings (week, length, deload toggle, mesocycle name).
 */
function archiveSheetTests(ss, check, h) {
  var session = ss.getSheetByName(TABS.SESSION);
  var logSheet = ss.getSheetByName(TABS.LOG);
  var archive = ss.getSheetByName(TABS.ARCHIVE);
  var program = ss.getSheetByName(TABS.PROGRAM);
  var settings = ss.getSheetByName(TABS.SETTINGS);
  var weekCell = settings.getRange(SETTINGS_ROWS.WEEK, 2);
  var mesoCell = settings.getRange(SETTINGS_ROWS.MESO_WEEKS, 2);
  var nameCell = settings.getRange(SETTINGS_ROWS.MESO_NAME, 2);
  var toggle = settings.getRange(SETTINGS_ROWS.DELOAD_AT_END, 2);
  var statusText = function () { return String(settings.getRange(SETTINGS_ROWS.STATUS, 2).getValue()); };
  var archRows = function () { return h.rowsOf(archive, ARCHIVE_HEADERS.length); };
  var acol = function (c) { return archRows().map(function (r) { return r[ARCHIVE_COLS[c] - 1]; }); };
  var scol = function (c) { return h.rowsOf(session, SESSION_HEADERS.length).map(function (r) { return r[SESSION_COLS[c] - 1]; }); };
  var flat = function () {
    h.enter(2, { S1: 10, S2: 10, S3: 10 });
    h.enter(3, { S1: 10, S2: 10, S3: 10 });
  };
  var start = function (week, meso) {
    weekCell.setValue(week);
    mesoCell.setValue(meso);
    h.writeProgram([['Mon', h.exA, 3, 20, 8, 12], ['Tue', h.exB, 3, 50, 8, 12]]);
    clearBody(logSheet, LOG_HEADERS.length);
    h.buildAndRead();
  };

  check('archive settings: rows labelled',
    [settings.getRange(SETTINGS_ROWS.MESO_NAME, 1).getValue(), settings.getRange(SETTINGS_ROWS.NEW_MESO_BOX, 1).getValue()],
    [SETTINGS_LABELS.MESO_NAME, SETTINGS_LABELS.NEW_MESO_BOX]);

  // A full mesocycle: 2 working weeks + the deload week
  clearBody(archive, ARCHIVE_HEADERS.length);
  nameCell.setValue('Test Meso 1');
  toggle.setValue(true);
  start(1, 2);
  h.enter(2, { S1: 10, S2: 10, S3: 10, ACTUAL_WEIGHT: 22.5, ACTUAL_RIR: 2 });
  h.enter(3, { S1: 10, S2: 9, S3: 8 });
  check('archive: week 1 -> 2 rolls', [h.completeWeek({ interactive: false }).ok, weekCell.getValue()], [true, 2]);
  var early = startNewMesocycle({ interactive: false });
  check('new meso: phone refuses before the mesocycle is finished',
    [early.ok, archRows().length, nameCell.getValue(), h.rowsOf(logSheet, LOG_HEADERS.length).length], [false, 0, 'Test Meso 1', 2]);
  flat();
  check('archive: week 2 -> deload week 3', [h.completeWeek({ interactive: false }).ok, weekCell.getValue()], [true, 3]);
  h.enter(2, { S1: 8, S2: 8, ACTUAL_WEIGHT: 10 });   // deload weight must not become the start weight
  h.enter(3, { S1: 8, S2: 8 });                      // the deload week is still unlogged: the tick logs it first
  var res = startNewMesocycle({ interactive: false });
  check('new meso: ok, 6 rows archived (A and B x 3 weeks)', [res.ok, res.archived], [true, 6]);
  check('archive: label, weeks and week type',
    [acol('MESO'), acol('MESO_WEEK'), acol('OVERALL_WEEK'), acol('WEEK_TYPE')],
    [['Test Meso 1', 'Test Meso 1', 'Test Meso 1', 'Test Meso 1', 'Test Meso 1', 'Test Meso 1'], [1, 1, 2, 2, 3, 3], [1, 1, 2, 2, 3, 3],
     ['Working', 'Working', 'Working', 'Working', 'Deload', 'Deload']]);
  check('archive: exercises, sets done', [acol('EXERCISE'), acol('SETS_DONE')],
    [[h.exA, h.exB, h.exA, h.exB, h.exA, h.exB], [3, 3, 3, 3, 2, 2]]);
  check('archive: weight, avg reps, volume',
    [acol('WEIGHT'), acol('AVG_REPS'), acol('VOLUME')],
    [[22.5, 50, 22.5, 50, 10, 50], [10, 9, 10, 10, 8, 8], [675, 1350, 675, 1500, 160, 800]]);
  var ladder = readSettings(ss).rirLadder;
  check('archive: target and actual RIR', [acol('TARGET_RIR'), acol('ACTUAL_RIR')],
    [[rirForWeek(ladder, 1), rirForWeek(ladder, 1), rirForWeek(ladder, 2), rirForWeek(ladder, 2), DELOAD.rir, DELOAD.rir], [2, '', '', '', '', '']]);
  check('archive: deload flag carried, date is a real date', [acol('FLAGS')[4], archRows()[0][ARCHIVE_COLS.DATE - 1] instanceof Date], [DELOAD.flags.deload, true]);
  check('new meso: Log cleared', h.rowsOf(logSheet, LOG_HEADERS.length).length, 0);
  check('new meso: Program Start Weight = last working weight (deload ignored)',
    h.rowsOf(program, PROGRAM_HEADERS.length).map(function (r) { return r[3]; }), [22.5, 50]);
  check('new meso: name advanced, back to week 1', [nameCell.getValue(), weekCell.getValue()], ['Test Meso 2', 1]);
  check('new meso: week 1 Session rebuilt from the new start weights',
    [scol('WEEK'), scol('REC_WEIGHT'), scol('REP_TARGET'), scol('RIR'), scol('SETS'), scol('FLAGS'), scol('S1')],
    [[1, 1], [22.5, 50], [8, 8], [rirForWeek(ladder, 1), rirForWeek(ladder, 1)], [3, 3], ['', ''], ['', '']]);
  check('new meso: status summarises', statusText().indexOf('Archived 6 rows as "Test Meso 1"') > -1, true);
  check('new meso: a second tick right away is refused, Archive unchanged', [startNewMesocycle({ interactive: false }).ok, archRows().length], [false, 6]);

  // A second mesocycle appends after the first; Overall Week keeps counting
  toggle.setValue(false);   // no deload week: a 1-week mesocycle is complete at once
  start(1, 1);
  flat();
  var second = startNewMesocycle({ interactive: false });
  check('new meso 2: ok, appended after the first', [second.ok, archRows().length], [true, 8]);
  check('new meso 2: label and Overall Week continue (3 + 1)',
    [acol('MESO').slice(6), acol('OVERALL_WEEK').slice(6), acol('WEEK_TYPE').slice(6)],
    [['Test Meso 2', 'Test Meso 2'], [4, 4], ['Working', 'Working']]);
  check('new meso 2: name advanced again', nameCell.getValue(), 'Test Meso 3');

  // The same label cannot be archived twice
  nameCell.setValue('Test Meso 1');
  start(1, 1);
  flat();
  var again = startNewMesocycle({ interactive: false });
  check('new meso: duplicate label refused, nothing changed', [again.ok, archRows().length, nameCell.getValue()], [false, 8, 'Test Meso 1']);
}
