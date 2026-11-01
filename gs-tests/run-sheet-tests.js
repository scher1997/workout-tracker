// Runs the real setupWorkbook() and runSheetTests() against the in-memory SpreadsheetApp mock.
// Catches logic and API-misuse bugs without a clasp push. It cannot check chart rendering,
// protections as the Sheet enforces them, or phone behaviour: keep the in-Sheet run for those.
// Usage: node gs-tests/run-sheet-tests.js [--verbose]   (--verbose also prints the script's Logger output)
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

const sheetResults = run('runSheetTests()');
// The tests paint Sessions by day while they run; afterwards the tab must look like the user's own (empty here) rows again.
const leftover = [];
const sessions = env.ss.getSheetByName('Sessions');
for (let r = 2; r <= 20; r++) if (sessions.getRange(r, 1).getBackground() !== '#ffffff') leftover.push(r);
check('after the tests: no day tint left on Sessions rows that are empty again', leftover, []);
const all = results.concat(sheetResults);
const failed = all.filter(r => !r.pass);
failed.forEach(r => console.log('FAIL ' + r.name + ' — ' + r.detail));
if (process.argv.includes('--verbose')) env.logs.forEach(l => console.log('  log: ' + l));
console.log(`\n${all.length - failed.length}/${all.length} sheet tests passed (mock SpreadsheetApp)`);
process.exit(failed.length ? 1 : 0);
