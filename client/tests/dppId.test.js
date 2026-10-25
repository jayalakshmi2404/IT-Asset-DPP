import { describe, it, expect } from 'vitest';
import { extractDppId } from '../src/utils/dppId';

describe('extractDppId', () => {
  it('accepts a bare DPP ID, with surrounding whitespace removed', () => {
    expect(extractDppId('  DPP-AST-001 ')).toBe('DPP-AST-001');
  });

  it('extracts the ID from the verification URL that the QR code encodes', () => {
    expect(extractDppId('https://passport.example.org/verify/DPP-AST-001')).toBe('DPP-AST-001');
    expect(extractDppId('http://localhost:5173/verify/DPP-ASSET049-43A1A8?x=1')).toBe('DPP-ASSET049-43A1A8');
  });

  it('rejects unrelated QR content instead of sending it to the server', () => {
    expect(extractDppId('https://example.com/menu')).toBeNull();
    expect(extractDppId('WIFI:S:home;T:WPA;P:secret;;')).toBeNull();
    expect(extractDppId('')).toBeNull();
    expect(extractDppId(null)).toBeNull();
  });

  it('rejects IDs with characters outside the allowed set, including path tricks', () => {
    expect(extractDppId('DPP-../../admin')).toBeNull();
    expect(extractDppId('https://x.test/verify/%E0%A4%A')).toBeNull();
  });
});
