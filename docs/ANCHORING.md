# External anchoring (optional)

The hash chain is still the ledger: a centralised, append-only chain of SHA-256 hashes stored in MongoDB (`hashblocks`). It is the source of this project's local integrity records. External anchoring adds one extra step: the hash of the latest ledger block is written to an outside record, so that later changes to the local ledger can be detected.

Anchoring is **off by default** (`ANCHOR_PROVIDER=none`). When it is off, nothing changes in the application.

There are three modes:

| `ANCHOR_PROVIDER` | What happens | Needs | Cost |
|---|---|---|---|
| `none` | Anchoring is disabled. The UI says "Disabled — Anchoring Not Enabled". | nothing | free |
| `mock` | **Simulation.** Anchors are stored in this application's own database and labelled MOCK / SIMULATED. The UI says "Mock Mode — Simulated, No Real Blockchain". | nothing (no RPC URL, no key, no internet) | free |
| `ethereum` | **Real transactions** on the Ethereum Sepolia test network. The UI says "Ethereum Sepolia — Real Testnet Transaction". | an RPC URL and a signing key for a test wallet | free (test ETH has no value) |

**Mock mode is not blockchain proof.** It shows the same workflow and the same verification logic, but the "anchor" is a row in the application's own database. Anyone with database access could change it. Use mock mode to demonstrate and test the feature. Use `ethereum` mode only if you want a real, public, timestamped record on a test network.

## What is sent to the chain (ethereum mode)

Only the block index and block hash. Each anchor is a zero-value transaction from the configured account to itself, with this text as its data:

```
DPP-ANCHOR|v1|<blockIndex>|<blockHash>
```

No asset, person, event, or personal data is written on-chain. Mock mode sends nothing anywhere.

## What an anchor proves, and what it does not

**Proves (for anchored blocks, ethereum mode only):** the ledger block with that index had that hash at the time the anchor was mined. If anyone later changes that block, or removes it, verification reports it.

**Does not prove:**
- Anything about blocks created after the latest anchor. Those are protected only by the normal hash chain until they are anchored.
- That nobody rewrote the ledger *before* the first anchor.
- That the anchor database rows were never deleted. Deleting an `anchorrecords` row hides the anchor from this application, but a real transaction stays on the chain.
- That the key used for anchoring is safe. Whoever holds `ANCHOR_PRIVATE_KEY` can send anchors.
- That the chain itself is secure. This depends on the network used.

**Mock mode proves nothing external.** Its records can be edited in the database by anyone who can write to it. It exists so the workflow, the checks, and the UI can be exercised for free. It detects a change to the stored record or to the ledger block (see *Checks performed*), but it cannot show that a change happened before the simulation.

## Configuration

| Variable | Required when | Meaning |
|---|---|---|
| `ANCHOR_PROVIDER` | always | `none` (default), `mock`, or `ethereum` |
| `ANCHOR_RPC_URL` | `ethereum` | `http(s)://` or `ws(s)://` endpoint of a Sepolia RPC provider (for example Alchemy). The provider is only the connection. It does not supply a wallet or key. |
| `ANCHOR_PRIVATE_KEY` | `ethereum` | `0x` + 64 hex characters from a **separate test wallet** you create. Use a wallet with no real funds. Never commit it. |
| `ANCHOR_CHAIN_ID` | optional | Expected chain ID of the RPC endpoint (default `11155111`, Ethereum Sepolia). The server refuses to send if the endpoint reports a different chain. |
| `ANCHOR_MIN_CONFIRMATIONS` | optional | Blocks needed before an anchor counts as confirmed (default `1`) |

Mock mode needs none of the `ANCHOR_RPC_URL`, `ANCHOR_PRIVATE_KEY`, `ANCHOR_CHAIN_ID` or `ANCHOR_MIN_CONFIRMATIONS` settings.

**Validation.** At startup, `ANCHOR_PROVIDER` must be one of the three values above; anything else is refused. In `ethereum` mode the server refuses to start if the RPC URL or key is missing, malformed, or still a placeholder, or if the chain ID is not a positive integer. It never falls back to mock mode when Ethereum configuration is wrong.

**Secrets.** The private key and the RPC URL (which can contain an API key) are never included in API responses, audit-log metadata, or error messages. Chain errors are replaced with a generic message before they reach the caller.

## API

| Method | Path | Who | Action |
|---|---|---|---|
| GET | `/api/anchors` | ADMIN, AUDITOR | Verify all anchors against the ledger and the record (and the chain, in ethereum mode). Includes `providerInfo`. |
| POST | `/api/anchors` | ADMIN | Anchor the latest ledger block. Idempotent per block: a repeat returns the existing record with `created: false`. In mock mode this is a simulation. |
| POST | `/api/anchors/refresh` | ADMIN | Move pending anchors to CONFIRMED or FAILED. |

Managers and employees have no access. Auditors may view and verify but cannot create or refresh anchors. Every call is written to the audit log (`ANCHOR_CREATED`, `ANCHOR_VERIFICATION`, `ANCHOR_VIOLATION_DETECTED`). A read that is still pending is logged as `ANCHOR_VERIFICATION`, not as a violation.

Verification returns `VERIFIED` only when at least one anchor is confirmed and no check fails. It returns `PENDING` when anchors are still waiting, and `NO_ANCHORS` when nothing has been anchored. It never reports "verified" by default.

Every anchor record stores `simulated` (true for mock) and `network` (`MOCK (no network)` for mock, and the chain name for ethereum), so a simulated record can never be mistaken for a real one.

## Checks performed

For each confirmed anchor:
1. The ledger block at that index still exists.
2. Its `currentHash` equals the anchored hash.
3. The record (mock) or external transaction (ethereum) can be found.
4. The stored or on-chain payload decodes to the same index and hash.
5. In ethereum mode, the transaction was sent from the configured account. In mock mode, the record's signer is `MOCK-SIGNER`.

A payload that names a different block hash from the stored one is reported as a violation. This is the mismatch case the tests cover.

## Mock mode in detail

- References are deterministic. An anchor reference looks like `MOCK-SIM-` followed by 24 hex characters, and the block reference is `MOCK-BLOCK-<index>`. Neither looks like an Ethereum transaction hash.
- Anchoring the same head twice stores one record.
- The simulated record lives in the `mockanchortxes` collection, next to `anchorrecords`. It is only written when an admin anchors.
- No network is used. The app works offline.

## Status of this feature

- **Mock mode** is covered by automated tests in `server/tests/unit/mockAnchoring.test.js` and `server/tests/api/mockAnchors.test.js`. They cover initialisation without RPC or key, simulated anchoring, verification, mismatch detection, admin-only writes, auditor read-only access, disabled behaviour, Ethereum configuration validation, and secret non-leakage.
- Ethereum mode is covered by fakes of the chain library and RPC client (`server/tests/unit/anchoring.test.js`). Those tests do not contact a network.
- **Ethereum mode has not been run against a live Sepolia endpoint** as part of this work. To test it, set the three `ANCHOR_*` variables in `server/.env` with your own test wallet and Alchemy endpoint, run `POST /api/anchors`, wait for confirmation, then `GET /api/anchors`. Record the result before relying on it.
