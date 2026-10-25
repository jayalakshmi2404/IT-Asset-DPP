/**
 * REAL MongoDB integration tests. These exercise true transactions, real unique indexes and real
 * concurrency, which the in-memory fake database cannot prove.
 *
 * Run only when MONGODB_TEST_URI is set to a replica set or Atlas cluster, for example:
 *   MONGODB_TEST_URI="mongodb://127.0.0.1:27017/dpp_integration_test?replicaSet=rs0" npm run test:integration
 *
 * Safety: the database name MUST contain "test". The suite drops that database and never runs
 * against a production or user database. Without MONGODB_TEST_URI the whole suite is skipped
 * and says so, rather than reporting a pass.
 */
const TEST_URI = process.env.MONGODB_TEST_URI || '';
const describeIfReal = TEST_URI ? describe : describe.skip;

if (!TEST_URI) {
  // eslint-disable-next-line no-console
  console.warn('[integration] MONGODB_TEST_URI is not set. The real-MongoDB suite is SKIPPED, not passed.');
}

describeIfReal('Real MongoDB: transactions, indexes and concurrency', () => {
  let mongoose;
  let connectDB;
  let assertReplicaSet;
  let withLedgerTransaction;
  let registerAsset;
  let recordLifecycleEvent;
  let appendBlock;
  let ensureGenesisBlock;
  let verifyFullChain;
  let verifyAssetChain;
  let Asset;
  let LifecycleEvent;
  let HashBlock;
  let AppError;
  let adminUser;

  const dbNameFromUri = (uri) => new URL(uri.replace(/^mongodb(\+srv)?:\/\//, 'http://')).pathname.replace(/^\//, '');

  beforeAll(async () => {
    if (!/test/i.test(dbNameFromUri(TEST_URI))) {
      throw new Error('Refusing to run: the database name in MONGODB_TEST_URI must contain "test".');
    }
    process.env.MONGODB_URI = TEST_URI;
    process.env.NODE_ENV = 'test';

    mongoose = require('mongoose');
    // Connect and reset BEFORE any model is loaded: models start building their indexes as soon as
    // the connection opens, and dropping the database while that happens is refused by the server.
    ({ connectDB, assertReplicaSet } = require('../../config/db'));
    await connectDB();
    await mongoose.connection.db.dropDatabase(); // isolated test database only (name checked above)

    ({ withLedgerTransaction } = require('../../services/blockchain/transaction'));
    ({ registerAsset, recordLifecycleEvent } = require('../../services/lifecycleService'));
    ({ appendBlock, ensureGenesisBlock } = require('../../services/blockchain/hashChain'));
    ({ verifyFullChain, verifyAssetChain } = require('../../services/verification/verifyChain'));
    Asset = require('../../models/Asset');
    LifecycleEvent = require('../../models/LifecycleEvent');
    HashBlock = require('../../models/HashBlock');
    ({ AppError } = require('../../middleware/errorHandler'));
    await Promise.all([Asset.init(), LifecycleEvent.init(), HashBlock.init()]);
    await ensureGenesisBlock();

    const User = require('../../models/User');
    adminUser = await User.create({ name: 'Integration Admin', email: 'int-admin@example.test', role: 'ADMIN', passwordHash: 'x', status: 'ACTIVE' });
  });

  afterAll(async () => {
    if (mongoose && mongoose.connection.readyState === 1) {
      await mongoose.connection.db.dropDatabase();
      await mongoose.disconnect();
    }
  });

  const fieldsFor = (assetId) => ({
    assetId,
    name: `Asset ${assetId}`,
    category: 'Laptop',
    brand: 'Dell',
    model: 'Latitude',
    purchaseDate: new Date('2024-01-01'),
    purchaseCost: 1000,
    location: 'HQ',
    departmentId: null,
    department: '',
    assignedTo: null,
    owner: '',
  });

  test('connects through the real connection path and confirms transactions are supported', async () => {
    const info = await assertReplicaSet();
    expect(info.topology === 'replicaSet' || info.topology === 'sharded').toBe(true);
  });

  test('the unique indexes that protect the ledger exist in the database', async () => {
    const hashIdx = await HashBlock.collection.indexes();
    const hashUnique = hashIdx.filter((i) => i.unique).map((i) => Object.keys(i.key)[0]);
    expect(hashUnique).toEqual(expect.arrayContaining(['index', 'currentHash']));

    const eventIdx = await LifecycleEvent.collection.indexes();
    expect(eventIdx.filter((i) => i.unique).map((i) => Object.keys(i.key)[0])).toEqual(expect.arrayContaining(['eventId', 'currentHash']));

    const assetIdx = await Asset.collection.indexes();
    expect(assetIdx.filter((i) => i.unique).map((i) => Object.keys(i.key)[0])).toEqual(expect.arrayContaining(['assetId', 'dppId']));
  });

  test('registration writes the asset, its event and its block together, and the chain verifies', async () => {
    const { asset, registrationEvent } = await registerAsset({ fields: fieldsFor('INT-001'), actor: adminUser });
    expect(asset.dppId).toBe('DPP-INT-001');
    expect(registrationEvent.blockIndex).toBeGreaterThan(0);

    const asset_ = await verifyAssetChain('INT-001');
    expect(asset_.status).toBe('VERIFIED');
    const full = await verifyFullChain();
    expect(full.status).toBe('VERIFIED');
  });

  test('a failed transaction leaves NO block, event or asset change behind', async () => {
    const { asset } = await registerAsset({ fields: fieldsFor('INT-002'), actor: adminUser });
    const before = {
      blocks: await HashBlock.countDocuments(),
      events: await LifecycleEvent.countDocuments(),
      status: (await Asset.findById(asset._id)).status,
    };

    await expect(
      withLedgerTransaction(async (session) => {
        // Real partial writes inside the transaction...
        await appendBlock({
          assetId: 'INT-002',
          eventId: 'EVT-ROLLBACK-TEST',
          eventType: 'MAINTENANCE',
          description: 'should never persist',
          performedByName: 'Integration Admin',
          timestamp: new Date(),
          metadata: {},
          session,
        });
        await LifecycleEvent.create(
          [{ eventId: 'EVT-ROLLBACK-TEST', asset: asset._id, assetId: 'INT-002', eventType: 'MAINTENANCE', description: 'x', performedBy: adminUser._id, performedByName: 'Integration Admin', previousHash: '0', currentHash: 'f'.repeat(64), blockIndex: 999 }],
          { session }
        );
        await Asset.updateOne({ _id: asset._id }, { status: 'DISPOSED' }, { session });
        // ...then a failure that must roll every one of them back.
        throw new AppError('Simulated failure after partial writes.', 500);
      })
    ).rejects.toThrow('Simulated failure after partial writes.');

    expect(await HashBlock.countDocuments()).toBe(before.blocks);
    expect(await LifecycleEvent.countDocuments()).toBe(before.events);
    expect((await Asset.findById(asset._id)).status).toBe(before.status);
    expect((await verifyFullChain()).status).toBe('VERIFIED');
  });

  test('concurrent lifecycle writes never corrupt the chain: indexes stay contiguous and it verifies', async () => {
    const { asset } = await registerAsset({ fields: fieldsFor('INT-003'), actor: adminUser });
    const attempts = 12;
    const results = await Promise.allSettled(
      Array.from({ length: attempts }, (_, i) =>
        recordLifecycleEvent({
          assetObjectId: asset._id,
          actor: adminUser,
          plan: () => ({
            allowedFrom: ['ACTIVE'],
            eventType: 'ALLOCATION',
            description: `Concurrent allocation ${i}`,
            metadata: { step: i },
            updates: { location: `Loc ${i}` },
            nextStatus: 'ACTIVE',
          }),
        })
      )
    );

    const succeeded = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected');
    // Every failure must be a clear, expected error (never a half-written record).
    for (const f of failed) expect(f.reason.statusCode).toBe(409);
    expect(succeeded).toBeGreaterThan(0);

    const blocks = await HashBlock.find().sort({ index: 1 }).lean();
    blocks.forEach((b, i) => expect(b.index).toBe(i)); // no gaps, no duplicates

    const full = await verifyFullChain();
    expect(full.status).toBe('VERIFIED');
    const assetCheck = await verifyAssetChain('INT-003');
    expect(assetCheck.status).toBe('VERIFIED');
    expect(assetCheck.totalEvents).toBe(succeeded + 1); // successes plus the registration
  });

  test('two registrations with the same assetId: exactly one commits, and the loser leaves no partial record', async () => {
    const results = await Promise.allSettled([
      registerAsset({ fields: fieldsFor('INT-DUP'), actor: adminUser }),
      registerAsset({ fields: fieldsFor('INT-DUP'), actor: adminUser }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const loser = results.find((r) => r.status === 'rejected');
    expect(loser.reason.code).toBe(11000); // duplicate key, surfaced to the error handler as 409

    expect(await Asset.countDocuments({ assetId: 'INT-DUP' })).toBe(1);
    expect(await LifecycleEvent.countDocuments({ assetId: 'INT-DUP' })).toBe(1);
    expect((await verifyFullChain()).status).toBe('VERIFIED');
  });
});
