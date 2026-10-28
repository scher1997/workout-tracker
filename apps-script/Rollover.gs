/**
 * Rollover.gs — progression rules and Complete Week.
 * Rules and planNextWeek() are pure (no SpreadsheetApp) so they run under Node tests.
 * completeWeek() is the sheet-facing wrapper (menu item + phone checkbox).
 * Tune the numbers in PROGRESSION (Config.gs).
 */

function roundToStep(x, step) {
  return Math.round(x / step) * step;
}

/** Reps for a Log row: average of the sets entered, rounded; null if none. */
function performedReps(logRow) {
  var sum = 0, n = 0;
  SESSION_REP_COLS.forEach(function (c) {
    var v = parseNumber(logRow[c]); // Log column 1 is Date, so Session column c sits at index c
    if (v !== null) { sum += v; n++; }
  });
  return n ? Math.round(sum / n) : null;
}

/** Next weight when going up: +5%, nearest 2.5, never less than the minimum bump. */
function bumpedWeight(weight) {
  var step = roundToStep(weight * PROGRESSION.increasePct, PROGRESSION.weightStep);
  return weight + Math.max(PROGRESSION.minBump, step);
}

/** Highest rep target we will prescribe for a row with this Rep Max. */
function repCeilingFor(repMax) {
  return Math.max(PROGRESSION.repCeiling, repMax);
}

/** Reps at newWeight that match prevWeight x prevReps volume, capped at the ceiling. */
function matchReps(prevWeight, prevReps, newWeight, ceiling) {
  if (!(newWeight > 0)) return null;
  var reps = Math.round(prevWeight * prevReps / newWeight);
  return Math.max(1, Math.min(reps, ceiling));
}

/**
 * Next week's weight and rep target from one Log row.
 * carryOnly: the row is from an earlier week (exercise skipped since) -> repeat it, no progression.
 * Feedback (Feedback.gs): bad tendon -> 'maintain' (weight and reps held, caller drops a set);
 * pump rating sets the rep bump on the 'hold' path (+1, or +2 for no pump).
 * Returns {action: 'increase'|'hold'|'carry'|'maintain', weight, repTarget, label} or null if the row has no usable weight/reps.
 */
function nextTarget(logRow, range, carryOnly) {
  var weight = parseNumber(logRow[SESSION_COLS.ACTUAL_WEIGHT]);
  var reps = performedReps(logRow);
  if (weight === null || weight <= 0 || reps === null) return null;
  var ceiling = repCeilingFor(range.max);
  var name = cleanName(logRow[SESSION_COLS.EXERCISE]);
  if (isMaintenance(logRow)) {
    return { action: 'maintain', weight: weight, repTarget: Math.min(Math.max(reps, range.min), ceiling), label: name };
  }
  if (carryOnly) {
    return { action: 'carry', weight: weight, repTarget: Math.min(Math.max(reps, range.min), ceiling), label: name };
  }
  if (reps >= PROGRESSION.increaseAtReps) {
    var up = bumpedWeight(weight);
    return { action: 'increase', weight: up, repTarget: matchReps(weight, reps, up, ceiling),
      label: name + ' ' + weight + '→' + up };
  }
  var bump = pumpRepBump(logRow[SESSION_COLS.PUMP]);
  return { action: 'hold', weight: weight, repTarget: Math.min(Math.max(reps + bump, range.min), ceiling), label: name };
}

/** Empty plan summary: exercise names per bucket, plus the deload advice once planNextWeek has counted stalls. */
function newSummary() {
  return { increase: [], hold: [], carry: [], fresh: [], maintain: [], technique: [], swap: [], stalled: [], deload: [],
    deloadAdvice: null };
}

/** Latest Log entry per day|exercise up to maxWeek: {overrideKey: {week, row}}. Later rows win ties. */
function latestEntries(logRows, maxWeek) {
  var out = {};
  logRows.forEach(function (r) {
    var week = parseNumber(r[SESSION_COLS.WEEK]);
    if (week === null || week > maxWeek) return;
    var key = overrideKey(r[SESSION_COLS.DAY], r[SESSION_COLS.EXERCISE]);
    if (!out[key] || week >= out[key].week) out[key] = { week: week, row: r };
  });
  return out;
}

/**
 * Plan the Session for settings.week + 1 from Program + Log.
 * settings: {week (the week just finished), rirLadder, repMin, repMax}
 * Exercises logged this week progress; ones last logged earlier repeat that weight;
 * ones never logged fall back to Program's start weight.
 * Feedback adds: maintenance sets (tendon) and Flags text (maintenance, technique check, swap).
 * Deload (Deload.gs) adds: stall flags per exercise and a deload recommendation in the summary;
 * deload weeks in the Log are ignored (progression resumes from the last working week).
 * settings.deload true -> plan a deload week instead (planDeloadWeek).
 * Returns planSessionRows' result plus {week, summary} (see newSummary).
 */
function planNextWeek(programRows, logRows, lookup, settings) {
  if (settings.deload) return planDeloadWeek(programRows, logRows, lookup, settings);
  var working = withoutDeload(logRows);
  var workingWeek = lastWorkingWeek(logRows, settings.week);
  var lastDeload = lastDeloadWeek(logRows, settings.week);
  var latest = latestEntries(working, settings.week);
  var overrides = {};
  var summary = newSummary();
  var logged = 0;
  programRows.forEach(function (r) {
    var exercise = cleanName(r[1]);
    if (!exercise) return;
    var key = overrideKey(r[0], exercise);
    if (overrides[key]) return; // duplicate Program rows share one result
    var found = latest[key];
    var res = found ? nextTarget(found.row, rowRepRange(r, settings), found.week < workingWeek) : null;
    if (!res) { summary.fresh.push(exercise); return; }
    logged++;
    var ov = { weight: res.weight, repTarget: res.repTarget };
    var flags = [];
    if (res.action === 'maintain') {
      ov.sets = maintenanceSets(toPosInt(r[2], DEFAULTS.sets));
      flags.push(FEEDBACK.flags.maintain);
    }
    var history = exerciseHistory(working, key, settings.week);
    var connection = connectionAction(history);
    if (connection) {
      summary[connection].push(exercise);
      flags.push(FEEDBACK.flags[connection]);
    }
    var stall = exerciseStallStreak(history.filter(function (h) { return h.week > lastDeload; }));
    if (stall >= DELOAD.stallWeeks) {
      summary.stalled.push(exercise);
      flags.push(stalledFlag(stall));
    }
    ov.flags = flags.join(' | ');
    overrides[key] = ov;
    summary[res.action].push(res.label);
  });
  summary.deloadAdvice = { stalled: summary.stalled.length, logged: logged,
    recommended: deloadRecommendation(summary.stalled.length, logged) };
  var next = { week: settings.week + 1, rirLadder: settings.rirLadder, repMin: settings.repMin, repMax: settings.repMax };
  var plan = planSessionRows(programRows, lookup, next, overrides);
  plan.week = next.week;
  plan.summary = summary;
  return plan;
}

/** New Rep Target after Rec Weight is overridden: volume-match last week's Log row. Null if no history. */
function recalcRepTarget(prevLogRow, newWeight, repMax) {
  var weight = parseNumber(prevLogRow[SESSION_COLS.ACTUAL_WEIGHT]);
  var reps = performedReps(prevLogRow);
  if (weight === null || weight <= 0 || reps === null) return null;
  return matchReps(weight, reps, newWeight, repCeilingFor(repMax));
}

/** "8–12" -> {min: 8, max: 12}; null if unreadable. */
function parseRepRange(text) {
  var m = String(text == null ? '' : text).match(/(\d+)\s*[–-]\s*(\d+)/);
  return m ? { min: Number(m[1]), max: Number(m[2]) } : null;
}

/** All non-empty Log body rows. */
function readLogRows(logSheet) {
  var last = lastDataRow(logSheet, LOG_HEADERS.length);
  if (last < 2) return [];
  return logSheet.getRange(2, 1, last - 1, LOG_HEADERS.length).getValues();
}

/**
 * Called from the onEdit trigger: when Rec Weight on Session is edited, re-derive Rep Target
 * so weight x reps matches what was logged for that exercise in the previous week.
 * oldValue (single-cell edits): re-typing the same weight changes nothing.
 */
function recalcRepsForWeightEdit(range, oldValue) {
  var col = SESSION_COLS.REC_WEIGHT;
  if (col < range.getColumn() || col >= range.getColumn() + range.getNumColumns()) return;
  var first = Math.max(range.getRow(), 2);
  if (range.getLastRow() < first) return;
  var sh = range.getSheet();
  var ss = sh.getParent();
  var rows = sh.getRange(first, 1, range.getLastRow() - first + 1, SESSION_HEADERS.length).getValues();
  var logRows = null, byWeek = {}, defaultMax = null, updated = 0;
  rows.forEach(function (row, i) {
    var week = parseNumber(row[SESSION_COLS.WEEK - 1]);
    var weight = parseNumber(row[col - 1]);
    if (week === null || weight === null || !cleanName(row[SESSION_COLS.EXERCISE - 1])) return;
    if (range.getNumRows() === 1 && range.getNumColumns() === 1 && parseNumber(oldValue) === weight) return;
    if (!logRows) logRows = readLogRows(ss.getSheetByName(TABS.LOG));
    if (!byWeek[week]) byWeek[week] = latestEntries(logRows, week - 1);
    var prev = byWeek[week][overrideKey(row[SESSION_COLS.DAY - 1], row[SESSION_COLS.EXERCISE - 1])];
    if (!prev) return;
    var rr = parseRepRange(row[SESSION_COLS.REP_RANGE - 1]);
    if (!rr) {
      if (defaultMax === null) defaultMax = readSettings(ss).repMax;
      rr = { max: defaultMax };
    }
    var reps = recalcRepTarget(prev.row, weight, rr.max);
    if (reps === null) return;
    sh.getRange(first + i, SESSION_COLS.REP_TARGET).setValue(reps);
    updated++;
  });
  if (updated) ss.toast('Rep Target recalculated for ' + updated + ' exercise(s) to match last week\'s volume.', 'Workout Tracker', 4);
}

/**
 * Roll the tracker to the next week: log anything completed, build next week's Session
 * from Log + Program, and advance Settings > Current week. Only runs when asked.
 * opts.interactive (default true): menu asks first; the phone checkbox cannot, so it just runs
 * (it refuses instead when there is nothing logged for the week, which also blocks double-ticks).
 */
function completeWeek(opts) {
  var interactive = !opts || opts.interactive !== false;
  var ss = SpreadsheetApp.getActive();
  var session = ss.getSheetByName(TABS.SESSION);
  var program = ss.getSheetByName(TABS.PROGRAM);
  var map = ss.getSheetByName(TABS.MAP);
  var log = ss.getSheetByName(TABS.LOG);
  if (!session || !program || !map || !log) {
    setStatus(ss, 'Run Setup first (Workout menu > Set up workbook).');
    return { ok: false };
  }
  var refuse = function (msg) { setStatus(ss, msg); ss.toast(msg, 'Workout Tracker', 6); return { ok: false, message: msg }; };

  var settings = readSettings(ss);
  var onDeload = sessionIsDeload(session);
  // Completing the last working week appends a deload week (Settings toggle); the deload week itself ends the meso.
  var deloadNext = settings.week === settings.mesoWeeks && settings.deloadAtEnd && !onDeload;
  if (settings.week >= settings.mesoWeeks && !deloadNext) {
    return refuse(onDeload
      ? 'Week ' + settings.week + ' was the deload week, so the mesocycle is complete.'
        + ' Tick "Start New Mesocycle" in Settings (archives the Log), or raise "Mesocycle length" to keep going.'
      : 'Week ' + settings.week + ' is the last of ' + settings.mesoWeeks
        + '. Raise "Mesocycle length" in Settings to keep going, or turn on "Deload after last week".');
  }
  var progRows = program.getLastRow() > 1
    ? program.getRange(2, 1, program.getLastRow() - 1, PROGRAM_HEADERS.length).getValues() : [];
  if (!progRows.some(function (r) { return cleanName(r[1]); })) {
    return refuse('Program has no exercises. Add rows to Program first.');
  }
  var loggedThisWeek = function (rows) {
    return rows.some(function (r) { return parseNumber(r[SESSION_COLS.WEEK]) === settings.week; });
  };
  var pending = countUnlogged(ss);
  if (!pending && !loggedThisWeek(readLogRows(log))) {
    return refuse('Nothing logged for week ' + settings.week + ' yet. Enter reps in Session, then try again.');
  }

  if (interactive) {
    var ui = SpreadsheetApp.getUi();
    var msg = (pending ? pending + ' completed exercise(s) will be logged first.\n\n' : '')
      + 'Build week ' + (settings.week + 1) + ' and replace the Session tab?';
    if (ui.alert('Complete week ' + settings.week + '?', msg, ui.ButtonSet.YES_NO) !== ui.Button.YES) return { ok: false, cancelled: true };
  }

  if (pending) completeSession({ interactive: false });
  var mapRows = map.getLastRow() > 1 ? map.getRange(2, 1, map.getLastRow() - 1, 2).getValues() : [];
  settings.deload = deloadNext;
  var plan = planNextWeek(progRows, readLogRows(log), buildMuscleLookup(mapRows), settings);
  writeSession(session, plan.rows);
  ss.getSheetByName(TABS.SETTINGS).getRange(SETTINGS_ROWS.WEEK, 2).setValue(plan.week);

  var s = plan.summary;
  var notes = [deloadNext
    ? 'Week ' + plan.week + ' is a deload week: half sets, weight held, target RIR ' + DELOAD.rir + '.'
    : 'Week ' + plan.week + ' ready (target RIR ' + rirForWeek(settings.rirLadder, plan.week) + ').'];
  if (s.increase.length) notes.push('Weight up: ' + s.increase.join(', ') + '.');
  if (s.hold.length) notes.push(s.hold.length + ' same weight, more reps.');
  if (s.maintain.length) notes.push('Tendon maintenance (weight held, one set fewer): ' + s.maintain.join(', ') + '.');
  if (s.technique.length) notes.push('Technique check: ' + s.technique.join(', ') + '.');
  if (s.swap.length) notes.push('Consider swapping: ' + s.swap.join(', ') + '.');
  if (s.stalled.length) notes.push('Stalled ' + DELOAD.stallWeeks + '+ weeks: ' + s.stalled.join(', ') + '.');
  if (s.deloadAdvice && s.deloadAdvice.recommended) {
    notes.push('Deload recommended (' + s.deloadAdvice.stalled + ' of ' + s.deloadAdvice.logged
      + ' exercises stalled). Tick "Deload this week" in Settings to convert this week.');
  }
  if (s.carry.length) notes.push('Not logged this week, repeated: ' + s.carry.join(', ') + '.');
  if (s.fresh.length) notes.push('No log history, Program start weight: ' + s.fresh.join(', ') + '.');
  if (plan.unknown.length) notes.push('Not in Exercise Map: ' + plan.unknown.join(', ') + '.');
  notes = notes.concat(plan.warnings);
  setStatus(ss, notes.join(' '));
  ss.toast(notes[0], 'Workout Tracker', 5);
  return { ok: true, week: plan.week, summary: s };
}
