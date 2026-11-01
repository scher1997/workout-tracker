/**
 * TestBackupTests.gs — pure tests for the sheet-test backup (TestBackup.gs).
 * runTestBackupTests() is called from runPureTests() in Tests.gs.
 * The recovery of a killed run against a sheet is checked in gs-tests/run-sheet-tests.js (the real Sheet cannot be killed on purpose).
 */

function runTestBackupTests() {
  var results = [];
  var check = function (name, actual, expected) {
    var a = JSON.stringify(actual), x = JSON.stringify(expected);
    results.push({ name: name, pass: a === x, detail: a === x ? '' : 'expected ' + x + ' got ' + a });
  };
  var day = new Date(2026, 9, 31, 8, 30, 0);
  var backup = {
    at: 12345,
    log: [[day, 1, 'Thu', 'Incline Dumbbell Press', '=SUM(A1)', '6–10', 22.5, true, '']],
    settings: [['ACTIONS'], [2], ['Test Meso 1'], [false]]
  };

  var chunks = backupToChunks(backup, 25);
  check('backup: long values are split into chunks of at most the size', [chunks.length > 1, chunks.every(function (c) { return c.length <= 25; })], [true, true]);
  var back = backupFromChunks(chunks);
  check('backup: round trip keeps numbers, booleans, blanks, text and the en dash',
    [back.at, back.log[0].slice(1), back.settings], [12345, [1, 'Thu', 'Incline Dumbbell Press', '=SUM(A1)', '6–10', 22.5, true, ''], backup.settings]);
  check('backup: a Date comes back as a Date with the same time',
    [Object.prototype.toString.call(back.log[0][0]), back.log[0][0].getTime()], ['[object Date]', day.getTime()]);
  check('backup: one chunk when the size is large', backupToChunks(backup, 100000).length, 1);
  check('backup: default chunk size fits a cell', TEST_BACKUP_CHUNK <= 50000, true);
  check('backup: empty tables survive', backupFromChunks(backupToChunks({ program: [], log: [] })), { program: [], log: [] });
  check('backup: a cut-off save is not a backup', backupFromChunks(chunks.slice(0, chunks.length - 1)), null);
  check('backup: chunks joined out of order are not a backup', backupFromChunks(chunks.slice().reverse()), null);
  return results;
}
