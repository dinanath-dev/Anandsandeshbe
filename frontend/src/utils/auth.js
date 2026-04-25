const AUTH_STORAGE_KEY = 'ssdnUserAuth';
const OTP_STORAGE_KEY = 'ssdnPendingAuth';

export function isUserAuthenticated() {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    return Boolean(parsed?.token && parsed?.user?.email);
  } catch {
    return false;
  }
}

export function getUserAuth() {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveUserAuth(payload) {
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(payload));
}

export function clearUserAuth() {
  localStorage.removeItem(AUTH_STORAGE_KEY);
}

export function getUserToken() {
  return getUserAuth()?.token || '';
}

export function savePendingOtp(payload) {
  sessionStorage.setItem(OTP_STORAGE_KEY, JSON.stringify(payload));
}

export function getPendingOtp() {
  try {
    const raw = sessionStorage.getItem(OTP_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearPendingOtp() {
  sessionStorage.removeItem(OTP_STORAGE_KEY);
}
