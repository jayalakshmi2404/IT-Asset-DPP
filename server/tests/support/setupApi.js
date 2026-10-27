// Replaces persistence for API tests with the in-memory fakes in fakeDb.js.
// The ledger transaction wrapper is stubbed because there is no replica set here.
jest.mock('../../models/User', () => require('./fakeDb').models.User);
jest.mock('../../models/Department', () => require('./fakeDb').models.Department);
jest.mock('../../models/Asset', () => require('./fakeDb').models.Asset);
jest.mock('../../models/LifecycleEvent', () => require('./fakeDb').models.LifecycleEvent);
jest.mock('../../models/HashBlock', () => require('./fakeDb').models.HashBlock);
jest.mock('../../models/AnchorRecord', () => require('./fakeDb').models.AnchorRecord);
jest.mock('../../models/MockAnchorTx', () => require('./fakeDb').models.MockAnchorTx);
jest.mock('../../models/AuditLog', () => {
  const model = require('./fakeDb').models.AuditLog;
  // AuditLog also exports its enum; re-attach it so controllers can import it.
  const { AUDIT_ACTIONS } = jest.requireActual('../../models/AuditLog');
  return Object.assign(model, { AUDIT_ACTIONS });
});
jest.mock('../../services/blockchain/transaction', () => ({
  withLedgerTransaction: async (work) => work(null),
}));
jest.mock('../../config/db', () => ({
  connectDB: jest.fn(async () => {}),
  dbState: jest.fn(() => 'connected'),
  isConnected: () => true,
}));

beforeEach(() => {
  require('./fakeDb').resetStore();
});
