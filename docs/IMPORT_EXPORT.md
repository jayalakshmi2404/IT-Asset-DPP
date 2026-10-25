# Bulk import and export of assets

Both features use the same rules as the rest of the application. Every asset written by an import
goes through the trusted lifecycle service, so it gets its REGISTRATION event and ledger block.

## Template

`server/templates/assets-import-template.csv` has the exact headers and example rows. Replace the
examples with your own data, and keep the header row.

## Columns

| Column | Required | Rules |
| --- | --- | --- |
| `assetId` | yes | 1 to 40 characters: letters, digits, `.`, `-`, `_`. Must be new (not already in the database or repeated in the file). |
| `name` | yes | 1 to 160 characters. |
| `category` | yes | One of: Laptop, Desktop, Server, Monitor, Printer, Networking, Storage, Peripheral, Other. Also accepted: `Network Equipment` → Networking, `Storage Device` → Storage, `Peripherals` → Peripheral. |
| `purchaseDate` | yes | `YYYY-MM-DD`, a real calendar date, not in the future. |
| `brand`, `model` | no | Up to 80 characters each. |
| `serialNumber` | no | Up to 80 characters. If given, must be new (not in the database or repeated in the file). |
| `purchaseCost` | no | Number from 0 to 1,000,000,000. Default 0. |
| `warranty` | no | Up to 120 characters. |
| `status` | no | Leave blank or use `Active` / `Registered`. Other values are refused: new assets are ACTIVE. Maintenance, transfers and disposal are recorded as lifecycle events after import. |
| `department` | no | Must match an existing department name (case-insensitive). Departments are not created by an import. |
| `location` | no | Up to 120 characters. |
| `description` | no | Up to 1000 characters. |

Ignored columns (accepted, not imported): `owner`, `dppId` (generated from the Asset ID as `DPP-<assetId>`), `qrReference`. Owners are assigned after import through Lifecycle → Allocate.

## Limits

- File: 2 MB at most.
- Rows: 1000 data rows at most.
- Format: CSV, UTF-8 (a byte-order mark is accepted). Quoted fields may contain commas, quotes and line breaks.

## What happens on import

1. **Validation first, for the whole file.** Every row is checked. If any row has an error, **nothing is written**, and every error is returned with its row number, field and reason.
2. **Writing a valid file.** Rows are written one at a time. Each asset and its REGISTRATION block commit in their own transaction. If the database rejects a row, the rows before it stay written (each is complete and verifiable), the rest are still attempted, and the result lists exactly which rows succeeded and which failed. Nothing is reported as imported unless its transaction committed.
3. **Re-running the same file** after a successful import is refused, because every Asset ID and serial number now exists. Nothing is duplicated.
4. Each imported asset writes an `ASSET_CREATED` audit entry with `"source": "bulk-import"`.

Who can import: **ADMIN only** (`assets:write`). The endpoint and the command line both enforce this.

## Endpoints and commands

| Action | How |
| --- | --- |
| Validate only (dry run) | `POST /api/assets/import?dryRun=true` with `Content-Type: text/csv` |
| Import | `POST /api/assets/import` with `Content-Type: text/csv` |
| Command line, dry run | `npm run import:assets -- path\to\file.csv` |
| Command line, import | `npm run import:assets -- path\to\file.csv --commit --as admin@yourcompany.test` |

Failed rows are written to `<file>-failed-rows.csv` beside the input file (or to `--report <path>`).

Responses: `201` when every row was imported, `207` when some rows failed (the body lists them), `422` when validation refused the whole file, `413` when the file is too large or has too many rows, `415` when the content type is not CSV, `403` for roles without `assets:write`.

## Export

`GET /api/assets/export` returns a CSV file.

- Applies the same filters and data scope as the asset list: `category`, `status`, `departmentId`, `search`.
- `ids=<id1>,<id2>` restricts the export to selected assets (still within the caller's scope).
- Needs `assets:read`. Each user only receives assets inside their own scope.
- Up to 5000 assets. Narrow the filters if you get `413`.
- Each export is audit-logged (`ASSETS_EXPORTED`) with the row count.

### Export columns (in this order)

`assetId, name, category, brand, model, serialNumber, purchaseDate, purchaseCost, warranty, status, department, location, description, dppId, qrGenerated`

Excluded on purpose: owner names (personal), internal IDs, creator, password and token fields, hash data.

### Formats and safety

- UTF-8 with a byte-order mark, so Excel opens accented characters correctly.
- Commas, quotes and line breaks are quoted per RFC 4180.
- **Formula injection:** a cell that starts with `=`, `+`, `-`, `@`, tab or carriage return is written with a leading apostrophe, so spreadsheets show it as text instead of running it.
- Dates are `YYYY-MM-DD`.

### Round trip

An export can be imported again, with two limits:
- Assets whose status is not ACTIVE (for example MAINTENANCE) are refused on import, because the status cannot be set directly.
- Owners are not exported, so they are not restored by an import.

XLSX export and XLSX import are not implemented.
