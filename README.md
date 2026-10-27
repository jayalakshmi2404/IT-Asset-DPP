# IT Asset DPP: Digital Product Passport for IT Assets

A web application for registering IT assets, recording their lifecycle (allocation, maintenance, transfer, disposal), issuing QR-linked Digital Product Passports, and verifying the record with a SHA-256 hash chain. Access is controlled by four roles enforced on the server.

The hash chain is a centralised, append-only ledger: each entry stores the SHA-256 hash of its data and of the previous entry. Changing any stored record breaks the chain and the verification reports it. It is **not** a blockchain and has no distributed consensus.

The latest block hash can optionally be **anchored** outside the database. Anchoring has three modes, set by `ANCHOR_PROVIDER`:

- `none` (default): anchoring is off.
- `mock`: a **free, offline simulation** for demonstrations and tests. Nothing is sent anywhere, and every result is labelled MOCK / SIMULATED. It is **not blockchain proof**.
- `ethereum`: real transactions on the Ethereum Sepolia **test** network. This is a separate, optional mode that needs an RPC URL and a test-wallet key.

Anchoring covers only anchored blocks and does not make the ledger tamper-proof. The design, the verification states and the public trust view are in **[docs/BLOCKCHAIN-TRUST.md](docs/BLOCKCHAIN-TRUST.md)**. The configuration reference is in [docs/ANCHORING.md](docs/ANCHORING.md). For the free demo, see [the mock demo](#free-blockchain-anchoring-demo-mock-mode) below.

## Contents

- `server/`: Express 4 API, Mongoose 8 models, MongoDB ledger, Jest tests
- `client/`: React 18 + Vite + Tailwind single-page app, Vitest tests

## Requirements

- Node.js 18 or newer
- MongoDB **as a replica set**. Transactions are required for atomic ledger writes. The server checks this at startup and refuses to run against a standalone `mongod`.
  - MongoDB Atlas: follow **[docs/ATLAS_SETUP.md](docs/ATLAS_SETUP.md)**. Use the `mongodb+srv://` string in `MONGODB_URI`.
  - Local: `mongod --replSet rs0 --dbpath <dir>`, then once: `mongosh --eval "rs.initiate()"`, and set `MONGODB_URI=mongodb://127.0.0.1:27017/it_asset_dpp?replicaSet=rs0`.

## Setup

```bash
# 1. API configuration (Windows PowerShell: use "Copy-Item .env.example .env")
cd server
cp .env.example .env          # then edit: MONGODB_URI, JWT_SECRET (required); PUBLIC_BASE_URL for deployment
npm install

# 2. Create the first administrator (name, email and password are arguments)
npm run create-admin -- "Ada Admin" admin@yourcompany.test "a-strong-password"

# 3. Start the API (port 5000)
npm start                      # or: npm run dev  (auto-restart with nodemon)

# 4. In a second terminal: the web app (port 5173)
cd ../client
npm install
cp .env.example .env           # optional; defaults to http://localhost:5000/api
npm run dev
```

Open http://localhost:5173 and sign in with the administrator account.

### QR codes

- Issue a QR from an asset's **Digital Product Passport** card (administrators and managers in scope). Issuing only records the QR; it never creates a lifecycle event.
- The QR encodes `PUBLIC_BASE_URL/verify/<DPP ID>` (or `CLIENT_URL` if `PUBLIC_BASE_URL` is unset). Set `PUBLIC_BASE_URL` to the public address of the web app when you deploy it.
- Download the PNG, or **Print QR label** to print it with the asset name and DPP ID.
- Scanning: open `/verify`, choose **Scan a QR code with the camera**, or type the DPP ID. The camera is released when the scan finishes or the scanner closes.

### Development demo data

```bash
cd server
npm run seed:dev               # creates departments, demo accounts, 8 assets, verifies the chain
npm run seed:dev -- --reset    # clears application collections first (development only)
```

- Set `SEED_PASSWORD` in `server/.env` to choose the password for all demo accounts. If it is unset, a random password is generated and printed once.
- The seed refuses to run when `NODE_ENV=production`.

Demo accounts (all use `@example.test` addresses):

| Role | Email | Notes |
| --- | --- | --- |
| Administrator | `admin@example.test` | Full access |
| Manager | `manager@example.test` | Manages IT Operations |
| Employee | `employee.a@example.test` | IT Operations, holds allocated assets |
| Employee | `employee.b@example.test` | Finance |
| Auditor | `auditor@example.test` | Read-only oversight |
| Inactive | `inactive@example.test` | Deactivated; sign-in is refused |

## Free blockchain anchoring demo (mock mode)

This section shows the anchoring workflow with **no blockchain account, no wallet, no private key and no paid service**. You only need the same MongoDB database the app already uses (a free MongoDB Atlas M0 cluster is enough; see [docs/ATLAS_SETUP.md](docs/ATLAS_SETUP.md)).

**What mock mode is:** a simulation. "Anchoring" stores a record in this application's own database, labelled MOCK / SIMULATED. It shows the same checks a real anchor would need, and it can detect a changed record. It is **not** blockchain proof: anyone with database access could change it, and no independent party saw it.

**What is still the source of integrity:** the centralised hash chain in the `hashblocks` collection. Every asset event is added to it, and the integrity checks use it. Anchoring is an extra layer on top, and it is not needed for the hash chain to work.

**Real Sepolia anchoring** is a separate, optional mode (`ANCHOR_PROVIDER=ethereum`). It needs an RPC URL from a provider such as Alchemy and a private key for a test wallet you create yourself. Alchemy is only the connection to the network. It does not give you a wallet or a key. Leave it off unless you specifically want to try it.

### 1. Configure (beginner steps)

From the project folder:

```bash
cd server
cp .env.example .env
```

Open `server/.env` in any text editor and set these two lines (the rest can stay as they are):

```bash
MONGODB_URI=mongodb+srv://<your-db-user>:<your-password>@<your-cluster-host>/it_asset_dpp?retryWrites=true&w=majority
JWT_SECRET=<a random string of at least 32 characters>
ANCHOR_PROVIDER=mock
```

- `MONGODB_URI`: your own database connection string. Keep the `<...>` placeholders out; the server refuses to start if they remain.
- `JWT_SECRET`: generate one with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`.
- `ANCHOR_PROVIDER=mock`: no RPC URL, private key or chain ID is needed.

Do not put any real wallet key in `.env` for this demo. Mock mode does not use one.

### 2. Start and create the first administrator

```bash
cd server
npm install
npm run create-admin -- "Ada Admin" admin@yourcompany.test "a-strong-password"
npm start                       # API on http://localhost:5000
```

In a second terminal:

```bash
cd client
npm install
npm run dev                     # web app on http://localhost:5173
```

Optionally, load demo assets so there is a ledger to anchor: `cd server && npm run seed:dev`.

### 3. Demo steps

1. Open http://localhost:5173 and sign in as the administrator.
2. Open the **Integrity** page (http://localhost:5173/integrity). Find the **External anchor** panel.
3. The badge reads **Mock Mode — Simulated, No Real Blockchain** and every row carries a **MOCK / SIMULATED** tag.
4. Click **Simulate anchor (latest block)**. The success message says it is not a blockchain transaction. The table shows the block number, block hash, the `MOCK-SIM-…` reference, the timestamp and the status.
5. Click **Refresh status**, then **Re-check**. The status becomes **VERIFIED** when the record matches the ledger.
6. Optional tamper test: stop the server, open the `mockanchortxes` collection in MongoDB Atlas, and edit the `payload` of the anchor so its block hash differs. Start the server and click **Re-check**. The status becomes **VIOLATION_DETECTED** and the reason is shown. Undo the edit afterwards, or delete that document, to restore a clean demo.
7. Optional auditor check: `cd server && npm run demo:accounts -- --yes` creates the demo accounts and prints a generated password for each once (without `--yes` it only previews). Sign in as `auditor@example.test`. The auditor can view and re-check the panel but has no anchor buttons.

### 4. Test commands

```bash
cd server && npm test           # all server tests (in-memory; no database needed)
cd client && npm test           # client tests (Vitest)
cd client && npm run build      # production build
```

The mock tests cover: starting without RPC or key, simulated anchoring, verification, mismatch detection, admin-only writes, auditor read-only access, disabled behaviour, Ethereum configuration validation, and no private-key or RPC-URL leakage in responses or errors.

### 5. Render deployment

Mock mode needs no extra variables or paid services. On Render, set `ANCHOR_PROVIDER=mock` (or leave it unset to keep anchoring off). Do not set `ANCHOR_PRIVATE_KEY` for mock mode.

The full steps, the variables for each mode (`none`, `mock`, `ethereum` on Sepolia), and the free-tier limits are in **[docs/BLOCKCHAIN-TRUST.md](docs/BLOCKCHAIN-TRUST.md)**. The project has no `render.yaml`; service names and commands stay as you configured them.

## Demo accounts, demo assets, import and export

Demo data (safe to re-run, nothing is deleted): see **[docs/DEMO_DATA.md](docs/DEMO_DATA.md)**.

```powershell
cd server
npm run demo:accounts -- --yes     # creates the four role accounts; prints new passwords once
npm run demo:assets -- --yes       # adds DEMO-AST-001..040 through the ledger service
npm run ledger:diagnose            # read-only integrity check
```

Bulk import and export: **[docs/IMPORT_EXPORT.md](docs/IMPORT_EXPORT.md)**. Template: `server/templates/assets-import-template.csv`.

```powershell
cd server
npm run import:assets -- ..\my-assets.csv                                   # validate only
npm run import:assets -- ..\my-assets.csv --commit --as admin@yourcompany.test
```

The web app has an **Export CSV** button on the Assets page. It exports the rows you are filtering.
The web app does **not** yet have an upload screen: bulk import is available through the command line
and the API (`POST /api/assets/import`).

## Roles and permissions

Permissions are defined once in `server/services/access/permissions.js` and mirrored in `client/src/auth/permissions.js`. A test confirms the two matrices are identical. The server enforces every rule; the client only hides controls.

| Capability | Administrator | Manager | Employee | Auditor |
| --- | --- | --- | --- | --- |
| View assets | All | Managed departments | Own assets only | All |
| Register asset, edit descriptive fields | Yes | No | No | No |
| Allocate / maintenance / transfer | Yes | Yes, within managed departments | No | No |
| Dispose asset | Yes | No | No | No |
| Issue QR code | Yes | Yes (in scope) | No | No |
| Verify one asset | Yes | Yes (in scope) | No | Yes |
| Full ledger verification | Yes | No | No | Yes |
| Reports | All | Managed departments | No | All |
| Audit logs | Yes | No | No | Yes |
| Users and departments | Yes | No | No | No |
| Own profile and password | Yes | Yes | Yes | Yes |

Out-of-scope records return `404`, not `403`, so their existence is not revealed. Mass assignment is blocked by field allowlists on every write endpoint.

## Dashboards

Each role has its own dashboard, and each calls only the endpoints its role may use:

- **Administrator**: organisation totals, status and category charts, full-ledger check (run on demand), recent lifecycle and audit activity.
- **Manager**: totals for managed departments, assets in maintenance, recent activity in those departments. Shows a notice when no departments are assigned.
- **Employee**: "My assets" with their status and recent activity on them. No organisation-wide figures are requested.
- **Auditor**: organisation totals, full-ledger verification with violation list, recent audit entries.

## Tests

```bash
cd server && npm test                  # Jest, in-memory: authorisation, lifecycle, integrity, tamper cases, canonical hashing, transaction error mapping
cd server && npm run test:integration  # Jest, REAL MongoDB: needs MONGODB_TEST_URI (replica set or Atlas test database); skipped otherwise
cd client && npm test                  # Vitest: permissions, routing, login, dashboards, QR card, camera scanner, passport parser
cd client && npm run build             # production build
```

The in-memory tests stub transactions and do not prove real MongoDB behaviour. The real-MongoDB suite
does, and it is skipped (not passed) unless `MONGODB_TEST_URI` is set. See **[docs/TESTING.md](docs/TESTING.md)**.

Read-only ledger check against the configured database:

```bash
cd server && npm run ledger:diagnose                  # full ledger + every asset; writes nothing
cd server && npm run ledger:diagnose -- --asset ASSET049
```

## Verifying a passport publicly

`/verify/:dppId` (no sign-in) shows asset identity, status, lifecycle records with hashes, and the verification result. Owner names, personal details and maintenance free text are withheld. Each public lookup is audit-logged. The page accepts a DPP ID typed by hand, a scanned QR code, or the full verification URL.

A passport shows **verified** only when every check above passed against the stored data. A violation is shown as a violation, with the reasons.

## Security notes

- Passwords are hashed with bcrypt. Sign-in responses do not reveal whether an email exists or whether the account is inactive until the password is verified.
- Sessions are HS256 JWTs with issuer and audience checks and a `tokenVersion` that is bumped on logout, password change, role or status change, so older tokens stop working immediately.
- Helmet, rate limiting on sign-in and public verification, JSON body limit of 100 kB, and CORS restricted to `CLIENT_URL`.
- The server refuses to start with a missing or placeholder `JWT_SECRET`.
- Search input is escaped before use in regular expressions, and non-string values are rejected to prevent NoSQL operator injection.

## Integrity and recovery

See **[docs/LEDGER_INTEGRITY.md](docs/LEDGER_INTEGRITY.md)** for the canonical hashing rules, what each check verifies, the procedure for investigating a violation (such as ASSET049), and the administrator-controlled recovery and migration steps. Nothing repairs or re-hashes data automatically.

## Known limitations

- Mock anchoring is a simulation stored in this application's own database. It is not blockchain proof and gives no independent evidence.
- Real Ethereum Sepolia anchoring has been covered only by fake-based unit tests. It has not been run against a live endpoint in this project.
- Atlas itself was not tested here (no Atlas credentials were available). The real-MongoDB suite was run against a local replica set. Run it against your Atlas test database before relying on Atlas (see docs/TESTING.md).
- The ledger verifier loads the full ledger into memory. That is fine for thousands of records, but a very large ledger needs a paged verifier.
- Migrating local data and repairing a legacy record are manual, approval-based steps (docs/LEDGER_INTEGRITY.md). There is no automatic migration tool.
- The session token is kept in `localStorage` (when "keep me signed in" is ticked) or `sessionStorage`. There is no cookie-based session and no CSRF token, so XSS would expose the token. A strict Content Security Policy is recommended for deployment.
- No single sign-on, no self-service password reset (an administrator resets passwords), no email notifications, no maintenance request workflow.
- The web app has no edit screen for asset details; the `PUT /api/assets/:id` endpoint exists for administrators.
- Departments cannot be deleted; departments can be created and renamed.
- Warranty is free text, not a computed expiry.
- Internal folder names still say `blockchain` (`server/services/blockchain/`); they refer to the hash-chain code only.
- Lint is not configured. No ESLint configuration is included.

## Project layout

```
server/
  config/        environment validation, database connection, constants
  controllers/   request handlers (already scoped and validated)
  middleware/    auth (token + account state), RBAC, error handling
  models/        User, Department, Asset, LifecycleEvent, HashBlock, AuditLog
  routes/        one file per resource, every route declares its permission
  services/
    access/      permission matrix, data-scope filters
    blockchain/  SHA-256 hash chain, ledger transactions
    verification/ full-chain and per-asset verification
    lifecycleService.js  the only path that writes lifecycle events
  scripts/       createAdmin.js, seedData.js, diagnoseLedger.js (read-only)
  templates/     assets-import-template.csv
  scripts/       demoAccounts.js, demoAssets.js, importAssets.js (plus the existing scripts)
  tests/         Jest suites: unit, in-memory API, and tests/integration (real MongoDB)
client/
  src/auth/      client permission mirror, navigation
  src/pages/     login, role dashboard router, asset, lifecycle, admin and public pages
  src/components/ shared UI, charts, DPP card, lifecycle modal, verification result
  tests/         Vitest suites
docs/
  ATLAS_SETUP.md        MongoDB Atlas, transactions, backup
  DEMO_DATA.md          demo accounts and demo assets
  IMPORT_EXPORT.md      CSV import and export rules, limits and formats
  PERMISSIONS.md        role permission matrix
  LEDGER_INTEGRITY.md   hashing rules, verification, ASSET049 procedure, recovery
  TESTING.md            what each test layer proves and how to run the real-MongoDB suite
```
