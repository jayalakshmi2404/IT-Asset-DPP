const mongoose = require('mongoose');
// The API test setup replaces this module with a pass-through stub. Load the real implementation.
const { withLedgerTransaction, MAX_ATTEMPTS } = jest.requireActual('../../services/blockchain/transaction');
const { AppError } = require('../../middleware/errorHandler');

/** A fake Mongoose session. `script` is consumed one entry per attempt: an Error to throw, or null to succeed. */
function fakeSessions(script) {
  const sessions = [];
  const start = jest.spyOn(mongoose, 'startSession').mockImplementation(async () => {
    const outcome = script.shift();
    const session = {
      ended: false,
      withTransaction: jest.fn(async (fn) => {
        await fn(session); // the real driver runs the callback, then commits
        if (outcome) throw outcome;
      }),
      endSession: jest.fn(async () => {
        session.ended = true;
      }),
    };
    sessions.push(session);
    return session;
  });
  return { sessions, restore: () => start.mockRestore() };
}

const chainRace = () => Object.assign(new Error('E11000 duplicate key error collection: app.hashblocks index: index_1 dup key'), { code: 11000 });
const standalone = () => Object.assign(new Error('Transaction numbers are only allowed on a replica set member or mongos'), { code: 20 });

describe('withLedgerTransaction', () => {
  afterEach(() => jest.restoreAllMocks());

  test('returns the work result after a successful commit', async () => {
    const { sessions } = fakeSessions([null]);
    const result = await withLedgerTransaction(async () => ({ ok: true }));
    expect(result).toEqual({ ok: true });
    expect(sessions[0].ended).toBe(true);
  });

  test('a standalone server is refused with an honest 503, never a silent non-transactional write', async () => {
    const work = jest.fn(async () => {});
    fakeSessions([standalone()]);
    const err = await withLedgerTransaction(work).catch((e) => e);
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(503);
    expect(err.message).toMatch(/not running as a replica set/);
    expect(err.message).toMatch(/Nothing was saved/);
  });

  test('a chain race is retried against the new chain head, then succeeds', async () => {
    const { sessions } = fakeSessions([chainRace(), chainRace(), null]);
    const work = jest.fn(async () => 'committed');
    await expect(withLedgerTransaction(work)).resolves.toBe('committed');
    expect(work).toHaveBeenCalledTimes(3);
    expect(sessions.every((s) => s.ended)).toBe(true);
  });

  test('a chain race that never settles gives a clear 409 and ends every session', async () => {
    const { sessions } = fakeSessions(Array.from({ length: MAX_ATTEMPTS }, chainRace));
    const err = await withLedgerTransaction(async () => {}).catch((e) => e);
    expect(err.statusCode).toBe(409);
    expect(err.message).toMatch(/Nothing was saved/);
    expect(sessions).toHaveLength(MAX_ATTEMPTS);
    expect(sessions.every((s) => s.ended)).toBe(true);
  });

  test('a business-rule error rolls back and propagates unchanged, without retrying', async () => {
    const rule = new AppError('Cannot record MAINTENANCE while the asset status is DISPOSED.', 409);
    const { sessions } = fakeSessions([rule]);
    const work = jest.fn(async () => {});
    await expect(withLedgerTransaction(work)).rejects.toBe(rule);
    expect(work).toHaveBeenCalledTimes(1);
    expect(sessions[0].ended).toBe(true);
  });

  test('a duplicate key on a non-chain collection is not retried as a chain race', async () => {
    const other = Object.assign(new Error('E11000 duplicate key error collection: app.assets index: assetId_1'), { code: 11000 });
    const { sessions } = fakeSessions([other]);
    await expect(withLedgerTransaction(async () => {})).rejects.toBe(other);
    expect(sessions).toHaveLength(1);
  });

  test('a generic error that merely mentions a replica set is not misreported as a standalone server', async () => {
    const topology = new Error('No replica set members available for this read preference');
    fakeSessions([topology]);
    await expect(withLedgerTransaction(async () => {})).rejects.toBe(topology);
  });
});
