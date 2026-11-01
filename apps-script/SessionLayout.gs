/**
 * SessionLayout.gs — how the Sessions tab works for the person training (Pass 10C).
 *  - Actual RIR and Actual Weight start out equal to Target RIR and Rec Weight and show in gray; typing anything
 *    different turns them black (conditional formatting, so it also works from the phone). They are real numbers, not
 *    formulas, so the phone keeps its number pad. Untouched defaults are not "entered data".
 *  - Week, Day and Exercise stay frozen on the left so the exercise being edited is always in view.
 * Everything above "Sheet side" is pure (no SpreadsheetApp) so it runs under Node tests.
 */

/** Copies of the Session rows with Actual RIR / Actual Weight filled from Target RIR / Rec Weight where blank. */
function fillActualDefaults(rows) {
  return rows.map(function (r) {
    var c = r.slice();
    if (c[SESSION_COLS.ACTUAL_RIR - 1] === '') c[SESSION_COLS.ACTUAL_RIR - 1] = c[SESSION_COLS.RIR - 1];
    if (c[SESSION_COLS.ACTUAL_WEIGHT - 1] === '') c[SESSION_COLS.ACTUAL_WEIGHT - 1] = c[SESSION_COLS.REC_WEIGHT - 1];
    return c;
  });
}

/** True if the user typed something in this Session row: any entry cell, or an Actual value that differs from its default. */
function rowHasUserInput(row) {
  var differs = function (actualCol, defaultCol) {
    var actual = parseNumber(row[actualCol - 1]);
    if (actual !== null) return actual !== parseNumber(row[defaultCol - 1]);
    return cleanName(row[actualCol - 1]) !== '';   // text where a number belongs counts as typed
  };
  var typed = SESSION_ENTRY_COLS.some(function (c) {
    if (c === SESSION_COLS.ACTUAL_RIR || c === SESSION_COLS.ACTUAL_WEIGHT) return false;
    return row[c - 1] !== '';
  });
  return typed || differs(SESSION_COLS.ACTUAL_RIR, SESSION_COLS.RIR) || differs(SESSION_COLS.ACTUAL_WEIGHT, SESSION_COLS.REC_WEIGHT);
}

/** Column number -> letter (1 -> A, 27 -> AA). */
function colLetter(n) {
  var s = '';
  for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

/** Conditional-format formula: the Actual cell (not blank) still equals its default in the same row. */
function defaultLookFormula(actualCol, defaultCol) {
  var a = '$' + colLetter(actualCol) + '2', d = '$' + colLetter(defaultCol) + '2';
  return '=AND(' + a + '<>"",' + a + '=' + d + ')';
}

// ---------------------------------------------------------------- Sheet side

/** Set up workbook step: frozen columns, their widths, and the gray-while-default rules. Idempotent. */
function setupSessionLayout(ss) {
  var sh = ss.getSheetByName(TABS.SESSION);
  sh.setFrozenColumns(SESSION_FROZEN_COLS);
  SESSION_FROZEN_WIDTHS.forEach(function (w) { sh.setColumnWidth(w[0], w[1]); });
  var rows = sh.getMaxRows() - 1;
  var rules = [[SESSION_COLS.ACTUAL_RIR, SESSION_COLS.RIR], [SESSION_COLS.ACTUAL_WEIGHT, SESSION_COLS.REC_WEIGHT]].map(function (p) {
    return SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied(defaultLookFormula(p[0], p[1]))
      .setFontColor(ACTUAL_DEFAULT_COLOR)
      .setRanges([sh.getRange(2, p[0], rows, 1)])
      .build();
  });
  sh.setConditionalFormatRules(rules);
}

/**
 * Called from the onEdit trigger: Rec Weight changed on one row, so an Actual Weight that was still the old default
 * follows it. Does nothing for pastes, other columns, or an Actual Weight the user already changed.
 */
function followRecWeightEdit(range, oldValue) {
  if (range.getNumRows() !== 1 || range.getNumColumns() !== 1) return;
  if (range.getColumn() !== SESSION_COLS.REC_WEIGHT || range.getRow() < 2) return;
  var oldWeight = parseNumber(oldValue), newWeight = parseNumber(range.getValue());
  if (oldWeight === null || newWeight === null) return;
  var actual = range.getSheet().getRange(range.getRow(), SESSION_COLS.ACTUAL_WEIGHT);
  if (parseNumber(actual.getValue()) === oldWeight) actual.setValue(newWeight);
}
