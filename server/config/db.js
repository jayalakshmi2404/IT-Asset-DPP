const mongoose = require('mongoose');

let isConnected = false;

const NOT_REPLICA_SET_MESSAGE =
  'Connected to a MongoDB server that is not a replica set. Lifecycle writes need transactions. ' +
  'Use a MongoDB Atlas mongodb+srv:// connection string, or add ?replicaSet=<name> to a local URI with a replica set. See docs/ATLAS_SETUP.md.';

/**
 * Confirms the connected server can run transactions. A standalone mongod cannot, so the server
 * refuses to start instead of failing on the first lifecycle write.
 * `hello` is the modern command; `isMaster` is used by very old servers.
 */
async function assertReplicaSet() {
  const admin = mongoose.connection.db.admin();
  let hello;
  try {
    hello = await admin.command({ hello: 1 });
  } catch {
    hello = await admin.command({ isMaster: 1 });
  }
  // setName: a replica set member. msg 'isdbgrid': a sharded cluster router (Atlas sharded clusters).
  const supportsTransactions = Boolean(hello.setName) || hello.msg === 'isdbgrid';
  if (!supportsTransactions) {
    await mongoose.disconnect();
    throw new Error(NOT_REPLICA_SET_MESSAGE);
  }
  return { replicaSet: hello.setName || null, topology: hello.msg === 'isdbgrid' ? 'sharded' : 'replicaSet' };
}

async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is not set. Copy .env.example to .env and configure it.');
  }

  mongoose.set('strictQuery', true);

  mongoose.connection.on('connected', () => {
    isConnected = true;
    console.log('[db] MongoDB connected');
  });

  mongoose.connection.on('error', (err) => {
    console.error('[db] MongoDB connection error:', err.message);
  });

  mongoose.connection.on('disconnected', () => {
    isConnected = false;
    console.warn('[db] MongoDB disconnected');
  });

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
  const info = await assertReplicaSet();
  console.log(`[db] Transactions available (${info.topology}${info.replicaSet ? `: ${info.replicaSet}` : ''})`);
  return mongoose.connection;
}

function dbState() {
  // 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting
  const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
  return states[mongoose.connection.readyState] || 'unknown';
}

module.exports = { connectDB, dbState, assertReplicaSet, NOT_REPLICA_SET_MESSAGE, isConnected: () => isConnected };
