/**
 * LogLayout.gs — Log tab layout: Primary / Secondary / Tertiary muscle columns.
 * On the sheet the Log has three muscle columns (LOG_HEADERS). In code a Log row is
 * [Date, ...Session columns, Secondary, Tertiary] (LOG_ROW), so r[SESSION_COLS.X] keeps working everywhere.
 * Secondary / tertiary are copied from the Exercise Map when an exercise is logged, so each row shows what it counted.
 * Everything above "Sheet side" is pure (no SpreadsheetApp) so it runs under Node tests.
 */

/** ['Triceps','Front Delts'] -> "Triceps, Front Delts". */
function joinMuscles(list) {
  return (list || []).join(', ');
}

/** [secondary, tertiary] text cells for an exercise, from buildMuscleRoles().roles; blank if it is not in the map. */
function roleCells(roles, exercise) {
  var role = roles && roles[normalizeName(exercise)];
  return role ? [joinMuscles(role.secondary), joinMuscles(role.tertiary)] : ['', ''];
}

/** Code row [Date, Session..., Sec, Ter] -> sheet row (Date, Week, Day, Exercise, Primary, Sec, Ter, Sets, ...). */
function logRowToSheet(row) {
  var m = SESSION_COLS.MUSCLE;   // Date is index 0, so the primary muscle sits at index m
  var sessionEnd = 1 + SESSION_HEADERS.length;
  return row.slice(0, m + 1).concat(
    [row[LOG_ROW.SECONDARY] === undefined ? '' : row[LOG_ROW.SECONDARY], row[LOG_ROW.TERTIARY] === undefined ? '' : row[LOG_ROW.TERTIARY]],
    row.slice(m + 1, sessionEnd));
}

/** Sheet row -> code row. Inverse of logRowToSheet. */
function logRowFromSheet(row) {
  var m = SESSION_COLS.MUSCLE;
  return row.slice(0, m + 1).concat(row.slice(m + 3), [row[m + 1], row[m + 2]]);
}

/** True when a header row still has the old single muscle column (secondary header missing next to the primary one). */
function needsMuscleColumns(headerRow, primaryCol) {
  var primary = String(headerRow[primaryCol - 1] == null ? '' : headerRow[primaryCol - 1]).trim();
  var next = String(headerRow[primaryCol] == null ? '' : headerRow[primaryCol]).trim();
  return primary !== '' && next !== MUSCLE_HEADERS[1];
}

/** Secondary / tertiary text cells for rows of an old tab, by exercise name from the map roles. */
function planMuscleBackfill(exercises, roles) {
  return exercises.map(function (name) { return roleCells(roles, name); });
}

// ---------------------------------------------------------------- Sheet side

/** buildMuscleRoles().roles from the Exercise Map tab. */
function readMuscleRoles(ss) {
  var map = ss.getSheetByName(TABS.MAP);
  var rows = map && map.getLastRow() > 1 ? map.getRange(2, 1, map.getLastRow() - 1, MAP_HEADERS.length).getValues() : [];
  return buildMuscleRoles(rows).roles;
}

/** Insert the two extra muscle columns into one old tab and fill them from the map. Returns rows backfilled. */
function addMuscleColumns(sheet, primaryCol, exerciseCol, roles) {
  if (sheet.getLastColumn() < primaryCol) return 0;
  var header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  if (!needsMuscleColumns(header, primaryCol)) return 0;
  sheet.insertColumnsAfter(primaryCol, 2);
  var last = sheet.getLastRow();
  if (last < 2) return 0;
  var names = sheet.getRange(2, exerciseCol, last - 1, 1).getValues().map(function (r) { return r[0]; });
  sheet.getRange(2, primaryCol + 1, last - 1, 2).setValues(planMuscleBackfill(names, roles));
  return last - 1;
}

/** Set up workbook step: old Log and Archive tabs (one Muscle Group column) get Secondary + Tertiary columns. Idempotent. */
function migrateMuscleColumns(ss) {
  var roles = readMuscleRoles(ss);
  var log = ss.getSheetByName(TABS.LOG);
  var archive = ss.getSheetByName(TABS.ARCHIVE);
  var logRows = log ? addMuscleColumns(log, SESSION_COLS.MUSCLE + 1, SESSION_COLS.EXERCISE + 1, roles) : 0;
  var archiveRows = archive ? addMuscleColumns(archive, ARCHIVE_COLS.MUSCLE, ARCHIVE_COLS.EXERCISE, roles) : 0;
  if (logRows || archiveRows) Logger.log('migrateMuscleColumns: backfilled ' + logRows + ' Log rows, ' + archiveRows + ' Archive rows');
}
