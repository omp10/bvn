import { Router } from "express";
import { authenticate } from "../../middleware/auth.js";
import { handler } from "../../lib/errors.js";
import { requireContext } from "../../lib/context.js";
import { Invoice } from "../../models/invoice.model.js";
import { School } from "../../models/school.model.js";
import { Student } from "../../models/student.model.js";
import { Trip } from "../../models/trip.model.js";
import { User } from "../../models/user.model.js";
import { Vehicle } from "../../models/vehicle.model.js";
import { VehicleRequest } from "../../models/vehicleRequest.model.js";
import { RouteChangeRequest } from "../../models/routeChangeRequest.model.js";
import { Emergency } from "../../models/emergency.model.js";
import { Attendance } from "../../models/attendance.model.js";
import { allSchools } from "../../models/plugins/tenant.js";
import { todayKey } from "../trips/trip.service.js";

/**
 * One endpoint, one shape per role. A dashboard is the first screen every user
 * sees, so it answers in a single request rather than eight.
 */
export const dashboardRouter = Router();
dashboardRouter.use(authenticate);

dashboardRouter.get(
  "/",
  handler(async (_req, res) => {
    const ctx = requireContext();
    switch (ctx.role) {
      case "super_admin":
        return res.json(await superAdminDashboard());
      case "school_admin":
        return res.json(await schoolDashboard());
      case "owner":
        return res.json(await ownerDashboard(ctx.userId));
      case "driver":
        return res.json(await driverDashboard(ctx.userId));
      case "staff":
        return res.json(await staffDashboard(ctx.userId));
      case "parent":
        return res.json(await parentDashboard(ctx.userId));
    }
  })
);

async function superAdminDashboard() {
  const [schools, active, trial, expired, parents, vehicles, running, requests, owners, revenue] =
    await Promise.all([
      School.countDocuments(),
      School.countDocuments({ status: "active" }),
      School.countDocuments({ status: "trial" }),
      School.countDocuments({ status: { $in: ["expired", "suspended"] } }),
      allSchools(User.find({ role: "parent" })).countDocuments(),
      allSchools(Vehicle.find()).countDocuments(),
      allSchools(Trip.find({ status: "running" })).countDocuments(),
      allSchools(VehicleRequest.find({ status: "pending" })).countDocuments(),
      allSchools(User.find({ role: "owner" })).countDocuments(),
      allSchools(Invoice.find({ status: "paid" })).select("amountInPaise").lean(),
    ]);

  return {
    schools: { total: schools, active, trial, expired },
    parents,
    vehicles,
    runningTrips: running,
    pendingVehicleRequests: requests,
    fleetOwners: owners,
    // Paise everywhere, converted once at the edge for display.
    revenueInPaise: revenue.reduce((sum, i) => sum + (i.amountInPaise ?? 0), 0),
  };
}

async function schoolDashboard() {
  const today = todayKey();
  const [vehicles, students, drivers, trips, routeRequests, emergencies] = await Promise.all([
    Vehicle.countDocuments(),
    Student.countDocuments({ active: true }),
    User.countDocuments({ role: "driver", status: { $ne: "inactive" } }),
    Trip.find({ tripDate: today }).select("status stats").lean(),
    RouteChangeRequest.countDocuments({ status: "pending" }),
    Emergency.countDocuments({ status: "open" }),
  ]);

  const unassigned = await Student.countDocuments({ active: true, vehicleId: null });

  return {
    vehicles,
    students,
    studentsWithoutBus: unassigned,
    drivers,
    todaysTrips: trips.length,
    runningTrips: trips.filter((t) => t.status === "running").length,
    pickedUp: trips.reduce((n, t) => n + (t.stats?.pickedUp ?? 0), 0),
    dropped: trips.reduce((n, t) => n + (t.stats?.dropped ?? 0), 0),
    absent: trips.reduce((n, t) => n + (t.stats?.absent ?? 0), 0),
    pendingRouteRequests: routeRequests,
    openEmergencies: emergencies,
  };
}

async function ownerDashboard(ownerId: string) {
  const vehicles = await allSchools(Vehicle.find({ ownerId })).lean();
  const soon = new Date(Date.now() + 30 * 86_400_000);
  return {
    total: vehicles.length,
    available: vehicles.filter((v) => v.status === "available").length,
    assigned: vehicles.filter((v) => v.status === "assigned").length,
    running: vehicles.filter((v) => v.status === "running").length,
    maintenance: vehicles.filter((v) => v.status === "maintenance").length,
    maintenanceDue: vehicles.filter((v) => v.nextMaintenanceDueAt && v.nextMaintenanceDueAt <= soon).length,
    drivers: await allSchools(User.find({ ownerId, role: "driver" })).countDocuments(),
  };
}

async function driverDashboard(driverId: string) {
  const vehicle = await Vehicle.findOne({ driverId })
    .populate("routeId", "name stops")
    .select("busNumber vehicleNumber routeId status")
    .lean();
  if (!vehicle) return { assigned: false };

  const [trip, students] = await Promise.all([
    Trip.findOne({ vehicleId: vehicle._id, status: "running" }).lean(),
    Student.countDocuments({ vehicleId: vehicle._id, active: true }),
  ]);

  return {
    assigned: true,
    vehicle,
    students,
    trip,
    tripStatus: trip ? "running" : "not_started",
  };
}

async function staffDashboard(staffId: string) {
  const vehicle = await Vehicle.findOne({ attendantId: staffId }).select("busNumber vehicleNumber").lean();
  if (!vehicle) return { assigned: false };

  const trip = await Trip.findOne({ vehicleId: vehicle._id, status: "running" }).lean();
  const [students, marked] = await Promise.all([
    Student.countDocuments({ vehicleId: vehicle._id, active: true }),
    trip ? Attendance.countDocuments({ tripId: trip._id }) : 0,
  ]);

  return { assigned: true, vehicle, trip, students, marked, remaining: Math.max(0, students - marked) };
}

async function parentDashboard(parentId: string) {
  const children = await Student.find({ parentId, active: true })
    .populate("vehicleId", "busNumber vehicleNumber")
    .lean();

  const vehicleIds = children.map((c) => c.vehicleId).filter(Boolean);
  const trips = await Trip.find({ vehicleId: { $in: vehicleIds }, status: "running" }).lean();

  return {
    children: children.map((child) => {
      const trip = trips.find((t) => String(t.vehicleId) === String(child.vehicleId?._id ?? child.vehicleId));
      return {
        id: child._id,
        name: child.name,
        bus: child.vehicleId ?? null,
        tripStatus: trip ? "running" : child.vehicleId ? "not_started" : "no_bus",
        position: trip?.lastPosition ?? null,
        tripId: trip?._id ?? null,
      };
    }),
  };
}
