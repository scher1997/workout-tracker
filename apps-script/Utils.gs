/** Utils.gs — small pure helpers shared by the builders and tests. */

/** Lowercase, trimmed, whitespace-collapsed key for matching names. */
function normalizeName(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim().toLowerCase();
}

/** Trimmed display name (keeps the user's casing). */
function cleanName(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

/** Number from a cell ("45", 45, "45 lb", "45,5"); null if blank or not numeric. */
function parseNumber(value) {
  if (typeof value === 'number') return isFinite(value) ? value : null;
  var text = String(value == null ? '' : value).trim().replace(',', '.');
  if (text === '') return null;
  var match = text.match(/-?\d+(\.\d+)?/);
  return match ? parseFloat(match[0]) : null;
}

/** Non-negative weight from a cell, else the fallback (0 is allowed: it switches that role off). */
function toWeight(value, fallback) {
  var n = parseNumber(value);
  return n !== null && n >= 0 ? n : fallback;
}

/** Log where the time goes: t = stageTimer("completeWeek"); t.mark("read"); ... t.done(). Output is in Extensions > Apps Script > Executions. */
function stageTimer(name) {
  var start = Date.now(), last = start, parts = [];
  return {
    mark: function (stage) { var now = Date.now(); parts.push(stage + " " + (now - last) + "ms"); last = now; },
    done: function () { Logger.log(name + " total " + (Date.now() - start) + "ms: " + parts.join(", ")); }
  };
}

/** Run fn with summary refreshes held off (the caller refreshes once at the end). */
function withSummaryPaused(fn) {
  var was = SUMMARY_STATE.paused;
  SUMMARY_STATE.paused = true;
  try { return fn(); } finally { SUMMARY_STATE.paused = was; }
}

function round2(x) { return Math.round(x * 100) / 100; }

/** Positive integer from a cell, else the fallback. */
function toPosInt(value, fallback) {
  var n = parseNumber(value);
  return n !== null && n >= 1 ? Math.round(n) : fallback;
}
