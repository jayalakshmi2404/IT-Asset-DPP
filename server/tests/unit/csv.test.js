const { parseCsv, toCsv, escapeCell, CsvLimitError } = require('../../services/csv/csv');

describe('CSV parsing', () => {
  test('handles quoted commas, doubled quotes and embedded newlines', () => {
    const { headers, rows } = parseCsv('a,b,c\r\n1,"x, ""quoted"" y","line1\nline2"\r\n');
    expect(headers).toEqual(['a', 'b', 'c']);
    expect(rows).toEqual([['1', 'x, "quoted" y', 'line1\nline2']]);
  });

  test('accepts LF and CRLF, removes a UTF-8 byte-order mark and blank lines', () => {
    const { headers, rows } = parseCsv('﻿assetId,name\n\nAST-1,Café ☕\r\n\r\n');
    expect(headers).toEqual(['assetId', 'name']);
    expect(rows).toEqual([['AST-1', 'Café ☕']]);
  });

  test('an unclosed quote is a clear error, not a silent partial parse', () => {
    expect(() => parseCsv('a,b\n"1,2\n')).toThrow(/unclosed quoted field/);
  });

  test('an empty file is refused', () => {
    expect(() => parseCsv('   \n\n')).toThrow(/empty/);
  });

  test('more than the row limit is refused before validation', () => {
    const body = `a\n${'1\n'.repeat(11)}`;
    expect(() => parseCsv(body, { maxRows: 10 })).toThrow(CsvLimitError);
  });

  test('a file over the byte limit is refused with 413', () => {
    try {
      parseCsv('a\n' + 'x'.repeat(100), { maxBytes: 50 });
      throw new Error('expected a limit error');
    } catch (err) {
      expect(err).toBeInstanceOf(CsvLimitError);
      expect(err.statusCode).toBe(413);
    }
  });
});

describe('CSV writing and formula-injection protection', () => {
  test.each([['=HYPERLINK("http://x")'], ['+SUM(A1)'], ['-1+2'], ['@cmd']])('neutralises a leading formula character in %s', (value) => {
    const out = escapeCell(value);
    expect(out.replace(/^"|"$/g, '').replace(/""/g, '"').startsWith("'")).toBe(true);
  });

  test('an ordinary value is left alone', () => {
    expect(escapeCell('Dell Latitude 7450')).toBe('Dell Latitude 7450');
  });

  test('commas, quotes and line breaks are quoted and quotes doubled', () => {
    expect(escapeCell('a,b')).toBe('"a,b"');
    expect(escapeCell('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCell('x\ny')).toBe('"x\ny"');
  });

  test('a round trip through toCsv and parseCsv keeps values intact (except the formula apostrophe)', () => {
    const columns = [{ key: 'name', header: 'name' }, { key: 'note', header: 'note' }];
    const csv = toCsv(columns, [{ name: 'Cisco, "Catalyst" 9300', note: 'line1\nline2' }]);
    const { headers, rows } = parseCsv(csv.replace(/^﻿/, ''));
    expect(headers).toEqual(['name', 'note']);
    expect(rows[0]).toEqual(['Cisco, "Catalyst" 9300', 'line1\nline2']);
  });

  test('the output starts with a BOM so spreadsheets read UTF-8', () => {
    expect(toCsv([{ key: 'a', header: 'a' }], []).charCodeAt(0)).toBe(0xfeff);
  });
});
