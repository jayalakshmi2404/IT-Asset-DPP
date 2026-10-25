import api from './api';

export const authApi = {
  login: (email, password) => api.post('/auth/login', { email, password }),
  me: () => api.get('/auth/me'),
  logout: () => api.post('/auth/logout'),
  changePassword: (currentPassword, newPassword) => api.put('/auth/me/password', { currentPassword, newPassword }),
};

export const assetApi = {
  list: (params) => api.get('/assets', { params }),
  get: (id) => api.get(`/assets/${encodeURIComponent(id)}`),
  create: (payload) => api.post('/assets', payload),
  update: (id, payload) => api.put(`/assets/${encodeURIComponent(id)}`, payload),
  getQr: (id) => api.get(`/assets/${encodeURIComponent(id)}/qr`),
  generateQr: (id) => api.post(`/assets/${encodeURIComponent(id)}/qr`),
  getIntegrity: (id) => api.get(`/assets/${encodeURIComponent(id)}/integrity`),
  verifyIntegrity: (id) => api.post(`/assets/${encodeURIComponent(id)}/verify-integrity`),
  exportCsv: (params) => api.get('/assets/export', { params, responseType: 'blob' }),
};

export const lifecycleApi = {
  listAll: (params) => api.get('/lifecycle', { params }),
  listForAsset: (id, params) => api.get(`/assets/${encodeURIComponent(id)}/lifecycle`, { params }),
  addEvent: (id, payload) => api.post(`/assets/${encodeURIComponent(id)}/lifecycle`, payload),
  recent: (limit = 8) => api.get('/lifecycle/recent', { params: { limit } }),
};

export const integrityApi = {
  fullChain: () => api.get('/integrity/full-chain'),
};

export const publicVerifyApi = {
  byDppId: (dppId) => api.get(`/verify/${encodeURIComponent(dppId)}`),
  byAssetId: (assetId) => api.get(`/verify/asset/${encodeURIComponent(assetId)}`),
};

export const userApi = {
  list: (params) => api.get('/users', { params }),
  assignable: (params) => api.get('/users/assignable', { params }),
  create: (payload) => api.post('/users', payload),
  update: (id, payload) => api.put(`/users/${encodeURIComponent(id)}`, payload),
};

export const departmentApi = {
  list: () => api.get('/departments'),
  create: (payload) => api.post('/departments', payload),
  update: (id, payload) => api.put(`/departments/${encodeURIComponent(id)}`, payload),
};

export const auditApi = {
  list: (params) => api.get('/audit-logs', { params }),
};

export const reportApi = {
  overview: () => api.get('/reports/overview'),
  lifecycle: () => api.get('/reports/lifecycle'),
};
