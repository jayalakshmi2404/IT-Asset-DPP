require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const { connectDB } = require('./config/db');
const { assertConfig } = require('./config/env');
const { ensureGenesisBlock } = require('./services/blockchain/hashChain');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const authRoutes = require('./routes/auth.routes');
const assetRoutes = require('./routes/asset.routes');
const lifecycleRoutes = require('./routes/lifecycle.routes');
const integrityRoutes = require('./routes/integrity.routes');
const verifyRoutes = require('./routes/verify.routes');
const userRoutes = require('./routes/user.routes');
const departmentRoutes = require('./routes/department.routes');
const auditRoutes = require('./routes/audit.routes');
const reportRoutes = require('./routes/report.routes');
const healthRoutes = require('./routes/health.routes');
const anchorRoutes = require('./routes/anchor.routes');

const isTest = process.env.NODE_ENV === 'test';
const app = express();

app.disable('x-powered-by');
app.use(helmet());
app.use(
  cors({
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: false, // bearer tokens, not cookies: no ambient credentials cross origins
  })
);
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: false, limit: '100kb' }));
if (!isTest) app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

const skipInTests = () => isTest;

// Brute-force protection for sign-in
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 50, standardHeaders: true, legacyHeaders: false, skip: skipInTests });
app.use('/api/auth/login', authLimiter);

// Public verification is unauthenticated, so it is rate-limited too
const verifyLimiter = rateLimit({ windowMs: 60 * 1000, max: 60, standardHeaders: true, legacyHeaders: false, skip: skipInTests });
app.use('/api/verify', verifyLimiter);

app.use('/api/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/assets', assetRoutes);
app.use('/api/lifecycle', lifecycleRoutes);
app.use('/api/integrity', integrityRoutes);
app.use('/api/verify', verifyRoutes);
app.use('/api/users', userRoutes);
app.use('/api/departments', departmentRoutes);
app.use('/api/audit-logs', auditRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/anchors', anchorRoutes);

app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
let server;

async function start() {
  assertConfig();
  await connectDB();
  await ensureGenesisBlock();
  server = app.listen(PORT, () => {
    console.log(`[server] IT Asset DPP API listening on port ${PORT} (${process.env.NODE_ENV || 'development'})`);
  });
}

function gracefulShutdown(signal) {
  console.log(`[server] Received ${signal}, shutting down gracefully...`);
  if (server) {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10000).unref();
  } else {
    process.exit(0);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('unhandledRejection', (reason) => {
  console.error('[server] Unhandled promise rejection:', reason);
});

if (require.main === module) {
  start().catch((err) => {
    console.error('[server] Failed to start:', err.message);
    process.exit(1);
  });
}

module.exports = { app, start };
