// Loads the .gs files into one context and runs the pure-logic tests locally.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const dir = path.join(__dirname, '..', 'apps-script');
const files = ['Config.gs', 'Utils.gs', 'SessionBuilder.gs', 'Logger.gs', 'Setup.gs', 'SheetTests.gs', 'Tests.gs'];
const ctx = vm.createContext({ console, Logger: { log: console.log } });
files.forEach(f => vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), ctx, { filename: f }));

const results = vm.runInContext('runPureTests()', ctx);
results.forEach(r => console.log((r.pass ? 'PASS ' : 'FAIL ') + r.name + (r.detail ? ' — ' + r.detail : '')));
const failed = results.filter(r => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
