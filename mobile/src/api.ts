import Constants from "expo-constants";
import { Platform } from "react-native";

import type { Deal, Preferences, RefreshResult } from "./types";

function packagerHost(): string | null {
  const hostUri =
    Constants.expoConfig?.hostUri ||
    Constants.manifest2?.extra?.expoClient?.hostUri ||
    (Constants.manifest as { debuggerHost?: string } | null)?.debuggerHost ||
    null;
  if (!hostUri) return null;
  const host = String(hostUri).split(":")[0]?.trim();
  if (!host || host === "localhost" || host === "127.0.0.1") return null;
  // Docker Metro sometimes advertises host.docker.internal — phones can't resolve that
  if (host === "host.docker.internal") return null;
  return host;
}

function defaultHost(): string {
  if (process.env.EXPO_PUBLIC_API_URL) {
    const configured = process.env.EXPO_PUBLIC_API_URL.replace(/\/$/, "");
    // Prefer LAN packager host when env still points at docker-only hostname
    if (!configured.includes("host.docker.internal")) {
      return configured;
    }
  }
  const lan = packagerHost();
  if (lan) {
    return `http://${lan}:8000`;
  }
  // Android emulator reaches host machine via 10.0.2.2
  if (Platform.OS === "android") {
    return "http://10.0.2.2:8000";
  }
  return "http://127.0.0.1:8000";
}

const API_BASE = defaultHost();

const REQUEST_TIMEOUT_MS = 12_000;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  // Bounded network timeout — without this, an unreachable API_BASE leaves
  // the fetch Promise pending indefinitely (bounded only by the OS TCP
  // stack), which is what left the Watchlist spinner spinning forever.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers || {}),
      },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || `HTTP ${res.status}`);
    }
    return res.json() as Promise<T>;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("Request timed out — check your connection");
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

export function getApiBase() {
  return API_BASE;
}

export function fetchDeals(deviceId: string) {
  return request<Deal[]>(`/deals?device_id=${encodeURIComponent(deviceId)}`);
}

export function fetchDeal(id: number, deviceId: string) {
  return request<Deal>(`/deals/${id}?device_id=${encodeURIComponent(deviceId)}`);
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

export function registerDevice(deviceId: string, expoPushToken?: string | null) {
  return request(`/devices/register`, {
    method: "POST",
    body: JSON.stringify({
      device_id: deviceId,
      expo_push_token: expoPushToken ?? null,
    }),
  });
}

export function refreshDeals(deviceId: string, force = false) {
  return request<RefreshResult>(`/refresh`, {
    method: "POST",
    body: JSON.stringify({ device_id: deviceId, force }),
  });
}
