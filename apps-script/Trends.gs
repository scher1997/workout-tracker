/**
 * Trends.gs — the Trends tab: pick a muscle group or an exercise and a metric, see it week by week.
 * Same data as the Muscle Summary (Archive + Log, Exercise Map for muscles). B1 = item, B2 = metric.
 * Everything above "Sheet side" is pure (no SpreadsheetApp) so it runs under Node tests.
 */

/** Dropdown entries: every muscle group, then every exercise ("Muscle: Chest", "Exercise: Bench Press"). */
function trendItems(muscles, exercises) {
  return muscles.map(function (m) { return SUMMARY.musclePrefix + m; })
    .concat(exercises.map(function (e) { return SUMMARY.exercisePrefix + e; }));
}

/** "Muscle: Chest" -> {kind: 'muscle', name: 'Chest'}; null if it is neither. */
function parseTrendItem(text) {
  var t = cleanName(text);
  if (t.indexOf(SUMMARY.musclePrefix) === 0) return { kind: 'muscle', name: cleanName(t.slice(SUMMARY.musclePrefix.length)) };
  if (t.indexOf(SUMMARY.exercisePrefix) === 0) return { kind: 'exercise', name: cleanName(t.slice(SUMMARY.exercisePrefix.length)) };
  return null;
}

/** Exercise display names: Exercise Map order, then anything in the history that the map no longer lists. */
function exerciseNames(facts, mapRows) {
  var names = [], seen = {};
  var add = function (n) {
    var k = normalizeName(n);
    if (k && !seen[k]) { seen[k] = true; names.push(cleanName(n)); }
  };
  mapRows.forEach(function (r) { if (cleanName(r[1])) add(r[0]); });
  facts.forEach(function (f) { add(f[ARCHIVE_COLS.EXERCISE - 1]); });
  return names;
}

/**
 * Weekly series for one dropdown item and metric (Sets, Volume, Top weight, Avg reps).
 * Muscles only have Sets and Volume (counted with the same secondary/tertiary options as the pivot);
 * any other metric falls back to Sets with a note. Weeks with nothing: 0 for Sets/Volume, blank for weight/reps.
 * Returns {labels, values, metric, title, note, weeks} or null if the item is not recognised.
 */
function trendSeries(facts, mapRows, opts, itemText, metric) {
  var item = parseTrendItem(itemText);
  if (!item) return null;
  var used = SUMMARY.metrics.indexOf(metric) > -1 ? metric : 'Sets';
  var note = '';
  if (item.kind === 'muscle' && SUMMARY.muscleMetrics.indexOf(used) === -1) {
    note = used + ' applies to exercises, showing Sets.';
    used = 'Sets';
  }
  var key = normalizeName(item.name);
  var weeks = weekSpan(facts), values;

  if (item.kind === 'muscle') {
    var plan = planMuscleSummary(facts, mapRows, opts, used === 'Volume' ? 'volume' : 'sets');
    var row = plan.rows.filter(function (r) { return r.key === key; })[0];
    values = row ? row.values : weeks.map(function () { return 0; });
  } else {
    var byWeek = {};
    facts.forEach(function (f) {
      var week = parseNumber(f[ARCHIVE_COLS.OVERALL_WEEK - 1]);
      if (week === null || normalizeName(f[ARCHIVE_COLS.EXERCISE - 1]) !== key) return;
      var a = byWeek[week] || (byWeek[week] = { sets: 0, volume: 0, top: null, reps: 0 });
      var sets = parseNumber(f[ARCHIVE_COLS.SETS_DONE - 1]) || 0;
      var volume = parseNumber(f[ARCHIVE_COLS.VOLUME - 1]);
      var weight = parseNumber(f[ARCHIVE_COLS.WEIGHT - 1]);
      var avg = parseNumber(f[ARCHIVE_COLS.AVG_REPS - 1]);
      a.sets += sets;
      if (volume !== null) a.volume += volume;
      if (weight !== null && (a.top === null || weight > a.top)) a.top = weight;
      if (avg !== null) a.reps += avg * sets;
    });
    values = weeks.map(function (w) {
      var a = byWeek[w];
      if (used === 'Sets') return a ? a.sets : 0;
      if (used === 'Volume') return a ? round2(a.volume) : 0;
      if (used === 'Top weight') return a && a.top !== null ? a.top : '';
      return a && a.sets ? round1(a.reps / a.sets) : '';   // Avg reps, weighted by sets
    });
  }
  return {
    labels: weeks.map(function (w) { return SUMMARY.weekPrefix + w; }),
    values: values,
    weeks: weeks,
    metric: used,
    title: item.name + ' · ' + used,
    note: note
  };
}

// ---------------------------------------------------------------- Sheet side

/** Replace the chart on the Trends tab: columns for Sets/Volume, a line for weight and reps. */
function drawTrendChart(sh, series) {
  sh.getCharts().forEach(function (c) { sh.removeChart(c); });
  if (!series || !series.labels.length) return;
  var column = series.metric === 'Sets' || series.metric === 'Volume';
  var range = sh.getRange(1, TRENDS_LAYOUT.DATA_COL, series.labels.length + 1, 2);
  var chart = sh.newChart()
    .setChartType(column ? Charts.ChartType.COLUMN : Charts.ChartType.LINE)
    .addRange(range)
    .setNumHeaders(1)
    .setOption('title', series.title)
    .setOption('legend', { position: 'none' })
    .setOption('width', 640)
    .setOption('height', 320)
    .setOption('pointSize', column ? 0 : 5)
    .setPosition(TRENDS_LAYOUT.CHART_ROW, 1, 0, 0)
    .build();
  sh.insertChart(chart);
}

/** Rebuild the item list, the chart data block and the chart. Keeps the user's item and metric when still valid. */
function refreshTrends(ss, data) {
  var sh = ss.getSheetByName(TABS.TRENDS);
  if (!sh) return null;
  var L = TRENDS_LAYOUT;
  var plan = planMuscleSummary(data.facts, data.mapRows, data.settings, 'sets');
  var muscles = plan.muscles.filter(function (m) { return m !== UNKNOWN_MUSCLE; });
  var items = trendItems(muscles, exerciseNames(data.facts, data.mapRows));

  sh.getRange(1, L.DATA_COL, sh.getMaxRows(), L.ITEMS_COL - L.DATA_COL + 1).clearContent();
  var itemCell = sh.getRange(L.ITEM_ROW, L.VALUE_COL);
  var metricCell = sh.getRange(L.METRIC_ROW, L.VALUE_COL);
  var noteCell = sh.getRange(L.NOTE_ROW, L.VALUE_COL);
  if (!items.length) {
    itemCell.clearDataValidations().clearContent();
    drawTrendChart(sh, null);
    noteCell.setValue('Add exercises to Exercise Map and log a session first.');
    return null;
  }
  sh.getRange(1, L.ITEMS_COL, items.length + 1, 1).setValues([['Items']].concat(items.map(function (i) { return [i]; })));
  itemCell.setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInRange(sh.getRange(2, L.ITEMS_COL, items.length, 1), true).setAllowInvalid(false).build());

  var chosen = cleanName(itemCell.getValue());
  if (items.indexOf(chosen) === -1) { chosen = items[0]; itemCell.setValue(chosen); }
  var metric = cleanName(metricCell.getValue());
  if (SUMMARY.metrics.indexOf(metric) === -1) { metric = SUMMARY.metrics[0]; metricCell.setValue(metric); }

  var series = trendSeries(data.facts, data.mapRows, data.settings, chosen, metric);
  if (!series.labels.length) {
    drawTrendChart(sh, null);
    noteCell.setValue('Nothing logged yet. Complete a session and this fills in.');
    return series;
  }
  var block = [['Week', series.metric]].concat(series.labels.map(function (l, i) { return [l, series.values[i]]; }));
  sh.getRange(1, L.DATA_COL, block.length, 2).setValues(block);
  noteCell.setValue(series.note || (series.title + ', weeks ' + series.weeks[0] + '-' + series.weeks[series.weeks.length - 1] + ' (Overall Week).'));
  drawTrendChart(sh, series);
  return series;
}

/** Called from the onEdit trigger: redraw when the item or metric dropdown changes. */
function onTrendsEdit(range) {
  var L = TRENDS_LAYOUT;
  if (range.getColumn() > L.VALUE_COL || range.getLastColumn() < L.VALUE_COL) return;
  if (range.getRow() > L.METRIC_ROW || range.getLastRow() < L.ITEM_ROW) return;
  var ss = range.getSheet().getParent();
  try {
    refreshTrends(ss, readSummaryData(ss));
  } catch (e) {
    Logger.log('Trends refresh failed: ' + e);
  }
}
