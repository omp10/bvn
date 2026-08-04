import cron, { type ScheduledTask } from "node-cron";
import { runWithContext } from "../lib/context.js";
import { redis } from "../lib/redis.js";
import { School } from "../models/school.model.js";
import { Trip } from "../models/trip.model.js";
import { User } from "../models/user.model.js";
import { Vehicle } from "../models/vehicle.model.js";
import { allSchools } from "../models/plugins/tenant.js";
import { notify } from "../modules/notifications/notification.service.js";
import { emitToSchool } from "../realtime/socket.js";

/**
 * Background jobs.
 *
 * Everything here is written to be safe to run repeatedly — each job either
 * filters on a "not done yet" marker or is naturally idempotent — because a
 * cron can fire twice after a restart, and because more than one instance may
 * be running.
 */

const tasks: ScheduledTask[] = [];

/**
 * A crude but effective distributed lock: the first instance to SET NX wins the
 * run, the others skip. Without Redis there is only one instance, so the lock
 * is unnecessary and every run proceeds.
 */
async function claim(job: string, ttlSeconds: number): Promise<boolean> {
  const client = redis();
  if (!client) return true;
  const won = await client.set(`job:${job}`, String(process.pid), "EX", ttlSeconds, "NX").catch(() => "OK");
  return won === "OK";
}

// The jobs return a count for tests and manual runs; the scheduler ignores it.
const run = (job: string, ttlSeconds: number, fn: () => Promise<unknown>) => async () => {
  try {
    if (!(await claim(job, ttlSeconds))) return;
    await fn();
  } catch (err) {
    // A failing job must never take the process down with it.
    console.error(`[job:${job}]`, err);
  }
};

/* ── Subscriptions ──────────────────────────────────────────────────── */

/** Warns a school before its subscription lapses. Sent once per period. */
export async function sendRenewalReminders(): Promise<number> {
  const horizon = new Date(Date.now() + 7 * 86_400_000);

  const schools = await School.find({
    status: { $in: ["active", "trial"] },
    "subscription.expiresAt": { $gt: new Date(), $lte: horizon },
    // The marker that makes this idempotent — cleared whenever a plan is renewed.
    $or: [{ "subscription.reminderSentAt": null }, { "subscription.reminderSentAt": { $exists: false } }],
  });

  for (const school of schools) {
    const admins = await allSchools(User.find({ schoolId: school._id, role: "school_admin" })).select("_id").lean();
    const days = Math.ceil((new Date(school.subscription!.expiresAt!).getTime() - Date.now()) / 86_400_000);

    await notify({
      userIds: admins.map((a) => a._id),
      type: "subscription",
      title: "Subscription expiring soon",
      body: `Your BalVahini subscription ends in ${days} day${days === 1 ? "" : "s"}. Renew to avoid interruption.`,
      schoolId: school._id,
    });

    school.subscription!.reminderSentAt = new Date();
    await school.save();
  }

  if (schools.length) console.log(`[job:renewals] reminded ${schools.length} school(s)`);
  return schools.length;
}

/** Moves lapsed schools to "expired", which locks their users out on the next request. */
export async function expireSubscriptions(): Promise<number> {
  const result = await School.updateMany(
    { status: { $in: ["active", "trial"] }, "subscription.expiresAt": { $lt: new Date() } },
    { status: "expired" }
  );
  if (result.modifiedCount) console.log(`[job:expiry] expired ${result.modifiedCount} school(s)`);
  return result.modifiedCount;
}

/* ── Compliance ─────────────────────────────────────────────────────── */

/** Licence and vehicle-document expiry warnings, to the school office. */
export async function sendComplianceReminders(): Promise<number> {
  const horizon = new Date(Date.now() + 30 * 86_400_000);
  const schools = await School.find({ status: { $in: ["active", "trial"] } }).select("_id").lean();
  let sent = 0;

  for (const school of schools) {
    const schoolId = String(school._id);

    await runWithContext({ userId: "system", role: "school_admin", schoolId }, async () => {
      const [drivers, vehicles, admins] = await Promise.all([
        User.find({ role: "driver", status: { $ne: "inactive" }, licenseExpiry: { $lte: horizon } })
          .select("name licenseExpiry")
          .lean(),
        Vehicle.find({ "documents.expiresOn": { $lte: horizon } }).select("busNumber documents").lean(),
        User.find({ role: "school_admin" }).select("_id").lean(),
      ]);

      if (!admins.length || (!drivers.length && !vehicles.length)) return;

      const lines: string[] = [];
      for (const d of drivers) lines.push(`${d.name}'s licence`);
      for (const v of vehicles) {
        const due = (v.documents ?? []).filter((doc) => doc.expiresOn && doc.expiresOn <= horizon);
        for (const doc of due) lines.push(`${v.busNumber ?? "a bus"} ${doc.type}`);
      }

      await notify({
        userIds: admins.map((a) => a._id),
        type: "announcement",
        title: "Documents expiring within 30 days",
        // Keep the push readable; the compliance screen has the full list.
        body: lines.slice(0, 3).join(", ") + (lines.length > 3 ? ` and ${lines.length - 3} more` : ""),
        schoolId,
      });
      sent++;
    });
  }

  return sent;
}

/* ── Trips ──────────────────────────────────────────────────────────── */

/**
 * Flags a running trip as delayed when it has been going far longer than a
 * school run should, or when its GPS has gone quiet.
 */
export async function flagDelayedTrips(): Promise<number> {
  const longRunning = new Date(Date.now() - 2 * 3600_000);
  const goneQuiet = new Date(Date.now() - 15 * 60_000);

  const trips = await allSchools(
    Trip.find({
      status: "running",
      delayed: { $ne: true },
      $or: [{ startedAt: { $lt: longRunning } }, { "lastPosition.at": { $lt: goneQuiet } }],
    })
  ).select("schoolId vehicleId startedAt lastPosition");

  for (const trip of trips) {
    trip.delayed = true;
    await trip.save();
    emitToSchool(String(trip.schoolId), "trip:delayed", { tripId: String(trip._id) });
  }

  if (trips.length) console.log(`[job:delayed] flagged ${trips.length} trip(s)`);
  return trips.length;
}

/**
 * Closes trips a driver forgot to end. Without this the bus stays "running"
 * forever and its partial unique index blocks tomorrow's trip.
 */
export async function closeStaleTrips(): Promise<number> {
  const cutoff = new Date(Date.now() - 8 * 3600_000);
  const trips = await allSchools(Trip.find({ status: "running", startedAt: { $lt: cutoff } }));

  for (const trip of trips) {
    trip.status = "completed";
    trip.endedAt = new Date();
    trip.autoClosed = true;
    await trip.save();
    await allSchools(Vehicle.updateOne({ _id: trip.vehicleId }, { status: "assigned" }));
  }

  if (trips.length) console.log(`[job:staleTrips] auto-closed ${trips.length} trip(s)`);
  return trips.length;
}

/* ── Wiring ─────────────────────────────────────────────────────────── */

export function startScheduler(): void {
  // Times are IST-ish by intent; set TZ on the host to match the schools served.
  tasks.push(
    cron.schedule("0 8 * * *", run("renewals", 3600, sendRenewalReminders)),
    cron.schedule("15 0 * * *", run("expiry", 3600, expireSubscriptions)),
    cron.schedule("30 8 * * 1", run("compliance", 3600, sendComplianceReminders)), // Mondays
    cron.schedule("*/5 * * * *", run("delayed", 240, flagDelayedTrips)),
    cron.schedule("0 * * * *", run("staleTrips", 1800, closeStaleTrips))
  );

  console.log(`[jobs] scheduler started (${tasks.length} jobs)`);
}

export function stopScheduler(): void {
  for (const task of tasks) task.stop();
  tasks.length = 0;
}
