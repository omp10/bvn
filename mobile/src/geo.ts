/** Great-circle distance in metres. Good enough at bus-route scale. */
export function metresBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

export const prettyDistance = (m: number): string =>
  m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;

/** Below this a "movement" is GPS noise, not the bus moving. */
const JITTER_M = 12;
/** Above this between consecutive fixes, the fix is a bad lock, not a journey. */
const TELEPORT_M = 3000;

/**
 * Cleans a raw GPS trail before it is drawn.
 *
 * A parked bus still emits a fix every ten seconds, and each one lands a few
 * metres from the last — draw them all and the line becomes a scribble at every
 * stop. Haversine between consecutive points is what separates real movement
 * from that jitter, and it drops the occasional wild fix that would otherwise
 * put a straight line across the city and back.
 */
export function smoothTrail<T extends { lat: number; lng: number }>(points: T[]): T[] {
  const kept: T[] = [];
  for (const point of points) {
    const last = kept[kept.length - 1];
    if (!last) {
      kept.push(point);
      continue;
    }
    const moved = metresBetween(last, point);
    if (moved < JITTER_M || moved > TELEPORT_M) continue;
    kept.push(point);
  }
  return kept;
}

/** Ground distance actually covered along a trail, in metres. */
export const trailDistance = (points: { lat: number; lng: number }[]): number =>
  points.reduce((total, p, i) => (i === 0 ? 0 : total + metresBetween(points[i - 1], p)), 0);
