/**
 * SessionBuilder.gs — builds the Session tab from Program for the current week.
 * planSessionRows() is pure (no SpreadsheetApp) so it runs under Node tests.
 * buildSession() is the sheet-facing wrapper.
 */

/** "3,2,1,0" or [3,2,1,0] -> [3,2,1,0]; falls back to the default ladder. */
function parseRirLadder(value) {
  var parts = Array.isArray(value) ? value : String(value == null ? '' : value).split(/[,\s;]+/);
  var ladder = [];
  parts.forEach(function (p) {
    var n = parseNumber(p);
    if (n !== null && n >= 0) ladder.push(Math.round(n));
  });
  return ladder.length ? ladder : DEFAULTS.rirLadder.slice();
}

/** Target RIR for a 1-based week; weeks past the ladder reuse its last entry. */
function rirForWeek(ladder, week) {
  var idx = Math.min(Math.max(week, 1), ladder.length) - 1;
  return ladder[idx];
}

/** Exercise Map rows [[exercise, muscle]] -> {normalizedExercise: muscle}. */
function buildMuscleLookup(mapRows) {
  var lookup = {};
  mapRows.forEach(function (r) {
    var key = normalizeName(r[0]);
    var muscle = cleanName(r[1]);
    if (key && muscle) lookup[key] = muscle;
  });
  return lookup;
}

/** Key used to match a Program row to a rollover override (Pass 3). */
function overrideKey(day, exercise) {
  return normalizeName(day) + '|' + normalizeName(exercise);
}

/**
 * programRows: [[day, exercise, sets, startWeight, repMin, repMax], ...]
 * settings:    {week, rirLadder, repMin, repMax}
 * overrides:   optional {overrideKey: {weight, sets, repMin, repMax, repTarget}}
 * Returns {rows, unknown, duplicates, warnings}.
 */
function planSessionRows(programRows, lookup, settings, overrides) {
  overrides = overrides || {};
  var out = { rows: [], unknown: [], duplicates: [], warnings: [] };
  var seen = {};
  var rir = rirForWeek(settings.rirLadder, settings.week);

  programRows.forEach(function (r, i) {
    var exercise = cleanName(r[1]);
    if (!exercise) return; // blank / spacer row
    var day = cleanName(r[0]);
    var where = 'Program row ' + (i + 2) + ' (' + exercise + ')';

    var key = overrideKey(day, exercise);
    var ov = overrides[key] || {};

    var sets = ov.sets != null ? ov.sets : toPosInt(r[2], null);
    if (sets === null) {
      sets = DEFAULTS.sets;
      out.warnings.push(where + ': no valid Sets, used ' + DEFAULTS.sets);
    }

    var repMin = ov.repMin != null ? ov.repMin : (parseNumber(r[4]) || settings.repMin);
    var repMax = ov.repMax != null ? ov.repMax : (parseNumber(r[5]) || settings.repMax);
    if (repMin > repMax) {
      out.warnings.push(where + ': Rep Min above Rep Max, swapped');
      var t = repMin; repMin = repMax; repMax = t;
    }

    var weight = ov.weight != null ? ov.weight : parseNumber(r[3]);
    var repTarget = ov.repTarget != null ? ov.repTarget : repMin;

    var muscle = lookup[normalizeName(exercise)];
    if (!muscle) {
      muscle = UNKNOWN_MUSCLE;
      if (out.unknown.indexOf(exercise) === -1) out.unknown.push(exercise);
    }

    if (seen[key]) out.duplicates.push(day + ' / ' + exercise);
    seen[key] = true;

    var row = new Array(SESSION_HEADERS.length);
    for (var c = 0; c < row.length; c++) row[c] = '';
    row[SESSION_COLS.WEEK - 1] = settings.week;
    row[SESSION_COLS.DAY - 1] = day;
    row[SESSION_COLS.EXERCISE - 1] = exercise;
    row[SESSION_COLS.MUSCLE - 1] = muscle;
    row[SESSION_COLS.SETS - 1] = sets;
    row[SESSION_COLS.REC_WEIGHT - 1] = weight === null ? '' : weight;
    row[SESSION_COLS.REP_RANGE - 1] = repMin + '–' + repMax; // en dash: Sheets won't read it as a date
    row[SESSION_COLS.REP_TARGET - 1] = repTarget;
    row[SESSION_COLS.RIR - 1] = rir;
    out.rows.push(row);
  });
  return out;
}

/** Read the Settings tab into the shape planSessionRows expects. */
function readSettings(ss) {
  var sh = ss.getSheetByName(TABS.SETTINGS);
  var val = function (row) { return sh.getRange(row, 2).getValue(); };
  var repMin = toPosInt(val(SETTINGS_ROWS.REP_MIN), DEFAULTS.repMin);
  var repMax = toPosInt(val(SETTINGS_ROWS.REP_MAX), DEFAULTS.repMax);
  return {
    week: toPosInt(val(SETTINGS_ROWS.WEEK), DEFAULTS.week),
    rirLadder: parseRirLadder(val(SETTINGS_ROWS.RIR_LADDER)),
    repMin: Math.min(repMin, repMax),
    repMax: Math.max(repMin, repMax)
  };
}

function setStatus(ss, message) {
  ss.getSheetByName(TABS.SETTINGS).getRange(SETTINGS_ROWS.STATUS, 2).setValue(message);
}

/** True if the Session tab holds anything the user typed during training. */
function sessionHasUserInput(sessionSheet) {
  var last = sessionSheet.getLastRow();
  if (last < 2) return false;
  var data = sessionSheet.getRange(2, 1, last - 1, SESSION_HEADERS.length).getValues();
  return data.some(function (row) {
    return SESSION_ENTRY_COLS.some(function (c) { return row[c - 1] !== ''; });
  });
}

/**
 * Empty the Session tab body (headers, dropdowns and protection stay).
 * Pass 2 will make this refuse while entries are still unlogged.
 */
function clearSession(opts) {
  var interactive = !opts || opts.interactive !== false;
  var ss = SpreadsheetApp.getActive();
  var session = ss.getSheetByName(TABS.SESSION);
  if (!session) return;
  if (interactive && sessionHasUserInput(session)) {
    var ui = SpreadsheetApp.getUi();
    if (ui.alert('Clear Session?', 'This deletes data entered in Session.', ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
  }
  var hadEntries = sessionHasUserInput(session);
  if (session.getLastRow() > 1) {
    session.getRange(2, 1, session.getLastRow() - 1, SESSION_HEADERS.length).clearContent();
  }
  setStatus(ss, 'Session cleared' + (hadEntries ? ' (entered data discarded).' : '.'));
}

/**
 * Rebuild the Session tab for the current week.
 * opts.interactive (default true): ask before overwriting entered data. From the
 * phone checkbox trigger no dialog is possible, so it refuses instead.
 */
function buildSession(opts) {
  var interactive = !opts || opts.interactive !== false;
  var ss = SpreadsheetApp.getActive();
  var session = ss.getSheetByName(TABS.SESSION);
  var program = ss.getSheetByName(TABS.PROGRAM);
  var map = ss.getSheetByName(TABS.MAP);
  if (!session || !program || !map) {
    setStatus(ss, 'Run Setup first (Workout menu > Set up workbook).');
    return;
  }

  var settings = readSettings(ss);
  var progRows = program.getLastRow() > 1
    ? program.getRange(2, 1, program.getLastRow() - 1, PROGRAM_HEADERS.length).getValues() : [];
  var mapRows = map.getLastRow() > 1
    ? map.getRange(2, 1, map.getLastRow() - 1, 2).getValues() : [];

  var plan = planSessionRows(progRows, buildMuscleLookup(mapRows), settings);
  if (!plan.rows.length) {
    setStatus(ss, 'Program has no exercises. Add rows to Program, then build again.');
    return;
  }

  if (sessionHasUserInput(session)) {
    if (!interactive) {
      setStatus(ss, 'Not rebuilt: Session has entered data. Log it first, or rebuild from the menu.');
      return;
    }
    var ui = SpreadsheetApp.getUi();
    if (ui.alert('Rebuild Session?', 'This replaces data already entered in Session.', ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
  }

  if (session.getLastRow() > 1) {
    session.getRange(2, 1, session.getLastRow() - 1, SESSION_HEADERS.length).clearContent();
  }
  session.getRange(2, 1, plan.rows.length, SESSION_HEADERS.length).setValues(plan.rows);

  var notes = ['Built week ' + settings.week + ': ' + plan.rows.length + ' exercises, target RIR '
    + rirForWeek(settings.rirLadder, settings.week) + '.'];
  if (plan.unknown.length) notes.push('Not in Exercise Map: ' + plan.unknown.join(', ') + '.');
  if (plan.duplicates.length) notes.push('Duplicates: ' + plan.duplicates.join(', ') + '.');
  notes = notes.concat(plan.warnings);
  setStatus(ss, notes.join(' '));
  ss.toast(notes[0], 'Workout Tracker', 5);
}
