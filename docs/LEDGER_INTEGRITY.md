# Ledger integrity: canonicalisation, verification and recovery

## 1. How a lifecycle event is hashed

Every lifecycle event produces exactly one hash-chain block. Both the writer and the verifier use
the same functions in `server/services/blockchain/hashCrypto.js`.

**Write path** (`lifecycleService.writeEvent`):

1. `canonicalEventFields` trims `description` and `performedByName`, fills missing values with `''`
   and `{}`, and JSON-cleans `metadata`. The result is the only data that is hashed **and** stored.
2. `eventDataHash = SHA-256(stableStringify({assetId, eventId, eventType, description, performedByName, timestamp (ISO-8601 UTC), metadata}))`
3. `currentHash = SHA-256(stableStringify({index, timestamp, assetId, eventId, eventDataHash, previousHash}))`
4. The block, the event and the asset update are written in one transaction.

**Canonical form** (`stableStringify`): keys sorted; `undefined`, functions and symbols omitted
(JSON rules), so an absent field and an `undefined` field hash the same; non-finite numbers and
undefined array items become `null`; invalid dates throw instead of hashing a guess.

**Compatibility:** the canonical form was tightened in this version, but it produces byte-identical
output for every record the previous code could write. This is pinned by a golden-vector test
(`server/tests/support/goldenVector.json`). No existing hash changes.

**Verification path** (`verifyChain.js`) hashes the **stored** record exactly as it is. It never applies
defaults, trims or repairs. A difference is always a violation.

## 2. What verification checks

Per asset (`verifyAssetChain`):

- the asset has at least one lifecycle record, including its `REGISTRATION` record (an asset with no records is a violation, never a pass)
- every record has a ledger block for the same asset
- each record's data still hashes to the block's `eventDataHash`
- each block's own hash recalculates correctly
- the record's `blockIndex`, `previousHash` and `currentHash` match the block
- every block for the asset still has its record (deletions are reported)

Full ledger (`verifyFullChain`):

- block 0 is the genesis block; indexes are sequential (no gaps, no reordering)
- `previousHash` of each block equals `currentHash` of the block before it
- each block's own hash recalculates correctly
- each block references exactly one record; that record exists, hashes correctly, and points back to the same block index, asset and hashes
- every lifecycle record in the database is referenced by a block (orphans are reported)
- an empty ledger returns `UNAVAILABLE`, not `VERIFIED`

Every violation names the event ID, the asset ID and the block index where available. A violation
may also carry a `diagnosis` list (see section 4).

## 3. Concurrency

Concurrent writers read the chain head inside a snapshot transaction and append the next index. The
unique index on `hashblocks.index` makes the loser fail; the transaction is then rolled back and retried
against the new head, with a short jittered back-off. If retries run out, the request gets a 409 and
nothing is saved. A real-MongoDB test runs 12 concurrent writes; all committed, indexes stayed
contiguous, and the full ledger verified.

## 4. Mismatch diagnosis (read-only)

When an event's data does not match its block, the verifier adds `diagnosis` hints. They never change
the result. Possible hints:

- the stored record has no `description` or `metadata` field (older builds may not have stored it)
- the stored description has leading or trailing whitespace that was not present when it was hashed
- the block's hash matches once the write-time defaults are applied. This points to a legacy record,
  **not** proof of tampering, but it still requires administrator review.
- no hint: the data differs from what was recorded, which is consistent with a later edit

## 5. ASSET049 (the screenshot in the spec)

What the screenshot reports: asset `ASSET049`, DPP ID `DPP-ASSET049-43A1A8`, one lifecycle record,
"Event data does not match its recorded hash".

What the code shows:

- The current code creates DPP IDs as `DPP-<assetId>` with **no suffix** (`server/utils/ids.js`). The
  suffix `-43A1A8` does not come from any code in this project. **The record was therefore not created
  by this code path**, or its DPP ID was changed directly in the database.
- The current write path is self-consistent: it stores exactly the values it hashes. Legacy-record
  explanations (section 4) are read-only and never change a result.

What cannot be determined without the database:

- whether the record was written by an older build (with a different hashing scheme), had fields
  removed, or was edited after creation. This needs the stored document and its block.
- the original trusted hash. If the original block was lost, historical tamper detection for this asset
  cannot be claimed.

**Investigation procedure (read-only):**

```bash
cd server
npm run ledger:diagnose -- --asset ASSET049 > asset049-report.json
```

Review `violations[].diagnosis` and the block's `eventDataHash`. Record the result in the audit trail
before any action. Do **not** recalculate hashes to make the check pass; that would hide the problem.

## 6. Recovery and migration (administrator-controlled)

No automatic repair exists, and none is run at startup. The following steps require approval.

1. **Back up first.** Snapshot the Atlas cluster, or `mongodump --db it_asset_dpp --out backups/<date>`.
2. **Dry run.** Run `npm run ledger:diagnose` on the backup restored into a *new* test database.
3. **Decide per asset:**
   - *Genuinely altered* (no hint, or a hint that does not match): keep the record as it is. Report it to
     the owner of the asset register. Do not overwrite it.
   - *Legacy record* (a diagnosis hint explains the mismatch): keep the original record. If an
     administrator approves, an annotated correction may be written as a **new** lifecycle event
     (`ALLOCATION`/`MAINTENANCE` with a note), never by editing the old one.
   - *Lost trusted hash*: state in the report that the historical record cannot be independently
     verified. Do not claim that tampering was excluded.
4. **Audit trail.** Every decision is recorded in the audit log (`logAction`) with the approving person.
5. **Never** reset, erase or reseed a production database to clear a violation.

## 7. Migrating local data to Atlas

1. `mongodump --uri "mongodb://127.0.0.1:27017/it_asset_dpp?replicaSet=rs0" --out local-backup`
2. `mongorestore --uri "$ATLAS_TEST_URI" --nsInclude "it_asset_dpp.*" local-backup` into a **test** database.
3. `MONGODB_URI=<atlas test uri> npm run ledger:diagnose` and review the report.
4. Only after approval, restore the same dump into the production database. Restore all of `hashblocks`,
   `lifecycleevents`, `assets`, `users`, `departments` and `auditlogs` together.

The application never assumes that local records exist in Atlas. An empty Atlas database starts with
the genesis block only.
