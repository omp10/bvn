import Redis from "ioredis";
import { env } from "../config/env.js";

/**
 * Redis, when it is there.
 *
 * Everything that uses it degrades to an in-process equivalent when REDIS_URL
 * is unset, so a developer can clone the repo and run the API with nothing but
 * MongoDB. The moment a second Node instance exists, Redis stops being optional
 * — an OTP issued on instance A must verify on instance B, and a position
 * broadcast on A must reach the parents connected to B.
 */

/**
 * Connected on import, not from an init() call in server.ts.
 *
 * Middleware such as the rate limiters builds its store at module load, which
 * happens before any function in server.ts runs — an init() call there would be
 * too late and those limiters would silently fall back to per-process counters.
 */
let client: Redis | null = env.redisUrl
  ? new Redis(env.redisUrl, {
      // Queue commands issued before the socket is up rather than throwing;
      // without this the pub/sub adapter fails on its very first psubscribe.
      enableOfflineQueue: true,
      // null = retry forever. A finite limit makes ioredis flush the queue with
      // a MaxRetriesPerRequestError, which it *throws* — and a library command
      // nobody awaited (the rate-limit store loads a script at startup) then
      // takes the whole API down. Redis being unreachable must degrade the
      // platform, never stop buses being tracked.
      maxRetriesPerRequest: null,
      // ...but a command must not hang forever either. This fails fast with a
      // catchable error, so a request degrades instead of stalling.
      commandTimeout: 3_000,
      retryStrategy: (times) => Math.min(times * 200, 5_000),
    })
  : null;

client?.on("ready", () => console.log("[redis] connected"));
client?.on("error", (err) => console.error("[redis] " + err.message));

/** Logs which mode the process is in. The connection itself is already open. */
export function initRedis(): Redis | null {
  console.log(
    client
      ? "[redis] enabled — shared OTPs, rate limits and socket fan-out"
      : "[redis] REDIS_URL not set — in-process fallbacks (single instance only)"
  );
  return client;
}

/**
 * The shared client, or null when Redis is not configured.
 *
 * Deliberately not gated on a "ready" flag: if it were, a command issued during
 * the connect window would silently take the in-memory path, and an OTP written
 * to memory could never be verified from Redis a second later. Configured means
 * used — commands queue while connecting and surface a real error if Redis is
 * genuinely down.
 */
export const redis = (): Redis | null => client;

export const redisEnabled = () => Boolean(env.redisUrl);

/**
 * A second connection — a subscriber cannot also issue normal commands.
 *
 * The error listener is not optional: an ioredis connection with no 'error'
 * handler emits an unhandled error event, and Node kills the process. Redis
 * going away must degrade the platform, never take the API down with it.
 */
export function duplicateRedis(): Redis | null {
  if (!client) return null;

  const copy = client.duplicate({
    enableOfflineQueue: true,
    // null = retry forever. With a finite limit ioredis eventually flushes the
    // queue and rejects every pending command — including the adapter's initial
    // psubscribe, which nothing awaits, so an unreachable Redis takes the whole
    // API down with an unhandled rejection.
    maxRetriesPerRequest: null,
  });

  copy.on("error", (err) => console.error("[redis:pubsub] " + err.message));
  return copy;
}

export async function closeRedis() {
  await client?.quit().catch(() => {});
  client = null;
}

/* ── Live positions ──────────────────────────────────────────────────
   The last known position of every running bus. Read constantly by parents and
   the office; written every few seconds by each driver. That is exactly the
   wrong shape for Mongo and exactly the right shape for Redis. */

const posKey = (tripId: string) => `pos:${tripId}`;
/** Long enough to outlive a trip, short enough to clean itself up. */
const POSITION_TTL_SECONDS = 6 * 3600;

export type LivePosition = { lat: number; lng: number; at: string; speedKmph?: number };

export async function setLivePosition(tripId: string, position: LivePosition): Promise<void> {
  const r = redis();
  if (!r) return;
  await r.set(posKey(tripId), JSON.stringify(position), "EX", POSITION_TTL_SECONDS).catch(() => {});
}

export async function getLivePosition(tripId: string): Promise<LivePosition | null> {
  const r = redis();
  if (!r) return null;
  const raw = await r.get(posKey(tripId)).catch(() => null);
  return raw ? (JSON.parse(raw) as LivePosition) : null;
}

/** One round trip for the whole fleet instead of one per bus. */
export async function getLivePositions(tripIds: string[]): Promise<Record<string, LivePosition>> {
  const r = redis();
  if (!r || !tripIds.length) return {};
  const values = await r.mget(tripIds.map(posKey)).catch(() => []);
  const out: Record<string, LivePosition> = {};
  tripIds.forEach((id, i) => {
    const raw = values[i];
    if (raw) out[id] = JSON.parse(raw) as LivePosition;
  });
  return out;
}

export async function clearLivePosition(tripId: string): Promise<void> {
  await redis()?.del(posKey(tripId)).catch(() => {});
}
