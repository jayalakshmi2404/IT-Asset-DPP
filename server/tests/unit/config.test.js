const { validateConfig, assertConfig } = require('../../config/env');

describe('Startup configuration', () => {
  const good = { MONGODB_URI: 'mongodb://127.0.0.1:27017/x?replicaSet=rs0', JWT_SECRET: 'k'.repeat(48) };

  test('a complete configuration passes', () => {
    expect(validateConfig(good)).toEqual([]);
    expect(() => assertConfig(good)).not.toThrow();
  });

  test('missing database URI or secret is reported', () => {
    expect(validateConfig({ JWT_SECRET: 'k'.repeat(48) })).toEqual(expect.arrayContaining([expect.stringMatching(/MONGODB_URI/)]));
    expect(validateConfig({ MONGODB_URI: 'x' })).toEqual(expect.arrayContaining([expect.stringMatching(/JWT_SECRET/)]));
  });

  test('placeholder secrets from the example file are refused', () => {
    expect(validateConfig({ ...good, JWT_SECRET: 'your-strong-secret-replace-this-value-now' }).join(' ')).toMatch(/placeholder/);
  });

  test('the dev seed cannot be enabled in production', () => {
    expect(validateConfig({ ...good, NODE_ENV: 'production', ALLOW_DEV_SEED: 'true' }).join(' ')).toMatch(/ALLOW_DEV_SEED/);
  });

  test('assertConfig throws with the list of problems', () => {
    expect(() => assertConfig({})).toThrow(/Invalid configuration/);
  });
});
