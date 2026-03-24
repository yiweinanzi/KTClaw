import { invokeIpc } from '@/lib/api-client';
import { trackUiEvent } from './telemetry';
import { normalizeAppError } from './error-model';
import { isBrowserPreviewMode } from './browser-preview';

const HOST_API_PORT = 3210;
const HOST_API_BASE = `http://127.0.0.1:${HOST_API_PORT}`;

type HostApiProxyResponse = {
  ok?: boolean;
  data?: {
    status?: number;
    ok?: boolean;
    json?: unknown;
    text?: string;
  };
  error?: { message?: string } | string;
  // backward compatibility fields
  success: boolean;
  status?: number;
  json?: unknown;
  text?: string;
};

type HostApiProxyData = {
  status?: number;
  ok?: boolean;
  json?: unknown;
  text?: string;
};

function headersToRecord(headers?: HeadersInit): Record<string, string> {
  if (!headers) return {};
  if (headers instanceof Headers) return Object.fromEntries(headers.entries());
  if (Array.isArray(headers)) return Object.fromEntries(headers);
  return { ...headers };
}

function resolveProxyErrorMessage(error: HostApiProxyResponse['error']): string {
  return typeof error === 'string'
    ? error
    : (error?.message || 'Host API proxy request failed');
}

function parseUnifiedProxyResponse<T>(
  response: HostApiProxyResponse,
  path: string,
  method: string,
  startedAt: number,
): T {
  if (!response.ok) {
    throw new Error(resolveProxyErrorMessage(response.error));
  }

  const data: HostApiProxyData = response.data ?? {};
  trackUiEvent('hostapi.fetch', {
    path,
    method,
    source: 'ipc-proxy',
    durationMs: Date.now() - startedAt,
    status: data.status ?? 200,
  });

  if (data.status === 204) return undefined as T;
  if (data.json !== undefined) return data.json as T;
  return data.text as T;
}

function parseLegacyProxyResponse<T>(
  response: HostApiProxyResponse,
  path: string,
  method: string,
  startedAt: number,
): T {
  if (!response.success) {
    throw new Error(resolveProxyErrorMessage(response.error));
  }

  if (!response.ok) {
    const message = response.text
      || (typeof response.json === 'object' && response.json != null && 'error' in (response.json as Record<string, unknown>)
        ? String((response.json as Record<string, unknown>).error)
        : `HTTP ${response.status ?? 'unknown'}`);
    throw new Error(message);
  }

  trackUiEvent('hostapi.fetch', {
    path,
    method,
    source: 'ipc-proxy-legacy',
    durationMs: Date.now() - startedAt,
    status: response.status ?? 200,
  });

  if (response.status === 204) return undefined as T;
  if (response.json !== undefined) return response.json as T;
  return response.text as T;
}

async function parseBrowserPreviewResponse<T>(response: Response): Promise<T> {
  if (response.status === 204) return undefined as T;

  const contentType = response.headers?.get?.('content-type') ?? '';
  if (contentType.includes('application/json') && typeof response.json === 'function') {
    return await response.json() as T;
  }

  if (typeof response.json === 'function' && !contentType) {
    try {
      return await response.json() as T;
    } catch {
      // fall through to text parsing
    }
  }

  if (typeof response.text === 'function') {
    const text = await response.text();
    if (text) {
      try {
        return JSON.parse(text) as T;
      } catch {
        return text as T;
      }
    }
  }

  return undefined as T;
}

async function readBrowserPreviewError(response: Response): Promise<string> {
  const contentType = response.headers?.get?.('content-type') ?? '';
  if (contentType.includes('application/json') && typeof response.json === 'function') {
    try {
      const payload = await response.json() as Record<string, unknown> | null;
      if (payload && typeof payload === 'object') {
        if (typeof payload.error === 'string') return payload.error;
        if (typeof payload.message === 'string') return payload.message;
      }
    } catch {
      // ignore JSON parsing failures
    }
  }

  if (typeof response.text === 'function') {
    try {
      const text = await response.text();
      if (text) return text;
    } catch {
      // ignore text parsing failures
    }
  }

  return `HTTP ${response.status}`;
}

async function browserPreviewFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const startedAt = Date.now();
  const method = init?.method || 'GET';
  const headers = new Headers(init?.headers ?? undefined);
  const body = init?.body ?? null;

  if (body !== null && typeof body === 'string' && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }

  try {
    const response = await fetch(`${HOST_API_BASE}${path}`, {
      ...init,
      method,
      headers,
      body,
    });

    if (!response.ok) {
      throw new Error(await readBrowserPreviewError(response));
    }

    trackUiEvent('hostapi.fetch', {
      path,
      method,
      source: 'browser-preview',
      durationMs: Date.now() - startedAt,
      status: response.status,
    });

    return await parseBrowserPreviewResponse<T>(response);
  } catch (error) {
    const normalized = normalizeAppError(error, { source: 'browser-preview', path, method });
    trackUiEvent('hostapi.fetch_error', {
      path,
      method,
      source: 'browser-preview',
      durationMs: Date.now() - startedAt,
      message: normalized.message,
      code: normalized.code,
    });
    throw normalized;
  }
}

export async function hostApiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  if (isBrowserPreviewMode()) {
    return browserPreviewFetch<T>(path, init);
  }

  const startedAt = Date.now();
  const method = init?.method || 'GET';
  // In Electron renderer, always proxy through main process to avoid CORS.
  try {
    const response = await invokeIpc<HostApiProxyResponse>('hostapi:fetch', {
      path,
      method,
      headers: headersToRecord(init?.headers),
      body: init?.body ?? null,
    });

    if (typeof response?.ok === 'boolean' && 'data' in response) {
      return parseUnifiedProxyResponse<T>(response, path, method, startedAt);
    }

    return parseLegacyProxyResponse<T>(response, path, method, startedAt);
  } catch (error) {
    const normalized = normalizeAppError(error, { source: 'ipc-proxy', path, method });
    trackUiEvent('hostapi.fetch_error', {
      path,
      method,
      source: 'ipc-proxy',
      durationMs: Date.now() - startedAt,
      message: normalized.message,
      code: normalized.code,
    });
    throw normalized;
  }
}

export function createHostEventSource(path = '/api/events'): EventSource {
  return new EventSource(`${HOST_API_BASE}${path}`);
}

export function getHostApiBase(): string {
  return HOST_API_BASE;
}
