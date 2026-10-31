/**
 * Setup.gs — creates tabs, headers, dropdowns, protection, menu and phone trigger.
 * Idempotent: existing tabs and their data are never wiped.
 */

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Workout')
    .addItem('Set up workbook', 'setupWorkbook')
    .addItem('Build session', 'buildSession')
    .addItem('Complete session (log it)', 'completeSession')
    .addItem('Clear session', 'clearSession')
    .addSeparator()
    .addItem('Complete week (roll to next week)', 'completeWeek')
    .addItem('Make this week a deload', 'makeDeloadWeek')
    .addItem('Start new mesocycle (archive + reset)', 'startNewMesocycle')
    .addSeparator()
    .addItem('Refresh muscle summary + trends', 'refreshSummaryNow')
    .addSeparator()
    .addItem('Run tests', 'runAllTests')
    .addItem('Run sheet tests', 'runSheetTests')
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
  ss.getSheetByName(TABS.SESSION).setColumnWidth(SESSION_COLS.FLAGS, 320);
  setupHeaderTab(ss, TABS.LOG, LOG_HEADERS);
  ss.getSheetByName(TABS.LOG).getRange('A2:A').setNumberFormat('yyyy-mm-dd');
  setupHeaderTab(ss, TABS.ARCHIVE, ARCHIVE_HEADERS);
  ss.getSheetByName(TABS.ARCHIVE).getRange(2, ARCHIVE_COLS.DATE, 999, 1).setNumberFormat('yyyy-mm-dd');
  setupHeaderTab(ss, TABS.SUMMARY, [SUMMARY.headerLabel]);
  setupTrends(ss);

  if (fresh[TABS.MAP]) {
    ss.getSheetByName(TABS.MAP).getRange(2, 1, SEED_EXERCISE_MAP.length, 2).setValues(SEED_EXERCISE_MAP);
  }
  setupProgramValidation(ss);
  setupSessionValidation(ss);
  setupSessionProtection(ss);
  installPhoneTrigger(ss);
  refreshSummarySafe(ss);   // fills Muscle Summary + Trends (needs the Map and Settings rows above)
  setupSummaryProtection(ss);

  // Drop the empty default sheet and put tabs in a sensible order.
  var blank = ss.getSheetByName('Sheet1');
  if (blank && blank.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(blank);
  [TABS.SETTINGS, TABS.PROGRAM, TABS.SESSION, TABS.LOG, TABS.ARCHIVE, TABS.SUMMARY, TABS.TRENDS, TABS.MAP].forEach(function (n, i) {
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
  labels[SETTINGS_ROWS.CLEAR_BOX] = 'Clear Session (tick)';
  labels[SETTINGS_ROWS.COMPLETE_BOX] = 'Complete Session (tick)';
  labels[SETTINGS_ROWS.WEEK_BOX] = 'Complete Week (tick)';
  labels[SETTINGS_ROWS.DELOAD_AT_END] = 'Deload after last week (on/off)';
  labels[SETTINGS_ROWS.DELOAD_BOX] = 'Deload this week (tick)';
  labels[SETTINGS_ROWS.MESO_NAME] = 'Mesocycle name (Archive label)';
  labels[SETTINGS_ROWS.NEW_MESO_BOX] = 'Start New Mesocycle (tick)';
  labels[SETTINGS_ROWS.INCL_SECONDARY] = 'Summary: count secondary muscles';
  labels[SETTINGS_ROWS.INCL_TERTIARY] = 'Summary: count tertiary muscles';
  labels[SETTINGS_ROWS.SECONDARY_WEIGHT] = 'Secondary muscle credit per set';
  labels[SETTINGS_ROWS.TERTIARY_WEIGHT] = 'Tertiary muscle credit per set';
  labels[SETTINGS_ROWS.SUMMARY_BOX] = 'Refresh Muscle Summary (tick)';
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
  sh.getRange(SETTINGS_ROWS.CLEAR_BOX, 2).insertCheckboxes();
  sh.getRange(SETTINGS_ROWS.COMPLETE_BOX, 2).insertCheckboxes();
  sh.getRange(SETTINGS_ROWS.WEEK_BOX, 2).insertCheckboxes();
  var atEnd = sh.getRange(SETTINGS_ROWS.DELOAD_AT_END, 2);
  var atEndWas = atEnd.getValue();
  atEnd.insertCheckboxes();
  if (atEndWas === '') atEnd.setValue(true);   // a persistent setting, on by default; never reset by onSettingsEdit
  sh.getRange(SETTINGS_ROWS.DELOAD_BOX, 2).insertCheckboxes();
  var mesoName = sh.getRange(SETTINGS_ROWS.MESO_NAME, 2);
  if (cleanName(mesoName.getValue()) === '') mesoName.setNumberFormat('@').setValue('Meso 1');
  sh.getRange(SETTINGS_ROWS.NEW_MESO_BOX, 2).insertCheckboxes();
  // Persistent summary options (like the deload toggle, never reset by onSettingsEdit).
  sh.getRange(SETTINGS_ROWS.INCL_SECONDARY, 2).insertCheckboxes();
  sh.getRange(SETTINGS_ROWS.INCL_TERTIARY, 2).insertCheckboxes();
  var secW = sh.getRange(SETTINGS_ROWS.SECONDARY_WEIGHT, 2);
  if (secW.getValue() === '') secW.setValue(SUMMARY.secondaryWeight);
  var terW = sh.getRange(SETTINGS_ROWS.TERTIARY_WEIGHT, 2);
  if (terW.getValue() === '') terW.setValue(SUMMARY.tertiaryWeight);
  sh.getRange(SETTINGS_ROWS.SUMMARY_BOX, 2).insertCheckboxes();
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
  // Clear first so dropdowns left on columns that moved in a layout change don't linger.
  sh.getRange(2, 1, 200, SESSION_HEADERS.length).clearDataValidations();
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

/** Trends tab: labels, the metric dropdown (the item dropdown is filled by refreshTrends). */
function setupTrends(ss) {
  var sh = ss.getSheetByName(TABS.TRENDS);
  var L = TRENDS_LAYOUT;
  sh.getRange(L.ITEM_ROW, 1, 3, 1).setValues([['Show'], ['Metric'], ['Note']]).setFontWeight('bold').setBackground('#e8eaed');
  sh.getRange(L.METRIC_ROW, L.VALUE_COL).setDataValidation(listRule(SUMMARY.metrics));
  sh.setColumnWidth(1, 90);
  sh.setColumnWidth(L.VALUE_COL, 260);
  sh.getRange(1, L.DATA_COL, 1, 2).setFontWeight('bold');
  sh.getRange(1, L.ITEMS_COL).setFontWeight('bold');
}

/** Warning-only protection on the script-written tabs; the Trends dropdown cells stay free. */
function setupSummaryProtection(ss) {
  var summary = ss.getSheetByName(TABS.SUMMARY);
  summary.getProtections(SpreadsheetApp.ProtectionType.SHEET).forEach(function (p) { p.remove(); });
  summary.protect().setDescription('Script-managed').setWarningOnly(true);
  var trends = ss.getSheetByName(TABS.TRENDS);
  trends.getProtections(SpreadsheetApp.ProtectionType.RANGE).forEach(function (p) { p.remove(); });
  trends.getRange(1, TRENDS_LAYOUT.DATA_COL, trends.getMaxRows(), TRENDS_LAYOUT.ITEMS_COL - TRENDS_LAYOUT.DATA_COL + 1)
    .protect().setDescription('Script-managed').setWarningOnly(true);
  trends.getRange(TRENDS_LAYOUT.NOTE_ROW, TRENDS_LAYOUT.VALUE_COL).protect().setDescription('Script-managed').setWarningOnly(true);
}

/** Installable onEdit so the Settings checkbox can build the session from the phone. */
function installPhoneTrigger(ss) {
  var exists = ScriptApp.getProjectTriggers().some(function (t) {
    return t.getHandlerFunction() === 'onSettingsEdit';
  });
  if (!exists) ScriptApp.newTrigger('onSettingsEdit').forSpreadsheet(ss).onEdit().create();
}

/**
 * The one installable onEdit handler (name kept so existing triggers keep working).
 * Settings checkboxes run actions; editing Rec Weight on Session recalculates Rep Target;
 * editing Soreness on Session re-derives Target RIR and the under-recovered flag.
 */
function onSettingsEdit(e) {
  if (!e || !e.range) return;
  var r = e.range;
  var sheetName = r.getSheet().getName();
  if (sheetName === TABS.SESSION) {
    recalcRepsForWeightEdit(r, e.oldValue);
    applySorenessEdit(r);
    return;
  }
  if (sheetName === TABS.MAP) {
    refreshSummarySafe(r.getSheet().getParent());   // new exercise or muscle group: summary follows, no code change
    return;
  }
  if (sheetName === TABS.TRENDS) {
    onTrendsEdit(r);
    return;
  }
  if (sheetName !== TABS.SETTINGS) return;
  if (r.getColumn() === 2 && r.getRow() >= SETTINGS_ROWS.INCL_SECONDARY && r.getRow() <= SETTINGS_ROWS.TERTIARY_WEIGHT) {
    refreshSummarySafe(r.getSheet().getParent());
    return;
  }
  if (r.getColumn() !== 2 || r.getValue() !== true) return;
  if (r.getRow() === SETTINGS_ROWS.BUILD_BOX) {
    r.setValue(false);
    buildSession({ interactive: false });
  } else if (r.getRow() === SETTINGS_ROWS.CLEAR_BOX) {
    r.setValue(false);
    clearSession({ interactive: false });
  } else if (r.getRow() === SETTINGS_ROWS.COMPLETE_BOX) {
    r.setValue(false);
    completeSession({ interactive: false });
  } else if (r.getRow() === SETTINGS_ROWS.WEEK_BOX) {
    r.setValue(false);
    completeWeek({ interactive: false });
  } else if (r.getRow() === SETTINGS_ROWS.DELOAD_BOX) {
    r.setValue(false);
    makeDeloadWeek();
  } else if (r.getRow() === SETTINGS_ROWS.NEW_MESO_BOX) {
    r.setValue(false);
    startNewMesocycle({ interactive: false });
  } else if (r.getRow() === SETTINGS_ROWS.SUMMARY_BOX) {
    r.setValue(false);
    refreshSummaryNow();
  }
}
