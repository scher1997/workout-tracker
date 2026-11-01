/**
 * TestBackup.gs — keeps the user's own data safe while the in-Sheet tests overwrite it.
 * The tests used to hold their backup only in memory, so a run killed by Apps Script's 6-minute limit lost it.
 * Now the backup is also written to a hidden "Test Backup" tab before anything is changed. A normal run restores
 * from memory and deletes the tab; the next run finds a tab left by a killed run and restores from it first.
 * backupToChunks / backupFromChunks are pure (Node-tested); the rest is sheet side.
 */

var TEST_BACKUP_TAB = 'Test Backup';
var TEST_BACKUP_CHUNK = 40000;   // a cell holds at most 50,000 characters

// ---- Pure part ----

/** Backup object -> array of strings, each at most `size` characters. Dates survive the round trip. */
function backupToChunks(backup, size) {
  size = size || TEST_BACKUP_CHUNK;
  var json = JSON.stringify(backup, function (key, value) {
    var original = this[key];   // Date.toJSON has already run on `value`
    return Object.prototype.toString.call(original) === '[object Date]' ? { $date: original.getTime() } : value;
  });
  var chunks = [];
  for (var i = 0; i < json.length; i += size) chunks.push(json.substring(i, i + size));
  return chunks;
}

/** Inverse of backupToChunks. Returns null when the text is not a complete backup. */
function backupFromChunks(chunks) {
  try {
    return JSON.parse(chunks.join(''), function (key, value) {
      return value && typeof value === 'object' && value.$date !== undefined ? new Date(value.$date) : value;
    });
  } catch (e) {
    return null;
  }
}

// ---- Sheet side ----

/** Non-empty body rows of a tab (a row with only dropdowns counts as empty). */
function backupBodyRows(sh, width) {
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, width).getValues().filter(function (r) {
    return r.some(function (c) { return c !== ''; });
  });
}

/** Everything the tests overwrite: the data tabs and the whole Settings value column. */
function captureTestBackup(ss) {
  var rows = function (name, width) { return backupBodyRows(ss.getSheetByName(name), width); };
  var settings = ss.getSheetByName(TABS.SETTINGS);
  var lastSettingsRow = SETTINGS_SECTIONS[SETTINGS_SECTIONS.length - 1].last;
  return {
    at: Date.now(),
    program: rows(TABS.PROGRAM, PROGRAM_HEADERS.length),
    session: rows(TABS.SESSION, SESSION_HEADERS.length),
    log: rows(TABS.LOG, LOG_HEADERS.length),
    archive: rows(TABS.ARCHIVE, ARCHIVE_HEADERS.length),
    map: rows(TABS.MAP, MAP_HEADERS.length),
    settings: settings.getRange(1, 2, lastSettingsRow, 1).getValues()
  };
}

/** Put a captured backup back. The summary and Trends are rebuilt by the caller. */
function restoreTestBackup(ss, backup) {
  var put = function (name, width, rows) {
    var sh = ss.getSheetByName(name);
    if (!sh) return;
    clearBody(sh, width);
    if (rows.length) sh.getRange(2, 1, rows.length, width).setValues(rows);
  };
  ss.getSheetByName(TABS.SETTINGS).getRange(1, 2, backup.settings.length, 1).setValues(backup.settings);
  put(TABS.MAP, MAP_HEADERS.length, backup.map);
  put(TABS.ARCHIVE, ARCHIVE_HEADERS.length, backup.archive);
  put(TABS.PROGRAM, PROGRAM_HEADERS.length, backup.program);
  put(TABS.LOG, LOG_HEADERS.length, backup.log);
  put(TABS.SESSION, SESSION_HEADERS.length, backup.session);
  paintSessionDays(ss.getSheetByName(TABS.SESSION), backup.session);   // test day tints must not outlive their rows
}

/** Write the backup to the hidden tab (replacing an older one) and flush, before any test changes data. */
function saveTestBackup(ss, backup) {
  var chunks = backupToChunks(backup);
  var sh = ss.getSheetByName(TEST_BACKUP_TAB);
  var active = ss.getActiveSheet();
  if (sh) sh.clear(); else sh = ss.insertSheet(TEST_BACKUP_TAB);
  sh.getRange(1, 1, 1, 2).setValues([['Part', 'Sheet-test backup (JSON). Restored automatically if a test run is killed; deleted after a normal run.']]);
  sh.getRange(2, 2, chunks.length, 1).setNumberFormat('@');   // keep every chunk text, whatever it starts with
  sh.getRange(2, 1, chunks.length, 2).setValues(chunks.map(function (c, i) { return [i + 1, c]; }));
  SpreadsheetApp.flush();
  if (active && active.getName() !== TEST_BACKUP_TAB) ss.setActiveSheet(active);   // inserting a tab selects it
  sh.hideSheet();
}

/** The backup left by a run that did not finish, or null (no tab, or a save that was cut off before any test ran). */
function loadTestBackup(ss) {
  var sh = ss.getSheetByName(TEST_BACKUP_TAB);
  if (!sh || sh.getLastRow() < 2) return null;
  var chunks = sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues()
    .sort(function (a, b) { return a[0] - b[0]; })
    .map(function (r) { return String(r[1]); });
  return backupFromChunks(chunks);
}

function dropTestBackup(ss) {
  var sh = ss.getSheetByName(TEST_BACKUP_TAB);
  if (sh) ss.deleteSheet(sh);
}
