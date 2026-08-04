import type { Server as HttpServer } from "node:http";
import { Server, type Socket } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { duplicateRedis, redisEnabled } from "../lib/redis.js";
import { env } from "../config/env.js";
import { runWithContext, type RequestContext } from "../lib/context.js";
import { verifyAccessToken } from "../lib/jwt.js";
import { Student } from "../models/student.model.js";
import { Trip } from "../models/trip.model.js";
import { Vehicle } from "../models/vehicle.model.js";

/**
 * Live tracking transport.
 *
 * The important thing here is that sockets bypass the Mongoose tenant plugin
 * entirely: once a client is in a room it receives broadcasts without any query
 * running. So authorisation happens at join time, and a client is never allowed
 * to name the room it joins — the room is derived from the signed token, or
 * checked against the database before the join is accepted.
 */

let io: Server | null = null;

const schoolRoom = (schoolId: string) => `school:${schoolId}`;
const tripRoom = (tripId: string) => `trip:${tripId}`;

type SocketContext = RequestContext;
const contextOf = (socket: Socket): SocketContext => socket.data.ctx as SocketContext;

export function initRealtime(server: HttpServer): Server {
  io = new Server(server, {
    cors: { origin: env.corsOrigin, credentials: true },
  });

  // Without this every instance broadcasts only to the sockets it happens to
  // hold, so a parent connected to instance B never sees a bus reporting to A.
  if (redisEnabled()) {
    const pub = duplicateRedis();
    const sub = duplicateRedis();
    if (pub && sub) {
      io.adapter(createAdapter(pub, sub));
      console.log("[socket] redis adapter active — safe to run multiple instances");
    }
  } else {
    console.log("[socket] in-memory adapter — single instance only");
  }

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) return next(new Error("unauthorized"));
    try {
      const claims = verifyAccessToken(token);
      socket.data.ctx = { userId: claims.userId, role: claims.role, schoolId: claims.schoolId };
      next();
    } catch {
      next(new Error("unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    const ctx = contextOf(socket);

    // School staff watch their whole fleet. The room comes from the token, so
    // there is nothing for the client to tamper with.
    if (ctx.schoolId && (ctx.role === "school_admin" || ctx.role === "staff")) {
      socket.join(schoolRoom(ctx.schoolId));
    }

    socket.on("trip:watch", async (payload: { tripId?: string }, ack?: (r: unknown) => void) => {
      const tripId = String(payload?.tripId ?? "");
      if (!/^[a-f\d]{24}$/i.test(tripId)) return ack?.({ error: "invalid tripId" });

      const allowed = await canWatchTrip(ctx, tripId);
      if (!allowed) return ack?.({ error: "forbidden" });

      socket.join(tripRoom(tripId));
      ack?.({ ok: true });
    });

    socket.on("trip:unwatch", (payload: { tripId?: string }) => {
      if (payload?.tripId) socket.leave(tripRoom(String(payload.tripId)));
    });
  });

  return io;
}

/**
 * Can this user watch this trip? Runs inside the caller's tenant scope, so a
 * trip belonging to another school is simply not found.
 */
async function canWatchTrip(ctx: SocketContext, tripId: string): Promise<boolean> {
  if (ctx.role === "super_admin") return true;
  if (!ctx.schoolId) return false;

  return runWithContext(ctx, async () => {
    const trip = await Trip.findById(tripId).select("vehicleId driverId attendantId");
    if (!trip) return false;

    switch (ctx.role) {
      case "school_admin":
        return true; // already proven to be this school's trip by the scope
      case "driver":
        return String(trip.driverId) === ctx.userId;
      case "staff":
        return String(trip.attendantId) === ctx.userId;
      case "parent": {
        // A parent may watch a trip only while their own child rides that bus.
        const count = await Student.countDocuments({
          parentId: ctx.userId,
          vehicleId: trip.vehicleId,
        });
        return count > 0;
      }
      case "owner": {
        const vehicle = await Vehicle.findById(trip.vehicleId).setOptions({ skipTenant: true });
        return String(vehicle?.ownerId) === ctx.userId;
      }
      default:
        return false;
    }
  });
}

/* ── Emit helpers ───────────────────────────────────────────────────────
   Handlers call these; nothing else touches `io` directly. */

export function emitToTrip(tripId: string, event: string, payload: unknown): void {
  io?.to(tripRoom(tripId)).emit(event, payload);
}

export function emitToSchool(schoolId: string, event: string, payload: unknown): void {
  io?.to(schoolRoom(schoolId)).emit(event, payload);
}

export const getIo = (): Server | null => io;
