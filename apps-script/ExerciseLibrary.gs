/**
 * ExerciseLibrary.gs — the built-in exercise library and the loader that merges it into the Exercise Map tab.
 * The rows themselves live in ExerciseLibraryUpper.gs / ExerciseLibraryLower.gs ([Exercise, Primary, Secondary, Tertiary]).
 * Everything above "Sheet side" is pure (no SpreadsheetApp) so it runs under Node tests.
 *
 * Naming: equipment first, so variants stay distinct (Barbell / Dumbbell / Smith Machine Bulgarian Split Squat).
 * Hypertrophy focus: no bodyweight-only movements (push-ups, pull-ups, planks, ...). The GHD / hyperextension / side-bend
 * family is the one deliberate exception.
 */

// Primary muscles in the order they first appear in the library; the spine groups come last.
var LIBRARY_MUSCLES = {
  upper: ['Chest', 'Lats', 'Upper Back', 'Traps', 'Front Delts', 'Side Delts', 'Rear Delts', 'Biceps', 'Triceps', 'Forearms'],
  lower: ['Quads', 'Hamstrings', 'Glutes', 'Adductors', 'Calves', 'Abs'],
  spine: ['Spinal Extension', 'Spinal Flexion', 'Spinal Side Bend', 'Spinal Rotation']
};

/** All library rows, upper body first. Copies, so callers can't change the data. Concatenated at call time (no cross-file reads at load). */
function exerciseLibrary() {
  return EXERCISE_LIBRARY_UPPER.concat(EXERCISE_LIBRARY_LOWER).map(function (r) { return r.slice(); });
}

/** The four Map columns of a row, cleaned: [exercise, primary, secondary, tertiary]. */
function mapRowCells(r) {
  return [cleanName(r[0]), cleanName(r[1]), cleanName(r[2]), cleanName(r[3])];
}

/**
 * Merge the library into the Exercise Map rows. Library wins: the result is the library in library order, then the
 * user's own rows (names not in the library) in their order. A same-name row takes the library's muscles.
 * Returns {rows, added, updated, kept, changed}: counts, and whether the rows differ from existing (order included).
 */
function planLibraryMerge(existingRows, library) {
  var current = {}, extras = [];
  var existing = [];
  existingRows.forEach(function (r) {
    var cells = mapRowCells(r);
    if (!cells[0]) return;   // blank spacer
    existing.push(cells);
  });
  var inLibrary = {};
  library.forEach(function (r) { inLibrary[normalizeName(r[0])] = true; });
  existing.forEach(function (cells) {
    var key = normalizeName(cells[0]);
    if (inLibrary[key]) { if (!current[key]) current[key] = cells; }
    else extras.push(cells);
  });
  var added = 0, updated = 0;
  var rows = library.map(function (r) {
    var cells = mapRowCells(r);
    var old = current[normalizeName(cells[0])];
    if (!old) added++;
    else if (old.slice(1).join('|') !== cells.slice(1).join('|')) updated++;   // muscles differ (a casing-only difference is not an update)
    return cells;
  });
  rows = rows.concat(extras);
  return { rows: rows, added: added, updated: updated, kept: extras.length,
    changed: JSON.stringify(rows) !== JSON.stringify(existing) };
}

// ---- Sheet side -------------------------------------------------------------------------------------------------

/** Exercise Map body rows (all four columns); empty when the tab has only headers. */
function readMapBody(map) {
  return map.getLastRow() > 1 ? map.getRange(2, 1, map.getLastRow() - 1, MAP_HEADERS.length).getValues() : [];
}

/**
 * Merge the library into Exercise Map (see planLibraryMerge). Nothing of yours is deleted, but the tab is reordered:
 * library first, your own rows after it. opts.interactive (default true) asks before changing a tab that has rows.
 */
function loadExerciseLibrary(opts) {
  var interactive = !opts || opts.interactive !== false;
  var ss = SpreadsheetApp.getActive();
  var map = ss.getSheetByName(TABS.MAP);
  if (!map) {
    setStatus(ss, 'Run Setup first (Workout menu > Set up workbook).');
    return { ok: false };
  }
  var existing = readMapBody(map);
  var plan = planLibraryMerge(existing, exerciseLibrary());
  if (!plan.changed) {
    setStatus(ss, 'Exercise Map already has the library (' + plan.rows.length + ' exercises).');
    return { ok: true, added: 0, updated: 0, kept: plan.kept, changed: false };
  }
  if (interactive && existing.some(function (r) { return cleanName(r[0]); })) {
    var ui = SpreadsheetApp.getUi();
    var ask = 'This rewrites Exercise Map: the library first (' + plan.added + ' new, ' + plan.updated
      + ' updated to the library\'s muscles), then ' + plan.kept + ' of your own exercises.\n\nNothing is deleted. Continue?';
    if (ui.alert('Load exercise library?', ask, ui.ButtonSet.YES_NO) !== ui.Button.YES) return { ok: false, cancelled: true };
  }
  if (map.getLastRow() > 1) map.getRange(2, 1, map.getLastRow() - 1, MAP_HEADERS.length).clearContent();
  map.getRange(2, 1, plan.rows.length, MAP_HEADERS.length).setValues(plan.rows);
  refreshSummarySafe(ss);   // scripted writes do not fire the Map edit hook
  refreshMuscleList(ss, plan.rows);
  var done = 'Exercise Map: ' + plan.rows.length + ' exercises (' + plan.added + ' added, ' + plan.updated + ' updated, '
    + plan.kept + ' of yours kept after the library).';
  setStatus(ss, done);
  ss.toast(done, 'Workout Tracker', 6);
  return { ok: true, added: plan.added, updated: plan.updated, kept: plan.kept, changed: true };
}
