/**
 * The scheduled jobs, run directly against a database.
 *
 * Each one must be safe to run twice — a cron can fire again after a restart,
 * and more than one instance may be up — so every test runs it a second time
 * and asserts nothing further happens.
 */
import { test, before, after } from "node:test";
import assert from "node:assert";
import mongoose from "mongoose";
import { env } from "../config/env.js";
import { runWithContext } from "../lib/context.js";
import { closeRedis } from "../lib/redis.js";
import { School } from "../models/school.model.js";
import { Trip } from "../models/trip.model.js";
import { User } from "../models/user.model.js";
import { Vehicle } from "../models/vehicle.model.js";
import { allSchools } from "../models/plugins/tenant.js";
import { closeStaleTrips, expireSubscriptions, flagDelayedTrips, sendRenewalReminders } from "./scheduler.js";

let connected = false;
let schoolId = "";

const day = 86_400_000;

before(async () => {
  try {
    await mongoose.connect(env.mongoTestUrl, { serverSelectionTimeoutMS: 2000 });
    await mongoose.syncIndexes();
    connected = true;
  } catch {
    console.log("no mongod — skipping scheduler tests");
    return;
  }

  await School.deleteMany({});
  await allSchools(Trip.deleteMany({}));
  await allSchools(User.deleteMany({}));
  await allSchools(Vehicle.deleteMany({}));

  const school = await School.create({
    name: "Job Test School",
    code: "JOB111",
    inviteToken: "t",
    status: "active",
    subscription: { plan: "monthly", startedAt: new Date(), expiresAt: new Date(Date.now() + 3 * day) },
  });
  schoolId = String(school._id);

  await User.create({ name: "Office", phone: "9000011111", role: "school_admin", schoolId });
});

after(async () => {
  if (connected) await mongoose.disconnect();
  // redis.ts opens its connection on import, which would keep this process
  // alive after the last test finished.
  await closeRedis();
});

const as = <T>(fn: () => PromiseLike<T>) =>
  runWithContext({ userId: "000000000000000000000001", role: "school_admin", schoolId }, async () => await fn());

test("a school expiring within a week is reminded exactly once", async (t) => {
  if (!connected) return t.skip();

  assert.equal(await sendRenewalReminders(), 1);
  // The marker on the subscription is what makes the job idempotent.
  assert.equal(await sendRenewalReminders(), 0, "a second run must not remind again");

  const school = await School.findById(schoolId);
  assert.ok(school!.subscription!.reminderSentAt);
});

test("a lapsed subscription is expired, which locks the school out", async (t) => {
  if (!connected) return t.skip();

  await School.findByIdAndUpdate(schoolId, { "subscription.expiresAt": new Date(Date.now() - day) });

  assert.equal(await expireSubscriptions(), 1);
  assert.equal((await School.findById(schoolId))!.status, "expired");
  assert.equal(await expireSubscriptions(), 0, "already-expired schools are not touched again");

  // Put it back for the trip tests below.
  await School.findByIdAndUpdate(schoolId, { status: "active", "subscription.expiresAt": new Date(Date.now() + 30 * day) });
});

test("a long-running trip is flagged delayed, once", async (t) => {
  if (!connected) return t.skip();

  const vehicleId = new mongoose.Types.ObjectId();
  const trip = await as(() =>
    Trip.create({
      vehicleId,
      driverId: new mongoose.Types.ObjectId(),
      type: "morning",
      tripDate: "2026-07-29",
      status: "running",
      startedAt: new Date(Date.now() - 3 * 3600_000),
    })
  );

  assert.equal(await flagDelayedTrips(), 1);
  assert.equal((await as(() => Trip.findById(trip._id)))!.delayed, true);
  assert.equal(await flagDelayedTrips(), 0, "an already-flagged trip is skipped");

  await allSchools(Trip.deleteOne({ _id: trip._id }));
});

test("a trip nobody ended is auto-closed, freeing the bus for tomorrow", async (t) => {
  if (!connected) return t.skip();

  const vehicle = await as(() =>
    Vehicle.create({ vehicleNumber: "MH12 JOB 1", capacity: 40, status: "running", busNumber: "Bus J" })
  );
  const trip = await as(() =>
    Trip.create({
      vehicleId: vehicle._id,
      driverId: new mongoose.Types.ObjectId(),
      type: "morning",
      tripDate: "2026-07-28",
      status: "running",
      startedAt: new Date(Date.now() - 10 * 3600_000),
    })
  );

  assert.equal(await closeStaleTrips(), 1);

  const closed = await as(() => Trip.findById(trip._id));
  assert.equal(closed!.status, "completed");
  assert.equal(closed!.autoClosed, true);
  assert.ok(closed!.endedAt);

  // The bus must not be left marked "running" forever.
  assert.equal((await as(() => Vehicle.findById(vehicle._id)))!.status, "assigned");
  assert.equal(await closeStaleTrips(), 0);
});

test("a trip that is still fresh is left alone", async (t) => {
  if (!connected) return t.skip();

  const trip = await as(() =>
    Trip.create({
      vehicleId: new mongoose.Types.ObjectId(),
      driverId: new mongoose.Types.ObjectId(),
      type: "evening",
      tripDate: "2026-07-29",
      status: "running",
      startedAt: new Date(),
      lastPosition: { lat: 18.5, lng: 73.8, at: new Date() },
    })
  );

  assert.equal(await flagDelayedTrips(), 0);
  assert.equal(await closeStaleTrips(), 0);

  await allSchools(Trip.deleteOne({ _id: trip._id }));
});
