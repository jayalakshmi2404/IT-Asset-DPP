const { buildScenario, as, anonymous } = require('../support/fixtures');
const { raw } = require('../support/fakeDb');
const { registerAsset } = require('../../services/lifecycleService');

const HEADER = 'assetId,name,category,brand,model,serialNumber,purchaseDate,purchaseCost,warranty,status,owner,department,location,description,dppId,qrReference';
const row = (id, serial, extra = {}) => [id, extra.name || `Item ${id}`, extra.category || 'Laptop', 'Dell', 'Latitude', serial, '2024-05-01', '800', '1 Year', '', '', extra.department || 'IT Operations', 'HQ', 'd', '', ''].join(',');

describe('GET /api/assets/export', () => {
  let s;
  beforeEach(async () => {
    s = await buildScenario();
  });

  test('requires sign-in', async () => {
    const res = await anonymous.get('/api/assets/export');
    expect(res.status).toBe(401);
  });

  test('returns CSV of persisted assets with stable headers and no owner or internal columns', async () => {
    const res = await as(s.users.admin).get('/api/assets/export');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.headers['content-disposition']).toMatch(/attachment; filename="assets-\d{4}-\d{2}-\d{2}\.csv"/);
    const text = res.text.replace(/^\uFEFF/, '');
    const header = text.split('\r\n')[0];
    expect(header).toBe('assetId,name,category,brand,model,serialNumber,purchaseDate,purchaseCost,warranty,status,department,location,description,dppId,qrGenerated');
    expect(header).not.toMatch(/owner|assignedTo|createdBy|hash/i);
    for (const id of ['AST-1001', 'AST-1002', 'AST-1003', 'AST-1004']) expect(text).toContain(id);
  });

  test('the export applies the list filters (category)', async () => {
    const res = await as(s.users.admin).get('/api/assets/export?category=Laptop');
    const text = res.text;
    expect(text).toContain('AST-1001');
    expect(text).not.toMatch(/,Monitor,/);
  });

  test('an employee exports only assets inside their own scope', async () => {
    const res = await as(s.users.empA).get('/api/assets/export');
    expect(res.status).toBe(200);
    expect(res.text).toContain('AST-1001');
    expect(res.text).not.toContain('AST-1002');
  });

  test('selected assets can be exported by ID, and an invalid ID is rejected', async () => {
    const a = raw('Asset').find((x) => x.assetId === 'AST-1003');
    const ok = await as(s.users.admin).get(`/api/assets/export?ids=${a._id}`);
    expect(ok.text).toContain('AST-1003');
    expect(ok.text).not.toContain('AST-1001');
    const bad = await as(s.users.admin).get('/api/assets/export?ids=not-an-id');
    expect(bad.status).toBe(400);
  });

  test('a formula-like asset name is neutralised in the export', async () => {
    await registerAsset({ actor: s.users.admin, fields: { assetId: 'FX-1', name: '=HYPERLINK("http://evil.test")', category: 'Other', purchaseDate: new Date('2024-01-01'), assignedTo: null, owner: '' } });
    const res = await as(s.users.admin).get('/api/assets/export?search=FX-1');
    expect(res.text).toContain(`'=HYPERLINK`);
    expect(res.text).not.toMatch(/(^|,)=HYPERLINK/m);
  });

  test('an export of an unsupported format is refused', async () => {
    const res = await as(s.users.admin).get('/api/assets/export?format=xlsx');
    expect(res.status).toBe(400);
  });
});

describe('POST /api/assets/import', () => {
  let s;
  beforeEach(async () => {
    s = await buildScenario();
  });

  const body = (...rows) => [HEADER, ...rows].join('\n');

  test('an employee and an auditor cannot import', async () => {
    for (const user of [s.users.empA, s.users.auditor]) {
      const res = await as(user).post('/api/assets/import').set('Content-Type', 'text/csv').send(body(row('X-1', 'SX-1')));
      expect(res.status).toBe(403);
    }
    expect(raw('Asset').some((a) => a.assetId === 'X-1')).toBe(false);
  });

  test('JSON is refused: the endpoint accepts CSV text only', async () => {
    const res = await as(s.users.admin).post('/api/assets/import').send({ csv: body(row('X-2', 'SX-2')) });
    expect(res.status).toBe(415);
  });

  test('a dry run validates and writes nothing', async () => {
    const before = raw('Asset').length;
    const res = await as(s.users.admin).post('/api/assets/import?dryRun=true').set('Content-Type', 'text/csv').send(body(row('DR-1', 'SDR-1')));
    expect(res.status).toBe(200);
    expect(res.body.committed).toBe(false);
    expect(res.body.data.validRows).toBe(1);
    expect(raw('Asset').length).toBe(before);
  });

  test('a valid file is committed and the response lists the persisted assets', async () => {
    const res = await as(s.users.admin).post('/api/assets/import').set('Content-Type', 'text/csv').send(body(row('OK-1', 'SOK-1'), row('OK-2', 'SOK-2')));
    expect(res.status).toBe(201);
    expect(res.body.data.succeeded.map((r) => r.assetId)).toEqual(['OK-1', 'OK-2']);
    expect(raw('Asset').some((a) => a.assetId === 'OK-2')).toBe(true);
  });

  test('a file with a bad row is refused with 422, lists the row error, and writes nothing', async () => {
    const before = raw('Asset').length;
    const res = await as(s.users.admin).post('/api/assets/import').set('Content-Type', 'text/csv').send(body(row('BR-1', 'SBR-1'), row('BR-2', 'SBR-2', { category: 'Toaster' })));
    expect(res.status).toBe(422);
    expect(res.body.details.some((d) => d.row === 3 && d.field === 'category')).toBe(true);
    expect(raw('Asset').length).toBe(before);
  });

  test('a file over the 2 MB limit is refused with 413 before it is parsed', async () => {
    const huge = `${HEADER}\n` + `${row('BIG-1', 'SBIG')}\n`.repeat(40000) + 'x'.repeat(2 * 1024 * 1024);
    const res = await as(s.users.admin).post('/api/assets/import').set('Content-Type', 'text/csv').send(huge);
    expect(res.status).toBe(413);
  });

  test('a file with more than 1000 data rows is refused with 413', async () => {
    const rows = Array.from({ length: 1001 }, (_, i) => row(`MANY-${i}`, `SMANY-${i}`));
    const res = await as(s.users.admin).post('/api/assets/import?dryRun=true').set('Content-Type', 'text/csv').send(body(...rows));
    expect(res.status).toBe(413);
  });
});
