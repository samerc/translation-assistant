import { logger } from './logger';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3005/api';

interface ApiOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
}

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// Inject honeypot field into write request bodies.
function withHoneypot(method: string, body: unknown): unknown {
  if (method === 'GET' || method === 'HEAD' || !body || typeof body !== 'object' || Array.isArray(body)) {
    return body;
  }
  return { ...(body as Record<string, unknown>), _hp: '' };
}

async function request<T>(endpoint: string, options: ApiOptions = {}): Promise<T> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
  const method = options.method || 'GET';

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const finalBody = options.body ? withHoneypot(method, options.body) : undefined;

  const res = await fetch(`${API_URL}${endpoint}`, {
    method,
    headers,
    credentials: 'include', // Send httpOnly cookies
    body: finalBody ? JSON.stringify(finalBody) : undefined,
  });

  if (res.status === 401) {
    // Try refresh — cookie is sent automatically
    const refreshed = await tryRefresh();
    if (refreshed) {
      headers['Authorization'] = `Bearer ${localStorage.getItem('accessToken')}`;
      const retryRes = await fetch(`${API_URL}${endpoint}`, {
        method,
        headers,
        credentials: 'include',
        body: finalBody ? JSON.stringify(finalBody) : undefined,
      });

      if (!retryRes.ok) {
        const error = await retryRes.json().catch(() => ({ message: 'Request failed' }));
        throw new ApiError(retryRes.status, error.message);
      }

      return retryRes.json();
    }

    // Refresh failed
    localStorage.removeItem('accessToken');
    window.location.href = '/login';
    throw new ApiError(401, 'Session expired');
  }

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: 'Request failed' }));
    throw new ApiError(res.status, error.message);
  }

  return res.json();
}

async function tryRefresh(): Promise<boolean> {
  try {
    // Refresh token is in httpOnly cookie — sent automatically with credentials: 'include'
    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    });

    if (!res.ok) return false;

    const data = await res.json();
    localStorage.setItem('accessToken', data.accessToken);
    // refreshToken is set as httpOnly cookie by the server — not in response body
    return true;
  } catch (err) {
    logger.error('Token refresh failed', err, 'api');
    return false;
  }
}

export const api = {
  get: <T>(endpoint: string) => request<T>(endpoint),
  post: <T>(endpoint: string, body?: unknown) =>
    request<T>(endpoint, { method: 'POST', body }),
  patch: <T>(endpoint: string, body?: unknown) =>
    request<T>(endpoint, { method: 'PATCH', body }),
  delete: <T>(endpoint: string) => request<T>(endpoint, { method: 'DELETE' }),
};

export { ApiError };
