/**
 * ExerciseMapGuard.gs — keeps duplicate exercise names out of the Exercise Map.
 * Typing a name that is already there is rejected by data validation. A paste or a script write skips validation, so a
 * duplicate that gets in anyway turns red and is named in Status (on a Map edit and when Sessions are built).
 * Names match like everywhere else: case and spacing are ignored.
 * Everything above "Sheet side" is pure (no SpreadsheetApp) so it runs under Node tests.
 */

/** Exercises that appear more than once: [{name, rows: [sheet row numbers]}] in first-seen order. mapRows = Map body from row 2. */
function duplicateExercises(mapRows) {
  var seen = {}, order = [];
  mapRows.forEach(function (r, i) {
    var key = normalizeName(r[0]);
    if (!key) return;
    if (!seen[key]) { seen[key] = { name: cleanName(r[0]), rows: [] }; order.push(key); }
    seen[key].rows.push(i + 2);
  });
  return order.map(function (k) { return seen[k]; }).filter(function (d) { return d.rows.length > 1; });
}

/** One Status line for duplicateExercises() output; '' when there are none. */
function duplicateWarning(dups) {
  if (!dups.length) return '';
  var shown = dups.slice(0, 3).map(function (d) { return '"' + d.name + '" (rows ' + d.rows.join(', ') + ')'; });
  return 'Duplicate in Exercise Map: ' + shown.join('; ') + (dups.length > 3 ? ' and ' + (dups.length - 3) + ' more' : '')
    + '. Delete or rename one.';
}

/** Sheets formula: how many Exercise Map names equal the one in `cell` (TRIM and LOWER match normalizeName). */
function duplicateCountFormula(cell) {
  return 'SUMPRODUCT(--(LOWER(TRIM($A$2:$A$' + MAP_LAST_ROW + '))=LOWER(TRIM(' + cell + '))))';
}

// ---- Sheet side -------------------------------------------------------------------------------------------------

/** Set up workbook step: reject a typed duplicate, tint any duplicate that got in by paste. Idempotent; this tab's format rules are ours. */
function setupMapGuard(ss) {
  var sh = ss.getSheetByName(TABS.MAP);
  var names = sh.getRange(2, 1, MAP_LAST_ROW - 1, 1);
  names.setDataValidation(SpreadsheetApp.newDataValidation()
    .requireFormulaSatisfied('=' + duplicateCountFormula('A2') + '=1')
    .setAllowInvalid(false).setHelpText('That exercise is already in the Exercise Map.').build());
  sh.setConditionalFormatRules([SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=AND(A2<>"",' + duplicateCountFormula('A2') + '>1)')
    .setBackground(MAP_DUPLICATE_COLOR).setRanges([names]).build()]);
}

/** Name any duplicates in Status (does nothing when there are none, so it never wipes another message). Returns them. */
function reportMapDuplicates(ss) {
  var map = ss.getSheetByName(TABS.MAP);
  var dups = map ? duplicateExercises(readMapBody(map)) : [];
  if (dups.length) setStatus(ss, duplicateWarning(dups));
  return dups;
}
