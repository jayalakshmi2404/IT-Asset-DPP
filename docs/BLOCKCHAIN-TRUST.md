# DPP Blockchain Trust & Provenance

This document explains what the blockchain feature does, what it proves, how to verify it, and how to run it on free services. Read it before relying on any anchor.

**Summary.** The application keeps a local, append-only hash chain of every asset event (`hashblocks`, `lifecycleevents`). Periodically an administrator anchors the latest chain block's hash to a public test network, Ethereum Sepolia. Anyone can then check that the local chain still matches what was anchored. Only hashes leave the system. A zero-cost **mock** mode runs the same workflow locally and is clearly labelled as a simulation.

## 1. Design decisions

### 1.1 What is written on-chain

Each anchor is a zero-value transaction from the configured account to itself. Its data field is a fixed, versioned text:

```
DPP-ANCHOR|v1|<blockIndex>|<blockHash>
```

- `blockIndex` is the position of the hash-chain block.
- `blockHash` is that block's `currentHash` (SHA-256).

Nothing else is written. No asset name, serial number, person, department, event description, or metadata goes on-chain. The format is deterministic, so the same block always produces the same payload.

### 1.2 Why not a smart contract

A transaction-data commitment meets the integrity requirement and needs no contract:

- The data field is public and immutable once mined, so it is as tamper-evident as a contract storage slot.
- A contract would need deployment (gas), an owner key, upgrade and access-control code, and its own audit. None of that is needed to prove "this block hash existed at this time".
- It works with a plain RPC provider and the free Sepolia faucet.

A contract becomes worth considering only if you need on-chain access control, on-chain queries of many commitments, or multiple independent writers. None of those is in scope. If you add one later, document the deployment, keys and cost in this file first.

### 1.3 Why the local hash chain stays the source of truth

The on-chain record proves only the block hash at anchoring time. The hash chain proves every record against the block hashes. Anchors cover blocks up to the one anchored; later blocks rely on the normal chain until anchored. Deleting a local `anchorrecords` row hides the anchor from this application, but it does not delete a real transaction. Verification reports the mismatch when the local ledger no longer matches the anchor (see §3).

## 2. Modes

| `ANCHOR_PROVIDER` | Result label in the UI | Network | Needs | Proof value |
|---|---|---|---|---|
| `none` | Disabled — Anchoring Not Enabled | none | nothing | none (the hash chain still works) |
| `mock` | Mock Mode — Simulated, No Real Blockchain | none, offline | nothing | **none**. It is a simulation stored in this app's database. |
| `ethereum` | Ethereum Sepolia — Real Testnet Transaction | Sepolia testnet | `ANCHOR_RPC_URL`, `ANCHOR_PRIVATE_KEY` | a real public testnet record |

Rules that hold in every mode:

- **No silent fallback.** If `ethereum` is selected and its settings are missing, malformed or wrong, the server refuses to start. It never switches to mock.
- **Sepolia only.** `ANCHOR_NETWORK` must be `sepolia` (the default). `ANCHOR_CHAIN_ID` must be `11155111`. Mainnet is refused at startup.
- **Mock is never labelled as real.** Every mock record has `simulated: true` and `network: "MOCK (no network)"`. Every screen shows MOCK / SIMULATED, and no explorer link is ever generated for a mock record.

## 3. Verification states

| State | Shown as | Meaning | Where it comes from |
|---|---|---|---|
| **Verified** | "Asset verified" / `VERIFIED` | At least one anchor is confirmed, and every check passes. | `verifyAnchors` |
| **Mismatch detected** | "Integrity violation" / `VIOLATION_DETECTED` | The block changed after anchoring, the block is missing, the transaction is missing, or its payload or sender differs. | `verifyAnchors`, `publicAnchorSummary` (local check) |
| **Pending** | "Anchor pending" / `PENDING` | Submitted, not yet confirmed to the required depth. Nothing is verified yet. | status `PENDING` |
| **Unavailable** | a problem message in the admin panel | The check could not finish, for example the RPC endpoint is down or rate-limited. The app reports it; it does not claim success. | RPC error, mapped to a safe message |
| **Simulated** | "MOCK / SIMULATED" | The result comes from mock mode. It is not on-chain proof. | `simulated: true` |

A failed anchor (`FAILED`) is shown as a problem, never as verified. The chain-side reasons are: the transaction reverted, the payload carries a different hash, or it was sent by another account.

A check is reported as **Unavailable** rather than verified when:

- the RPC endpoint fails for an anchor (that anchor is listed under *Not checked*; the rest are still checked);
- anchoring is disabled (`ANCHOR_PROVIDER=none`) but anchors exist;
- an anchor was made by a different provider than the one now configured. For example, a simulated anchor from the mock demo is never sent to a real RPC endpoint. It is listed under *Not checked*.

Nothing is reported as verified unless every confirmed anchor was actually checked by the active provider.

### 3.1 Two kinds of check

| Check | Uses | When it runs |
|---|---|---|
| **Local** | the application's database only | every public page load and the provenance timeline |
| **External** | the RPC endpoint (Sepolia) | only when an administrator clicks *Re-check* or *Refresh status* |

Public page loads never call the RPC endpoint. This protects free-tier quota and keeps public traffic from causing outbound requests. The public page always says it was checked against local records only.

### 3.2 What the external check compares

For each confirmed anchor:

1. The ledger block at that index still exists.
2. Its `currentHash` equals the anchored hash.
3. The transaction can be found on Sepolia.
4. Its data decodes to the same index and hash.
5. It was sent from the configured account.

## 4. Provenance timeline

Every lifecycle event of an asset is already in the hash chain. The timeline adds one label per event, based on whether a confirmed anchor covers the event's block and still matches the ledger:

| Label | Meaning |
|---|---|
| Anchored on Sepolia (testnet) | a real confirmed anchor covers the event and matches the local ledger |
| MOCK / SIMULATED anchor | a simulated anchor covers the event. Not on-chain proof. |
| Anchor pending | the covering anchor is waiting for confirmation |
| Anchor mismatch | a covering anchor no longer matches the ledger |
| Hash chain only | recorded in the hash chain; no anchor covers it yet |

The timeline never invents history. It shows only events that exist in `lifecycleevents`.

## 5. Public verification

`GET /api/verify/:dppId` and `GET /api/verify/asset/:assetId` stay public and unauthenticated. They now also return:

- `anchoring`: whether anchoring is configured, the latest anchor's block index, block hash, status, mode label, network, submitted time, local check, and an explorer link (real anchors only).
- `lifecycle[].anchor`: the timeline label for each event.

They never return owner names, performer names, metadata, passwords, keys, RPC URLs, or the anchor's internal fields (`createdByName`). Existing QR codes and URLs keep working.

## 6. Duplicate prevention and failure handling

- **One anchor per block.** `anchorrecords.blockIndex` is unique in MongoDB. A repeated request returns the existing record with `created: false`. It never sends a second transaction.
- **Reserve, then submit.** An anchor first writes a `PENDING` row with the reference `RESERVED`, then submits. A concurrent request for the same block loses on the unique index and sends nothing.
- **Release on failure.** If submission fails, nothing was sent, so the reservation is deleted and the block can be anchored later.
- **Keep on partial failure.** If the transaction was sent but saving its hash fails, the error reports the public transaction hash, and the reservation is kept. Ask an administrator to record it before retrying. This is the only case where a manual step is needed.
- **Refresh skips reservations.** A `RESERVED` row has no transaction yet, so refresh does not query the chain for it.
- **Timeouts.** Every RPC call is limited to 20 seconds. A slow endpoint returns "did not answer in time" instead of hanging the request.
- **Safe messages.** Errors are mapped to fixed text by machine-readable code (`INSUFFICIENT_FUNDS`, rate limit `429`, nonce or replacement conflicts, `CALL_EXCEPTION`, timeout). The original error text is never copied, because it can contain the RPC URL (which includes the Alchemy key) or the wallet key.

Known edge case: the reservation is not expired automatically. A `RESERVED` row stays until an administrator removes it. This is deliberate: silently removing it could let a second transaction be sent for a block whose first transaction is unknown.

## 7. Secrets

- `ANCHOR_PRIVATE_KEY` and `ANCHOR_RPC_URL` are read only by the server. They are not returned by any endpoint, not written to the audit log, and not included in errors.
- The frontend receives only the provider label and the public explorer link.
- Keep both values in the Render dashboard (or your local `.env`, which is git-ignored). Never commit them. Use a dedicated test wallet with no real funds.
- Alchemy only supplies the RPC connection. It cannot give you a wallet or a key.

## 8. Local setup

Follow the README sections *Setup* and *Free blockchain anchoring demo (mock mode)*. For mock mode you need only `MONGODB_URI`, `JWT_SECRET` and `ANCHOR_PROVIDER=mock`.

For real Sepolia mode, in `server/.env` add:

```bash
ANCHOR_PROVIDER=ethereum
ANCHOR_NETWORK=sepolia
ANCHOR_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/<your-alchemy-key>
ANCHOR_PRIVATE_KEY=0x<64 hex characters from your test wallet>
ANCHOR_CHAIN_ID=11155111
```

Fund the test wallet with Sepolia test ETH from a public faucet. Then start the server; it refuses to start if any value is missing or wrong.

## 9. Render deployment

The project has no `render.yaml`. Service names, build and start commands are whatever you already configured in the Render dashboard. This section lists only what changes. **Do not assume the new code is deployed until Render shows a successful deploy of it.**

### 9.1 Steps

1. Push the updated code to your GitHub repository (`jayalakshmi2404/IT-Asset-DPP`). Render redeploys automatically if auto-deploy is on.
2. Open the **backend** web service in Render → **Environment**.
3. Add the variables for the mode you want (below). Leave the existing `MONGODB_URI`, `JWT_SECRET` and others unchanged.
4. Save. Render restarts the service. Check the logs: a configuration problem appears as `[server] Failed to start: Invalid configuration`.
5. Open `https://<your-backend>/api/health` (or the existing health route) to confirm the service is up.
6. Open the frontend and sign in as an administrator to check the anchoring panel shows the expected mode label.
7. The frontend's `VITE_API_URL` is baked in at build time. This update does not change it, so no frontend rebuild is needed for anchoring. If you change it, redeploy the static site.

### 9.2 Variables per mode

| Variable | `none` (default) | `mock` (free demo) | `ethereum` (Sepolia testnet) |
|---|---|---|---|
| `ANCHOR_PROVIDER` | `none` or unset | `mock` | `ethereum` |
| `ANCHOR_NETWORK` | not needed | not needed | `sepolia` |
| `ANCHOR_RPC_URL` | not needed | not needed | Sepolia RPC URL (secret) |
| `ANCHOR_PRIVATE_KEY` | not needed | **do not set** | test-wallet key (secret) |
| `ANCHOR_CHAIN_ID` | not needed | not needed | `11155111` (optional) |
| `ANCHOR_MIN_CONFIRMATIONS` | not needed | not needed | `1` (optional) |

All other variables (`MONGODB_URI`, `JWT_SECRET`, `NODE_ENV`, `PORT`, `CLIENT_URL`, `PUBLIC_BASE_URL`) stay as they are.

### 9.3 Free-tier limits to plan around

- **Sleeping services.** Free web services can sleep after inactivity and take time to wake. A refresh or anchor request may be slow on the first call.
- **No background jobs.** Anchors are created and refreshed only by an administrator's click. Nothing confirms automatically in the background. Click *Refresh status* after a few minutes.
- **Request timeouts.** Each RPC call is capped at 20 seconds. Anchoring one block involves a few calls, so keep requests to one at a time.
- **RPC quota.** Alchemy's free tier has a monthly request limit. Public page loads never call Alchemy, so they do not use it. Use the admin *Re-check* sparingly.
- **Database.** Mock and Sepolia modes use the same MongoDB database as before. Use a replica set (free Atlas M0 is fine), as the README requires.

## 10. Database changes

No schema migration is required. `anchorrecords` gained two optional fields in an earlier change (`simulated`, `network`), with defaults for old rows. The new reservation status uses the existing `txRef` field and the existing `PENDING` status. Existing rows are unaffected.

## 11. Testing

Run from the `server` and `client` folders:

```bash
cd server && npm test     # includes unit and API tests for mock mode, trust labels, public verification, race handling, timeouts and secret checks
cd client && npm test     # includes tests for the public result and the admin panel wording
cd client && npm run build
```

All tests use mocked RPC responses and an in-memory database. A real Sepolia transaction has **not** been run as part of this change. See §12.

## 12. Limitations and security considerations

- **Not run on a live network.** The Ethereum provider is tested only with fakes. Run one real anchor on Sepolia yourself before relying on it, and record the result.
- **Mock is a simulation.** Its records live in your database. Anyone who can write to it can change them. Use it to demonstrate the workflow, not as evidence.
- **Only anchored blocks are covered.** Events after the latest anchor rely on the local hash chain until the next anchor.
- **The local chain is centralised.** Someone with database access and enough time can rewrite the chain. An external anchor makes that detectable after anchoring, but only for anchored blocks, and only if the external record is kept.
- **Pre-anchor history is not proven.** An anchor cannot show that nothing changed before its first block was anchored.
- **Key custody.** Whoever holds `ANCHOR_PRIVATE_KEY` can send anchors from that account. Use a dedicated test wallet, rotate it if exposed, and do not reuse it for anything of value.
- **Reservations need manual cleanup** after a crash between a successful send and the database save (§6).
- **Public trust page is local-only.** It does not prove the external record still exists. Administrators use the external check for that.
- **Session token** handling and other existing limitations in the README still apply.
- **Not a certification.** Anchoring does not prove that an asset's details are true, only that the recorded hash existed at the anchored time.

## 13. Deployment checklist (beginner)

1. Create a free MongoDB Atlas M0 cluster as a replica set (`docs/ATLAS_SETUP.md`).
2. Local test: set `ANCHOR_PROVIDER=mock`, run the server and client, and follow the demo in the README.
3. Push the code to GitHub.
4. In Render's backend service, add `ANCHOR_PROVIDER=mock` (or leave anchoring off). Redeploy.
5. Check the health route and sign in as an administrator.
6. Optional real testnet: create a test wallet, get Sepolia test ETH from a faucet, add the three `ANCHOR_*` variables in Render, redeploy, then anchor once and check the Etherscan link.
7. Never paste a key or RPC URL into the repository, a ticket, or a chat.
