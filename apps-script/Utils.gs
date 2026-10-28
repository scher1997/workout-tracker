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

/** Positive integer from a cell, else the fallback. */
function toPosInt(value, fallback) {
  var n = parseNumber(value);
  return n !== null && n >= 1 ? Math.round(n) : fallback;
}
