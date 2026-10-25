/**
 * In-memory stand-in for the Mongoose models, used by the API tests.
 *
 * It is NOT a database. It implements the subset of the Mongoose model API that the
 * app uses, and evaluates query filters with `mingo` (an implementation of the MongoDB
 * query language) so that scope filters such as { departmentId: { $in: [...] } } are
 * really applied to the records, not assumed.
 *
 * Limits (be aware when reading test results):
 *  - no real transactions (the ledger transaction wrapper is stubbed in the tests)
 *  - no indexes beyond the unique checks listed in UNIQUE_FIELDS
 *  - ObjectIds are stored as hex strings
 *  - only the operators the application uses are guaranteed to behave like MongoDB
 */
require('mingo/init/system');
const mingo = require('mingo');
const mongoose = require('mongoose');

const { ObjectId } = mongoose.Types;

const COLLECTIONS = ['User', 'Department', 'Asset', 'LifecycleEvent', 'HashBlock', 'AuditLog'];

const store = Object.fromEntries(COLLECTIONS.map((n) => [n, []]));

const UNIQUE_FIELDS = {
  User: ['email'],
  Department: ['name'],
  Asset: ['assetId', 'serialNumber'],
  LifecycleEvent: ['eventId', 'currentHash'],
  HashBlock: ['index', 'currentHash'],
};

const DEFAULTS = {
  User: { status: 'ACTIVE', tokenVersion: 0, managedDepartmentIds: [], departmentId: null, department: '', passwordHash: null },
  Asset: {
    brand: '',
    model: '',
    warranty: '',
    description: '',
    location: '',
    owner: '',
    department: '',
    departmentId: null,
    assignedTo: null,
    purchaseCost: 0,
    qrGenerated: false,
    qrGeneratedAt: null,
    serialNumber: undefined,
  },
  Department: { code: '' },
};

/** Converts ObjectIds (anywhere in a value) to hex strings so comparisons match stored data. */
function plain(value) {
  if (value instanceof ObjectId) return value.toHexString();
  if (Array.isArray(value)) return value.map(plain);
  if (value && typeof value === 'object' && !(value instanceof Date) && !(value instanceof RegExp)) {
    const out = {};
    for (const key of Object.keys(value)) out[key] = plain(value[key]);
    return out;
  }
  return value;
}

function cloneRecord(record) {
  return structuredClone(record);
}

function matches(name, filter) {
  const query = new mingo.Query(plain(filter || {}));
  return store[name].filter((record) => query.test(record));
}

function sortRecords(records, sort) {
  if (!sort) return records;
  const keys = Object.entries(sort);
  return [...records].sort((a, b) => {
    for (const [key, dir] of keys) {
      const av = a[key];
      const bv = b[key];
      if (av === bv) continue;
      if (av === undefined || av === null) return -1 * dir;
      if (bv === undefined || bv === null) return 1 * dir;
      return av < bv ? -dir : dir;
    }
    return 0;
  });
}

class FakeDoc {
  constructor(name, record) {
    Object.defineProperty(this, '__model', { value: name, enumerable: false });
    Object.assign(this, record);
  }

  async save() {
    const idx = store[this.__model].findIndex((r) => r._id === this._id);
    const snapshot = {};
    for (const key of Object.keys(this)) snapshot[key] = cloneRecord(this[key]);
    if (idx === -1) throw new Error('save() on a record that is not stored');
    store[this.__model][idx] = snapshot;
    return this;
  }

  toObject() {
    const out = {};
    for (const key of Object.keys(this)) out[key] = this[key];
    return out;
  }
}

function wrap(name, record) {
  return record ? new FakeDoc(name, cloneRecord(record)) : null;
}

class FakeQuery {
  constructor(name, filter, op, arg) {
    this.name = name;
    this.filter = filter;
    this.op = op;
    this.arg = arg;
    this._sort = null;
    this._skip = 0;
    this._limit = null;
    this._lean = false;
  }

  sort(s) {
    this._sort = s;
    return this;
  }

  skip(n) {
    this._skip = n;
    return this;
  }

  limit(n) {
    this._limit = n;
    return this;
  }

  lean() {
    this._lean = true;
    return this;
  }

  select() {
    return this;
  }

  session() {
    return this;
  }

  populate() {
    return this;
  }

  distinct(field) {
    const values = [...new Set(matches(this.name, this.filter).map((r) => r[field]))];
    return Promise.resolve(values);
  }

  async exec() {
    const present = (r) => (this._lean ? cloneRecord(r) : wrap(this.name, r));

    if (this.op === 'findOne' || this.op === 'findById') {
      const hit = sortRecords(matches(this.name, this.filter), this._sort)[0];
      return hit ? present(hit) : null;
    }

    let records = sortRecords(matches(this.name, this.filter), this._sort);
    records = records.slice(this._skip, this._limit == null ? undefined : this._skip + this._limit);
    return records.map(present);
  }

  then(resolve, reject) {
    return this.exec().then(resolve, reject);
  }
}

function applyUpdate(record, update) {
  const set = update.$set || {};
  const inc = update.$inc || {};
  Object.assign(record, plain(set));
  for (const [k, v] of Object.entries(inc)) record[k] = (record[k] || 0) + v;
}

function enforceUnique(name, record) {
  for (const field of UNIQUE_FIELDS[name] || []) {
    const value = record[field];
    if (value === undefined || value === null) continue;
    const clash = store[name].find((r) => r[field] === value && r._id !== record._id);
    if (clash) {
      const err = new Error(`E11000 duplicate key error collection: test.${name.toLowerCase()} index: ${field}_1 dup key`);
      err.code = 11000;
      err.keyValue = { [field]: value };
      throw err;
    }
  }
}

function insertOne(name, data) {
  const record = { ...(DEFAULTS[name] ? structuredClone(DEFAULTS[name]) : {}), ...plain(data) };
  record._id = data._id ? String(data._id) : new ObjectId().toHexString();
  if (name === 'User' && data.passwordHash === undefined) record.passwordHash = null;
  const now = new Date();
  record.createdAt = record.createdAt || now;
  record.updatedAt = now;
  if (record.serialNumber === undefined) delete record.serialNumber;
  enforceUnique(name, record);
  store[name].push(record);
  return record;
}

function makeModel(name) {
  return {
    __name: name,
    find: (filter) => new FakeQuery(name, filter || {}, 'find'),
    findOne: (filter) => new FakeQuery(name, filter || {}, 'findOne'),
    findById: (id) => new FakeQuery(name, { _id: String(id) }, 'findOne'),
    exists: async (filter) => {
      const hit = matches(name, filter)[0];
      return hit ? { _id: hit._id } : null;
    },
    countDocuments: async (filter) => matches(name, filter || {}).length,
    create: async (input) => {
      if (Array.isArray(input)) return input.map((d) => wrap(name, insertOne(name, d)));
      return wrap(name, insertOne(name, input));
    },
    updateOne: async (filter, update) => {
      const hit = matches(name, filter)[0];
      if (!hit) return { matchedCount: 0, modifiedCount: 0 };
      applyUpdate(hit, update);
      return { matchedCount: 1, modifiedCount: 1 };
    },
    updateMany: async (filter, update) => {
      const hits = matches(name, filter);
      hits.forEach((h) => applyUpdate(h, update));
      return { matchedCount: hits.length, modifiedCount: hits.length };
    },
    deleteMany: async () => {
      store[name].length = 0;
      return { deletedCount: 0 };
    },
    aggregate: (pipeline) => ({
      then: (resolve, reject) => Promise.resolve(new mingo.Aggregator(plain(pipeline)).run(store[name].map(cloneRecord))).then(resolve, reject),
    }),
  };
}

const models = Object.fromEntries(COLLECTIONS.map((n) => [n, makeModel(n)]));

/** Clears every collection. Call in beforeEach. */
function resetStore() {
  for (const name of COLLECTIONS) store[name].length = 0;
}

/** Direct access for assertions and for simulating out-of-band (tampering) writes. */
function raw(name) {
  return store[name];
}

module.exports = { models, resetStore, raw, plain };
