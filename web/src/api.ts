import type { Deal, Preferences, RefreshResult } from "./types";

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") || "";

export class HttpError extends Error {
  readonly status: number;

  constructor(status: number, statusText: string) {
    // Built from status only -- never from the response body, which may be an
    // arbitrary HTML document (nginx's 504 page, Azure's front-end error page)
    // and used to get rendered verbatim as the panel's status message.
    // statusText is empty over HTTP/2, so trim keeps the message readable.
    super(`HTTP ${status} ${statusText}`.trim());
    this.name = "HttpError";
    this.status = status;
  }
}

// Lives beside HttpError so every caller that catches one has a single way to
// render it, rather than re-deriving `err instanceof Error ? ...` per catch.
export const msgOf = (err: unknown, fallback = "Unknown error") =>
  err instanceof Error ? err.message : fallback;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    throw new HttpError(res.status, res.statusText);
  }
  return res.json() as Promise<T>;
}

export function fetchDeals(deviceId: string) {
  return request<Deal[]>(`/deals?device_id=${encodeURIComponent(deviceId)}&limit=40`);
}

export function refreshDeals(deviceId: string, force = false) {
  return request<RefreshResult>("/refresh", {
    method: "POST",
    body: JSON.stringify({ device_id: deviceId, force }),
  });
}

export function registerDevice(deviceId: string) {
  return request("/devices/register", {
    method: "POST",
    body: JSON.stringify({ device_id: deviceId, expo_push_token: null }),
  });
}

export function fetchPreferences(deviceId: string) {
  return request<Preferences>(`/preferences/${encodeURIComponent(deviceId)}`);
}

export function savePreferences(deviceId: string, prefs: Omit<Preferences, "device_id">) {
  return request<Preferences>(`/preferences/${encodeURIComponent(deviceId)}`, {
    method: "PUT",
    body: JSON.stringify(prefs),
  });
}

export function getApiBase() {
  return API_BASE || window.location.origin;
}
