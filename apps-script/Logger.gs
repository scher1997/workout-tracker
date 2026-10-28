/**
 * Logger.gs — appends completed Session exercises to the Log tab.
 * planLogRows() is pure (no SpreadsheetApp) so it runs under Node tests.
 * completeSession() is the sheet-facing wrapper (menu item + phone checkbox).
 */

/** Identity of one logged exercise: same week + day + exercise = same entry. */
function logKey(week, day, exercise) {
  return String(week) + '|' + normalizeName(day) + '|' + normalizeName(exercise);
}

/** True once any set has a rep count typed in. */
function isExerciseCompleted(sessionRow) {
  return SESSION_REP_COLS.some(function (c) { return parseNumber(sessionRow[c - 1]) !== null; });
}

/**
 * sessionRows: Session body rows. existingKeys: {logKey: true} already in Log.
 * Returns {rows (new Log rows), duplicates (rows already logged), skipped (count not completed)}.
 * Weight falls back to the recommended weight when Actual Weight is blank.
 */
function planLogRows(sessionRows, existingKeys, date) {
  var out = { rows: [], duplicates: [], skipped: 0 };
  var seen = {};
  sessionRows.forEach(function (r) {
    if (!cleanName(r[SESSION_COLS.EXERCISE - 1])) return; // blank row
    if (!isExerciseCompleted(r)) { out.skipped++; return; }
    var row = r.slice();
    if (parseNumber(row[SESSION_COLS.ACTUAL_WEIGHT - 1]) === null) {
      row[SESSION_COLS.ACTUAL_WEIGHT - 1] = row[SESSION_COLS.REC_WEIGHT - 1];
    }
    var logRow = [date].concat(row);
    var key = logKey(r[SESSION_COLS.WEEK - 1], r[SESSION_COLS.DAY - 1], r[SESSION_COLS.EXERCISE - 1]);
    if (existingKeys[key] || seen[key]) out.duplicates.push(logRow);
    else out.rows.push(logRow);
    seen[key] = true;
  });
  return out;
}

/** Keys of everything already in the Log tab. */
function readLogKeys(logSheet) {
  var keys = {};
  if (logSheet.getLastRow() < 2) return keys;
  var data = logSheet.getRange(2, 1, logSheet.getLastRow() - 1, LOG_HEADERS.length).getValues();
  data.forEach(function (r) {
    // Log column 1 is Date, so Session column n sits at index n.
    keys[logKey(r[SESSION_COLS.WEEK], r[SESSION_COLS.DAY], r[SESSION_COLS.EXERCISE])] = true;
  });
  return keys;
}

/** Last row that actually holds data (getLastRow also counts rows with only dropdowns). */
function lastDataRow(sh, width) {
  var last = sh.getLastRow();
  if (last < 2) return 1;
  var vals = sh.getRange(2, 1, last - 1, width).getValues();
  for (var i = vals.length - 1; i >= 0; i--) {
    if (vals[i].some(function (c) { return c !== ''; })) return i + 2;
  }
  return 1;
}

/**
 * Append completed Session exercises to Log.
 * opts.interactive (default true): ask before re-logging exercises already in Log.
 * From the phone checkbox no dialog is possible, so already-logged exercises are skipped.
 */
function completeSession(opts) {
  var interactive = !opts || opts.interactive !== false;
  var ss = SpreadsheetApp.getActive();
  var session = ss.getSheetByName(TABS.SESSION);
  var log = ss.getSheetByName(TABS.LOG);
  if (!session || !log) {
    setStatus(ss, 'Run Setup first (Workout menu > Set up workbook).');
    return;
  }
  var last = lastDataRow(session, SESSION_HEADERS.length);
  var sessionRows = last > 1 ? session.getRange(2, 1, last - 1, SESSION_HEADERS.length).getValues() : [];
  var date = new Date(Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'yyyy/MM/dd'));
  var plan = planLogRows(sessionRows, readLogKeys(log), date);

  var toWrite = plan.rows;
  if (plan.duplicates.length && interactive) {
    var ui = SpreadsheetApp.getUi();
    var answer = ui.alert('Already logged',
      plan.duplicates.length + ' exercise(s) are already in Log for this week. Log them again?\n\nYes = log again, No = skip them.',
      ui.ButtonSet.YES_NO);
    if (answer === ui.Button.YES) toWrite = plan.rows.concat(plan.duplicates);
  }

  if (toWrite.length) {
    var start = lastDataRow(log, LOG_HEADERS.length) + 1;
    log.getRange(start, 1, toWrite.length, LOG_HEADERS.length).setValues(toWrite);
    log.getRange(start, 1, toWrite.length, 1).setNumberFormat('yyyy-mm-dd');
  }

  var notes = ['Logged ' + toWrite.length + ' exercise(s).'];
  var skippedDupes = plan.rows.concat(plan.duplicates).length - toWrite.length;
  if (skippedDupes) notes.push(skippedDupes + ' already in Log, skipped.');
  if (plan.skipped) notes.push(plan.skipped + ' with no reps entered, not logged.');
  if (!toWrite.length && !skippedDupes && !plan.skipped) notes = ['Nothing to log: Session is empty.'];
  setStatus(ss, notes.join(' '));
  ss.toast(notes[0], 'Workout Tracker', 5);
  return { logged: toWrite.length, duplicatesSkipped: skippedDupes, notCompleted: plan.skipped };
}
