/**
 * Demo data.
 *
 * Two schools on purpose — one school proves nothing about tenant isolation.
 * Sign in as each school admin and confirm neither can see the other's buses,
 * students or trips.
 *
 *   npm run seed
 */
import mongoose from "mongoose";
import { connectDb, disconnectDb } from "./lib/db.js";
import { randomSchoolCode, randomToken } from "./lib/codes.js";
import { hashPassword } from "./lib/password.js";
import { runWithContext } from "./lib/context.js";
import { Plan, DEFAULT_PLANS } from "./models/plan.model.js";
import { School } from "./models/school.model.js";
import { Student } from "./models/student.model.js";
import { TransportRoute } from "./models/route.model.js";
import { User } from "./models/user.model.js";
import { Vehicle } from "./models/vehicle.model.js";
import { Role } from "./models/role.model.js";
import { ALL_PERMISSIONS, expandPermissions } from "./lib/permissions.js";

await connectDb();

for (const collection of Object.values(mongoose.connection.collections)) {
  await collection.deleteMany({});
}

await Plan.insertMany(DEFAULT_PLANS.map((p) => ({ ...p, features: [] })));

const password = await hashPassword("admin123");

await User.create({
  name: "Platform Owner",
  phone: "9000000001",
  role: "super_admin",
  passwordHash: password,
});

const owner = await User.create({
  name: "Ravi Sharma",
  companyName: "Sharma Travels",
  phone: "9000000002",
  role: "owner",
  passwordHash: await hashPassword("owner123"),
});

// An unassigned vehicle in the pool, so the vehicle-request flow has something
// to hand out.
await Vehicle.create({
  vehicleNumber: "MH12 XY 9999",
  type: "bus",
  capacity: 45,
  ownerId: owner._id,
  status: "available",
});

const SCHOOLS = [
  { name: "Sunrise Public School", city: "Pune", prefix: "911110", colour: "#1d4ed8" },
  { name: "Green Valley School", city: "Nashik", prefix: "922220", colour: "#047857" },
];

for (const [index, spec] of SCHOOLS.entries()) {
  const school = await School.create({
    name: spec.name,
    code: randomSchoolCode(),
    inviteToken: randomToken(),
    contactPerson: "Principal",
    phone: `${spec.prefix}0000`,
    city: spec.city,
    state: "Maharashtra",
    status: "active",
    subscription: {
      plan: "yearly",
      startedAt: new Date(),
      expiresAt: new Date(Date.now() + 365 * 86_400_000),
    },
    branding: { appName: spec.name, themeColor: spec.colour },
  });

  const schoolId = String(school._id);
  // 6-digit prefix + 4-digit suffix = the 10 digits login validation expects.
  const mobile = (suffix: number) => `${spec.prefix}${String(suffix).padStart(4, "0")}`;
  const make = (role: string, suffix: number, name: string, extra: Record<string, unknown> = {}) =>
    User.create({ name, phone: mobile(suffix), role, schoolId, ...extra });

  const admin = await make("school_admin", 1, `${spec.name} Office`, { passwordHash: await hashPassword("school123") });
  const driver = await make("driver", 2, index === 0 ? "Ramesh Patil" : "Suresh Jadhav", {
    passwordHash: await hashPassword("driver123"),
    licenseNumber: `MH12-2019-${1000 + index}`,
    licenseExpiry: new Date(Date.now() + 400 * 86_400_000),
    experienceYears: 8 + index,
    ownerId: owner._id,
  });
  const attendant = await make("staff", 3, index === 0 ? "Sunita Kale" : "Manda Shinde", {
    passwordHash: await hashPassword("staff123"),
  });
  const parent = await make("parent", 4, index === 0 ? "Anil Deshmukh" : "Vijay More", {
    relationship: "father",
  });

  // Tenant-scoped models need the scope open, exactly as a real request does.
  await runWithContext({ userId: String(admin._id), role: "school_admin", schoolId }, async () => {
    // Two roles: the untouchable built-in one, and a realistic restricted role.
    await Role.create([
      {
        name: "School Administrator",
        description: "Full access to everything in this school.",
        // Every permission there is. Deriving this by rewriting ":view" to
        // ":manage" silently drops the modules that only have a view action.
        permissions: ALL_PERMISSIONS,
        system: true,
      },
      {
        name: "Transport Coordinator",
        description: "Runs day-to-day transport; cannot see salaries or billing.",
        permissions: expandPermissions([
          "dashboard:view", "live:view", "buses:manage", "drivers:manage",
          "attendants:manage", "routes:manage", "students:manage",
          "requests:manage", "alerts:manage", "reports:view",
        ]),
      },
    ]);

    const route = await TransportRoute.create({
      name: index === 0 ? "Kothrud Morning" : "College Road Morning",
      number: `R${index + 1}`,
      type: "morning",
      startPoint: "School Gate",
      endPoint: index === 0 ? "Kothrud Depot" : "College Road",
      distanceKm: 12,
      stops: [
        { name: "Anand Nagar", sequence: 1, lat: 18.5074 + index * 0.4, lng: 73.8077 + index * 0.4, pickupTime: "07:10", dropTime: "15:40" },
        { name: "Mayur Colony", sequence: 2, lat: 18.5124 + index * 0.4, lng: 73.8127 + index * 0.4, pickupTime: "07:20", dropTime: "15:30" },
        { name: "School Gate", sequence: 3, lat: 18.5174 + index * 0.4, lng: 73.8177 + index * 0.4, pickupTime: "07:40", dropTime: "15:10" },
      ],
    });

    const vehicle = await Vehicle.create({
      busNumber: `Bus ${index + 1}`,
      vehicleNumber: `MH12 AB ${1000 + index}`,
      capacity: 40,
      status: "assigned",
      driverId: driver._id,
      attendantId: attendant._id,
      routeId: route._id,
      ownerId: owner._id,
      documents: [
        { type: "insurance", number: `INS-${2000 + index}`, expiresOn: new Date(Date.now() + 120 * 86_400_000) },
        { type: "fitness", number: `FIT-${2000 + index}`, expiresOn: new Date(Date.now() + 20 * 86_400_000) },
      ],
    });

    const [firstStop, secondStop] = route.stops;
    await Student.create([
      {
        name: index === 0 ? "Aarav Deshmukh" : "Riya More",
        class: "5", section: "A", rollNo: `${index}01`,
        parentId: parent._id, vehicleId: vehicle._id, routeId: route._id,
        pickupStopId: firstStop._id, dropStopId: firstStop._id,
      },
      {
        name: index === 0 ? "Isha Deshmukh" : "Kabir More",
        class: "3", section: "B", rollNo: `${index}02`,
        parentId: parent._id, vehicleId: vehicle._id, routeId: route._id,
        pickupStopId: secondStop._id, dropStopId: secondStop._id,
      },
    ]);
  });

  console.log(`\n${spec.name}  —  school code ${school.code}`);
  console.log(`  School admin  ${mobile(1)} / school123`);
  console.log(`  Driver        ${mobile(2)} / driver123`);
  console.log(`  Attendant     ${mobile(3)} / staff123`);
  console.log(`  Parent        ${mobile(4)}  (school code ${school.code}, OTP 123456)`);
}

console.log(`
Platform accounts
  Super admin   9000000001 / admin123
  Fleet owner   9000000002 / owner123
`);

await disconnectDb();
