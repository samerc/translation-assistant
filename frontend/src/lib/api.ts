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

// On these a 401 means "wrong credentials / bad token", not "session expired" —
// never refresh or redirect, just surface the server's message.
const NO_REFRESH = [
  '/auth/login',
  '/auth/register',
  '/auth/refresh',
  '/auth/forgot-password',
  '/auth/verify-reset-token',
  '/auth/reset-password',
];

// Inject honeypot field into write request bodies.
function withHoneypot(method: string, body: unknown): unknown {
  if (method === 'GET' || method === 'HEAD' || !body || typeof body !== 'object' || Array.isArray(body)) {
    return body;
  }
  return { ...(body as Record<string, unknown>), _hp: '' };
}

// Endpoints that return nothing (e.g. most DELETEs) send an empty 200 body,
// which res.json() would reject — resolve those as undefined instead.
async function parseBody<T>(res: Response): Promise<T> {
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

// class-validator sends `message` as a string array.
async function toApiError(res: Response, fallback: string): Promise<ApiError> {
  const data = await res.json().catch(() => ({}));
  const raw = (data as { message?: unknown }).message;
  const message = Array.isArray(raw) ? raw.join('. ') : typeof raw === 'string' && raw ? raw : fallback;
  return new ApiError(res.status, message);
}

async function doRefresh(): Promise<boolean> {
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

// Refresh tokens are one-time use: two refreshes with the same cookie make the
// second fail and log the user out. So refresh at most once at a time — shared
// by concurrent requests in this tab, and serialized across tabs with a Web Lock.
// A caller whose token was already replaced (by another request or tab) just
// retries with the new one.
let refreshing: Promise<boolean> | null = null;

function refreshOnce(staleToken: string | null): Promise<boolean> {
  if (!refreshing) {
    const run = async () => {
      const current = localStorage.getItem('accessToken');
      if (current && current !== staleToken) return true;
      return doRefresh();
    };
    const locked = typeof navigator !== 'undefined' && navigator.locks
      ? navigator.locks.request('ta-auth-refresh', run)
      : run();
    refreshing = locked.finally(() => {
      refreshing = null;
    });
  }
  return refreshing;
}

// Every API call goes through here: auth header, 401 → refresh → retry once,
// and a redirect to /login when the session is really gone.
async function authedFetch(endpoint: string, init: RequestInit): Promise<Response> {
  const send = (token: string | null) =>
    fetch(`${API_URL}${endpoint}`, {
      ...init,
      credentials: 'include', // Send httpOnly cookies
      headers: { ...(init.headers as Record<string, string>), ...(token && { Authorization: `Bearer ${token}` }) },
    });

  const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
  const res = await send(token);
  if (res.status !== 401 || NO_REFRESH.some((p) => endpoint.startsWith(p))) return res;

  if (await refreshOnce(token)) {
    const retry = await send(localStorage.getItem('accessToken'));
    if (retry.status !== 401) return retry;
  }

  localStorage.removeItem('accessToken');
  window.location.href = '/login';
  throw new ApiError(401, 'Session expired');
}

async function request<T>(endpoint: string, options: ApiOptions = {}): Promise<T> {
  const method = options.method || 'GET';
  const finalBody = options.body ? withHoneypot(method, options.body) : undefined;
  const res = await authedFetch(endpoint, {
    method,
    headers: { 'Content-Type': 'application/json', ...options.headers },
    body: finalBody ? JSON.stringify(finalBody) : undefined,
  });
  if (!res.ok) throw await toApiError(res, 'Request failed');
  return parseBody<T>(res);
}

// Multipart upload. Lets the browser set the multipart Content-Type boundary.
async function upload<T>(endpoint: string, formData: FormData, method = 'PATCH'): Promise<T> {
  const res = await authedFetch(endpoint, { method, body: formData });
  if (!res.ok) throw await toApiError(res, 'Upload failed');
  return parseBody<T>(res);
}

// The UTF-8 `filename*` (keeps Arabic etc.) wins over the ASCII `filename` fallback.
function fileNameFrom(header: string | null): string | null {
  if (!header) return null;
  const encoded = header.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (encoded) {
    try {
      return decodeURIComponent(encoded);
    } catch {
      /* malformed — fall through to the plain name */
    }
  }
  return header.match(/filename="([^"]+)"/)?.[1] ?? null;
}

// Fetch a generated file (PDF/DOCX export) and hand it to the browser as a download.
async function download(endpoint: string, fallbackName: string, method = 'POST'): Promise<void> {
  const res = await authedFetch(endpoint, { method });
  if (!res.ok) throw await toApiError(res, 'Download failed');
  const blob = await res.blob();
  const fileName = fileNameFrom(res.headers.get('Content-Disposition')) || fallbackName;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export const api = {
  get: <T>(endpoint: string) => request<T>(endpoint),
  post: <T>(endpoint: string, body?: unknown) =>
    request<T>(endpoint, { method: 'POST', body }),
  patch: <T>(endpoint: string, body?: unknown) =>
    request<T>(endpoint, { method: 'PATCH', body }),
  delete: <T>(endpoint: string) => request<T>(endpoint, { method: 'DELETE' }),
  upload,
  download,
};

export { ApiError };
