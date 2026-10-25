const { buildScenario } = require('../support/fixtures');
const { raw } = require('../support/fakeDb');
const { prepareImport, commitImport } = require('../../services/assets/bulkImport');
const { verifyFullChain } = require('../../services/verification/verifyChain');

const HEADER = 'assetId,name,category,brand,model,serialNumber,purchaseDate,purchaseCost,warranty,status,owner,department,location,description,dppId,qrReference';
const line = (o = {}) => {
  const v = {
    assetId: 'NEW-1', name: 'New Laptop', category: 'Laptop', brand: 'Dell', model: 'Latitude', serialNumber: 'SN-NEW-1',
    purchaseDate: '2024-03-01', purchaseCost: '900', warranty: '1 Year', status: '', owner: '', department: 'IT Operations',
    location: 'HQ', description: 'desc', dppId: '', qrReference: '', ...o,
  };
  return [v.assetId, v.name, v.category, v.brand, v.model, v.serialNumber, v.purchaseDate, v.purchaseCost, v.warranty, v.status, v.owner, v.department, v.location, v.description, v.dppId, v.qrReference]
    .map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(',');
};
const csv = (...lines) => [HEADER, ...lines].join('\n');

describe('bulk import: validation', () => {
  let s;
  beforeEach(async () => {
    s = await buildScenario(); // existing: AST-1001..1004, serials SN-AST-1001..1004, departments IT Operations and Finance
  });

  test('a valid file is accepted and reports the ignored owner and dppId columns', async () => {
    const p = await prepareImport(csv(line(), line({ assetId: 'NEW-2', serialNumber: 'SN-NEW-2', owner: 'Someone' })));
    expect(p.canCommit).toBe(true);
    expect(p.validCount).toBe(2);
    expect(p.ignoredColumns).toEqual(expect.arrayContaining(['owner', 'dppId', 'qrReference']));
    expect(p.rows[1].warnings.join(' ')).toMatch(/Owner is not imported/);
  });

  test('spreadsheet category names are mapped to the application categories', async () => {
    const p = await prepareImport(csv(line({ assetId: 'N-3', category: 'Network Equipment', serialNumber: 'SN-N3' }), line({ assetId: 'N-4', category: 'Storage Device', serialNumber: 'SN-N4' }), line({ assetId: 'N-5', category: 'Peripherals', serialNumber: 'SN-N5' })));
    expect(p.canCommit).toBe(true);
    expect(p.rows.map((r) => r.fields.category)).toEqual(['Networking', 'Storage', 'Peripheral']);
  });

  test('an unknown category, bad date, future date and bad cost are each reported on the right row', async () => {
    const p = await prepareImport(csv(
      line({ assetId: 'B-1', category: 'Toaster', serialNumber: 'X1' }),
      line({ assetId: 'B-2', purchaseDate: '01/03/2024', serialNumber: 'X2' }),
      line({ assetId: 'B-3', purchaseDate: '2099-01-01', serialNumber: 'X3' }),
      line({ assetId: 'B-4', purchaseCost: 'lots', serialNumber: 'X4' }),
    ));
    expect(p.canCommit).toBe(false);
    const byRow = Object.fromEntries(p.rows.map((r) => [r.rowNumber, r.errors.map((e) => e.field)]));
    expect(byRow[2]).toEqual(['category']);
    expect(byRow[3]).toEqual(['purchaseDate']);
    expect(byRow[4]).toEqual(['purchaseDate']);
    expect(byRow[5]).toEqual(['purchaseCost']);
  });

  test('an impossible calendar date (2024-02-30) is rejected', async () => {
    const p = await prepareImport(csv(line({ purchaseDate: '2024-02-30', serialNumber: 'Y1' })));
    expect(p.rows[0].errors[0].message).toMatch(/not a real calendar date/);
  });

  test('a status other than ACTIVE is refused with the reason', async () => {
    const p = await prepareImport(csv(line({ status: 'Under Maintenance', serialNumber: 'Z1' })));
    expect(p.rows[0].errors[0].field).toBe('status');
    expect(p.rows[0].errors[0].message).toMatch(/lifecycle events/);
  });

  test('an existing Asset ID and an existing serial number are detected against the database', async () => {
    const p = await prepareImport(csv(line({ assetId: 'AST-1001', serialNumber: 'SN-FRESH' }), line({ assetId: 'FRESH-9', serialNumber: 'SN-AST-1002' })));
    expect(p.rows[0].errors.map((e) => e.message).join(' ')).toMatch(/already exists/);
    expect(p.rows[1].errors.map((e) => e.message).join(' ')).toMatch(/already registered/);
  });

  test('duplicates inside the same file are detected', async () => {
    const p = await prepareImport(csv(line({ assetId: 'D-1', serialNumber: 'S-1' }), line({ assetId: 'D-1', serialNumber: 'S-2' }), line({ assetId: 'D-3', serialNumber: 'S-1' })));
    expect(p.rows[1].errors[0].message).toMatch(/more than once in this file/);
    expect(p.rows[2].errors[0].message).toMatch(/more than once in this file/);
  });

  test('an unknown department is refused and a matching department name in another case is accepted', async () => {
    const p = await prepareImport(csv(line({ assetId: 'G-1', serialNumber: 'G1', department: 'Marketing' }), line({ assetId: 'G-2', serialNumber: 'G2', department: 'finance' })));
    expect(p.rows[0].errors[0].message).toMatch(/does not exist/);
    expect(p.rows[1].errors).toHaveLength(0);
    expect(p.rows[1].fields.department).toBe('Finance');
  });

  test('a file missing a required column is refused with 400 and the missing names', async () => {
    const err = await prepareImport('assetId,name\nA,B').catch((e) => e);
    expect(err.statusCode).toBe(400);
    expect(err.message).toMatch(/category, purchaseDate/);
  });

  test('an invalid asset ID format is refused', async () => {
    const p = await prepareImport(csv(line({ assetId: 'bad id!', serialNumber: 'Q1' })));
    expect(p.rows[0].errors[0].message).toMatch(/may only contain/);
  });
});

describe('bulk import: commit', () => {
  let s;
  beforeEach(async () => {
    s = await buildScenario();
  });

  test('refuses to write anything when any row is invalid, and returns every row error', async () => {
    const before = raw('Asset').length;
    const p = await prepareImport(csv(line({ assetId: 'OK-1', serialNumber: 'K1' }), line({ assetId: 'BAD-2', category: 'Nope', serialNumber: 'K2' })));
    await expect(commitImport(p, { actor: s.users.admin })).rejects.toMatchObject({ statusCode: 422 });
    expect(raw('Asset').length).toBe(before);
  });

  test('a valid file creates each asset with its REGISTRATION ledger entry, and the chain still verifies', async () => {
    const before = raw('Asset').length;
    const p = await prepareImport(csv(line({ assetId: 'OK-1', serialNumber: 'K1' }), line({ assetId: 'OK-2', serialNumber: 'K2', category: 'Monitor' })));
    const result = await commitImport(p, { actor: s.users.admin });
    expect(result.succeeded.map((r) => r.assetId)).toEqual(['OK-1', 'OK-2']);
    expect(result.failed).toEqual([]);
    expect(raw('Asset').length).toBe(before + 2);
    expect(raw('AuditLog').filter((l) => l.action === 'ASSET_CREATED' && l.metadata && l.metadata.source === 'bulk-import')).toHaveLength(2);
    expect((await verifyFullChain()).status).toBe('VERIFIED');
  });

  test('re-submitting an already imported file is refused as duplicates and creates nothing', async () => {
    const body = csv(line({ assetId: 'RE-1', serialNumber: 'R1' }));
    await commitImport(await prepareImport(body), { actor: s.users.admin });
    const again = await prepareImport(body);
    expect(again.canCommit).toBe(false);
    await expect(commitImport(again, { actor: s.users.admin })).rejects.toMatchObject({ statusCode: 422 });
    expect(raw('Asset').filter((a) => a.assetId === 'RE-1')).toHaveLength(1);
  });
});
