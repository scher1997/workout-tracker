// Runs the real setupWorkbook() and runSheetTests() against the in-memory SpreadsheetApp mock.
// Catches logic and API-misuse bugs without a clasp push. It cannot check chart rendering,
// protections as the Sheet enforces them, or phone behaviour: keep the in-Sheet run for those.
// Usage: node gs-tests/run-sheet-tests.js [--verbose] [--part=1|--part=2]
//   --verbose also prints the script's Logger output; --part runs one half of the suite (the menu's 1 of 2 / 2 of 2).
const vm = require('vm');
const { loadGs } = require('./gs-files');
const { createMockEnv } = require('./mock-spreadsheet');

const env = createMockEnv();
const ctx = loadGs(env.globals);
const run = code => vm.runInContext(code, ctx);

const results = [];
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual), x = JSON.stringify(expected);
  results.push({ name, pass: a === x, detail: a === x ? '' : `expected ${x} got ${a}` });
};

// Set up twice: the second run must change nothing structural (it is meant to be idempotent).
run('setupWorkbook()');
const tabsAfterFirst = env.ss.getSheets().map(s => s.getName());
run('setupWorkbook()');
check('setup: all tabs created', tabsAfterFirst.length, run('Object.keys(TABS).length'));
check('setup: second run keeps the same tabs in order', env.ss.getSheets().map(s => s.getName()), tabsAfterFirst);
check('setup: exactly one onSettingsEdit trigger', env.triggers.filter(t => t.getHandlerFunction() === 'onSettingsEdit').length, 1);
check('setup: Program seeded from the map', env.ss.getSheetByName('Program').getRange(2, 2).getValue() !== '', true);

// --part=1 or --part=2 runs one half (what the Workout menu does on a real Sheet); no flag runs both.
const partArg = (process.argv.find(a => a.startsWith('--part=')) || '').slice(7);
const sheetResults = run(`runSheetTests(${partArg === '1' || partArg === '2' ? partArg : ''})`);
// The tests paint Sessions by day while they run; afterwards the tab must look like the user's own (empty here) rows again.
const leftover = [];
const sessions = env.ss.getSheetByName('Sessions');
for (let r = 2; r <= 20; r++) if (sessions.getRange(r, 1).getBackground() !== '#ffffff') leftover.push(r);
check('after the tests: no day tint left on Sessions rows that are empty again', leftover, []);

// Script lock around the Settings action dispatch (runner-only: the real Sheet cannot simulate a second execution).
const settingsSheet = env.ss.getSheetByName('Settings');
const actionRow = run('SETTINGS_ROWS.ACTION'), statusRow = run('SETTINGS_ROWS.STATUS'), weekRow = run('SETTINGS_ROWS.WEEK');
const pick = name => {
  settingsSheet.getRange(actionRow, 2).setValue(name);
  run('runSettingsAction(SpreadsheetApp.getActive().getSheetByName(TABS.SETTINGS).getRange(SETTINGS_ROWS.ACTION, 2))');
};
const status = () => String(settingsSheet.getRange(statusRow, 2).getValue());
const weekBefore = settingsSheet.getRange(weekRow, 2).getValue();
const lock = env.lockState;
const acquiredBefore = lock.acquired;
lock.busy = true;
pick('Complete Week');
lock.busy = false;
check('lock busy: Status says Busy, try again', status(), 'Busy, try again');
check('lock busy: action did not run, week unchanged, cell reset',
  [settingsSheet.getRange(weekRow, 2).getValue(), settingsSheet.getRange(actionRow, 2).getValue(), lock.acquired], [weekBefore, 'Choose action', acquiredBefore]);
check('lock busy: waited the configured time for the lock', lock.lastWaitMs, run('ACTION_LOCK_WAIT_MS'));
pick('Refresh Muscle Summary');
check('lock free: action runs, lock taken and released', [status() !== 'Busy, try again', lock.acquired, lock.released, lock.held], [true, acquiredBefore + 1, lock.released, 0]);
run('var realRefreshSummaryNow = refreshSummaryNow; refreshSummaryNow = function () { throw new Error("boom"); }');
let thrown = '';
try { pick('Refresh Muscle Summary'); } catch (e) { thrown = e.message; }
run('refreshSummaryNow = realRefreshSummaryNow');
check('lock: released even when the action throws', [thrown, lock.held], ['boom', 0]);

const all = results.concat(sheetResults);
const failed = all.filter(r => !r.pass);
failed.forEach(r => console.log('FAIL ' + r.name + ' — ' + r.detail));
if (process.argv.includes('--verbose')) env.logs.forEach(l => console.log('  log: ' + l));
console.log(`\n${all.length - failed.length}/${all.length} sheet tests passed (mock SpreadsheetApp)`);
process.exit(failed.length ? 1 : 0);
