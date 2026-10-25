const Asset = require('../models/Asset');
const LifecycleEvent = require('../models/LifecycleEvent');
const { appendBlock } = require('./blockchain/hashChain');
const { withLedgerTransaction } = require('./blockchain/transaction');
const { canonicalEventFields } = require('./blockchain/hashCrypto');
const { generateEventId, buildDppId } = require('../utils/ids');
const { AppError } = require('../middleware/errorHandler');

/**
 * The ONE path every lifecycle-affecting change goes through: registration,
 * allocation, maintenance, transfer, disposal. Each call:
 *   1. runs inside a MongoDB transaction together with the hash-chain append
 *   2. re-reads the asset inside that transaction and checks the state transition
 *   3. writes the hash block, the lifecycle record, and the asset update atomically
 *
 * `plan(asset)` must be a pure function of the asset it receives. It can run more
 * than once if the transaction is retried.
 */

async function writeEvent({ session, asset, eventType, description, actor, metadata, updates = {}, nextStatus }) {
  const timestamp = new Date();
  const eventId = generateEventId();
  // One normalised object is both hashed and stored, so the stored record always matches its hash.
  const fields = canonicalEventFields({ description, performedByName: actor.name, metadata });

  const { previousHash, currentHash, blockIndex } = await appendBlock({
    assetId: asset.assetId,
    eventId,
    eventType,
    description: fields.description,
    performedByName: fields.performedByName,
    timestamp,
    metadata: fields.metadata,
    session,
  });

  const [event] = await LifecycleEvent.create(
    [
      {
        eventId,
        asset: asset._id,
        assetId: asset.assetId,
        eventType,
        description: fields.description,
        performedBy: actor._id,
        performedByName: fields.performedByName,
        timestamp,
        metadata: fields.metadata,
        previousHash,
        currentHash,
        blockIndex,
      },
    ],
    { session }
  );

  Object.assign(asset, updates, { status: nextStatus });
  await asset.save({ session });

  return event;
}

/**
 * Registers a new asset and writes its REGISTRATION event in one transaction.
 * Returns { asset, registrationEvent }.
 */
async function registerAsset({ fields, actor }) {
  return withLedgerTransaction(async (session) => {
    const dppId = buildDppId(fields.assetId);
    const [asset] = await Asset.create(
      [{ ...fields, dppId, status: 'ACTIVE', createdBy: actor._id }],
      { session }
    );

    const registrationEvent = await writeEvent({
      session,
      asset,
      eventType: 'REGISTRATION',
      description: `Asset "${asset.name}" registered in the system.`,
      actor,
      metadata: { category: asset.category, brand: asset.brand, model: asset.model, location: asset.location },
      nextStatus: 'ACTIVE',
    });

    return { asset, registrationEvent };
  });
}

/**
 * Records a lifecycle event on an existing asset.
 *   plan(asset) -> { allowedFrom: string[], eventType, description, metadata, updates, nextStatus }
 */
async function recordLifecycleEvent({ assetObjectId, actor, plan }) {
  return withLedgerTransaction(async (session) => {
    const asset = await Asset.findById(assetObjectId).session(session);
    if (!asset) throw new AppError('Asset not found.', 404);

    const change = plan(asset);

    if (asset.status === 'DISPOSED') {
      throw new AppError('This asset has been disposed and cannot receive further lifecycle events.', 409);
    }
    if (!change.allowedFrom.includes(asset.status)) {
      throw new AppError(`Cannot record ${change.eventType} while the asset status is ${asset.status}.`, 409);
    }

    const event = await writeEvent({
      session,
      asset,
      eventType: change.eventType,
      description: change.description,
      actor,
      metadata: change.metadata,
      updates: change.updates,
      nextStatus: change.nextStatus,
    });

    return { event, asset };
  });
}

module.exports = { registerAsset, recordLifecycleEvent };
