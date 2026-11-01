/**
 * SessionLayout.gs — how the Sessions tab works for the person training (Pass 10C/10D).
 *  - A built week is prefilled: S1..S<Sets> with the Rep Target (week 1: the low end of the rep range), Actual RIR and
 *    Actual Weight with Target RIR and Rec Weight. They are real numbers (the phone keeps its number pad) and show in
 *    gray until typed over (conditional formatting, so it works from the phone too).
 *  - Because every set is prefilled, reps no longer say whether an exercise was done. An exercise counts as done once
 *    Pump, Tendon and Connection are all filled in; Complete Week refuses while an exercise has been started
 *    (changed reps, weight, RIR, notes or a rating) but is missing ratings, and warns about exercises never touched.
 *  - Exercise is the one frozen column; Week, Day, Rep Range and Rep Target stay in the data but are hidden.
 * Everything above "Sheet side" is pure (no SpreadsheetApp) so it runs under Node tests.
 */

/** Copies of the Session rows with S1..S<Sets>, Actual RIR and Actual Weight prefilled where blank. */
function fillSessionDefaults(rows) {
  return rows.map(function (r) {
    var c = r.slice();
    var sets = Math.min(toPosInt(c[SESSION_COLS.SETS - 1], 0), SESSION_REP_COLS.length);
    for (var i = 0; i < sets; i++) {
      if (c[SESSION_REP_COLS[i] - 1] === '') c[SESSION_REP_COLS[i] - 1] = c[SESSION_COLS.REP_TARGET - 1];
    }
    if (c[SESSION_COLS.ACTUAL_RIR - 1] === '') c[SESSION_COLS.ACTUAL_RIR - 1] = c[SESSION_COLS.RIR - 1];
    if (c[SESSION_COLS.ACTUAL_WEIGHT - 1] === '') c[SESSION_COLS.ACTUAL_WEIGHT - 1] = c[SESSION_COLS.REC_WEIGHT - 1];
    return c;
  });
}

/** True if an entry cell holds something other than its prefill (default = the number it would have been built with). */
function differsFromDefault(value, defaultValue) {
  var typed = parseNumber(value);
  if (typed !== null) return typed !== parseNumber(defaultValue);
  return cleanName(value) !== '';   // text where a number belongs counts as typed
}

/** Rating dropdown headers (Pump, Tendon, Connection) that are still blank in this row, lower case. */
function missingRatings(row) {
  return SESSION_RATING_COLS.filter(function (c) { return cleanName(row[c - 1]) === ''; })
    .map(function (c) { return SESSION_HEADERS[c - 1].toLowerCase(); });
}

/** Done = a named exercise with every rating filled in. */
function rowIsDone(row) {
  return cleanName(row[SESSION_COLS.EXERCISE - 1]) !== '' && missingRatings(row).length === 0;
}

/** Started = the person did something after training: changed a set, weight or RIR, wrote notes, or chose a rating. */
function rowStarted(row) {
  if (cleanName(row[SESSION_COLS.EXERCISE - 1]) === '') return false;
  var planned = Math.min(toPosInt(row[SESSION_COLS.SETS - 1], 0), SESSION_REP_COLS.length);
  var target = row[SESSION_COLS.REP_TARGET - 1];
  var repsChanged = SESSION_REP_COLS.some(function (c, i) {
    var v = row[c - 1];
    if (i < planned) return parseNumber(target) === null ? cleanName(v) !== '' : differsFromDefault(v, target) || cleanName(v) === '';   // a cleared planned set counts
    return cleanName(v) !== '';
  });
  var changed = repsChanged
    || differsFromDefault(row[SESSION_COLS.ACTUAL_RIR - 1], row[SESSION_COLS.RIR - 1])
    || differsFromDefault(row[SESSION_COLS.ACTUAL_WEIGHT - 1], row[SESSION_COLS.REC_WEIGHT - 1]);
  var written = SESSION_RATING_COLS.concat([SESSION_COLS.NOTES]).some(function (c) { return cleanName(row[c - 1]) !== ''; });
  return changed || written;
}

/** Started but not done: this is what stops Complete Week until the missing ratings are filled in. */
function rowUnfinished(row) {
  return rowStarted(row) && !rowIsDone(row);
}

/** True if the user typed anything in this Session row, soreness (chosen before training) included. */
function rowHasUserInput(row) {
  return rowStarted(row) || cleanName(row[SESSION_COLS.SORENESS - 1]) !== '';
}

/** Column number -> letter (1 -> A, 27 -> AA). */
function colLetter(n) {
  var s = '';
  for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

/** Conditional-format formula: the entry cell (not blank) still equals its default in the same row. */
function defaultLookFormula(entryCol, defaultCol) {
  var a = '$' + colLetter(entryCol) + '2', d = '$' + colLetter(defaultCol) + '2';
  return '=AND(' + a + '<>"",' + a + '=' + d + ')';
}

/** [entry column, the column holding its default] for every gray-while-default cell. */
function defaultLookPairs() {
  var pairs = [[SESSION_COLS.ACTUAL_RIR, SESSION_COLS.RIR], [SESSION_COLS.ACTUAL_WEIGHT, SESSION_COLS.REC_WEIGHT]];
  SESSION_REP_COLS.forEach(function (c) { pairs.push([c, SESSION_COLS.REP_TARGET]); });
  return pairs;
}

// ---------------------------------------------------------------- Sheet side

/** Set up workbook step: Exercise frozen, helper columns hidden, gray-while-default rules. Idempotent. */
function setupSessionLayout(ss) {
  var sh = ss.getSheetByName(TABS.SESSION);
  sh.setFrozenColumns(SESSION_FROZEN_COLS);
  SESSION_FROZEN_WIDTHS.forEach(function (w) { sh.setColumnWidth(w[0], w[1]); });
  SESSION_HIDDEN_COLS.forEach(function (c) { sh.hideColumns(c); });
  var rows = sh.getMaxRows() - 1;
  sh.setConditionalFormatRules(defaultLookPairs().map(function (p) {
    return SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied(defaultLookFormula(p[0], p[1]))
      .setFontColor(ACTUAL_DEFAULT_COLOR)
      .setRanges([sh.getRange(2, p[0], rows, 1)])
      .build();
  }));
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

/** The Rep Target of one row changed: planned sets that still hold the old target follow it (typed reps stay). */
function followRepTarget(sh, sheetRow, rowValues, newTarget) {
  var oldTarget = parseNumber(rowValues[SESSION_COLS.REP_TARGET - 1]);
  if (oldTarget === null) return;
  var planned = Math.min(toPosInt(rowValues[SESSION_COLS.SETS - 1], 0), SESSION_REP_COLS.length);
  SESSION_REP_COLS.slice(0, planned).forEach(function (c) {
    if (parseNumber(rowValues[c - 1]) === oldTarget) sh.getRange(sheetRow, c).setValue(newTarget);
  });
}
