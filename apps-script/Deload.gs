/**
 * Deload.gs — stall detection, deload recommendation and the deload week plan.
 * Everything except sessionIsDeload() and makeDeloadWeek() is pure (no SpreadsheetApp) so it runs under Node tests.
 * Rollover.gs calls these while building next week. Tune the numbers in DELOAD (Config.gs).
 * State is derived from Log history: a deload week is any week whose Flags carry the deload segment.
 */

// ---- Deload marker ----

/** True if a Flags cell holds the deload segment (segments are ' | ' separated). */
function isDeloadFlags(text) {
  return String(text == null ? '' : text).split(' | ').some(function (p) {
    return p.indexOf(DELOAD.deloadPrefix) === 0;
  });
}

/** True for a Log row logged during a deload week. */
function isDeloadEntry(logRow) {
  return isDeloadFlags(logRow[SESSION_COLS.FLAGS]);
}

/** Log rows without deload weeks (deloads must not count as stalls or as the weight to progress from). */
function withoutDeload(logRows) {
  return logRows.filter(function (r) { return !isDeloadEntry(r); });
}

/** Latest week at or before `week` that was not a deload week (a deload week has any flagged Log row). */
function lastWorkingWeek(logRows, week) {
  var deloadWeeks = {};
  logRows.forEach(function (r) {
    if (isDeloadEntry(r)) deloadWeeks[parseNumber(r[SESSION_COLS.WEEK])] = true;
  });
  while (deloadWeeks[week]) week--;
  return week;
}

/** Latest deload week at or before `week` (0 if none). Stall counting restarts after it. */
function lastDeloadWeek(logRows, week) {
  var last = 0;
  logRows.forEach(function (r) {
    var w = parseNumber(r[SESSION_COLS.WEEK]);
    if (isDeloadEntry(r) && w !== null && w <= week && w > last) last = w;
  });
  return last;
}

// ---- Stall detection ----

/**
 * Consecutive logged weeks, ending at the latest entry, with no weight or rep gain over the week before.
 * history: exerciseHistory() of working (non-deload) Log rows. Maintenance weeks (tendon) are skipped, not counted:
 * the weight is held on purpose. A week with no entry, or an unreadable weight/reps, ends the run.
 */
function exerciseStallStreak(history) {
  var weeks = {};
  history.forEach(function (h) { weeks[h.week] = true; });
  var kept = history.filter(function (h) { return !isMaintenance(h.row); });
  var n = 0;
  for (var i = kept.length - 1; i >= 1; i--) {
    var cur = kept[i], prev = kept[i - 1];
    for (var w = prev.week + 1; w < cur.week; w++) if (!weeks[w]) return n;   // skipped week
    var wc = parseNumber(cur.row[SESSION_COLS.ACTUAL_WEIGHT]), wp = parseNumber(prev.row[SESSION_COLS.ACTUAL_WEIGHT]);
    var rc = performedReps(cur.row), rp = performedReps(prev.row);
    if (wc === null || wp === null || rc === null || rp === null) return n;
    if (wc > wp || rc > rp) return n;
    n++;
  }
  return n;
}

function stalledFlag(weeks) {
  return DELOAD.stalledPrefix + ' ' + weeks + ' weeks: no weight or rep gain';
}

/** Deload is recommended when enough of the logged exercises are stalled. */
function deloadRecommendation(stalled, logged) {
  return stalled >= Math.max(DELOAD.minStalled, Math.ceil(logged * DELOAD.stallShare));
}

// ---- Deload week plan ----

/** Half the Program sets, rounded up, never below 1. */
function deloadSets(programSets) {
  return Math.max(1, Math.ceil(programSets / 2));
}

/**
 * Plan a deload Session for settings.week + 1 (same inputs as planNextWeek).
 * Each exercise: half sets, last logged weight held, reps = last performed (no push), Target RIR = DELOAD.rir.
 * Never-logged exercises get the Program start weight. Deload weeks already in the Log are ignored.
 */
function planDeloadWeek(programRows, logRows, lookup, settings) {
  var latest = latestEntries(withoutDeload(logRows), settings.week);
  var overrides = {};
  var summary = newSummary();
  programRows.forEach(function (r) {
    var exercise = cleanName(r[1]);
    if (!exercise) return;
    var key = overrideKey(r[0], exercise);
    if (overrides[key]) return;
    var ov = { sets: deloadSets(toPosInt(r[2], DEFAULTS.sets)), rir: DELOAD.rir, flags: DELOAD.flags.deload };
    var found = latest[key];
    var weight = found ? parseNumber(found.row[SESSION_COLS.ACTUAL_WEIGHT]) : null;
    var reps = found ? performedReps(found.row) : null;
    if (weight !== null && weight > 0 && reps !== null) {
      var range = rowRepRange(r, settings);
      ov.weight = weight;
      ov.repTarget = Math.min(Math.max(reps, range.min), repCeilingFor(range.max));
      summary.deload.push(exercise);
    } else {
      summary.fresh.push(exercise);
    }
    overrides[key] = ov;
  });
  var next = { week: settings.week + 1, rirLadder: settings.rirLadder, repMin: settings.repMin, repMax: settings.repMax };
  var plan = planSessionRows(programRows, lookup, next, overrides);
  plan.week = next.week;
  plan.summary = summary;
  return plan;
}

// ---- Sheet-facing ----

/** True if any Session row carries the deload segment. */
function sessionIsDeload(sessionSheet) {
  var last = lastDataRow(sessionSheet, SESSION_HEADERS.length);
  if (last < 2) return false;
  return sessionSheet.getRange(2, SESSION_COLS.FLAGS, last - 1, 1).getValues().some(function (r) {
    return isDeloadFlags(r[0]);
  });
}

/**
 * Convert the current, not-yet-started Session into a deload week (menu item + Settings checkbox).
 * Uses Log history up to the previous week. Refuses when Session already has entries or is already a deload.
 */
function makeDeloadWeek() {
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
  if (lastDataRow(session, SESSION_HEADERS.length) < 2) return refuse('Session is empty. Build or roll the week first, then convert it to a deload.');
  if (sessionIsDeload(session)) return refuse('Week ' + settings.week + ' is already a deload week.');
  if (sessionHasUserInput(session)) {
    return refuse('Not converted: Session already has entries. Deload applies to a week you have not started.');
  }
  var progRows = program.getLastRow() > 1
    ? program.getRange(2, 1, program.getLastRow() - 1, PROGRAM_HEADERS.length).getValues() : [];
  var mapRows = map.getLastRow() > 1 ? map.getRange(2, 1, map.getLastRow() - 1, 2).getValues() : [];
  var prev = { week: settings.week - 1, rirLadder: settings.rirLadder, repMin: settings.repMin, repMax: settings.repMax };
  var plan = planDeloadWeek(progRows, readLogRows(log), buildMuscleLookup(mapRows), prev);
  if (!plan.rows.length) return refuse('Program has no exercises. Add rows to Program first.');
  writeSession(session, plan.rows);
  var msg = 'Week ' + settings.week + ' converted to a deload: half sets, weight held, target RIR ' + DELOAD.rir + '.';
  if (plan.summary.fresh.length) msg += ' No log history, Program start weight: ' + plan.summary.fresh.join(', ') + '.';
  setStatus(ss, msg);
  ss.toast(msg, 'Workout Tracker', 5);
  return { ok: true, week: settings.week, summary: plan.summary };
}
