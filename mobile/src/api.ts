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

// A forced refresh does live OpenWebNinja work across retailers sequentially,
// so it is the one call that legitimately runs long. 200s matches the bound the
// web kiosk's nginx enforces, and stays under Azure App Service's
// non-configurable ~240s (Linux) front-end idle timeout -- which mobile hits
// directly, since it does not go through our nginx.
const REFRESH_TIMEOUT_MS = 200_000;

export class HttpError extends Error {
  readonly status: number;

  constructor(status: number, statusText: string) {
    // Built from status only -- never from the response body. Mobile talks to
    // Azure App Service directly, which serves HTML error pages, and those used
    // to land verbatim in the Watchlist's status line.
    // statusText is empty over HTTP/2, so trim keeps the message readable.
    super(`HTTP ${status} ${statusText}`.trim());
    this.name = "HttpError";
    this.status = status;
  }
}

export class RequestTimeoutError extends Error {
  readonly timeoutMs: number;

  constructor(timeoutMs: number) {
    super(`Request timed out after ${Math.round(timeoutMs / 1000)}s`);
    this.name = "RequestTimeoutError";
    this.timeoutMs = timeoutMs;
  }
}

export const msgOf = (err: unknown, fallback = "Unknown error") =>
  err instanceof Error ? err.message : fallback;

async function request<T>(
  path: string,
  init?: RequestInit,
  timeoutMs: number = REQUEST_TIMEOUT_MS,
): Promise<T> {
  // Without this, an unreachable API_BASE leaves the fetch Promise pending
  // indefinitely (bounded only by the OS TCP stack), which is what left the
  // Watchlist spinner spinning forever.
  //
  // AbortSignal.timeout() would express this without a timer, but React Native
  // 0.81 polyfills AbortSignal from `abort-controller`
  // (Libraries/Core/setUpXHR.js), which does not implement .timeout().
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs); // golden-rule-ignore: request deadline that aborts a hung fetch, not a delay
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
      throw new HttpError(res.status, res.statusText);
    }
    return res.json() as Promise<T>;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      // Report the fact (timed out, after how long); let each caller say what
      // it means. "Check your connection" is the wrong diagnosis for a forced
      // refresh, where the connection is fine and the work is still running.
      throw new RequestTimeoutError(timeoutMs);
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
  return request<RefreshResult>(
    `/refresh`,
    {
      method: "POST",
      body: JSON.stringify({ device_id: deviceId, force }),
    },
    REFRESH_TIMEOUT_MS,
  );
}
