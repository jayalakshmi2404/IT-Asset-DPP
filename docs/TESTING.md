# Testing

There are three layers. Be clear about which one you ran.

| Layer | Command | Needs | What it proves |
| --- | --- | --- | --- |
| Server unit and API (in-memory) | `cd server && npm test` | nothing | Authorisation, business rules, hash canonicalisation, verifier logic, error mapping. Transactions are **stubbed** and the store is `mingo`, so this does not prove real MongoDB behaviour. |
| Server real-MongoDB integration | `cd server && npm run test:integration` | `MONGODB_TEST_URI` pointing at a **replica set or Atlas test database** | Real transactions, rollback, real unique indexes, concurrent writes, duplicate-key races. |
| Client (Vitest) and build | `cd client && npm test && npm run build` | nothing | Permission mirror, routing, login, dashboards, QR card, camera scanner, passport parser, production build. |

Without `MONGODB_TEST_URI` the integration suite is **skipped** and prints a warning. A skipped suite
is not a pass.

## Running the real-MongoDB suite

Local replica set:

```bash
mongod --replSet rs0 --bind_ip 127.0.0.1 --port 27017 --dbpath ./data/rs0
mongosh --eval "rs.initiate()"         # once
cd server
MONGODB_TEST_URI="mongodb://127.0.0.1:27017/dpp_integration_test?replicaSet=rs0" npm run test:integration
```

Atlas test database (a separate cluster or a database named `…_test`):

```powershell
cd server
$env:MONGODB_TEST_URI = "mongodb+srv://<user>:<password>@<cluster>/it_asset_dpp_test?retryWrites=true&w=majority"
npm run test:integration
```

The suite drops the database named in `MONGODB_TEST_URI` before it runs. It refuses any database
whose name does not contain `test`.

## Standalone refusal check

A standalone server must be refused. This was verified in the development environment with a
standalone `mongod`: `connectDB()` throws the replica-set message, and a `withLedgerTransaction` call
returns 503 with no rows written.

## Destructive operations

Tests that tamper with records use the in-memory store or the isolated test database. Nothing in the
test suite touches `MONGODB_URI` (the in-memory tests set it to an unused address).

## End-to-end check (manual, against a scratch database)

```bash
cd server
MONGODB_URI="mongodb://127.0.0.1:27017/dpp_e2e_test?replicaSet=rs0" SEED_PASSWORD="<choose>" npm run seed:dev
npm run ledger:diagnose          # expect exit 0, VERIFIED
```

Then change one stored record directly in the scratch database and run `npm run ledger:diagnose` again.
Expect exit 1 and a violation naming the event and asset.
