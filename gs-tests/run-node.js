// Loads the .gs files into one context and runs the pure-logic tests locally.
const { loadGs } = require('./gs-files');

const ctx = loadGs({ Logger: { log: console.log } });

const results = require('vm').runInContext('runPureTests()', ctx);
results.forEach(r => console.log((r.pass ? 'PASS ' : 'FAIL ') + r.name + (r.detail ? ' — ' + r.detail : '')));
const failed = results.filter(r => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
