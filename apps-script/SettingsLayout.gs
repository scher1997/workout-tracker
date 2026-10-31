/**
 * SettingsLayout.gs — builds the Settings tab: three tables (Actions, Program setup, Preferences),
 * label in column A, value in column B, sized for a phone. Row numbers live in SETTINGS_ROWS (Config.gs).
 * Idempotent: values are kept. A workbook still on the old single-list layout is moved over once.
 */

/** First-time values for a brand-new Settings tab. */
function settingsSeed() {
  return {
    WEEK: DEFAULTS.week,
    MESO_WEEKS: DEFAULTS.mesoWeeks,
    RIR_LADDER: DEFAULTS.rirLadder.join(','),
    REP_MIN: DEFAULTS.repMin,
    REP_MAX: DEFAULTS.repMax
  };
}

/**
 * Values from an older Settings layout keyed like SETTINGS_ROWS, or null if the sheet is not on one.
 * Old single list: A1 = "Setting". Pass 8 tables: A1 = "ACTIONS" and a checkbox row labelled "Build Session" in A4.
 */
function readLegacySettings(sh) {
  if (sh.getLastRow() < 1) return null;
  var a1 = String(sh.getRange(1, 1).getValue());
  var rows = null;
  if (a1 === 'Setting') rows = LEGACY_SETTINGS_ROWS;
  else if (a1 === 'ACTIONS' && String(sh.getRange(4, 1).getValue()) === 'Build Session') rows = PASS8_SETTINGS_ROWS;
  if (!rows) return null;
  var out = {};
  Object.keys(rows).forEach(function (k) {
    var v = sh.getRange(rows[k], 2).getValue();
    if (v !== '') out[k] = v;
  });
  return out;
}

function setupSettings(ss, isNew) {
  var sh = ss.getSheetByName(TABS.SETTINGS);
  var carried = readLegacySettings(sh);
  if (carried) {
    sh.clear();
    sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns()).clearDataValidations();
  }
  var seed = carried || (isNew ? settingsSeed() : {});
  Object.keys(seed).forEach(function (k) {
    var cell = sh.getRange(SETTINGS_ROWS[k], 2);
    if (k === 'RIR_LADDER') cell.setNumberFormat('@');   // keep "3,2,1,0" as text
    cell.setValue(seed[k]);
  });

  SETTINGS_SECTIONS.forEach(function (s) { sh.getRange(s.row, 1, 1, 2).setValues([[s.title, s.hint]]); });
  Object.keys(SETTINGS_LABELS).forEach(function (k) { sh.getRange(SETTINGS_ROWS[k], 1).setValue(SETTINGS_LABELS[k]); });

  // One Action dropdown: pick an entry to run it; onSettingsEdit puts it back to "Choose action".
  var actionCell = sh.getRange(SETTINGS_ROWS.ACTION, 2);
  var actionValues = Object.keys(SETTINGS_ACTIONS).map(function (k) { return SETTINGS_ACTIONS[k]; });
  actionCell.setDataValidation(listRule(actionValues)).setValue(SETTINGS_ACTIONS.NONE);
  // Number-only cells get a number rule so the phone shows the number pad.
  ['MESO_WEEKS', 'REP_MIN', 'REP_MAX'].forEach(function (k) {
    sh.getRange(SETTINGS_ROWS[k], 2).setDataValidation(numberRule(1, 100));
  });
  ['SECONDARY_WEIGHT', 'TERTIARY_WEIGHT'].forEach(function (k) {
    sh.getRange(SETTINGS_ROWS[k], 2).setDataValidation(numberRule(0, 1));
  });
  var atEnd = sh.getRange(SETTINGS_ROWS.DELOAD_AT_END, 2);
  var atEndWas = atEnd.getValue();
  atEnd.insertCheckboxes();
  if (atEndWas === '') atEnd.setValue(true);   // on by default
  sh.getRange(SETTINGS_ROWS.INCL_SECONDARY, 2).insertCheckboxes();
  sh.getRange(SETTINGS_ROWS.INCL_TERTIARY, 2).insertCheckboxes();
  var secW = sh.getRange(SETTINGS_ROWS.SECONDARY_WEIGHT, 2);
  if (secW.getValue() === '') secW.setValue(SUMMARY.secondaryWeight);
  var terW = sh.getRange(SETTINGS_ROWS.TERTIARY_WEIGHT, 2);
  if (terW.getValue() === '') terW.setValue(SUMMARY.tertiaryWeight);
  var mesoName = sh.getRange(SETTINGS_ROWS.MESO_NAME, 2);
  if (cleanName(mesoName.getValue()) === '') mesoName.setNumberFormat('@').setValue('Meso 1');

  formatSettings(sh);
}

/** Look only: big type, tall rows, one bordered table per section. No values change here. */
function formatSettings(sh) {
  var lastRow = SETTINGS_SECTIONS[SETTINGS_SECTIONS.length - 1].last;
  sh.setHiddenGridlines(true);
  sh.setColumnWidth(1, 200);
  sh.setColumnWidth(2, 190);   // together about one phone screen wide
  sh.getRange(1, 1, lastRow, 2).setFontSize(12).setFontWeight('normal').setFontColor('#202124')
    .setVerticalAlignment('middle').setBackground('#ffffff');
  sh.getRange(2, 2, lastRow - 1, 1).setHorizontalAlignment('left');
  for (var r = 1; r <= lastRow; r++) {
    if (r !== SETTINGS_ROWS.STATUS) sh.setRowHeight(r, 38);   // Status keeps auto height so long messages wrap and show
  }
  sh.getRange(SETTINGS_ROWS.STATUS, 2).setWrap(true).setVerticalAlignment('top');
  sh.getRange(SETTINGS_ROWS.STATUS, 1).setVerticalAlignment('top');
  SETTINGS_SECTIONS.forEach(function (s) {
    sh.getRange(s.row, 1, 1, 2).setBackground('#1a73e8').setFontColor('#ffffff').setFontWeight('bold').setFontSize(14);
    sh.getRange(s.row, 2).setFontSize(11).setFontWeight('normal').setWrap(true);
    sh.getRange(s.row + 1, 1, s.last - s.row, 1).setFontWeight('bold');
    sh.getRange(s.row, 1, s.last - s.row + 1, 2)
      .setBorder(true, true, true, true, true, true, '#bdc1c6', SpreadsheetApp.BorderStyle.SOLID);
  });
}
