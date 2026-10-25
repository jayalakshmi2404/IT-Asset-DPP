/**
 * Token storage. "Remember me" chooses localStorage (kept across browser restarts);
 * otherwise sessionStorage (cleared when the tab closes). The user profile is NOT
 * stored: it is always fetched fresh from the server, so no stale role or data can
 * survive a logout or an account switch.
 */
const TOKEN_KEY = 'itdpp_token';
const NOTICE_KEY = 'itdpp_notice';

function safe(fn, fallback) {
  try {
    return fn();
  } catch {
    return fallback; // storage can be blocked (private mode, disabled site data)
  }
}

export function getToken() {
  return safe(() => localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY), null);
}

export function storeToken(token, remember) {
  clearToken();
  safe(() => (remember ? localStorage : sessionStorage).setItem(TOKEN_KEY, token));
}

export function clearToken() {
  safe(() => localStorage.removeItem(TOKEN_KEY));
  safe(() => sessionStorage.removeItem(TOKEN_KEY));
}

/** One-time message shown on the sign-in page (e.g. "session expired"). */
export function setNotice(message) {
  safe(() => sessionStorage.setItem(NOTICE_KEY, message));
}

/** Read-only: safe to call from render (StrictMode may call initialisers twice). */
export function peekNotice() {
  return safe(() => sessionStorage.getItem(NOTICE_KEY), null);
}

export function clearNotice() {
  safe(() => sessionStorage.removeItem(NOTICE_KEY));
}
