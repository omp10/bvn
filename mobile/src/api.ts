import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import * as SecureStore from "expo-secure-store";
// The legacy entry point is where uploadAsync lives in SDK 54+.
import * as FileSystem from "expo-file-system/legacy";
import { API_URL } from "./theme";

const ACCESS = "bv_access";
const REFRESH = "bv_refresh";

/**
 * Tokens live in the device keystore, not AsyncStorage: on a rooted or shared
 * phone AsyncStorage is a plain file, and a refresh token is a 30-day session.
 *
 * A memory copy sits in front of it so render paths and the socket can read the
 * token without awaiting — SecureStore is async, and a component cannot be.
 */
let cache: { access: string | null; refresh: string | null } = { access: null, refresh: null };

export const tokens = {
  access: () => cache.access,
  refresh: () => cache.refresh,

  /** Called once at boot, before anything decides whether we are signed in. */
  async load() {
    const [access, refresh] = await Promise.all([
      SecureStore.getItemAsync(ACCESS).catch(() => null),
      SecureStore.getItemAsync(REFRESH).catch(() => null),
    ]);
    cache = { access, refresh };
    return cache;
  },

  async save(access: string, refresh: string) {
    cache = { access, refresh };
    await Promise.all([
      SecureStore.setItemAsync(ACCESS, access),
      SecureStore.setItemAsync(REFRESH, refresh),
    ]);
  },

  async clear() {
    cache = { access: null, refresh: null };
    await Promise.all([
      SecureStore.deleteItemAsync(ACCESS).catch(() => {}),
      SecureStore.deleteItemAsync(REFRESH).catch(() => {}),
    ]);
  },
};

export class ApiError extends Error {
  constructor(readonly status: number, message: string, readonly details?: unknown) {
    super(message);
  }
}

/* ── Reachability ──────────────────────────────────────────────────────
 *
 * "Can we reach our API" rather than "is there a network", which is the
 * question every screen actually asks. A phone on a bus holds a full signal
 * bar while behind a captive portal, and NetInfo would happily call that
 * online — so this is derived from real request outcomes instead. It also
 * costs no native module, which the parent app would otherwise carry for one
 * banner.
 */
let online = true;
const onlineWatchers = new Set<(value: boolean) => void>();

function setOnline(value: boolean) {
  if (online === value) return;
  online = value;
  onlineWatchers.forEach((fn) => fn(value));
}

/** Subscribe to reachability. Returns the current value and an unsubscribe. */
export function watchOnline(fn: (value: boolean) => void) {
  onlineWatchers.add(fn);
  return () => {
    onlineWatchers.delete(fn);
  };
}

export const isOnline = () => online;

export function useOnline() {
  const [value, setValue] = useState(online);
  useEffect(() => watchOnline(setValue), []);
  return value;
}

/** The server names the offending field in `details`; "validation failed" does not. */
function messageFor(data: { error?: string; details?: unknown }, status: number): string {
  const first = Array.isArray(data?.details) ? (data.details[0] as { message?: string }) : null;
  if (first?.message) return first.message;
  if (data?.error) return data.error;
  return status === 0 ? "Cannot reach the server. Check your connection." : `Something went wrong (${status})`;
}

/**
 * What happens when the session is gone for good. The auth provider registers
 * the real handler; until then a 401 simply throws.
 */
let onSessionLost: () => void = () => {};
export const setSessionLostHandler = (fn: () => void) => (onSessionLost = fn);

/** One refresh at a time — ten parallel 401s must not rotate the token ten times. */
let refreshing: Promise<boolean> | null = null;

async function refreshSession(): Promise<boolean> {
  const token = tokens.refresh();
  if (!token) return false;

  refreshing ??= (async () => {
    try {
      const res = await fetch(`${API_URL}/api/auth/refresh`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ refreshToken: token }),
      });
      if (!res.ok) return false;
      const data = await res.json();
      await tokens.save(data.accessToken, data.refreshToken);
      return true;
    } catch {
      return false;
    } finally {
      setTimeout(() => (refreshing = null), 0);
    }
  })();

  return refreshing;
}

type Options = Omit<RequestInit, "body"> & { body?: unknown };

export async function api<T = any>(path: string, options: Options = {}): Promise<T> {
  const send = async () =>
    fetch(API_URL + "/api" + path, {
      ...options,
      method: options.method ?? (options.body !== undefined ? "POST" : "GET"),
      headers: {
        "content-type": "application/json",
        ...(tokens.access() ? { Authorization: `Bearer ${tokens.access()}` } : {}),
        ...options.headers,
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });

  let res: Response;
  try {
    res = await send();
    setOnline(true);
  } catch {
    // A phone on a bus loses signal constantly. Say that, rather than "Network
    // request failed", which reads like the app is broken.
    setOnline(false);
    throw new ApiError(0, "Cannot reach the server. Check your connection.");
  }

  if (res.status === 401 && (await refreshSession())) res = await send();

  if (res.status === 401) {
    await tokens.clear();
    onSessionLost();
    throw new ApiError(401, "Your session has expired. Please sign in again.");
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, messageFor(data, res.status), (data as any).details);
  return data as T;
}

/**
 * Uploads a photo.
 *
 * Uses expo-file-system rather than fetch + FormData. React Native's FormData
 * rejects the `{ uri, name, type }` file part on the New Architecture with
 * "Unsupported FormData part", so the driver's check-in selfie never uploaded.
 * uploadAsync builds the multipart body natively and never touches the JS
 * FormData shim, which is the whole reason the bug goes away.
 */
export async function uploadPhoto(uri: string, path = "/api/uploads/photos"): Promise<{ url: string }> {
  const send = () =>
    FileSystem.uploadAsync(API_URL + path, uri, {
      httpMethod: "POST",
      uploadType: FileSystem.FileSystemUploadType.MULTIPART,
      // The server names this exact field, and says so in its own error.
      fieldName: "file",
      mimeType: "image/jpeg",
      headers: tokens.access() ? { Authorization: `Bearer ${tokens.access()}` } : {},
    });

  let res = await send();
  if (res.status === 401 && (await refreshSession())) res = await send();

  let data: any = {};
  try {
    data = JSON.parse(res.body);
  } catch {
    // A proxy error page rather than the API — say something useful.
    if (res.status >= 400) throw new ApiError(res.status, `Upload failed (${res.status})`);
  }

  if (res.status >= 400) throw new ApiError(res.status, data.error ?? "Upload failed");
  return data as { url: string };
}

/** Absolute URL for a server-relative upload path, for <Image source>. */
export const assetUrl = (path?: string | null) =>
  !path ? null : path.startsWith("http") ? path : API_URL + path;

export type Query<T> = {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
  setData: (value: T) => void;
};

/**
 * ponytail: ~30 lines instead of TanStack Query, mirroring the web app so the
 * two stay readable side by side. Swap it in when cache sharing across screens
 * starts to hurt.
 */
export function useQuery<T>(path: string | null, deps: unknown[] = []): Query<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(path));
  const latest = useRef(0);

  const reload = useCallback(() => {
    if (!path) {
      setData(null);
      setLoading(false);
      return;
    }
    const ticket = ++latest.current;
    setLoading(true);
    api<T>(path)
      .then((result) => {
        if (ticket !== latest.current) return;
        setData(result);
        setError(null);
      })
      .catch((err) => ticket === latest.current && setError(err.message))
      .finally(() => ticket === latest.current && setLoading(false));
  }, [path]);

  useEffect(reload, [reload, ...deps]);
  return { data, error, loading, reload, setData };
}

/**
 * Live screens poll as a safety net behind the socket. Pauses while the app is
 * backgrounded — polling a hidden app is pure battery.
 */
export function usePolling<T>(path: string | null, everyMs = 30_000): Query<T> {
  const query = useQuery<T>(path);
  const reload = query.reload;

  useEffect(() => {
    if (!path) return;
    const tick = () => AppState.currentState === "active" && reload();
    const id = setInterval(tick, everyMs);
    const sub = AppState.addEventListener("change", (state) => state === "active" && reload());
    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, [path, everyMs, reload]);

  return query;
}

/** Pending and error state around one mutating call, for a form or a button. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async (fn: () => Promise<unknown>, onDone?: () => void) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onDone?.();
      return true;
    } catch (err) {
      setError((err as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  return { busy, error, setError, run };
}
