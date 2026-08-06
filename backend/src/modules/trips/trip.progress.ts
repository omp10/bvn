import { distanceMeters, naiveEtaMinutes, type Point } from "../../lib/geo.js";

export type Stop = {
  _id: unknown;
  name: string;
  lat: number;
  lng: number;
  sequence: number;
  /** "HH:MM", the time this stop is scheduled for. */
  pickupTime?: string;
  dropTime?: string;
};

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
 * How late the bus was reaching a stop, in minutes — FRD §19.6.
 *
 * Negative means early, which is worth keeping: a bus running ten minutes ahead
 * of the timetable is a child missing their pickup, not good news.
 *
 * Returns null when the stop has no scheduled time, because "on time" and "no
 * timetable" are different answers and only one of them should light a warning.
 *
 * ponytail: the schedule is a wall-clock "HH:MM" with no timezone, so it is read
 * in the server's local zone against the trip's own date. That is correct while
 * a school and its server share a zone, which is every deployment today. It
 * breaks the day one school runs in another zone — store an IANA zone on the
 * school and pass it in here when that happens.
 */
export function delayMinutesAt(
  stop: Pick<Stop, "pickupTime" | "dropTime">,
  tripType: "morning" | "evening",
  tripDate: string,
  arrivedAt: Date
): number | null {
  const scheduled = tripType === "morning" ? stop.pickupTime : stop.dropTime;
  if (!scheduled || !/^\d{4}-\d{2}-\d{2}$/.test(tripDate)) return null;

  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(scheduled);
  if (!match) return null;

  const [year, month, day] = tripDate.split("-").map(Number);
  const due = new Date(year, month - 1, day, Number(match[1]), Number(match[2]), 0, 0);

  return Math.round((arrivedAt.getTime() - due.getTime()) / 60_000);
}

/**
 * Has the bus arrived at the school gate? Same idea as a stop arrival, but the
 * school is not on the route's stop list, so it needs its own check.
 */
export function atSchool(
  position: Point,
  // Deliberately loose: a school's location is optional in the schema, and the
  // whole point of this function is to say "no" when it was never set.
  school?: { lat?: number | null; lng?: number | null } | null,
  radiusMeters = 150
): boolean {
  if (school?.lat == null || school?.lng == null) return false;
  return distanceMeters(position, { lat: school.lat, lng: school.lng }) <= radiusMeters;
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
