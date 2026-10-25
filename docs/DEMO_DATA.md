# Demo accounts and demo assets

For development and demonstration only. Do not run these against a production database.
Both commands refuse to run when `NODE_ENV=production`.

## 1. Demo role accounts

```powershell
cd server
npm run demo:accounts              # DRY RUN: shows what would be created. Writes nothing.
npm run demo:accounts -- --yes     # creates only the accounts and departments that are missing
```

| Role | Email | Department |
| --- | --- | --- |
| ADMIN | admin@example.test | none |
| MANAGER | manager@example.test | IT Operations (managed) |
| EMPLOYEE | employee@example.test | IT Operations |
| AUDITOR | auditor@example.test | none |

- Each **new** account gets a random password. It is printed **once**, in the terminal. Copy it then.
  Passwords are stored only as bcrypt hashes. If you lose one, sign in as the administrator and reset it.
- An account whose email already exists is **left exactly as it is**, including its password.
- The command never deletes or resets anything.
- The `.test` domain is reserved and cannot receive email.

## 2. Demo assets

```powershell
cd server
npm run demo:assets               # DRY RUN: lists what would be added.
npm run demo:assets -- --yes      # adds the missing demo assets
```

- Requires step 1 first (the demo departments and the demo administrator).
- Adds `DEMO-AST-001` to `DEMO-AST-040`: laptops, desktops, monitors, printers, networking, servers,
  storage, peripherals and UPS units.
- Every asset is registered through the same service the application uses, so each has a REGISTRATION
  event and a ledger block. Every fourth asset also has a MAINTENANCE start and completion recorded.
- Running it again adds nothing: existing Asset IDs are skipped.
- After seeding it runs the full-ledger check and exits non-zero if the chain does not verify.

## 3. Check the result

```powershell
cd server
npm run ledger:diagnose           # read-only: expect "VERIFIED" for the full ledger and every asset
```

## Relation to the older seed

`npm run seed:dev` is the original development seed. It refuses to run once any user exists, and
`--reset` deletes application data. The commands above never delete anything and can be re-run.
