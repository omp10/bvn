import { distanceMeters, naiveEtaMinutes, type Point } from "../../lib/geo.js";

export type Stop = { _id: unknown; name: string; lat: number; lng: number; sequence: number };

export type Progress = {
  /** Index of the stop the bus is heading to, after applying any arrival. */
  currentStopIndex: number;
  /** Set when the bus has just arrived at a stop it had not reached before. */
  reached?: Stop;
  /** Set when the bus is close to the next stop but has not arrived. */
  approaching?: { stop: Stop; distanceMeters: number; etaMinutes: number };
};

/** Within this distance the bus counts as having arrived at the stop. */
const ARRIVAL_RADIUS_M = 120;

/**
 * Works out what a new GPS fix means for a trip: whether the next stop has been
 * reached, or is close enough to warn the parents waiting at it.
 *
 * Pure on purpose — this is the logic that decides when a parent's phone buzzes,
 * and it should be testable without a database, a bus or a driver.
 */
export function stopProgress(
  stops: Stop[],
  currentStopIndex: number,
  position: Point,
  approachingRadiusMeters = 800,
  speedKmph?: number
): Progress {
  const index = Math.max(0, Math.min(currentStopIndex, stops.length));
  if (index >= stops.length) return { currentStopIndex: index };

  const next = stops[index];
  const away = distanceMeters(position, { lat: next.lat, lng: next.lng });

  if (away <= ARRIVAL_RADIUS_M) {
    return { currentStopIndex: index + 1, reached: next };
  }

  if (away <= approachingRadiusMeters) {
    return {
      currentStopIndex: index,
      approaching: {
        stop: next,
        distanceMeters: Math.round(away),
        etaMinutes: naiveEtaMinutes(position, { lat: next.lat, lng: next.lng }, speedKmph),
      },
    };
  }

  return { currentStopIndex: index };
}

/**
 * Keeps the newest fix by device clock. Buffered points from an offline stretch
 * arrive out of order, and the live map must not jump backwards when they do.
 */
export function latestByTime<T extends { at: Date | string }>(points: T[]): T | undefined {
  return points.reduce<T | undefined>(
    (best, p) => (!best || new Date(p.at) > new Date(best.at) ? p : best),
    undefined
  );
}
