// In-memory stand-in for the Apps Script globals the workbook code touches
// (SpreadsheetApp, Utilities, ScriptApp, Charts, Logger). It models cell values, number formats,
// data validation, protections, charts and triggers; it does NOT render anything or fire onEdit triggers
// (script edits don't either). Validation IS enforced on script writes, as in Sheets: a rule that rejects input
// (setAllowInvalid(false)) makes setValue/setValues throw "The data you entered in cell X violates the data validation rules".
//
// Fidelity choices, copied from observed Sheets behaviour:
//  - getLastRow()/getLastColumn() count a cell that only carries a dropdown/checkbox (see SheetTests.rowsOf).
//  - setValue('3') stores the number 3 unless the cell's number format is '@' (text).
//  - insertCheckboxes() turns blank cells into false.
//  - ranges outside the grid (1000 rows x 26 columns by default) throw.
//  - ui.alert() throws: tests must run non-interactively, and a prompt would hang the real thing.

const MAX_ROWS = 1000;
const MAX_COLS = 26;

function colNumber(letters) {
  return letters.split('').reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
}

function coerce(value, format) {
  if (value === null || value === undefined) return '';
  if (typeof value !== 'string' || format === '@') return value;
  if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(value)) return Number(value);
  if (/^true$/i.test(value)) return true;
  if (/^false$/i.test(value)) return false;
  return value;
}

function chainable(target, names) {
  names.forEach(n => { target[n] = function () { return this; }; });
}

function a1(row, col) {
  let letters = '';
  for (let n = col; n > 0; n = Math.floor((n - 1) / 26)) letters = String.fromCharCode(65 + ((n - 1) % 26)) + letters;
  return letters + row;
}

/** True if value passes the rule (blank always passes; only rules that reject input are checked). */
function passes(value, rule) {
  if (!rule || rule.allowInvalid || value === '') return true;
  const [first] = rule.values;
  switch (rule.type) {
    case 'VALUE_IN_LIST': return first.map(String).includes(String(value));
    case 'VALUE_IN_RANGE': return [].concat(...first.getValues()).map(String).includes(String(value));
    case 'NUMBER_BETWEEN': return typeof value === 'number' && value >= rule.values[0] && value <= rule.values[1];
    case 'CHECKBOX': return typeof value === 'boolean';
    default: return true;
  }
}

class Protection {
  constructor(type, remove) { this.type = type; this.description = ''; this.warningOnly = false; this._remove = remove; }
  setDescription(d) { this.description = d; return this; }
  getDescription() { return this.description; }
  setWarningOnly(w) { this.warningOnly = w; return this; }
  isWarningOnly() { return this.warningOnly; }
  getProtectionType() { return this.type; }
  remove() { this._remove(this); }
}

class ValidationBuilder {
  constructor() { this.rule = { type: null, values: [], allowInvalid: true, helpText: '' }; }
  requireValueInList(list, show) { this.rule.type = 'VALUE_IN_LIST'; this.rule.values = [list, show]; return this; }
  requireValueInRange(range, show) { this.rule.type = 'VALUE_IN_RANGE'; this.rule.values = [range, show]; return this; }
  requireNumberBetween(min, max) { this.rule.type = 'NUMBER_BETWEEN'; this.rule.values = [min, max]; return this; }
  requireCheckbox() { this.rule.type = 'CHECKBOX'; this.rule.values = []; return this; }
  setAllowInvalid(a) { this.rule.allowInvalid = a; return this; }
  setHelpText(t) { this.rule.helpText = t; return this; }
  build() {
    const r = Object.assign({}, this.rule);
    return { rule: r, getCriteriaType: () => r.type, getCriteriaValues: () => r.values, getAllowInvalid: () => r.allowInvalid, getHelpText: () => r.helpText };
  }
}

class Range {
  constructor(sheet, row, col, numRows, numCols) {
    if (row < 1 || col < 1 || numRows < 1 || numCols < 1 || row + numRows - 1 > sheet.maxRows || col + numCols - 1 > sheet.maxCols) {
      throw new Error(`The coordinates or dimensions of the range are invalid: ${sheet.name} r${row} c${col} ${numRows}x${numCols}`);
    }
    Object.assign(this, { sheet, row, col, numRows, numCols });
  }
  each(fn) {
    for (let r = this.row; r < this.row + this.numRows; r++) {
      for (let c = this.col; c < this.col + this.numCols; c++) fn(this.sheet.cell(r, c), r, c);
    }
  }
  getSheet() { return this.sheet; }
  getRow() { return this.row; }
  getColumn() { return this.col; }
  getLastRow() { return this.row + this.numRows - 1; }
  getLastColumn() { return this.col + this.numCols - 1; }
  getNumRows() { return this.numRows; }
  getNumColumns() { return this.numCols; }

  getValue() { return this.sheet.peek(this.row, this.col).v; }
  getValues() {
    const out = [];
    for (let r = 0; r < this.numRows; r++) {
      const line = [];
      for (let c = 0; c < this.numCols; c++) line.push(this.sheet.peek(this.row + r, this.col + c).v);
      out.push(line);
    }
    return out;
  }
  write(row, col, value) {
    const cell = this.sheet.cell(row, col);
    const v = coerce(value, cell.fmt);
    if (cell.dv && !passes(v, cell.dv.rule)) {
      if (process.env.MOCK_TRACE) console.error(`rejected ${JSON.stringify(v)} in ${this.sheet.name}!${a1(row, col)}
` + new Error().stack);
      throw new Error(`Exception: The data you entered in cell ${a1(row, col)} violates the data validation rules set on this cell.`);
    }
    cell.v = v;
  }
  setValue(value) { this.each((cell, r, c) => this.write(r, c, value)); return this; }
  setValues(rows) {
    if (!Array.isArray(rows) || rows.length !== this.numRows) throw new Error(`The number of rows in the data does not match the number of rows in the range. The data has ${rows && rows.length} but the range has ${this.numRows}.`);
    rows.forEach((line, r) => {
      if (line.length !== this.numCols) throw new Error(`The number of columns in the data does not match the number of columns in the range. The data has ${line.length} but the range has ${this.numCols}.`);
      line.forEach((v, c) => this.write(this.row + r, this.col + c, v));
    });
    return this;
  }
  clearContent() { this.each(cell => { cell.v = ''; }); return this; }
  clear() { this.each(cell => { cell.v = ''; cell.fmt = ''; cell.dv = null; cell.bg = ''; }); return this; }
  setBackground(color) { this.each(cell => { cell.bg = color || ''; }); return this; }
  setBackgrounds(rows) {
    if (rows.length !== this.numRows || rows.some(line => line.length !== this.numCols)) throw new Error('The background data does not match the range size.');
    rows.forEach((line, r) => line.forEach((color, c) => { this.sheet.cell(this.row + r, this.col + c).bg = color || ''; }));
    return this;
  }
  getBackground() { return this.sheet.peek(this.row, this.col).bg || '#ffffff'; }   // Sheets reports the default fill as white
  clearDataValidations() { this.each(cell => { cell.dv = null; }); return this; }
  setNumberFormat(f) { this.each(cell => { cell.fmt = f; }); return this; }
  setDataValidation(rule) { this.each(cell => { cell.dv = rule; }); return this; }
  getDataValidation() { return this.sheet.peek(this.row, this.col).dv; }
  insertCheckboxes() {
    const rule = new ValidationBuilder().requireCheckbox().build();
    this.each(cell => { cell.dv = rule; if (cell.v === '') cell.v = false; });
    return this;
  }
  protect() { return this.sheet.addProtection('RANGE'); }
}
chainable(Range.prototype, ['setFontWeight', 'setFontStyle', 'setFontSize', 'setFontColor', 'setWrap',
  'setVerticalAlignment', 'setHorizontalAlignment', 'setBorder']);

class Sheet {
  constructor(ss, name) {
    Object.assign(this, { ss, name, maxRows: MAX_ROWS, maxCols: MAX_COLS, cells: new Map(), protections: [], charts: [], frozenRows: 0 });
  }
  cell(r, c) {
    const key = r + ',' + c;
    if (!this.cells.has(key)) this.cells.set(key, { v: '', fmt: '', dv: null, bg: '' });
    return this.cells.get(key);
  }
  peek(r, c) { return this.cells.get(r + ',' + c) || { v: '', fmt: '', dv: null, bg: '' }; }
  extent(axis) {   // last row (axis 0) or column (axis 1) holding a value or a validation
    let last = 0;
    this.cells.forEach((cell, key) => {
      if (cell.v === '' && !cell.dv) return;
      last = Math.max(last, Number(key.split(',')[axis]));
    });
    return last;
  }
  getName() { return this.name; }
  setName(n) { this.name = n; return this; }
  getParent() { return this.ss; }
  getLastRow() { return this.extent(0); }
  getLastColumn() { return this.extent(1); }
  getMaxRows() { return this.maxRows; }
  getMaxColumns() { return this.maxCols; }
  getDataRange() { return new Range(this, 1, 1, Math.max(this.getLastRow(), 1), Math.max(this.getLastColumn(), 1)); }
  getRange(a, b, c, d) {
    if (typeof a === 'string') {
      const m = a.match(/^([A-Z]+)(\d+)(?::([A-Z]+)(\d*))?$/);
      if (!m) throw new Error('Unsupported A1 notation in mock: ' + a);
      const c1 = colNumber(m[1]), r1 = Number(m[2]);
      if (!m[3]) return new Range(this, r1, c1, 1, 1);
      const c2 = colNumber(m[3]), r2 = m[4] ? Number(m[4]) : this.maxRows;   // "A2:A" runs to the bottom
      return new Range(this, r1, c1, r2 - r1 + 1, c2 - c1 + 1);
    }
    return new Range(this, a, b, c || 1, d || 1);
  }
  clear() { this.cells.clear(); return this; }
  insertColumnsAfter(col, n) {
    const moved = new Map();
    this.cells.forEach((cell, key) => {
      const [r, c] = key.split(',').map(Number);
      moved.set(r + ',' + (c > col ? c + n : c), cell);
    });
    this.cells = moved;
    this.maxCols += n;
    return this;
  }
  setFrozenRows(n) { this.frozenRows = n; return this; }
  addProtection(type) {
    const p = new Protection(type, self => { this.protections = this.protections.filter(x => x !== self); });
    this.protections.push(p);
    return p;
  }
  protect() { return this.addProtection('SHEET'); }
  getProtections(type) { return this.protections.filter(p => p.type === type); }
  newChart() {
    const chart = { options: {}, ranges: [] };
    const builder = {
      setChartType: t => { chart.type = t; return builder; },
      addRange: r => { chart.ranges.push(r); return builder; },
      setNumHeaders: n => { chart.numHeaders = n; return builder; },
      setOption: (k, v) => { chart.options[k] = v; return builder; },
      setPosition: () => builder,
      build: () => chart
    };
    return builder;
  }
  insertChart(chart) { this.charts.push(chart); }
  removeChart(chart) { this.charts = this.charts.filter(c => c !== chart); }
  getCharts() { return this.charts.slice(); }
}
chainable(Sheet.prototype, ['setFrozenColumns', 'setColumnWidth', 'setColumnWidths', 'setRowHeight', 'setHiddenGridlines',
  'setConditionalFormatRules']);

class Spreadsheet {
  constructor() { this.sheets = [new Sheet(this, 'Sheet1')]; this.active = this.sheets[0]; this.toasts = []; }
  getName() { return 'Mock Workout Tracker'; }
  getId() { return 'mock-spreadsheet-id'; }
  getUrl() { return 'https://docs.google.com/spreadsheets/d/mock-spreadsheet-id'; }
  getSpreadsheetTimeZone() { return 'America/New_York'; }
  getSheets() { return this.sheets.slice(); }
  getSheetByName(name) { return this.sheets.find(s => s.name === name) || null; }
  insertSheet(name) {
    if (this.getSheetByName(name)) throw new Error(`A sheet with the name "${name}" already exists.`);
    const sh = new Sheet(this, name);
    this.sheets.push(sh);
    this.active = sh;
    return sh;
  }
  deleteSheet(sh) { this.sheets = this.sheets.filter(s => s !== sh); }
  setActiveSheet(sh) { this.active = sh; return sh; }
  moveActiveSheet(pos) {
    this.sheets = this.sheets.filter(s => s !== this.active);
    this.sheets.splice(pos - 1, 0, this.active);
  }
  toast(msg) { this.toasts.push(msg); }
}

function formatDate(date, tz, pattern) {
  const p2 = n => String(n).padStart(2, '0');
  return pattern.replace('yyyy', date.getFullYear()).replace('MM', p2(date.getMonth() + 1)).replace('dd', p2(date.getDate()))
    .replace('HH', p2(date.getHours())).replace('mm', p2(date.getMinutes())).replace('ss', p2(date.getSeconds()));
}

/** Fresh set of globals (and the handles a runner wants to inspect). */
function createMockEnv() {
  const ss = new Spreadsheet();
  const triggers = [];
  const logs = [];
  const menu = { addItem() { return menu; }, addSeparator() { return menu; }, addToUi() {} };
  const ui = {
    ButtonSet: { YES_NO: 'YES_NO' },
    Button: { YES: 'YES', NO: 'NO' },
    createMenu: () => menu,
    alert: title => { throw new Error('Unexpected ui.alert in a non-interactive test: ' + title); }
  };
  const SpreadsheetApp = {
    getActive: () => ss,
    getUi: () => ui,
    flush() {},
    newDataValidation: () => new ValidationBuilder(),
    newConditionalFormatRule: () => {
      const b = { setGradientMinpoint: () => b, setGradientMaxpoint: () => b, setRanges: () => b, build: () => ({}) };
      return b;
    },
    ProtectionType: { RANGE: 'RANGE', SHEET: 'SHEET' },
    BorderStyle: { SOLID: 'SOLID' }
  };
  const ScriptApp = {
    getProjectTriggers: () => triggers.slice(),
    newTrigger: fn => {
      const t = { getHandlerFunction: () => fn };
      const b = { forSpreadsheet: () => b, onEdit: () => b, create: () => { triggers.push(t); return t; } };
      return b;
    }
  };
  const Charts = { ChartType: { COLUMN: 'COLUMN', LINE: 'LINE' } };
  const Logger = { log: msg => { logs.push(String(msg)); } };
  return { ss, triggers, logs, globals: { SpreadsheetApp, ScriptApp, Charts, Logger, Utilities: { formatDate } } };
}

module.exports = { createMockEnv };
