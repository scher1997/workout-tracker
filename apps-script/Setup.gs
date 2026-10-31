/**
 * Setup.gs — creates tabs, headers, dropdowns, protection, menu and phone trigger.
 * Idempotent: existing tabs and their data are never wiped.
 */

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Workout')
    .addItem('Set up workbook', 'setupWorkbook')
    .addItem('Build session', 'buildSession')
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
  renameLegacySessionTab(ss);
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
  seedProgramFromMap(ss);
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

/** The Session tab became Sessions: rename the old one in place so its data stays. */
function renameLegacySessionTab(ss) {
  var old = ss.getSheetByName('Session');
  if (old && !ss.getSheetByName(TABS.SESSION)) old.setName(TABS.SESSION);
}

function setupHeaderTab(ss, name, headers) {
  var sh = ss.getSheetByName(name);
  sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold').setBackground('#e8eaed');
  sh.setFrozenRows(1);
}

function listRule(values) {
  return SpreadsheetApp.newDataValidation().requireValueInList(values, true).setAllowInvalid(false).build();
}

/** Number rule: the phone shows the number pad for cells that only take numbers. Rejects text. */
function numberRule(min, max) {
  var b = SpreadsheetApp.newDataValidation().requireNumberBetween(min, max).setAllowInvalid(false)
    .setHelpText('Numbers only (' + min + ' to ' + max + ')');
  return b.build();
}

/** Pure: Program rows (Day, Exercise, Sets, Start Weight, Rep Min, Rep Max) from Exercise Map rows, split evenly over days. */
function planSeedProgram(mapRows, days, sets) {
  var names = mapRows.map(function (r) { return cleanName(r[0]); }).filter(function (n) { return n; });
  var perDay = Math.ceil(names.length / days.length);
  return names.map(function (n, i) {
    return [days[Math.min(Math.floor(i / perDay), days.length - 1)], n, sets, '', '', ''];
  });
}

/** Empty Program -> starter plan from the Exercise Map, so Build Session works straight away. Never touches existing rows. */
function seedProgramFromMap(ss) {
  var program = ss.getSheetByName(TABS.PROGRAM);
  var map = ss.getSheetByName(TABS.MAP);
  if (program.getLastRow() > 1) return;
  var mapRows = map.getLastRow() > 1 ? map.getRange(2, 1, map.getLastRow() - 1, 1).getValues() : [];
  var rows = planSeedProgram(mapRows, SEED_PROGRAM.days, SEED_PROGRAM.sets);
  if (rows.length) program.getRange(2, 1, rows.length, PROGRAM_HEADERS.length).setValues(rows);
}

function setupProgramValidation(ss) {
  var program = ss.getSheetByName(TABS.PROGRAM);
  var map = ss.getSheetByName(TABS.MAP);
  // Warn-only so a pasted old plan with unknown names still lands.
  var rule = SpreadsheetApp.newDataValidation()
    .requireValueInRange(map.getRange('A2:A1000'), true).setAllowInvalid(true).build();
  program.getRange('B2:B1000').setDataValidation(rule);
  // Numeric Program columns: Sets, Start Weight, Rep Min, Rep Max (number pad on the phone).
  program.getRange('C2:C1000').setDataValidation(numberRule(1, 20));
  program.getRange('D2:D1000').setDataValidation(numberRule(0, 2000));
  program.getRange('E2:F1000').setDataValidation(numberRule(1, 100));
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
  // Number-only entry cells: weight, rep target, reps per set, actual RIR.
  var applyRule = function (col, rule) { sh.getRange(2, col, 200, 1).setDataValidation(rule); };
  applyRule(SESSION_COLS.REC_WEIGHT, numberRule(0, 2000));
  applyRule(SESSION_COLS.ACTUAL_WEIGHT, numberRule(0, 2000));
  applyRule(SESSION_COLS.REP_TARGET, numberRule(0, 100));
  applyRule(SESSION_COLS.ACTUAL_RIR, numberRule(0, 10));
  SESSION_REP_COLS.forEach(function (c) { applyRule(c, numberRule(0, 100)); });
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
  if (r.getColumn() !== 2 || r.getRow() !== SETTINGS_ROWS.ACTION) return;
  runSettingsAction(r);
}

/** Reset the Action cell first (so the phone shows it done), say it started, then run the picked action. */
function runSettingsAction(r) {
  var A = SETTINGS_ACTIONS;
  var picked = String(r.getValue());
  if (picked === A.NONE || picked === '') return;
  r.setValue(A.NONE);
  var ss = r.getSheet().getParent();
  setStatus(ss, 'Working: ' + picked + ' ...');
  SpreadsheetApp.flush();
  if (picked === A.BUILD) buildSession({ interactive: false });
  else if (picked === A.CLEAR) clearSession({ interactive: false });
  else if (picked === A.WEEK) completeWeek({ interactive: false });
  else if (picked === A.DELOAD) makeDeloadWeek();
  else if (picked === A.NEW_MESO) startNewMesocycle({ interactive: false });
  else if (picked === A.SUMMARY) refreshSummaryNow();
  else setStatus(ss, 'Unknown action: ' + picked);
}
