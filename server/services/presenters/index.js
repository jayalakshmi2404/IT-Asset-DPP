/**
 * Response shapers. Controllers return these instead of raw documents so that
 * password hashes, token versions and other internal fields can never leak.
 */

function publicUser(user) {
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status,
    department: user.department || '',
    departmentId: user.departmentId ? String(user.departmentId) : null,
    managedDepartmentIds: (user.managedDepartmentIds || []).map(String),
  };
}

function publicAsset(asset) {
  const plain = typeof asset.toObject === 'function' ? asset.toObject() : { ...asset };
  return {
    _id: String(plain._id),
    assetId: plain.assetId,
    name: plain.name,
    category: plain.category,
    brand: plain.brand || '',
    model: plain.model || '',
    serialNumber: plain.serialNumber || '',
    purchaseDate: plain.purchaseDate,
    purchaseCost: plain.purchaseCost ?? 0,
    warranty: plain.warranty || '',
    status: plain.status,
    assignedTo: plain.assignedTo ? String(plain.assignedTo) : null,
    owner: plain.owner || '',
    departmentId: plain.departmentId ? String(plain.departmentId) : null,
    department: plain.department || '',
    location: plain.location || '',
    description: plain.description || '',
    dppId: plain.dppId,
    qrGenerated: Boolean(plain.qrGenerated),
    qrGeneratedAt: plain.qrGeneratedAt || null,
    createdAt: plain.createdAt,
    updatedAt: plain.updatedAt,
  };
}

function publicLifecycleEvent(event) {
  return {
    _id: String(event._id),
    eventId: event.eventId,
    assetId: event.assetId,
    eventType: event.eventType,
    description: event.description,
    performedByName: event.performedByName,
    timestamp: event.timestamp,
    metadata: event.metadata || {},
    previousHash: event.previousHash,
    currentHash: event.currentHash,
    blockIndex: event.blockIndex,
  };
}

module.exports = { publicUser, publicAsset, publicLifecycleEvent };
