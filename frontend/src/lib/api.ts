import { useCallback, useEffect, useRef, useState } from "react";

const ACCESS = "bv_access";
const REFRESH = "bv_refresh";

export const tokens = {
  access: () => localStorage.getItem(ACCESS),
  refresh: () => localStorage.getItem(REFRESH),
  save(access: string, refresh: string) {
    localStorage.setItem(ACCESS, access);
    localStorage.setItem(REFRESH, refresh);
  },
  clear() {
    localStorage.removeItem(ACCESS);
    localStorage.removeItem(REFRESH);
  },
};

export class ApiError extends Error {
  constructor(readonly status: number, message: string, readonly details?: unknown) {
    super(message);
  }
}

/**
 * "validation failed" tells a user nothing. The server already sends which
 * field and why in `details` — surface that, or the person staring at the form
 * has no idea which box is wrong.
 */
function messageFor(data: { error?: string; details?: unknown }, status: number): string {
  const first = Array.isArray(data?.details) ? (data.details[0] as { message?: string }) : null;
  if (first?.message) return first.message;
  return data?.error ?? `Something went wrong (${status})`;
}

/**
 * Access tokens last 15 minutes, so a refresh mid-session is normal rather than
 * exceptional. One refresh runs at a time and every waiting request joins it —
 * otherwise ten parallel calls would each rotate the token and nine would lose.
 */
let refreshing: Promise<boolean> | null = null;

async function refreshSession(): Promise<boolean> {
  const token = tokens.refresh();
  if (!token) return false;

  refreshing ??= (async () => {
    try {
      const res = await fetch("/api/auth/refresh", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ refreshToken: token }),
      });
      if (!res.ok) return false;
      const data = await res.json();
      tokens.save(data.accessToken, data.refreshToken);
      return true;
    } catch {
      return false;
    } finally {
      // Cleared on the next tick so joiners see the settled promise first.
      setTimeout(() => (refreshing = null), 0);
    }
  })();

  return refreshing;
}

type Options = Omit<RequestInit, "body"> & { body?: unknown; raw?: boolean };

export async function api<T = any>(path: string, options: Options = {}): Promise<T> {
  const send = async () =>
    fetch("/api" + path, {
      ...options,
      method: options.method ?? (options.body ? "POST" : "GET"),
      headers: {
        "content-type": "application/json",
        ...(tokens.access() ? { Authorization: `Bearer ${tokens.access()}` } : {}),
        ...options.headers,
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });

  let res = await send();

  if (res.status === 401 && (await refreshSession())) res = await send();

  if (res.status === 401) {
    tokens.clear();
    if (!location.pathname.endsWith("/login")) location.href = "/login";
    throw new ApiError(401, "Your session has expired. Please sign in again.");
  }

  if (options.raw) {
    if (!res.ok) throw new ApiError(res.status, "Download failed");
    return (await res.blob()) as T;
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, messageFor(data, res.status), data.details);
  return data as T;
}

/** Triggers a file download from an authenticated endpoint. */
export async function download(path: string, filename: string) {
  const blob = await api<Blob>(path, { raw: true });
  const url = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement("a"), { href: url, download: filename });
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Uploads a file. Deliberately not using api(): a multipart body must NOT get a
 * JSON content-type header — the browser sets its own boundary.
 */
export async function uploadFile<T = any>(path: string, file: File, field = "file"): Promise<T> {
  const form = new FormData();
  form.append(field, file);

  const send = () =>
    fetch("/api" + path, {
      method: "POST",
      headers: tokens.access() ? { Authorization: `Bearer ${tokens.access()}` } : undefined,
      body: form,
    });

  let res = await send();
  if (res.status === 401 && (await refreshSession())) res = await send();

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? "Upload failed");
  return data as T;
}

/** Fetches an authenticated image and returns an object URL for <img src>. */
export async function fetchImageUrl(path: string): Promise<string> {
  const blob = await api<Blob>(path, { raw: true });
  return URL.createObjectURL(blob);
}

export type Query<T> = {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
  setData: (value: T) => void;
};

/**
 * ponytail: ~30 lines instead of TanStack Query. Screens here load once and
 * show. Swap it in when shared cache invalidation across screens starts to
 * hurt — the call sites barely change.
 */
export function useQuery<T>(path: string | null, deps: unknown[] = []): Query<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(path));
  // Guards against a slow response for an old path overwriting a newer one.
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

/** Live screens poll until Socket.IO is wired up. Pauses on a hidden tab. */
export function usePolling<T>(path: string | null, everyMs = 10_000): Query<T> {
  const query = useQuery<T>(path);
  const reload = query.reload;

  useEffect(() => {
    if (!path) return;
    const tick = () => document.visibilityState === "visible" && reload();
    const id = setInterval(tick, everyMs);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [path, everyMs, reload]);

  return query;
}

/** Wraps a mutating call with pending and error state for a form or button. */
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
