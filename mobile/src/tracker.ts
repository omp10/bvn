import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { api, tokens } from "./api";
import { colors } from "./theme";

export type Fix = {
  lat: number;
  lng: number;
  at: string;
  speedKmph?: number;
  heading?: number;
  accuracy?: number;
};

const TASK = "balvahini-location";
const TRIP_KEY = "bv_trip_id";
const BUFFER_KEY = "bv_gps_buffer";
const STATS_KEY = "bv_gps_stats";

/** ~5.5 hours at one fix every 10s. Oldest points drop first. */
const MAX_BUFFERED = 2000;
/** A 2 km "position" is worse than no position. */
const MAX_ACCURACY_M = 500;
/** The server caps a batch at 500; stay well under so a retry is never rejected. */
const BATCH = 200;

type Stats = { lastFix: Fix | null; sent: number; error: string | null };

const readJson = async <T,>(key: string, fallback: T): Promise<T> => {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};

const writeJson = (key: string, value: unknown) =>
  AsyncStorage.setItem(key, JSON.stringify(value)).catch(() => {});

const readBuffer = () => readJson<Fix[]>(BUFFER_KEY, []);
const readStats = () => readJson<Stats>(STATS_KEY, { lastFix: null, sent: 0, error: null });

export const clearBuffer = () =>
  Promise.all([AsyncStorage.removeItem(BUFFER_KEY), AsyncStorage.removeItem(STATS_KEY)]);

/**
 * ponytail: one flush at a time, guarded by a module flag. That holds while the
 * app is alive — the OS runs the background task in this same JS context. It
 * does not hold across a process restart mid-flush, which is why the server
 * dedupes replayed points instead of trusting the client not to send them.
 */
let flushing = false;

/**
 * Drains the buffer to the server.
 *
 * Called from the location task, so it must assume nothing is loaded: after the
 * OS restarts a killed app to deliver a location, module state is empty and the
 * tokens have to come back off the keystore first.
 */
export async function flushPositions(): Promise<void> {
  if (flushing) return;
  flushing = true;
  try {
    const tripId = await AsyncStorage.getItem(TRIP_KEY);
    if (!tripId) return;

    const buffer = await readBuffer();
    if (!buffer.length) return;

    if (!tokens.access()) await tokens.load();
    if (!tokens.access()) return; // Signed out — keep the points, they are not ours to drop.

    const batch = buffer.slice(0, BATCH);
    const stats = await readStats();
    try {
      await api(`/driver/trips/${tripId}/positions`, { body: { points: batch } });
      // Re-read: the task may have appended while the request was in flight.
      const current = await readBuffer();
      await writeJson(BUFFER_KEY, current.slice(batch.length));
      await writeJson(STATS_KEY, { ...stats, sent: stats.sent + batch.length, error: null });
    } catch (err) {
      // Keep the batch. Surviving a dead zone is the entire point of the buffer.
      await writeJson(STATS_KEY, { ...stats, error: (err as Error).message });
    }
  } finally {
    flushing = false;
  }
}

/**
 * The background location task.
 *
 * Defined at module scope on purpose: the OS may launch the app straight into
 * this task with no UI at all, and a task defined inside a component would not
 * exist yet when that happens.
 */
TaskManager.defineTask(TASK, async ({ data, error }: any) => {
  if (error || !data?.locations?.length) return;

  const fixes: Fix[] = data.locations
    .filter((l: any) => !(l.coords.accuracy && l.coords.accuracy > MAX_ACCURACY_M))
    .map((l: any) => ({
      lat: l.coords.latitude,
      lng: l.coords.longitude,
      at: new Date(l.timestamp).toISOString(),
      // The OS reports m/s; the rest of the system speaks km/h.
      speedKmph:
        l.coords.speed != null && l.coords.speed >= 0 ? Math.round(l.coords.speed * 3.6) : undefined,
      heading:
        l.coords.heading != null && l.coords.heading >= 0 ? Math.round(l.coords.heading) : undefined,
      accuracy: l.coords.accuracy ? Math.round(l.coords.accuracy) : undefined,
    }));
  if (!fixes.length) return;

  const buffer = await readBuffer();
  await writeJson(BUFFER_KEY, [...buffer, ...fixes].slice(-MAX_BUFFERED));

  const stats = await readStats();
  await writeJson(STATS_KEY, { ...stats, lastFix: fixes[fixes.length - 1] });

  await flushPositions();
});

export type TrackerStatus = {
  tracking: boolean;
  lastFix: Fix | null;
  buffered: number;
  sent: number;
  error: string | null;
  /** Set when the driver declined a permission — the only error they can fix. */
  needsPermission: boolean;
};

async function startTracking(): Promise<string | null> {
  const foreground = await Location.requestForegroundPermissionsAsync();
  if (!foreground.granted) return "Location permission is blocked. Allow it to share the bus position.";

  /* Background permission is what keeps the bus on the map when the phone goes
     in a pocket. Without it tracking still works while the screen is on, so a
     refusal is a warning rather than a failure. */
  const background = await Location.requestBackgroundPermissionsAsync();

  if (await Location.hasStartedLocationUpdatesAsync(TASK)) return null;

  await Location.startLocationUpdatesAsync(TASK, {
    accuracy: Location.Accuracy.High,
    timeInterval: 10_000,
    distanceInterval: 20,
    // A parked bus at a stop must keep reporting, or the school sees it vanish.
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: "Trip running",
      notificationBody: "BalVahini is sharing the bus position with your school.",
      notificationColor: colors.brand600,
    },
  });

  return background.granted
    ? null
    : "Allow location 'all the time' so the bus keeps reporting when the screen is off.";
}

export async function stopTracking() {
  if (await Location.hasStartedLocationUpdatesAsync(TASK).catch(() => false)) {
    await Location.stopLocationUpdatesAsync(TASK).catch(() => {});
  }
  await AsyncStorage.removeItem(TRIP_KEY).catch(() => {});
}

const EMPTY: TrackerStatus = {
  tracking: false,
  lastFix: null,
  buffered: 0,
  sent: 0,
  error: null,
  needsPermission: false,
};

/**
 * Reads what the background task wrote. Purely an observer — the task runs
 * outside React and cannot call setState, so a poll of its scratch storage is
 * how any screen learns where the bus got to.
 *
 * Any number of screens may use this. Only one may use `useTripTracker`.
 */
export function useTrackerStatus(): TrackerStatus {
  const [status, setStatus] = useState<TrackerStatus>(EMPTY);

  useEffect(() => {
    let alive = true;

    const refresh = async () => {
      const [buffer, stats, running] = await Promise.all([
        readBuffer(),
        readStats(),
        Location.hasStartedLocationUpdatesAsync(TASK).catch(() => false),
      ]);
      if (!alive) return;
      setStatus({
        tracking: running,
        buffered: buffer.length,
        sent: stats.sent,
        lastFix: stats.lastFix,
        error: stats.error,
        needsPermission: false,
      });
    };

    void refresh();
    const timer = setInterval(refresh, 5_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  return status;
}

/**
 * Starts and stops the position stream, and reports on it.
 *
 * Unlike the web version this survives a locked screen and a backgrounded app —
 * that foreground service is the whole reason the driver needs an APK rather
 * than a browser tab.
 *
 * Exactly one mounted screen may own this. A second copy would fight the first
 * over whether tracking should be running, and the loser is whichever one last
 * saw a stale trip id — which is how a bus keeps reporting after its trip ended.
 */
export function useTripTracker(tripId: string | null | undefined): TrackerStatus {
  const observed = useTrackerStatus();
  const [control, setControl] = useState<{ error: string | null; needsPermission: boolean }>({
    error: null,
    needsPermission: false,
  });

  useEffect(() => {
    let cancelled = false;

    if (!tripId) {
      void stopTracking();
      return;
    }

    (async () => {
      await AsyncStorage.setItem(TRIP_KEY, tripId);
      const problem = await startTracking();
      if (cancelled) return;
      setControl({ error: problem, needsPermission: Boolean(problem) });
    })();

    return () => {
      cancelled = true;
    };
  }, [tripId]);

  return {
    ...observed,
    // A permission refusal is the one error the driver can actually act on, so
    // it outranks whatever the last upload attempt reported.
    error: control.error ?? observed.error,
    needsPermission: control.needsPermission,
  };
}
