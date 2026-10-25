const { demoAssets, DEMO_ACCOUNTS, DEMO_DEPARTMENTS } = require('../../services/demo/demoData');
const { validateRow } = require('../../services/assets/bulkImport');

describe('demo dataset definitions', () => {
  const assets = demoAssets(40);

  test('defines 40 assets with unique IDs and serial numbers', () => {
    expect(assets).toHaveLength(40);
    expect(new Set(assets.map((a) => a.assetId)).size).toBe(40);
    expect(new Set(assets.map((a) => a.serialNumber)).size).toBe(40);
  });

  test('every demo asset passes the same validation rules the importer uses', () => {
    const empty = { departmentsByName: new Map(DEMO_DEPARTMENTS.map((d) => [d.name.toLowerCase(), { id: 'x', name: d.name }])), existingAssetIds: new Set(), existingSerials: new Set(), seenAssetIds: new Set(), seenSerials: new Set() };
    for (const a of assets) {
      const raw = { ...a, purchaseCost: String(a.purchaseCost), status: 'Active', maintenanceAfterRegistration: undefined };
      const { errors } = validateRow(raw, empty);
      expect({ id: a.assetId, errors }).toEqual({ id: a.assetId, errors: [] });
    }
  });

  test('every demo asset is in a department that is defined', () => {
    const names = new Set(DEMO_DEPARTMENTS.map((d) => d.name));
    expect(assets.every((a) => names.has(a.department))).toBe(true);
  });

  test('the dataset covers several categories and includes maintenance history', () => {
    expect(new Set(assets.map((a) => a.category)).size).toBeGreaterThanOrEqual(7);
    expect(assets.filter((a) => a.maintenanceAfterRegistration).length).toBe(10);
  });

  test('demo accounts cover all four roles, use reserved .test addresses and define no passwords', () => {
    expect(DEMO_ACCOUNTS.map((a) => a.role).sort()).toEqual(['ADMIN', 'AUDITOR', 'EMPLOYEE', 'MANAGER']);
    expect(DEMO_ACCOUNTS.every((a) => a.email.endsWith('@example.test'))).toBe(true);
    expect(DEMO_ACCOUNTS.some((a) => 'password' in a || 'passwordHash' in a)).toBe(false);
  });
});
