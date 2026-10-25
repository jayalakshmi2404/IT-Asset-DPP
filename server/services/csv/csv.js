/**
 * CSV parsing and writing for bulk import and export.
 *
 * Parsing follows RFC 4180: quoted fields may contain commas, quotes (doubled) and newlines; CRLF
 * and LF are both accepted; a UTF-8 byte-order mark is removed. Limits are enforced before parsing
 * so an oversized upload is refused without being read cell by cell.
 *
 * Writing escapes commas, quotes and newlines, and neutralises spreadsheet formula injection:
 * any cell whose first character would make a spreadsheet evaluate it as a formula (= + - @, tab,
 * carriage return) is prefixed with a single quote, so Excel and Sheets show it as text.
 */

const MAX_IMPORT_BYTES = 2 * 1024 * 1024; // 2 MB
const MAX_IMPORT_ROWS = 1000;
const FORMULA_START = /^[=+\-@\t\r]/;

class CsvLimitError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CsvLimitError';
    this.statusCode = 413;
  }
}

/** Parses CSV text into { headers, rows } where rows are arrays of strings. Throws CsvLimitError when limits are exceeded. */
function parseCsv(text, { maxRows = MAX_IMPORT_ROWS, maxBytes = MAX_IMPORT_BYTES } = {}) {
  if (typeof text !== 'string') throw new TypeError('CSV content must be text.');
  if (Buffer.byteLength(text, 'utf8') > maxBytes) {
    throw new CsvLimitError(`The file is larger than ${Math.round(maxBytes / 1024 / 1024)} MB. Split it into smaller files.`);
  }
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  const records = [];
  let record = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }
    if (ch === '"' && field === '') {
      inQuotes = true;
      i += 1;
    } else if (ch === ',') {
      record.push(field);
      field = '';
      i += 1;
    } else if (ch === '\r' || ch === '\n') {
      record.push(field);
      records.push(record);
      record = [];
      field = '';
      i += ch === '\r' && src[i + 1] === '\n' ? 2 : 1;
    } else {
      field += ch;
      i += 1;
    }
  }
  if (inQuotes) throw new Error('The CSV has an unclosed quoted field. Check for a missing closing quote.');
  if (field !== '' || record.length) {
    record.push(field);
    records.push(record);
  }

  // Drop fully blank lines (for example a trailing newline).
  const nonBlank = records.filter((r) => r.some((c) => c.trim() !== ''));
  if (nonBlank.length === 0) throw new Error('The file is empty.');
  const [headers, ...rows] = nonBlank;
  if (rows.length > maxRows) {
    throw new CsvLimitError(`The file has ${rows.length} data rows. The limit is ${maxRows} rows per import.`);
  }
  return { headers: headers.map((h) => h.trim()), rows };
}

/** Makes one cell safe for a spreadsheet: formula characters are neutralised with a leading apostrophe. */
function safeCell(value) {
  if (value === null || value === undefined) return '';
  let s = String(value);
  if (FORMULA_START.test(s)) s = `'${s}`;
  return s;
}

/** Quotes a cell when it contains a delimiter, quote or line break. Unicode is written as-is (UTF-8). */
function escapeCell(value) {
  const s = safeCell(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Builds CSV text from column definitions and row objects. Columns are { key, header }. */
function toCsv(columns, rows) {
  const lines = [columns.map((c) => escapeCell(c.header)).join(',')];
  for (const row of rows) {
    lines.push(columns.map((c) => escapeCell(row[c.key])).join(','));
  }
  return `﻿${lines.join('\r\n')}\r\n`; // BOM so Excel opens UTF-8 correctly
}

module.exports = { parseCsv, toCsv, escapeCell, safeCell, CsvLimitError, MAX_IMPORT_BYTES, MAX_IMPORT_ROWS };
