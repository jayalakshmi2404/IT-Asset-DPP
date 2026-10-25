import { describe, it, expect } from 'vitest';
import { filenameFromDisposition } from '../src/utils/download';

describe('filenameFromDisposition', () => {
  it('reads the quoted filename from the server header', () => {
    expect(filenameFromDisposition('attachment; filename="assets-2026-10-25.csv"')).toBe('assets-2026-10-25.csv');
  });

  it('falls back when the header is missing or has no filename', () => {
    expect(filenameFromDisposition(undefined, 'assets.csv')).toBe('assets.csv');
    expect(filenameFromDisposition('attachment', 'assets.csv')).toBe('assets.csv');
  });

  it('removes characters that are unsafe in a local filename', () => {
    expect(filenameFromDisposition('attachment; filename="../../x y.csv"')).toBe('.._.._x_y.csv');
  });
});
