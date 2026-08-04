import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";

export type Fix = {
  lat: number;
  lng: number;
  at: string;
  speedKmph?: number;
  heading?: number;
  accuracy?: number;
};

export type TrackerStatus = {
  tracking: boolean;
  lastFix: Fix | null;
  buffered: number;
  sent: number;
  error: string | null;
  /** True while the screen is being held awake. */
  screenAwake: boolean;
};

const BUFFER_KEY = "bv_gps_buffer";
/** ~5.5 hours at one fix every 10s. Oldest points drop first. */
const MAX_BUFFERED = 2000;
const FLUSH_EVERY_MS = 10_000;
/** Discard wildly imprecise fixes — a 2 km "position" is worse than none. */
const MAX_ACCURACY_M = 500;

const readBuffer = (): Fix[] => {
  try {
    const raw = JSON.parse(localStorage.getItem(BUFFER_KEY) ?? "[]");
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
};

const writeBuffer = (points: Fix[]) => {
  try {
    localStorage.setItem(BUFFER_KEY, JSON.stringify(points.slice(-MAX_BUFFERED)));
  } catch {
    // Storage full or blocked — tracking still works, history just won't survive a reload.
  }
};

export const clearBuffer = () => localStorage.removeItem(BUFFER_KEY);

/**
 * Streams the bus position while a trip is running.
 *
 * Buffers to localStorage and flushes in batches, so a tunnel, a dead zone or a
 * reloaded tab does not lose the trail — the server dedupes replayed points and
 * accepts them out of order.
 *
 * ponytail: this is a foreground tracker. A browser (and a WebView) throttles or
 * suspends timers once the tab is hidden or the screen locks, so the driver must
 * keep the app open. The wake lock below buys most of that; true background
 * tracking needs a native foreground service, which is the phase-2 APK.
 */
export function useTripTracker(tripId: string | null | undefined): TrackerStatus {
  const [status, setStatus] = useState<TrackerStatus>({
    tracking: false,
    lastFix: null,
    buffered: readBuffer().length,
    sent: 0,
    error: null,
    screenAwake: false,
  });

  const buffer = useRef<Fix[]>(readBuffer());
  const flushing = useRef(false);
  const sentCount = useRef(0);

  const flush = useCallback(async () => {
    if (!tripId || flushing.current || buffer.current.length === 0) return;
    flushing.current = true;

    // Take a snapshot; anything captured mid-flight stays queued for next time.
    const batch = buffer.current.slice(0, 200);
    try {
      await api(`/driver/trips/${tripId}/positions`, { body: { points: batch } });
      buffer.current = buffer.current.slice(batch.length);
      writeBuffer(buffer.current);
      sentCount.current += batch.length;
      setStatus((s) => ({ ...s, buffered: buffer.current.length, sent: sentCount.current, error: null }));
    } catch (err) {
      // Keep the batch — the whole point of the buffer is surviving this.
      setStatus((s) => ({ ...s, error: (err as Error).message, buffered: buffer.current.length }));
    } finally {
      flushing.current = false;
    }
  }, [tripId]);

  useEffect(() => {
    if (!tripId) {
      setStatus((s) => ({ ...s, tracking: false }));
      return;
    }

    if (!("geolocation" in navigator)) {
      setStatus((s) => ({ ...s, error: "This device cannot share location." }));
      return;
    }

    setStatus((s) => ({ ...s, tracking: true, error: null }));

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude, speed, heading, accuracy } = position.coords;
        if (accuracy && accuracy > MAX_ACCURACY_M) return;

        const fix: Fix = {
          lat: latitude,
          lng: longitude,
          at: new Date(position.timestamp).toISOString(),
          // The API reports m/s; the rest of the system speaks km/h.
          speedKmph: speed != null && speed >= 0 ? Math.round(speed * 3.6) : undefined,
          heading: heading != null && !Number.isNaN(heading) ? Math.round(heading) : undefined,
          accuracy: accuracy ? Math.round(accuracy) : undefined,
        };

        buffer.current = [...buffer.current, fix].slice(-MAX_BUFFERED);
        writeBuffer(buffer.current);
        setStatus((s) => ({ ...s, lastFix: fix, buffered: buffer.current.length }));
      },
      (err) => {
        const message =
          err.code === err.PERMISSION_DENIED
            ? "Location permission is blocked. Allow it to share the bus position."
            : err.code === err.POSITION_UNAVAILABLE
              ? "No GPS signal right now."
              : "Location is taking longer than usual.";
        setStatus((s) => ({ ...s, error: message }));
      },
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 20_000 }
    );

    const timer = setInterval(flush, FLUSH_EVERY_MS);

    // Keep the screen on while driving so the browser does not suspend us.
    let lock: WakeLockSentinel | null = null;
    const acquireLock = async () => {
      try {
        lock = await navigator.wakeLock?.request("screen");
        setStatus((s) => ({ ...s, screenAwake: Boolean(lock) }));
      } catch {
        setStatus((s) => ({ ...s, screenAwake: false }));
      }
    };
    void acquireLock();

    // A wake lock is released whenever the tab is hidden; take it back.
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void acquireLock();
        void flush();
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      navigator.geolocation.clearWatch(watchId);
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release().catch(() => {});
      setStatus((s) => ({ ...s, tracking: false, screenAwake: false }));
      // One last attempt so the final leg is not stranded in the buffer.
      void flush();
    };
  }, [tripId, flush]);

  return status;
}
