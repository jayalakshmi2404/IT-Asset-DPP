import axios from 'axios';
import { clearToken, getToken, setNotice } from './session';

const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export const api = axios.create({ baseURL, timeout: 20000 });

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Authentication endpoints report their own 401s, so only other endpoints end the session.
const SESSION_EXEMPT = ['/auth/login'];

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const url = error.config?.url || '';
    const status = error.response?.status;
    if (status === 401 && !SESSION_EXEMPT.some((p) => url.startsWith(p))) {
      clearToken();
      setNotice('Your session has ended. Please sign in again.');
      if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
        window.location.assign('/login');
      }
    }
    return Promise.reject(error);
  }
);

/** A readable message for any failed request. Never shows stack traces or raw HTML. */
export function apiErrorMessage(err) {
  if (!err) return 'Something went wrong. Please try again.';
  if (!err.response) {
    return err.code === 'ECONNABORTED'
      ? 'The server took too long to respond. Please try again.'
      : 'Cannot reach the server. Check your connection and try again.';
  }
  const { status, data } = err.response;
  if (data?.message && typeof data.message === 'string') return data.message;
  if (status === 403) return 'You do not have permission to do that.';
  if (status === 404) return 'That record was not found, or you do not have access to it.';
  if (status === 429) return 'Too many attempts. Please wait a few minutes and try again.';
  if (status >= 500) return 'The service is temporarily unavailable. Please try again.';
  return 'Something went wrong. Please try again.';
}

export default api;
