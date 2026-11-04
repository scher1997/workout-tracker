/**
 * Reset.gs — Workout > Reset for a new user (copy only): turns a used workbook into a clean one to hand to a tester.
 * Erases Log, Archive and Sessions; puts the Exercise Map back to the library and Program to the first program template;
 * resets week, mesocycle name, length, RIR ladder and rep defaults. Settings > Preferences are kept (so tick your counting
 * options first); the guide tab is rewritten. Meant for a copy of the workbook: it asks you to type RESET.
 */

function resetForNewUser(opts) {
  var interactive = !opts || opts.interactive !== false;
  var ss = SpreadsheetApp.getActive();
  var map = ss.getSheetByName(TABS.MAP), program = ss.getSheetByName(TABS.PROGRAM), session = ss.getSheetByName(TABS.SESSION);
  var log = ss.getSheetByName(TABS.LOG), archive = ss.getSheetByName(TABS.ARCHIVE), settings = ss.getSheetByName(TABS.SETTINGS);
  if (!map || !program || !session || !log || !archive || !settings) {
    if (settings) setStatus(ss, 'Run Setup first (Workout menu > Set up workbook).');
    return { ok: false };
  }
  if (interactive) {
    var ui = SpreadsheetApp.getUi();
    var ask = 'This ERASES the Log, the Archive and Sessions, puts the Exercise Map back to the library and Program back to '
      + '"' + findProgramTemplate().name + '", and resets the week and mesocycle settings. Your Preferences stay.\n\n'
      + 'Only do this on a copy you are about to hand to someone else. Type RESET to continue.';
    var answer = ui.prompt('Reset for a new user?', ask, ui.ButtonSet.OK_CANCEL);
    if (answer.getSelectedButton() !== ui.Button.OK || cleanName(answer.getResponseText()).toUpperCase() !== 'RESET') {
      return { ok: false, cancelled: true };
    }
  }
  var clearBodyOf = function (sh, width) { if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, width).clearContent(); };
  var template = findProgramTemplate();
  var rows = templateProgramRows(template);
  var library = planLibraryMerge([], exerciseLibrary()).rows;

  withSummaryPaused(function () {
    clearBodyOf(log, LOG_HEADERS.length);
    clearBodyOf(archive, ARCHIVE_HEADERS.length);
    clearBodyOf(session, SESSION_HEADERS.length);
    paintSessionDays(session, []);
    clearBodyOf(map, MAP_HEADERS.length);
    map.getRange(2, 1, library.length, MAP_HEADERS.length).setValues(library);
    clearBodyOf(program, PROGRAM_HEADERS.length);
    program.getRange(2, 1, rows.length, PROGRAM_HEADERS.length).setValues(rows);
    var put = function (key, value) { settings.getRange(SETTINGS_ROWS[key], 2).setValue(value); };
    put('WEEK', DEFAULTS.week);
    put('MESO_NAME', 'Meso 1');
    put('MESO_WEEKS', DEFAULTS.mesoWeeks);
    put('RIR_LADDER', DEFAULTS.rirLadder.join(','));
    put('REP_MIN', DEFAULTS.repMin);
    put('REP_MAX', DEFAULTS.repMax);
    put('ACTION', SETTINGS_ACTIONS.NONE);
    if (!opts || !opts.keepTestBackup) dropTestBackup(ss);   // a killed test run's backup would carry the old data into the copy
    refreshMuscleList(ss, library);
    buildSession({ interactive: false });
  });
  setupGuide(ss, true);
  refreshSummarySafe(ss);
  var done = 'Ready for a new user: Log, Archive and Sessions cleared, Program = "' + template.name + '", Exercise Map = the library, week 1. Preferences kept.';
  setStatus(ss, done);
  var guide = ss.getSheetByName(TABS.GUIDE);
  if (guide) ss.setActiveSheet(guide);
  ss.toast(done, 'Workout Tracker', 8);
  return { ok: true };
}
