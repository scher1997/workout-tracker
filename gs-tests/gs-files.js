// Shared by the Node runners: the .gs load order and a loader that evaluates them in one vm context.
// A new .gs file goes in this list (order matters only for top-level statements; functions hoist per file).
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const dir = path.join(__dirname, '..', 'apps-script');
const GS_FILES = ['Config.gs', 'Utils.gs', 'SessionBuilder.gs', 'Logger.gs', 'Rollover.gs', 'Feedback.gs', 'Deload.gs', 'Archive.gs', 'MuscleSummary.gs', 'LogLayout.gs', 'SessionLayout.gs', 'Trends.gs', 'SettingsLayout.gs', 'Setup.gs', 'SheetTests.gs', 'FeedbackTests.gs', 'DeloadTests.gs', 'ArchiveTests.gs', 'MuscleSummaryTests.gs', 'LogLayoutTests.gs', 'SampleWeek.gs', 'WeekFlowTests.gs', 'SessionLayoutTests.gs', 'Tests.gs'];

function loadGs(globals) {
  const ctx = vm.createContext(Object.assign({ console }, globals));
  GS_FILES.forEach(f => vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), ctx, { filename: f }));
  return ctx;
}

module.exports = { GS_FILES, loadGs };
