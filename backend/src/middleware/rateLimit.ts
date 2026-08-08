import rateLimit, { type Store } from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import { redis } from "../lib/redis.js";
import { env } from "../config/env.js";

/**
 * Rate limits are shared across instances when Redis is configured; without it
 * each process counts on its own, which lets N instances allow N× the traffic.
 * Fine for one box, wrong behind a load balancer.
 */
function store(prefix: string): Store | undefined {
  const client = redis();
  if (!client) return undefined;
  return new RedisStore({
    prefix: `rl:${prefix}:`,
    sendCommand: (...args: string[]) => client.call(...(args as [string, ...string[]])) as never,
  }) as unknown as Store;
}

const limiter = (prefix: string, windowMs: number, max: number, message: string) =>
  rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    // Built once at import. redis.ts connects on import for exactly this reason
    // — resolve it any later and these silently become per-process counters.
    store: store(prefix),
    message: { error: message, code: "rate_limited" },
  });

/** Credential stuffing and OTP brute force both arrive here. */
export const authLimiter = limiter(
  "auth",
  15 * 60_000,
  env.rateLimits.auth,
  "too many attempts, try again later"
);

/**
 * OTP requests cost real money once the SMS gateway is live — and until then
 * they cost nothing and protect nothing, because OTP_DEV_MODE hands the same
 * 123456 back in the response. Throttling a code that is already public is pure
 * friction, so the strict limit only applies once a real gateway is wired.
 *
 * Deliberately keyed off otpDevMode rather than a separate switch: turning the
 * dev OTP off is exactly the moment this has to tighten, and tying them
 * together means nobody has to remember.
 */
export const otpLimiter = env.otpDevMode
  ? limiter("otp", 10 * 60_000, env.rateLimits.otp, "too many OTP requests, try again later")
  : limiter("otp", 10 * 60_000, 5, "too many OTP requests, try again later");

/**
 * Position uploads are frequent by design — every bus reports each few seconds
 * and may flush a backlog after a dead zone — so this is a runaway guard rather
 * than a throttle on normal use.
 */
export const trackingLimiter = limiter("gps", 60_000, env.rateLimits.tracking, "position updates too frequent");

export const apiLimiter = limiter("api", 60_000, env.rateLimits.api, "too many requests");
