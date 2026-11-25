const API_BASE = '/api';
const TOKEN_KEY = 'advanced-dropbox-token';

export function getStoredToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function saveToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  constructor(message, status, data = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

export async function apiRequest(path, options = {}) {
  const {
    auth = true,
    headers: customHeaders,
    ...fetchOptions
  } = options;

  const headers = new Headers(customHeaders || {});

  if (auth) {
    const token = getStoredToken();

    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
  }

  const isFormData =
    typeof FormData !== 'undefined' &&
    fetchOptions.body instanceof FormData;

  if (
    fetchOptions.body &&
    !isFormData &&
    !headers.has('Content-Type')
  ) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...fetchOptions,
    cache: 'no-store',
    headers,
  });

  const rawBody = await response.text();

  let data = null;

  if (rawBody) {
    try {
      data = JSON.parse(rawBody);
    } catch {
      data = { error: rawBody };
    }
  }

  if (!response.ok) {
    const message =
      data?.error ||
      data?.message ||
      `Request failed with status ${response.status}`;

    if (response.status === 401 && auth) {
      window.dispatchEvent(new Event('auth:unauthorized'));
    }

    throw new ApiError(message, response.status, data);
  }

  return data;
}