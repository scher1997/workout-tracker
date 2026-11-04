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

/** Number of single-character edits (insert, delete, change) between two strings. */
function levenshtein(a, b) {
  var prev = [], j;
  for (j = 0; j <= b.length; j++) prev[j] = j;
  for (var i = 1; i <= a.length; i++) {
    var cur = [i];
    for (j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/**
 * Muscle names that are probably typos: used by few exercises (MUSCLE_TYPO.rareUses) yet a couple of letters away from a name
 * that many exercises use. A legitimately new group is only flagged if it is spelled almost like an existing one.
 * mapRows = Map body [exercise, primary, secondary, tertiary]. Returns [{name, near}] in map order.
 */
function muscleTypos(mapRows) {
  var uses = {}, display = {}, order = [];
  mapRows.forEach(function (r) {
    if (!normalizeName(r[0])) return;
    var inRow = {};
    [cleanName(r[1])].concat(parseMuscleList(r[2]), parseMuscleList(r[3])).forEach(function (m) {
      var key = normalizeName(m);
      if (key) inRow[key] = cleanName(m);
    });
    Object.keys(inRow).forEach(function (key) {   // a muscle counts once per exercise, whichever columns it is in
      if (!uses[key]) { uses[key] = 0; display[key] = inRow[key]; order.push(key); }
      uses[key]++;
    });
  });
  var T = MUSCLE_TYPO, out = [];
  order.forEach(function (key) {
    if (uses[key] > T.rareUses || key.length < T.minLength) return;
    var best = null, bestDistance = T.distance + 1;
    order.forEach(function (other) {
      if (other === key || uses[other] < T.commonUses || other.length < T.minLength) return;
      var d = levenshtein(key, other);
      if (d < bestDistance) { best = other; bestDistance = d; }
    });
    if (best) out.push({ name: display[key], near: display[best] });
  });
  return out;
}

/** One Status line for muscleTypos() output; '' when there are none. */
function muscleTypoWarning(typos) {
  if (!typos.length) return '';
  var shown = typos.slice(0, 3).map(function (t) { return '"' + t.name + '" looks like "' + t.near + '"'; });
  return 'Check muscle spelling in Exercise Map: ' + shown.join('; ') + (typos.length > 3 ? ' and ' + (typos.length - 3) + ' more' : '')
    + '. Fix it, or ignore this if it is a new muscle group.';
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

/**
 * Set up workbook step: the Muscle Group column (B) gets a dropdown of the muscle groups in use, fed by column F.
 * Warn-only: a new group can still be typed. Column F is script-written.
 */
function setupMuscleList(ss) {
  var sh = ss.getSheetByName(TABS.MAP), L = MAP_MUSCLE_LIST;
  sh.setColumnWidth(L.col, L.width);
  sh.getRange(2, 2, MAP_LAST_ROW - 1, 1).setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInRange(sh.getRange(2, L.col, L.rows - 1, 1), true).setAllowInvalid(true)
    .setHelpText('Pick a muscle group, or type a new one. Spell it the same way every time.').build());
  sh.getRange(1, L.col).setValue(L.header).setFontWeight('bold').setBackground('#e8eaed');
  sh.getProtections(SpreadsheetApp.ProtectionType.RANGE).forEach(function (p) { p.remove(); });
  sh.getRange(1, L.col, L.rows, 1).protect().setDescription('Script-managed').setWarningOnly(true);
  refreshMuscleList(ss);
}

/** Rewrite the muscle group list in column F from the map (mapRows optional: the Map body if already read). */
function refreshMuscleList(ss, mapRows) {
  var sh = ss.getSheetByName(TABS.MAP), L = MAP_MUSCLE_LIST;
  var muscles = buildMuscleRoles(mapRows || readMapBody(sh)).muscles.slice(0, L.rows - 1);
  sh.getRange(2, L.col, L.rows - 1, 1).clearContent();
  if (muscles.length) sh.getRange(2, L.col, muscles.length, 1).setValues(muscles.map(function (m) { return [m]; }));
}

/**
 * After a Map edit: say in Status if an exercise is in twice or a muscle looks misspelled. Does nothing when all is well,
 * so it never wipes another message. Returns {duplicates, typos}.
 */
function reportMapProblems(ss, mapRows) {
  var map = ss.getSheetByName(TABS.MAP);
  var rows = mapRows || (map ? readMapBody(map) : []);
  var found = { duplicates: duplicateExercises(rows), typos: muscleTypos(rows) };
  var message = [duplicateWarning(found.duplicates), muscleTypoWarning(found.typos)].filter(function (m) { return m; }).join(' ');
  if (message) setStatus(ss, message);
  return found;
}
