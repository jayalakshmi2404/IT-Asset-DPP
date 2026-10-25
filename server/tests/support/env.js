// Test-only environment. Never used by the application outside the test runner.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-only-secret-that-is-long-enough-0123456789';
process.env.JWT_EXPIRES_IN = '1h';
process.env.MONGODB_URI = 'mongodb://127.0.0.1:0/test-only-not-used';
process.env.CLIENT_URL = 'http://localhost:5173';
