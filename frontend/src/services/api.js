const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

function withAuthHeaders(headers = {}) {
  try {
    const auth = JSON.parse(localStorage.getItem('ssdnUserAuth') || '{}');
    if (auth?.token) {
      return { ...headers, Authorization: `Bearer ${auth.token}` };
    }
  } catch {
    // Ignore local auth parsing issues and continue without auth headers.
  }

  return headers;
}

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: withAuthHeaders(options.headers)
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.message || 'Request failed. Please try again.');
  }

  return payload;
}

export function getMyFormSubmission() {
  return request('/form/me');
}

export function submitUserForm(formData) {
  return request('/form', {
    method: 'POST',
    body: formData
  });
}

export function requestEmailOtp(payload) {
  return request('/auth/request-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

export function verifyEmailOtp(payload) {
  return request('/auth/verify-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

export function loginWithPassword(payload) {
  return request('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

export function resetPasswordWithOtp(payload) {
  return request('/auth/reset-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

export function getCurrentUser() {
  return request('/auth/me');
}

export function adminLogin({ email, password }) {
  return request('/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
}

export function getSubmissions(token, status) {
  const query = status && status !== 'all' ? `?status=${status}` : '';
  return request(`/admin/submissions${query}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
}

export function verifySubmission(token, id) {
  return request(`/admin/verify/${id}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}` }
  });
}
