/** Asset categories accepted by the API. Keep in sync with client/src/utils/format.js. */
const CATEGORIES = Object.freeze([
  'Laptop',
  'Desktop',
  'Monitor',
  'Server',
  'Networking',
  'Mobile Device',
  'Printer',
  'Storage',
  'Peripheral',
  'Other',
]);

const EVENT_TYPES_WRITABLE = Object.freeze(['ALLOCATION', 'MAINTENANCE', 'TRANSFER', 'DISPOSAL']);

const MAX_PAGE_SIZE = 100;

module.exports = { CATEGORIES, EVENT_TYPES_WRITABLE, MAX_PAGE_SIZE };
