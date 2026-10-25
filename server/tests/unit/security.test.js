const { escapeRegex, requireString, requireObjectId, requireEnum, clampInt, optionalString } = require('../../utils/security');
const { AppError } = require('../../middleware/errorHandler');

describe('Input helpers', () => {
  test('escapeRegex neutralises metacharacters', () => {
    const pattern = new RegExp(escapeRegex('.*+?'));
    expect('.*+?'.match(pattern)).not.toBeNull();
    expect('anything'.match(pattern)).toBeNull();
  });

  test('requireString rejects operator objects and arrays (NoSQL injection)', () => {
    expect(() => requireString({ $ne: null }, 'Email')).toThrow(AppError);
    expect(() => requireString(['a'], 'Email')).toThrow(/must be text/);
    expect(() => requireString(42, 'Email')).toThrow(/must be text/);
  });

  test('requireString enforces length and presence', () => {
    expect(requireString('  ok  ', 'Name')).toBe('ok');
    expect(() => requireString('', 'Name')).toThrow(/is required/);
    expect(() => requireString('x'.repeat(201), 'Name')).toThrow(/at most 200/);
    expect(optionalString(undefined, 'Brand')).toBeUndefined();
  });

  test('requireObjectId accepts only 24-hex identifiers', () => {
    expect(requireObjectId('64b7f0c2a1b2c3d4e5f60718', 'id')).toBe('64b7f0c2a1b2c3d4e5f60718');
    expect(() => requireObjectId('not-an-id', 'id')).toThrow(/not a valid identifier/);
    expect(() => requireObjectId({ $gt: '' }, 'id')).toThrow(AppError);
  });

  test('requireEnum rejects values outside the allow-list', () => {
    expect(requireEnum('ADMIN', ['ADMIN'], 'role')).toBe('ADMIN');
    expect(() => requireEnum('ROOT', ['ADMIN'], 'role')).toThrow(/must be one of/);
  });

  test('clampInt bounds paging values', () => {
    expect(clampInt('5000', { min: 1, max: 100, fallback: 20 })).toBe(100);
    expect(clampInt('-3', { min: 1, max: 100, fallback: 20 })).toBe(1);
    expect(clampInt('abc', { min: 1, max: 100, fallback: 20 })).toBe(20);
  });
});
