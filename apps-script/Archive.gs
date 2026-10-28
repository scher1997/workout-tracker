/**
 * Archive.gs — end a mesocycle: copy Log into the Archive tab (chart-ready long format), carry the last working
 * weights into Program, clear Log and start the next mesocycle at week 1.
 * Everything except startNewMesocycle() is pure (no SpreadsheetApp) so it runs under Node tests.
 * Archive columns are ARCHIVE_HEADERS (Config.gs): one row per exercise per day per week, with an Overall Week
 * that keeps counting across mesocycles so charts get a long-term time axis.
 */

/** "Meso 1" -> "Meso 2"; a name with no trailing number gets " 2"; blank -> "Meso 2" (blank archives as "Meso 1"). */
function nextMesoName(name) {
  var n = cleanName(name) || 'Meso 1';
  var m = n.match(/^(.*?)(\d+)$/);
  return m ? m[1] + (parseInt(m[2], 10) + 1) : n + ' 2';
}

/** The earlier of two Log dates (Date objects compare by time; anything else keeps the first non-blank). */
function earlierDate(a, b) {
  if (a === undefined || a === '' || a === null) return b;
  if (b === undefined || b === '' || b === null) return a;
  if (a instanceof Date && b instanceof Date) return a.getTime() <= b.getTime() ? a : b;
  return a;
}

/** Highest Overall Week already in the Archive body (0 if empty). */
function maxOverallWeek(archiveRows) {
  var max = 0;
  archiveRows.forEach(function (r) {
    var w = parseNumber(r[ARCHIVE_COLS.OVERALL_WEEK - 1]);
    if (w !== null && w > max) max = w;
  });
  return max;
}

/** True if the Archive already holds this mesocycle label. */
function archiveHasLabel(archiveRows, label) {
  var key = normalizeName(label);
  return archiveRows.some(function (r) { return normalizeName(r[ARCHIVE_COLS.MESO - 1]) === key; });
}

/**
 * The mesocycle is finished once the last working week is behind us: the deload week is the current week,
 * or no deload follows the last week (toggle off), or the week count is already past the length.
 */
function mesoComplete(settings, onDeload) {
  if (settings.week < settings.mesoWeeks) return false;
  return onDeload || settings.week > settings.mesoWeeks || !settings.deloadAtEnd;
}

function round1(x) { return Math.round(x * 10) / 10; }

/**
 * Log rows -> Archive rows. A re-logged exercise (same week + day + exercise) keeps its latest row.
 * Meso Week = Log week; Overall Week = overallOffset + Meso Week; Date = the week's earliest logged date;
 * Week Type = Deload when any Log row of that week carries the deload flag.
 * Weight x total reps entered = Volume. Rows come out in week order, Log order within a week.
 */
function archiveRows(logRows, label, overallOffset) {
  var deloadWeeks = {}, weekDate = {}, byKey = {}, entries = [];
  logRows.forEach(function (r, idx) {
    var week = parseNumber(r[SESSION_COLS.WEEK]);
    if (week === null || !cleanName(r[SESSION_COLS.EXERCISE])) return;
    if (isDeloadEntry(r)) deloadWeeks[week] = true;
    weekDate[week] = earlierDate(weekDate[week], r[0]);
    var k = logKey(week, r[SESSION_COLS.DAY], r[SESSION_COLS.EXERCISE]);
    if (byKey[k] === undefined) { byKey[k] = entries.length; entries.push({ week: week, idx: idx, row: r }); }
    else entries[byKey[k]].row = r;
  });
  entries.sort(function (a, b) { return a.week - b.week || a.idx - b.idx; });
  return entries.map(function (e) {
    var r = e.row;
    var reps = [];
    SESSION_REP_COLS.forEach(function (c) { var v = parseNumber(r[c]); if (v !== null) reps.push(v); });
    var total = reps.reduce(function (a, b) { return a + b; }, 0);
    var weight = parseNumber(r[SESSION_COLS.ACTUAL_WEIGHT]);
    var targetRir = parseNumber(r[SESSION_COLS.RIR]);
    var actualRir = parseNumber(r[SESSION_COLS.ACTUAL_RIR]);
    var out = new Array(ARCHIVE_HEADERS.length);
    out[ARCHIVE_COLS.MESO - 1] = label;
    out[ARCHIVE_COLS.MESO_WEEK - 1] = e.week;
    out[ARCHIVE_COLS.OVERALL_WEEK - 1] = overallOffset + e.week;
    out[ARCHIVE_COLS.DATE - 1] = weekDate[e.week] === undefined ? '' : weekDate[e.week];
    out[ARCHIVE_COLS.WEEK_TYPE - 1] = deloadWeeks[e.week] ? ARCHIVE_WEEK_TYPES.deload : ARCHIVE_WEEK_TYPES.working;
    out[ARCHIVE_COLS.DAY - 1] = cleanName(r[SESSION_COLS.DAY]);
    out[ARCHIVE_COLS.EXERCISE - 1] = cleanName(r[SESSION_COLS.EXERCISE]);
    out[ARCHIVE_COLS.MUSCLE - 1] = cleanName(r[SESSION_COLS.MUSCLE]);
    out[ARCHIVE_COLS.SETS_DONE - 1] = reps.length;
    out[ARCHIVE_COLS.WEIGHT - 1] = weight === null ? '' : weight;
    out[ARCHIVE_COLS.AVG_REPS - 1] = reps.length ? round1(total / reps.length) : '';
    out[ARCHIVE_COLS.VOLUME - 1] = weight !== null && reps.length ? round1(weight * total) : '';
    out[ARCHIVE_COLS.TARGET_RIR - 1] = targetRir === null ? '' : targetRir;
    out[ARCHIVE_COLS.ACTUAL_RIR - 1] = actualRir === null ? '' : actualRir;
    out[ARCHIVE_COLS.SORENESS - 1] = cleanName(r[SESSION_COLS.SORENESS]);
    out[ARCHIVE_COLS.PUMP - 1] = cleanName(r[SESSION_COLS.PUMP]);
    out[ARCHIVE_COLS.TENDON - 1] = cleanName(r[SESSION_COLS.TENDON]);
    out[ARCHIVE_COLS.CONNECTION - 1] = cleanName(r[SESSION_COLS.CONNECTION]);
    out[ARCHIVE_COLS.FLAGS - 1] = cleanName(r[SESSION_COLS.FLAGS]);
    return out;
  });
}

/**
 * New Program Start Weight column: each exercise's weight from its latest working (non-deload) Log entry.
 * Exercises with no usable entry (and spacer rows) keep their current value.
 * Returns {column: [[weight], ...] one per Program row, updated: [exercise names]}.
 */
function planProgramStartWeights(progRows, logRows) {
  var latest = latestEntries(withoutDeload(logRows), Infinity);
  var updated = [], seen = {};
  var column = progRows.map(function (r) {
    var exercise = cleanName(r[1]);
    var key = overrideKey(r[0], exercise);
    var found = exercise ? latest[key] : null;
    var weight = found ? parseNumber(found.row[SESSION_COLS.ACTUAL_WEIGHT]) : null;
    if (weight === null || weight <= 0) return [r[3]];
    if (!seen[key]) { seen[key] = true; updated.push(exercise); }
    return [weight];
  });
  return { column: column, updated: updated };
}

/**
 * Archive the finished mesocycle and start the next one at week 1 (menu item + phone checkbox).
 * Order: checks -> log pending Session rows -> append to Archive and verify the count -> Program start weights
 * -> clear Log -> next name, week 1 -> rebuild Session. Log is only cleared after the Archive copy checks out.
 * opts.interactive (default true): the menu may end an unfinished mesocycle early after a confirmation;
 * the phone checkbox refuses unless the mesocycle is complete (the deload week is the current week, or it is past the end).
 */
function startNewMesocycle(opts) {
  var interactive = !opts || opts.interactive !== false;
  var ss = SpreadsheetApp.getActive();
  var session = ss.getSheetByName(TABS.SESSION);
  var program = ss.getSheetByName(TABS.PROGRAM);
  var log = ss.getSheetByName(TABS.LOG);
  var archive = ss.getSheetByName(TABS.ARCHIVE);
  if (!session || !program || !log || !archive || archive.getRange(1, 1).getValue() !== ARCHIVE_HEADERS[0]) {
    setStatus(ss, 'Run Setup first (Workout menu > Set up workbook).');
    return { ok: false };
  }
  var refuse = function (msg) { setStatus(ss, msg); ss.toast(msg, 'Workout Tracker', 6); return { ok: false, message: msg }; };

  var settings = readSettings(ss);
  var label = settings.mesoName || 'Meso 1';
  var early = !mesoComplete(settings, sessionIsDeload(session));
  if (early && !interactive) {
    return refuse('Mesocycle not finished (week ' + settings.week + ' of ' + settings.mesoWeeks
      + (settings.deloadAtEnd ? ', then a deload week' : '') + '). Finish it, or use Workout > Start new mesocycle to end early.');
  }
  var archLast = lastDataRow(archive, ARCHIVE_HEADERS.length);
  var archBody = archLast > 1 ? archive.getRange(2, 1, archLast - 1, ARCHIVE_HEADERS.length).getValues() : [];
  if (archiveHasLabel(archBody, label)) {
    return refuse('Archive already has "' + label + '". Change "Mesocycle name" in Settings, then try again.');
  }
  var pending = countUnlogged(ss);
  if (!pending && !readLogRows(log).length) return refuse('Nothing in Log to archive yet.');

  if (interactive) {
    var ui = SpreadsheetApp.getUi();
    var msg = (early ? 'This mesocycle is not finished (week ' + settings.week + ' of ' + settings.mesoWeeks + ').\n\n' : '')
      + (pending ? pending + ' completed exercise(s) will be logged first.\n\n' : '')
      + 'Archive Log as "' + label + '", set Program start weights to the last working weights, '
      + 'clear Log, reset to week 1 as "' + nextMesoName(label) + '" and rebuild Session?';
    if (ui.alert('Start a new mesocycle?', msg, ui.ButtonSet.YES_NO) !== ui.Button.YES) return { ok: false, cancelled: true };
  }

  if (pending) completeSession({ interactive: false });
  var logRows = readLogRows(log);
  var rows = archiveRows(logRows, label, maxOverallWeek(archBody));
  if (!rows.length) return refuse('Nothing in Log to archive yet.');
  var start = archLast + 1;
  archive.getRange(start, 1, rows.length, ARCHIVE_HEADERS.length).setValues(rows);
  archive.getRange(start, ARCHIVE_COLS.DATE, rows.length, 1).setNumberFormat('yyyy-mm-dd');
  SpreadsheetApp.flush();
  var written = archive.getRange(start, ARCHIVE_COLS.MESO, rows.length, 1).getValues().filter(function (r) {
    return normalizeName(r[0]) === normalizeName(label);
  }).length;
  if (written !== rows.length) {
    return refuse('Archive copy did not check out (' + written + ' of ' + rows.length + ' rows). Log was NOT cleared. '
      + 'Remove the "' + label + '" rows from Archive and try again.');
  }

  var next = nextMesoName(label);
  try {
    var progRows = program.getLastRow() > 1
      ? program.getRange(2, 1, program.getLastRow() - 1, PROGRAM_HEADERS.length).getValues() : [];
    var weights = planProgramStartWeights(progRows, logRows);
    if (progRows.length) program.getRange(2, 4, progRows.length, 1).setValues(weights.column);
    // Session first: while Log still holds its rows nothing counts as unlogged, so the clear is allowed.
    clearSession({ interactive: false });
    log.getRange(2, 1, Math.max(log.getLastRow() - 1, 1), LOG_HEADERS.length).clearContent();
    var settingsSheet = ss.getSheetByName(TABS.SETTINGS);
    settingsSheet.getRange(SETTINGS_ROWS.MESO_NAME, 2).setValue(next);
    settingsSheet.getRange(SETTINGS_ROWS.WEEK, 2).setValue(1);
    buildSession({ interactive: false });
  } catch (e) {
    return refuse('Archived ' + rows.length + ' rows as "' + label + '" but the reset stopped: ' + e
      + '. Do not archive again; finish by hand (clear Log, set week 1, build Session).');
  }

  var span = rows[0][ARCHIVE_COLS.OVERALL_WEEK - 1] + '–' + rows[rows.length - 1][ARCHIVE_COLS.OVERALL_WEEK - 1];
  var notes = ['Archived ' + rows.length + ' rows as "' + label + '" (overall weeks ' + span + ').',
    'Program start weights updated for ' + weights.updated.length + ' exercise(s).',
    'Now "' + next + '", week 1 built.'];
  if (early) notes.push('(Ended early.)');
  setStatus(ss, notes.join(' '));
  ss.toast(notes[0], 'Workout Tracker', 6);
  return { ok: true, archived: rows.length, label: label, next: next, updatedWeights: weights.updated.length };
}
