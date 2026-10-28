/**
 * Feedback.gs — how pump, tendon, connection and soreness ratings change the plan.
 * Everything except applySorenessEdit() is pure (no SpreadsheetApp) so it runs under Node tests.
 * Rollover.gs calls these while building next week; the onEdit trigger calls applySorenessEdit().
 * Tune the numbers and flag wording in FEEDBACK (Config.gs).
 */

/** Normalized rating text of a Log row (Log column 1 is Date, so Session column n sits at index n). */
function logRating(logRow, col) {
  return normalizeName(logRow[col]);
}

// ---- Pump (4a) ----

/** Reps added to last week's performed reps: +1 for great/mid/blank, +2 for none. */
function pumpRepBump(pump) {
  var bump = FEEDBACK.pumpRepBump[normalizeName(pump)];
  return bump == null ? 1 : bump;
}

// ---- Tendon (4b) ----

/**
 * Maintenance is derived, not stored: an exercise is on maintenance next week when its latest
 * logged tendon rating is "bad". The first neutral/good (or blank) rating ends it, and the
 * following week progresses normally from the weight used.
 */
function isMaintenance(logRow) {
  return logRating(logRow, SESSION_COLS.TENDON) === FEEDBACK.tendonBad;
}

/** Program sets minus the maintenance drop, never below 1. */
function maintenanceSets(programSets) {
  return Math.max(1, programSets - FEEDBACK.maintenanceSetDrop);
}

// ---- Connection (4c) ----

/** Latest Log row per week for one exercise, oldest first: [{week, row}]. Later rows win ties. */
function exerciseHistory(logRows, key, maxWeek) {
  var byWeek = {};
  logRows.forEach(function (r) {
    var week = parseNumber(r[SESSION_COLS.WEEK]);
    if (week === null || week > maxWeek) return;
    if (overrideKey(r[SESSION_COLS.DAY], r[SESSION_COLS.EXERCISE]) !== key) return;
    byWeek[week] = { week: week, row: r };
  });
  return Object.keys(byWeek).map(Number).sort(function (a, b) { return a - b; })
    .map(function (w) { return byWeek[w]; });
}

/** Consecutive weeks, ending at the latest entry, rated "not at all". A skipped week breaks the run. */
function connectionMissStreak(history) {
  var n = 0;
  for (var i = history.length - 1; i >= 0; i--) {
    if (logRating(history[i].row, SESSION_COLS.CONNECTION) !== FEEDBACK.connectionMiss) break;
    if (n && history[i].week !== history[i + 1].week - 1) break;
    n++;
  }
  return n;
}

/** 'technique' after one miss, 'swap' after swapAfterWeeks in a row, else null. */
function connectionAction(history) {
  var n = connectionMissStreak(history);
  if (n >= FEEDBACK.swapAfterWeeks) return 'swap';
  return n >= 1 ? 'technique' : null;
}

// ---- Flags column ----

/** Replace the segment of a Flags cell that starts with prefix (text '' removes it). Segments are ' | ' separated. */
function setFlagSegment(flags, prefix, text) {
  var parts = String(flags == null ? '' : flags).split(' | ').filter(function (p) {
    return p !== '' && p.indexOf(prefix) !== 0;
  });
  if (text) parts.push(text);
  return parts.join(' | ');
}

// ---- Soreness (4d) ----

/** Target RIR for a session: the week's ladder value, one step easier when "still sore". */
function sorenessRir(baseRir, soreness) {
  return normalizeName(soreness) === FEEDBACK.stillSore ? baseRir + FEEDBACK.sorenessRirStep : baseRir;
}

/** Consecutive weeks up to throughWeek in which any Log row for this muscle was rated "still sore". */
function stillSoreStreak(logRows, muscle, throughWeek) {
  var m = normalizeName(muscle);
  var sore = {};
  logRows.forEach(function (r) {
    if (normalizeName(r[SESSION_COLS.MUSCLE]) === m && logRating(r, SESSION_COLS.SORENESS) === FEEDBACK.stillSore) {
      sore[parseNumber(r[SESSION_COLS.WEEK])] = true;
    }
  });
  var n = 0;
  for (var w = throughWeek; sore[w]; w--) n++;
  return n;
}

/** True when this week's soreness is "still sore" and the weeks before it complete the required run. */
function isUnderRecovered(logRows, muscle, week, soreness) {
  if (normalizeName(soreness) !== FEEDBACK.stillSore) return false;
  return 1 + stillSoreStreak(logRows, muscle, week - 1) >= FEEDBACK.underRecoveredWeeks;
}

/**
 * Apply Soreness edits to Session rows (pure). editedIdx: indexes into sessionRows whose Soreness cell changed.
 * The rating spreads to every row with the same Day + Muscle Group (it is per muscle group, per session).
 * Each affected row gets Target RIR from the ladder (+1 step if still sore) and its under-recovered flag refreshed.
 * Sets are never touched, so a sore muscle group keeps its set count.
 * Returns {rows: copies of sessionRows, changed: [indexes of rows that were rewritten]}.
 */
function planSorenessUpdate(sessionRows, editedIdx, ladder, logRows) {
  var rows = sessionRows.map(function (r) { return r.slice(); });
  var unknown = normalizeName(UNKNOWN_MUSCLE);
  var changed = {};
  editedIdx.forEach(function (i) {
    var src = rows[i];
    if (!src || !cleanName(src[SESSION_COLS.EXERCISE - 1])) return;
    var muscle = normalizeName(src[SESSION_COLS.MUSCLE - 1]);
    var day = normalizeName(src[SESSION_COLS.DAY - 1]);
    rows.forEach(function (r, j) {
      var sameGroup = muscle !== unknown && normalizeName(r[SESSION_COLS.MUSCLE - 1]) === muscle
        && normalizeName(r[SESSION_COLS.DAY - 1]) === day && cleanName(r[SESSION_COLS.EXERCISE - 1]);
      if (j !== i && !sameGroup) return;
      r[SESSION_COLS.SORENESS - 1] = src[SESSION_COLS.SORENESS - 1];
      changed[j] = true;
    });
  });
  var out = [];
  Object.keys(changed).forEach(function (key) {
    var j = Number(key), r = rows[j];
    var week = parseNumber(r[SESSION_COLS.WEEK - 1]);
    if (week === null) return;
    var soreness = r[SESSION_COLS.SORENESS - 1];
    r[SESSION_COLS.RIR - 1] = sorenessRir(rirForWeek(ladder, week), soreness);
    var flag = isUnderRecovered(logRows, r[SESSION_COLS.MUSCLE - 1], week, soreness) ? FEEDBACK.flags.recovery : '';
    r[SESSION_COLS.FLAGS - 1] = setFlagSegment(r[SESSION_COLS.FLAGS - 1], 'Under-recovered', flag);
    out.push(j);
  });
  return { rows: rows, changed: out };
}

/**
 * Called from the onEdit trigger: when Soreness on Session changes, re-derive Target RIR and the
 * under-recovered flag for that session's muscle group. Does nothing for other columns.
 */
function applySorenessEdit(range) {
  var col = SESSION_COLS.SORENESS;
  if (col < range.getColumn() || col >= range.getColumn() + range.getNumColumns()) return;
  var sh = range.getSheet();
  var ss = sh.getParent();
  var last = lastDataRow(sh, SESSION_HEADERS.length);
  if (last < 2) return;
  var rows = sh.getRange(2, 1, last - 1, SESSION_HEADERS.length).getValues();
  var edited = [];
  for (var r = Math.max(range.getRow(), 2); r <= Math.min(range.getLastRow(), last); r++) edited.push(r - 2);
  var log = ss.getSheetByName(TABS.LOG);
  var plan = planSorenessUpdate(rows, edited, readSettings(ss).rirLadder, log ? readLogRows(log) : []);
  plan.changed.forEach(function (j) {
    sh.getRange(j + 2, SESSION_COLS.SORENESS).setValue(plan.rows[j][SESSION_COLS.SORENESS - 1]);
    sh.getRange(j + 2, SESSION_COLS.RIR).setValue(plan.rows[j][SESSION_COLS.RIR - 1]);
    sh.getRange(j + 2, SESSION_COLS.FLAGS).setValue(plan.rows[j][SESSION_COLS.FLAGS - 1]);
  });
}
