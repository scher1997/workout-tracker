/**
 * MuscleSummary.gs — the Muscle Summary tab: weekly sets per muscle group, pivot style.
 * Source = Archive (past mesocycles) + Log (current one), so the Overall Week axis keeps counting.
 * Muscles come from the Exercise Map (primary / secondary / tertiary columns); nothing is named in code.
 * Everything above "Sheet side" is pure (no SpreadsheetApp) so it runs under Node tests.
 */

/** "Triceps, Front delts ; lats" -> ['Triceps','Front delts','lats']. */
function parseMuscleList(value) {
  return String(value == null ? '' : value).split(/[,;\n]+/).map(cleanName).filter(function (m) { return m; });
}

/**
 * Exercise Map rows [[exercise, primary, secondary, tertiary]] ->
 * {roles: {normalizedExercise: {primary, secondary: [], tertiary: []}}, muscles: [display names in map order]}.
 * Rows without an exercise or a primary muscle are ignored (same rule as buildMuscleLookup).
 */
function buildMuscleRoles(mapRows) {
  var roles = {}, muscles = [], seen = {};
  var note = function (m) {
    var k = normalizeName(m);
    if (k && !seen[k]) { seen[k] = true; muscles.push(cleanName(m)); }
  };
  mapRows.forEach(function (r) {
    var key = normalizeName(r[0]);
    var primary = cleanName(r[1]);
    if (!key || !primary) return;
    roles[key] = { primary: primary, secondary: parseMuscleList(r[2]), tertiary: parseMuscleList(r[3]) };
    note(primary);
    roles[key].secondary.forEach(note);
    roles[key].tertiary.forEach(note);
  });
  return { roles: roles, muscles: muscles };
}

/**
 * Who gets credit for one set of an exercise: [{key, name, weight}].
 * Primary = 1. Secondary / tertiary only when switched on in opts, at their weights.
 * A muscle in several roles counts once, at the highest role that is switched on.
 */
function muscleShares(role, opts) {
  var out = [], seen = {};
  var add = function (name, weight) {
    var key = normalizeName(name);
    if (!key || seen[key] || !(weight > 0)) return;
    seen[key] = true;
    out.push({ key: key, name: cleanName(name), weight: weight });
  };
  add(role.primary, 1);
  if (opts.includeSecondary) role.secondary.forEach(function (m) { add(m, toWeight(opts.secondaryWeight, SUMMARY.secondaryWeight)); });
  if (opts.includeTertiary) role.tertiary.forEach(function (m) { add(m, toWeight(opts.tertiaryWeight, SUMMARY.tertiaryWeight)); });
  return out;
}

/**
 * Archive-shaped rows for all history: the Archive body plus the current Log (Overall Week continues after the Archive).
 * Log rows are skipped when the Archive already holds the current mesocycle label (archived but reset stopped).
 */
function historyFacts(archiveBody, logRows, mesoLabel) {
  var current = archiveHasLabel(archiveBody, mesoLabel) ? [] : archiveRows(logRows, mesoLabel, maxOverallWeek(archiveBody));
  return archiveBody.concat(current);
}

/** Every Overall Week from the first to the last that has data (gaps included, so the axis is honest). */
function weekSpan(facts) {
  var min = null, max = null;
  facts.forEach(function (f) {
    var w = parseNumber(f[ARCHIVE_COLS.OVERALL_WEEK - 1]);
    if (w === null || !cleanName(f[ARCHIVE_COLS.EXERCISE - 1])) return;
    if (min === null || w < min) min = w;
    if (max === null || w > max) max = w;
  });
  var weeks = [];
  for (var w = min; min !== null && w <= max; w++) weeks.push(w);
  return weeks;
}

/**
 * Pivot of muscle group x Overall Week.
 * facts: historyFacts(); mapRows: Exercise Map body; opts: {includeSecondary, includeTertiary, secondaryWeight, tertiaryWeight};
 * measure: 'sets' (default) or 'volume'.
 * The muscle of a fact comes from the map (so editing the map fixes old rows), else the muscle stored on the row.
 * Returns {grid, weeks, muscles (display names), rows: [{key, name, values}]}.
 * grid = header row (Muscle Group, weeks...), mesocycle row, one row per muscle, Total row.
 */
function planMuscleSummary(facts, mapRows, opts, measure) {
  opts = opts || {};
  var col = measure === 'volume' ? ARCHIVE_COLS.VOLUME : ARCHIVE_COLS.SETS_DONE;
  var built = buildMuscleRoles(mapRows);
  var names = {}, order = [], cells = {}, meta = {};
  built.muscles.forEach(function (m) { names[normalizeName(m)] = m; order.push(normalizeName(m)); });

  facts.forEach(function (f) {
    var week = parseNumber(f[ARCHIVE_COLS.OVERALL_WEEK - 1]);
    var exercise = normalizeName(f[ARCHIVE_COLS.EXERCISE - 1]);
    if (week === null || !exercise) return;
    if (!meta[week]) meta[week] = { meso: cleanName(f[ARCHIVE_COLS.MESO - 1]), deload: false };
    if (f[ARCHIVE_COLS.WEEK_TYPE - 1] === ARCHIVE_WEEK_TYPES.deload) meta[week].deload = true;
    var amount = parseNumber(f[col - 1]);
    if (amount === null) amount = 0;
    var role = built.roles[exercise]
      || { primary: cleanName(f[ARCHIVE_COLS.MUSCLE - 1]) || UNKNOWN_MUSCLE, secondary: [], tertiary: [] };
    muscleShares(role, opts).forEach(function (s) {
      if (!names[s.key]) { names[s.key] = s.name; order.push(s.key); }
      if (!cells[s.key]) cells[s.key] = {};
      cells[s.key][week] = (cells[s.key][week] || 0) + amount * s.weight;
    });
  });

  var unknownKey = normalizeName(UNKNOWN_MUSCLE);
  if (order.indexOf(unknownKey) > -1) order = order.filter(function (k) { return k !== unknownKey; }).concat(unknownKey);

  var weeks = weekSpan(facts);
  var mesoRow = weeks.map(function (w) {
    return meta[w] ? meta[w].meso + (meta[w].deload ? SUMMARY.deloadSuffix : '') : '';
  });
  var totals = weeks.map(function () { return 0; });
  var rows = order.map(function (key) {
    var values = weeks.map(function (w, i) {
      var v = (cells[key] && cells[key][w]) || 0;
      totals[i] += v;
      return round2(v);
    });
    return { key: key, name: names[key], values: values };
  });
  var grid = [[SUMMARY.headerLabel].concat(weeks), [SUMMARY.mesoRowLabel].concat(mesoRow)];
  rows.forEach(function (r) { grid.push([r.name].concat(r.values)); });
  grid.push([SUMMARY.totalLabel].concat(totals.map(round2)));
  return { grid: grid, weeks: weeks, muscles: rows.map(function (r) { return r.name; }), rows: rows };
}

/** One-line note under the pivot saying what is being counted. */
function countingCaption(opts) {
  var parts = ['primary'];
  if (opts.includeSecondary) parts.push('secondary x' + toWeight(opts.secondaryWeight, SUMMARY.secondaryWeight));
  if (opts.includeTertiary) parts.push('tertiary x' + toWeight(opts.tertiaryWeight, SUMMARY.tertiaryWeight));
  return 'Sets done per week. Counting: ' + parts.join(' + ') + '. Change in Settings > Preferences.';
}

// ---------------------------------------------------------------- Sheet side

/** While true, refreshSummarySafe() does nothing (the sheet tests pause it to stay fast). */
var SUMMARY_STATE = { paused: false };

/** Everything the summary and Trends need, read once: settings, Exercise Map body, history facts. */
function readSummaryData(ss) {
  var settings = readSettings(ss);
  var map = ss.getSheetByName(TABS.MAP);
  var archive = ss.getSheetByName(TABS.ARCHIVE);
  var log = ss.getSheetByName(TABS.LOG);
  var mapRows = map && map.getLastRow() > 1 ? map.getRange(2, 1, map.getLastRow() - 1, MAP_HEADERS.length).getValues() : [];
  var archLast = archive ? lastDataRow(archive, ARCHIVE_HEADERS.length) : 1;
  var archBody = archLast > 1 ? archive.getRange(2, 1, archLast - 1, ARCHIVE_HEADERS.length).getValues() : [];
  var logRows = log ? readLogRows(log) : [];
  return {
    settings: settings,
    mapRows: mapRows,
    facts: historyFacts(archBody, logRows, settings.mesoName || 'Meso 1')
  };
}

/** Write the pivot to the Muscle Summary tab (script-managed: the whole tab is rewritten). */
function writeSummaryGrid(sh, grid, caption) {
  var rows = grid.length, cols = grid[0].length;
  sh.clear();
  sh.getRange(1, 1, rows, cols).setValues(grid);
  sh.getRange(1, 1, 2, cols).setFontWeight('bold').setBackground('#e8eaed');
  sh.getRange(rows, 1, 1, cols).setFontWeight('bold').setBackground('#e8eaed');
  sh.getRange(3, 1, Math.max(rows - 3, 0) || 1, 1).setFontWeight('bold');
  sh.getRange(2, 2, 1, Math.max(cols - 1, 1)).setWrap(true);
  sh.getRange(rows + 2, 1).setValue(caption).setFontStyle('italic').setFontColor('#5f6368');
  sh.setFrozenRows(2);
  sh.setFrozenColumns(1);
  sh.setColumnWidth(1, 170);
  if (cols > 1) sh.setColumnWidths(2, cols - 1, 80);
  var rules = [];
  if (cols > 1 && rows > 3) {
    rules.push(SpreadsheetApp.newConditionalFormatRule()
      .setGradientMinpoint('#ffffff').setGradientMaxpoint('#57bb8a')
      .setRanges([sh.getRange(3, 2, rows - 3, cols - 1)]).build());
  }
  sh.setConditionalFormatRules(rules);
}

/** Rebuild the Muscle Summary tab. Returns the plan, or null if the tab is missing (run Setup). */
function refreshMuscleSummary(ss, data) {
  var sh = ss.getSheetByName(TABS.SUMMARY);
  if (!sh) return null;
  var plan = planMuscleSummary(data.facts, data.mapRows, data.settings, 'sets');
  writeSummaryGrid(sh, plan.grid, countingCaption(data.settings));
  return plan;
}

/** Rebuild the Muscle Summary tab and the Trends dashboard from one read. */
function refreshAllSummaries(ss) {
  var timer = stageTimer('refreshAllSummaries');
  var data = readSummaryData(ss);
  timer.mark('read');
  var plan = refreshMuscleSummary(ss, data);
  timer.mark('summary grid');
  refreshTrends(ss, data);
  timer.mark('trends + chart');
  timer.done();
  return plan;
}

/** Hook for logging, rollover, archive and edit triggers: never throws, so it can never block them. */
function refreshSummarySafe(ss) {
  if (SUMMARY_STATE.paused) return false;
  try {
    return !!refreshAllSummaries(ss);
  } catch (e) {
    Logger.log('Muscle Summary refresh failed: ' + e);
    return false;
  }
}

/** Menu item + Settings checkbox: refresh and say what happened. */
function refreshSummaryNow() {
  var ss = SpreadsheetApp.getActive();
  try {
    var plan = refreshAllSummaries(ss);
    if (!plan) { setStatus(ss, 'Run Setup first (Workout menu > Set up workbook).'); return; }
    var span = plan.weeks.length ? 'weeks ' + plan.weeks[0] + '-' + plan.weeks[plan.weeks.length - 1] : 'no logged weeks yet';
    var msg = 'Muscle Summary refreshed: ' + plan.muscles.length + ' muscle groups, ' + span + '.';
    setStatus(ss, msg);
    ss.toast(msg, 'Workout Tracker', 5);
  } catch (e) {
    setStatus(ss, 'Muscle Summary refresh failed: ' + e);
  }
}
