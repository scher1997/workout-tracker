/**
 * Setup.gs — creates tabs, headers, dropdowns, protection, menu and phone trigger.
 * Idempotent: existing tabs and their data are never wiped.
 */

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Workout')
    .addItem('Set up workbook', 'setupWorkbook')
    .addItem('Build session', 'buildSession')
    .addSeparator()
    .addItem('Run tests', 'runAllTests')
    .addToUi();
}

function setupWorkbook() {
  var ss = SpreadsheetApp.getActive();
  Logger.log('setupWorkbook target: "' + ss.getName() + '" id=' + ss.getId() + ' url=' + ss.getUrl()
    + ' tabs before=' + ss.getSheets().map(function (s) { return s.getName(); }).join(','));
  var fresh = {};
  Object.keys(TABS).forEach(function (k) {
    var name = TABS[k];
    var sh = ss.getSheetByName(name);
    fresh[name] = !sh;
    if (!sh) ss.insertSheet(name);
  });

  setupSettings(ss, fresh[TABS.SETTINGS]);
  setupHeaderTab(ss, TABS.PROGRAM, PROGRAM_HEADERS);
  setupHeaderTab(ss, TABS.MAP, MAP_HEADERS);
  setupHeaderTab(ss, TABS.SESSION, SESSION_HEADERS);
  setupHeaderTab(ss, TABS.LOG, LOG_HEADERS);
  setupHeaderTab(ss, TABS.SUMMARY, ['Muscle Group']);

  if (fresh[TABS.MAP]) {
    ss.getSheetByName(TABS.MAP).getRange(2, 1, SEED_EXERCISE_MAP.length, 2).setValues(SEED_EXERCISE_MAP);
  }
  setupProgramValidation(ss);
  setupSessionValidation(ss);
  setupSessionProtection(ss);
  installPhoneTrigger(ss);

  // Drop the empty default sheet and put tabs in a sensible order.
  var blank = ss.getSheetByName('Sheet1');
  if (blank && blank.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(blank);
  [TABS.SETTINGS, TABS.PROGRAM, TABS.SESSION, TABS.LOG, TABS.SUMMARY, TABS.MAP].forEach(function (n, i) {
    ss.setActiveSheet(ss.getSheetByName(n));
    ss.moveActiveSheet(i + 1);
  });
  ss.setActiveSheet(ss.getSheetByName(TABS.SETTINGS));
  SpreadsheetApp.flush();
  Logger.log('setupWorkbook done. tabs after=' + ss.getSheets().map(function (s) { return s.getName(); }).join(','));
  ss.toast('Workbook ready: ' + ss.getSheets().length + ' tabs in "' + ss.getName() + '"', 'Workout Tracker', 6);
}

function setupHeaderTab(ss, name, headers) {
  var sh = ss.getSheetByName(name);
  sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold').setBackground('#e8eaed');
  sh.setFrozenRows(1);
}

function setupSettings(ss, isNew) {
  var sh = ss.getSheetByName(TABS.SETTINGS);
  var labels = {};
  labels[SETTINGS_ROWS.WEEK] = 'Current week';
  labels[SETTINGS_ROWS.MESO_WEEKS] = 'Mesocycle length (weeks)';
  labels[SETTINGS_ROWS.RIR_LADDER] = 'Target RIR by week (comma list)';
  labels[SETTINGS_ROWS.REP_MIN] = 'Default rep min';
  labels[SETTINGS_ROWS.REP_MAX] = 'Default rep max';
  labels[SETTINGS_ROWS.BUILD_BOX] = 'Build Session (tick)';
  labels[SETTINGS_ROWS.STATUS] = 'Status';
  sh.getRange(1, 1, 1, 2).setValues([['Setting', 'Value']]).setFontWeight('bold').setBackground('#e8eaed');
  Object.keys(labels).forEach(function (r) { sh.getRange(Number(r), 1).setValue(labels[r]); });
  if (isNew) {
    sh.getRange(SETTINGS_ROWS.WEEK, 2).setValue(DEFAULTS.week);
    sh.getRange(SETTINGS_ROWS.MESO_WEEKS, 2).setValue(DEFAULTS.mesoWeeks);
    sh.getRange(SETTINGS_ROWS.RIR_LADDER, 2).setNumberFormat('@').setValue(DEFAULTS.rirLadder.join(','));
    sh.getRange(SETTINGS_ROWS.REP_MIN, 2).setValue(DEFAULTS.repMin);
    sh.getRange(SETTINGS_ROWS.REP_MAX, 2).setValue(DEFAULTS.repMax);
  }
  sh.getRange(SETTINGS_ROWS.BUILD_BOX, 2).insertCheckboxes();
  sh.setColumnWidth(1, 230);
  sh.setColumnWidth(2, 360);
}

function listRule(values) {
  return SpreadsheetApp.newDataValidation().requireValueInList(values, true).setAllowInvalid(false).build();
}

function setupProgramValidation(ss) {
  var program = ss.getSheetByName(TABS.PROGRAM);
  var map = ss.getSheetByName(TABS.MAP);
  // Warn-only so a pasted old plan with unknown names still lands.
  var rule = SpreadsheetApp.newDataValidation()
    .requireValueInRange(map.getRange('A2:A1000'), true).setAllowInvalid(true).build();
  program.getRange('B2:B1000').setDataValidation(rule);
}

function setupSessionValidation(ss) {
  var sh = ss.getSheetByName(TABS.SESSION);
  var apply = function (col, values) {
    sh.getRange(2, col, 200, 1).setDataValidation(listRule(values));
  };
  apply(SESSION_COLS.SORENESS, OPTIONS.soreness);
  apply(SESSION_COLS.PUMP, OPTIONS.pump);
  apply(SESSION_COLS.TENDON, OPTIONS.tendon);
  apply(SESSION_COLS.CONNECTION, OPTIONS.connection);
}

/** Warning-only protection: script-managed columns prompt before an edit but never lock out the owner. */
function setupSessionProtection(ss) {
  var sh = ss.getSheetByName(TABS.SESSION);
  sh.getProtections(SpreadsheetApp.ProtectionType.RANGE).forEach(function (p) { p.remove(); });
  SESSION_PROTECTED_COLS.forEach(function (c) {
    sh.getRange(1, c, 200, 1).protect().setDescription('Script-managed').setWarningOnly(true);
  });
}

/** Installable onEdit so the Settings checkbox can build the session from the phone. */
function installPhoneTrigger(ss) {
  var exists = ScriptApp.getProjectTriggers().some(function (t) {
    return t.getHandlerFunction() === 'onSettingsEdit';
  });
  if (!exists) ScriptApp.newTrigger('onSettingsEdit').forSpreadsheet(ss).onEdit().create();
}

function onSettingsEdit(e) {
  if (!e || !e.range) return;
  var r = e.range;
  if (r.getSheet().getName() !== TABS.SETTINGS) return;
  if (r.getRow() !== SETTINGS_ROWS.BUILD_BOX || r.getColumn() !== 2) return;
  if (r.getValue() !== true) return;
  r.setValue(false);
  buildSession({ interactive: false });
}
