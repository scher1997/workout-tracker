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

/** Values from the old layout (header "Setting" in A1) keyed like SETTINGS_ROWS, or null if not on the old layout. */
function readLegacySettings(sh) {
  if (sh.getLastRow() < 1 || String(sh.getRange(1, 1).getValue()) !== 'Setting') return null;
  var out = {};
  Object.keys(LEGACY_SETTINGS_ROWS).forEach(function (k) {
    var v = sh.getRange(LEGACY_SETTINGS_ROWS[k], 2).getValue();
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

  // Action boxes untick themselves (onSettingsEdit); the persistent toggles below never do.
  ['BUILD_BOX', 'COMPLETE_BOX', 'WEEK_BOX', 'CLEAR_BOX', 'DELOAD_BOX', 'SUMMARY_BOX', 'NEW_MESO_BOX'].forEach(function (k) {
    sh.getRange(SETTINGS_ROWS[k], 2).insertCheckboxes();
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
