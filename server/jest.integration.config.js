// Real-MongoDB suite. Separate from the default config so the in-memory model mocks do not apply.
// Run with: MONGODB_TEST_URI="mongodb://127.0.0.1:27017/dpp_integration_test?replicaSet=rs0" npm run test:integration
module.exports = {
  testEnvironment: 'node',
  rootDir: __dirname,
  testMatch: ['<rootDir>/tests/integration/**/*.test.js'],
  testTimeout: 120000,
};
