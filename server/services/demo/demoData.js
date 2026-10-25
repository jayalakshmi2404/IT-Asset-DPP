/**
 * Development/demo dataset definitions. Pure data: no database access here.
 * Everything is deterministic, so running the initializers twice produces the same identifiers
 * and the second run finds them already present. All emails use the reserved .test domain.
 */

const DEMO_DOMAIN = 'example.test';

const DEMO_DEPARTMENTS = [
  { name: 'IT Operations', code: 'ITOPS' },
  { name: 'Finance', code: 'FIN' },
];

/** One demo account per role. Passwords are NEVER defined here: they are generated at creation time. */
const DEMO_ACCOUNTS = [
  { key: 'admin', name: 'Demo Administrator', email: `admin@${DEMO_DOMAIN}`, role: 'ADMIN', department: null },
  { key: 'manager', name: 'Demo Manager', email: `manager@${DEMO_DOMAIN}`, role: 'MANAGER', department: 'IT Operations' },
  { key: 'employee', name: 'Demo Employee', email: `employee@${DEMO_DOMAIN}`, role: 'EMPLOYEE', department: 'IT Operations' },
  { key: 'auditor', name: 'Demo Auditor', email: `auditor@${DEMO_DOMAIN}`, role: 'AUDITOR', department: null },
];

const MODELS = [
  { category: 'Laptop', brand: 'Dell', model: 'Latitude 7450', warranty: '3 Years On-site Support', cost: 1450 },
  { category: 'Laptop', brand: 'Lenovo', model: 'ThinkPad T14 Gen 5', warranty: '3 Years On-site Support', cost: 1320 },
  { category: 'Desktop', brand: 'HP', model: 'ProDesk 600 G6', warranty: '1 Year Standard Warranty', cost: 980 },
  { category: 'Monitor', brand: 'Dell', model: 'P2725H', warranty: '3 Years On-site Support', cost: 310 },
  { category: 'Printer', brand: 'Brother', model: 'HL-L5210DN', warranty: '1 Year Standard Warranty', cost: 540 },
  { category: 'Networking', brand: 'Cisco', model: 'Catalyst 9300', warranty: '5 Years Enterprise Support', cost: 4200 },
  { category: 'Server', brand: 'HPE', model: 'ProLiant DL380 Gen11', warranty: '5 Years Enterprise Support', cost: 7800 },
  { category: 'Storage', brand: 'Synology', model: 'DS923+', warranty: '3 Years On-site Support', cost: 690 },
  { category: 'Peripheral', brand: 'Logitech', model: 'MX Keys', warranty: '1 Year Standard Warranty', cost: 120 },
  { category: 'Other', brand: 'APC', model: 'Smart-UPS 1500', warranty: '3 Years On-site Support', cost: 560 },
];
const DEPARTMENT_CYCLE = ['IT Operations', 'Finance', 'IT Operations', 'Finance', 'IT Operations'];
const LOCATIONS = ['Headquarters - Floor 1', 'Headquarters - Floor 2', 'Server Room A', 'Training Lab', 'Branch Office - Salem'];

/**
 * Builds the demo asset list: DEMO-AST-001 to DEMO-AST-040. Every fourth asset gets a MAINTENANCE
 * lifecycle event after registration (see demoAssets.js), so the history has more than one record.
 */
function demoAssets(count = 40) {
  const assets = [];
  for (let i = 0; i < count; i += 1) {
    const m = MODELS[i % MODELS.length];
    const n = String(i + 1).padStart(3, '0');
    const year = 2024 + (i % 2);
    const month = String((i % 12) + 1).padStart(2, '0');
    const day = String((i % 27) + 1).padStart(2, '0');
    assets.push({
      assetId: `DEMO-AST-${n}`,
      name: `${m.brand} ${m.model} (demo ${n})`,
      category: m.category,
      brand: m.brand,
      model: m.model,
      serialNumber: `DEMO-SN-${n}`,
      purchaseDate: `${year}-${month}-${day}`,
      purchaseCost: m.cost + (i % 5) * 10,
      warranty: m.warranty,
      department: DEPARTMENT_CYCLE[i % DEPARTMENT_CYCLE.length],
      location: LOCATIONS[i % LOCATIONS.length],
      description: `Demo asset ${n} for development. Not a real device.`,
      maintenanceAfterRegistration: i % 4 === 3,
    });
  }
  return assets;
}

module.exports = { DEMO_DOMAIN, DEMO_DEPARTMENTS, DEMO_ACCOUNTS, demoAssets };
