import { createServer } from "node:http";
import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { connectDb, disconnectDb } from "./lib/db.js";
import { closeRedis, initRedis } from "./lib/redis.js";
import { initRealtime } from "./realtime/socket.js";
import { startScheduler, stopScheduler } from "./jobs/scheduler.js";

/*
 * Process guards go first — before any await.
 *
 * redis.ts opens its connection on import, and libraries queue commands there
 * without awaiting them (the rate-limit store loads a script at startup). If
 * Redis is unreachable those reject a few seconds later, which can easily be
 * while we are still waiting on Mongo below. Registered after that await, these
 * handlers would not exist yet and the process would die during boot.
 */

/**
 * Redis is a cache and a fan-out bus, not the source of truth. Killing a live
 * bus-tracking service because a cache blinked is the wrong trade, so Redis
 * errors are logged and survived — every feature that needs it already falls
 * back or fails that one request.
 *
 * Deliberately narrow: anything else still exits, because a process in an
 * unknown state must not keep serving.
 */
const isRedisError = (err: unknown): boolean => {
  const text = err instanceof Error ? `${err.name} ${err.message}` : String(err);
  return /MaxRetriesPerRequest|Command timed out|ECONNREFUSED|Redis|Stream isn't writeable/i.test(text);
};

process.on("unhandledRejection", (reason) => {
  if (isRedisError(reason)) return console.error("[redis] degraded:", (reason as Error)?.message);
  console.error("[unhandledRejection]", reason);
});

process.on("uncaughtException", (err) => {
  if (isRedisError(err)) return console.error("[redis] degraded:", err.message);
  console.error("[uncaughtException]", err);
  process.exit(1);
});

// Mongo is the source of truth: if it is unreachable there is nothing to serve,
// so this rejection is allowed to stop the boot.
await connectDb();
initRedis();

const app = createApp();
const server = createServer(app);
initRealtime(server);
startScheduler();

if (env.isProd && env.otpDevMode) {
  console.warn(
    "[security] OTP_DEV_MODE is on in production: every OTP is " +
      env.devOtp +
      " and is returned in the response. Anyone who knows a parent's mobile " +
      "number can sign in as them. Turn this off once an SMS gateway is live."
  );
}

server.listen(env.port, () => {
  console.log(`BalVahini API listening on http://localhost:${env.port} (${env.nodeEnv})`);
});

/** Finish in-flight requests before the process goes away. */
const shutdown = async (signal: string) => {
  console.log(`\n${signal} received, shutting down`);
  stopScheduler();
  server.close(async () => {
    await disconnectDb();
    await closeRedis();
    process.exit(0);
  });
  // Don't hang forever on a stuck connection.
  setTimeout(() => process.exit(1), 10_000).unref();
};

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
