import type { Deal, Preferences, RefreshResult } from "./types";

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") || "";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    throw new Error((await res.text()) || `HTTP ${res.status}`);
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
