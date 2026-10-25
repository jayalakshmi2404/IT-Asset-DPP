# MongoDB Atlas setup

The application needs transactions. Every lifecycle write (registration, allocation, transfer,
maintenance, disposal) writes the asset update, the lifecycle record and the hash-chain block in
one transaction. That only works on a **replica set or a sharded cluster**. A standalone server
refuses the write, and the server refuses to start against one.

MongoDB Atlas clusters are replica sets, so an Atlas `mongodb+srv://` connection string works
without extra configuration.

## 1. Create the cluster and database user

1. In Atlas, create a cluster (the free M0 tier is fine for evaluation).
2. **Database Access** → add a database user with a strong password and the *Read and write to any
   database* role, or a role limited to the database you use. Do not reuse your Atlas login.
3. **Network Access** → add your current IP address. For a shared server, add its address only.
   Avoid `0.0.0.0/0` outside a short test.
4. **Connect** → *Drivers* → Node.js. Copy the `mongodb+srv://` string.

## 2. Put the connection string in `server/.env`

```
MONGODB_URI=mongodb+srv://<db_user>:<db_password>@<cluster-host>/it_asset_dpp?retryWrites=true&w=majority
```

- Replace `<db_password>` with the real password. URL-encode special characters such as `@`, `:`, `/`, `?`, `#`.
- Use a separate database name for testing (for example `it_asset_dpp_test`). The real-MongoDB
  integration suite refuses to run against a database whose name does not contain `test`.
- Keep `.env` out of version control and out of any ZIP you share.

## 3. What happens at startup

`npm start` connects, then checks that the server supports transactions. You will see:

```
[db] MongoDB connected
[db] Transactions available (replicaSet: atlas-…)
```

If you see `Connected to a MongoDB server that is not a replica set`, the URI points at a standalone
server (for example `mongodb://localhost:27017/...` without `?replicaSet=`). Fix the URI. Do not try to
work around the check.

## 4. Empty database versus migrated data

A new Atlas database is **empty**. The application creates the hash-chain genesis block on first
start (block index 0, nothing else). It does not copy or import data from your local MongoDB.

- To start fresh: run `npm run create-admin -- "Name" admin@example.org "a-strong-password"`.
- To load demo data (development only): `npm run seed:dev`. It refuses to run if users already exist,
  and never runs when `NODE_ENV=production`.
- To move existing local data into Atlas, see `docs/LEDGER_INTEGRITY.md` ("Migrating local data").
  Do not copy only some collections: the hash chain needs `hashblocks`, `lifecycleevents` and `assets`
  together, or the verification will report missing records.

## 5. Indexes

On startup Mongoose builds the unique indexes that protect the ledger: `hashblocks.index`,
`hashblocks.currentHash`, `lifecycleevents.eventId`, `lifecycleevents.currentHash`, `assets.assetId`,
`assets.dppId`, `assets.serialNumber` (sparse). The real-MongoDB suite checks that these exist.

## 6. Backup and restore

- Atlas: enable **Backup** for the cluster (continuous backup is available on paid tiers). Take a
  snapshot before any migration or recovery step.
- Logical backup of one database: `mongodump --uri "$MONGODB_URI" --db it_asset_dpp --out backups/$(date +%F)`
  Restore into a **new** database name first and verify it with `npm run ledger:diagnose`
  before pointing the application at it.
- Never restore over a live ledger without an approved recovery plan (see `docs/LEDGER_INTEGRITY.md`).

## 7. Verifying the connection

```bash
cd server
npm run ledger:diagnose          # read-only: reports the ledger state; writes nothing
```

The report shows `"readOnly": true`, the database name, and the verification result for the full
ledger and for each asset.
