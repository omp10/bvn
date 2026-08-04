const EARTH_RADIUS_M = 6_371_000;
const toRad = (deg: number) => (deg * Math.PI) / 180;

export type Point = { lat: number; lng: number };

/** Great-circle distance in metres. */
export function distanceMeters(a: Point, b: Point): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Straight-line ETA, deliberately naive.
 *
 * ponytail: real ETA needs road distance from the Directions API. Call it once
 * per bus per tick on the server and broadcast the result — never once per
 * watching parent, which is how the Maps bill explodes. This estimate keeps the
 * parent screen useful until that lands; the 1.35 factor is a rough allowance
 * for roads not being straight.
 */
export function naiveEtaMinutes(from: Point, to: Point, speedKmph = 25): number {
  const roadDistanceKm = (distanceMeters(from, to) / 1000) * 1.35;
  return Math.max(1, Math.round((roadDistanceKm / Math.max(5, speedKmph)) * 60));
}

export const isValidPoint = (p: unknown): p is Point =>
  !!p &&
  typeof p === "object" &&
  Number.isFinite((p as Point).lat) &&
  Number.isFinite((p as Point).lng) &&
  Math.abs((p as Point).lat) <= 90 &&
  Math.abs((p as Point).lng) <= 180;
