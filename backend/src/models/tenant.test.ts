/**
 * The invariant the whole platform rests on: no school can reach another
 * school's data, and a query that forgets to say which school it wants fails
 * loudly instead of quietly returning everything.
 *
 *   npm test        (needs a local mongod; skips cleanly without one)
 */
import { test, before, after } from "node:test";
import assert from "node:assert";
import mongoose from "mongoose";
import { env } from "../config/env.js";
import { runWithContext, type Role } from "../lib/context.js";
import { School } from "./school.model.js";
import { Student } from "./student.model.js";
import { Trip } from "./trip.model.js";
import { allSchools } from "./plugins/tenant.js";

let connected = false;
let schoolA = "";
let schoolB = "";

/**
 * Runs fn inside a request scope, the way authenticate() does.
 *
 * The await matters: a Mongoose Query is lazy, so returning `Student.find()`
 * unawaited would let runWithContext() exit before the query ever executes, and
 * it would run with no tenant in scope. Real handlers await inside the request,
 * which is why they are unaffected.
 */
const as = <T>(schoolId: string, fn: () => PromiseLike<T>, role: Role = "school_admin"): Promise<T> =>
  runWithContext({ userId: "000000000000000000000001", role, schoolId }, async () => await fn());

before(async () => {
  try {
    await mongoose.connect(env.mongoTestUrl, { serverSelectionTimeoutMS: 2000 });
    await mongoose.syncIndexes();
    connected = true;
  } catch {
    console.log(`no mongod at ${env.mongoTestUrl} — skipping tenant tests`);
    return;
  }

  await allSchools(Student.deleteMany({}));
  await allSchools(Trip.deleteMany({}));
  await School.deleteMany({});

  const [a, b] = await School.create([
    { name: "A School", code: "AAA111", inviteToken: "a" },
    { name: "B School", code: "BBB222", inviteToken: "b" },
  ]);
  schoolA = String(a._id);
  schoolB = String(b._id);

  await as(schoolA, () => Student.create({ name: "Aarav", class: "5" }));
  await as(schoolB, () => Student.create({ name: "Riya", class: "5" }));
});

after(async () => {
  if (connected) await mongoose.disconnect();
});

test("a school reads only its own students", async (t) => {
  if (!connected) return t.skip();
  const rows = await as(schoolA, () => Student.find().lean());
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, "Aarav");
});

test("schoolId is stamped on create without the caller passing it", async (t) => {
  if (!connected) return t.skip();
  const created = await as(schoolB, () => Student.create({ name: "Kabir" }));
  assert.equal(String(created.schoolId), schoolB);
  await as(schoolB, () => Student.deleteOne({ _id: created._id }));
});

test("insertMany is stamped too", async (t) => {
  if (!connected) return t.skip();
  const docs = await as(schoolA, () => Student.insertMany([{ name: "Bulk" }]));
  assert.equal(String(docs[0].schoolId), schoolA);
  await as(schoolA, () => Student.deleteOne({ _id: docs[0]._id }));
});

test("fetching another school's document by id returns nothing", async (t) => {
  if (!connected) return t.skip();
  const riya = await as(schoolB, () => Student.findOne({ name: "Riya" }).lean());
  const stolen = await as(schoolA, () => Student.findById(riya!._id).lean());
  assert.equal(stolen, null);
});

test("a cross-tenant update matches nothing instead of writing", async (t) => {
  if (!connected) return t.skip();
  const riya = await as(schoolB, () => Student.findOne({ name: "Riya" }).lean());
  await as(schoolA, () => Student.updateOne({ _id: riya!._id }, { name: "HACKED" }));
  const after = await as(schoolB, () => Student.findById(riya!._id).lean());
  assert.equal(after!.name, "Riya");
});

test("a cross-tenant delete does nothing", async (t) => {
  if (!connected) return t.skip();
  const riya = await as(schoolB, () => Student.findOne({ name: "Riya" }).lean());
  const result = await as(schoolA, () => Student.deleteOne({ _id: riya!._id }));
  assert.equal(result.deletedCount, 0);
});

test("aggregate is scoped as well as find", async (t) => {
  if (!connected) return t.skip();
  const rows = await as(schoolA, () =>
    Student.aggregate([{ $group: { _id: "$class", n: { $sum: 1 } } }])
  );
  assert.equal(rows.reduce((sum: number, r: { n: number }) => sum + r.n, 0), 1);
});

test("an unscoped query throws rather than returning every school", async (t) => {
  if (!connected) return t.skip();
  await assert.rejects(() => Student.find().exec(), /tenant scope missing/);
});

test("the super admin bypass is explicit and works", async (t) => {
  if (!connected) return t.skip();
  const all = await allSchools(Student.find()).lean();
  assert.equal(all.length, 2);
});

test("one running trip per bus per day per type — the Start Trip guard", async (t) => {
  if (!connected) return t.skip();
  const vehicleId = new mongoose.Types.ObjectId();
  const driverId = new mongoose.Types.ObjectId();
  const base = { vehicleId, driverId, tripDate: "2026-07-29", type: "morning" as const };

  const first = await as(schoolA, () => Trip.create(base));
  // The driver's second tap on a flaky connection.
  await assert.rejects(() => as(schoolA, () => Trip.create(base)), (e: unknown) => (e as { code?: number }).code === 11000);

  // Once the trip is finished, the same bus may run the same trip again.
  await as(schoolA, () => Trip.updateOne({ _id: first._id }, { status: "completed" }));
  const second = await as(schoolA, () => Trip.create(base));
  assert.notEqual(String(second._id), String(first._id));

  // And the same bus is free to run the other trip type the same day.
  const evening = await as(schoolA, () => Trip.create({ ...base, type: "evening" }));
  assert.ok(evening._id);

  await allSchools(Trip.deleteMany({ vehicleId }));
});

test("the same bus number may exist at two different schools", async (t) => {
  if (!connected) return t.skip();
  const { Vehicle } = await import("./vehicle.model.js");
  const a = await as(schoolA, () => Vehicle.create({ busNumber: "Bus 1", vehicleNumber: "MH12 AA 0001", capacity: 40 }));
  const b = await as(schoolB, () => Vehicle.create({ busNumber: "Bus 1", vehicleNumber: "MH12 AA 0002", capacity: 40 }));
  assert.notEqual(String(a._id), String(b._id));
  await allSchools(Vehicle.deleteMany({ _id: { $in: [a._id, b._id] } }));
});
