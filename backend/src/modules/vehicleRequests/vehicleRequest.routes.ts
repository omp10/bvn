import { Router } from "express";
import { audit } from "../../middleware/audit.js";
import { authenticate, requireActiveSchool, requireRole } from "../../middleware/auth.js";
import { badRequest, handler, notFound } from "../../lib/errors.js";
import { requireContext } from "../../lib/context.js";
import { idParam, objectId, paginationQuery, validate, z } from "../../lib/validate.js";
import { School } from "../../models/school.model.js";
import { User } from "../../models/user.model.js";
import { Vehicle } from "../../models/vehicle.model.js";
import { VehicleRequest, REQUEST_STATUSES } from "../../models/vehicleRequest.model.js";
import { allSchools, anySchool } from "../../models/plugins/tenant.js";
import { notify } from "../notifications/notification.service.js";

/* ── School side: ask for more buses ────────────────────────────────── */
export const schoolVehicleRequestRouter = Router();
schoolVehicleRequestRouter.use(authenticate, requireRole("school_admin"), requireActiveSchool);

schoolVehicleRequestRouter.get(
  "/",
  handler(async (_req, res) => {
    res.json(
      await VehicleRequest.find()
        .populate("routeId", "name number")
        .populate("assignedVehicleIds", "vehicleNumber capacity")
        .sort({ createdAt: -1 })
        .lean()
    );
  })
);

schoolVehicleRequestRouter.post(
  "/",
  validate({
    body: z.object({
      seatingCapacity: z.number().int().min(1).max(100),
      vehicleCount: z.number().int().min(1).max(20).default(1),
      routeId: objectId.optional(),
      startsOn: z.coerce.date().optional(),
      endsOn: z.coerce.date().optional(),
      specialRequirements: z.string().trim().max(500).optional(),
    }),
  }),
  handler(async (req, res) => {
    if (req.body.startsOn && req.body.endsOn && req.body.endsOn <= req.body.startsOn)
      throw badRequest("the end date must be after the start date");

    const request = await VehicleRequest.create({
      ...req.body,
      requestedBy: requireContext().userId,
    });
    await audit(req, "vehicleRequest.create", "VehicleRequest", request._id);
    res.status(201).json(request);
  })
);

schoolVehicleRequestRouter.post(
  "/:id/cancel",
  validate({ params: idParam }),
  handler(async (req, res) => {
    // Only before vehicles are committed — after that it is a conversation.
    const request = await VehicleRequest.findOneAndUpdate(
      { _id: req.params.id, status: { $in: ["pending", "approved"] } },
      { status: "cancelled" },
      { new: true }
    );
    if (!request) throw badRequest("this request can no longer be cancelled");
    await audit(req, "vehicleRequest.cancel", "VehicleRequest", request._id);
    res.json(request);
  })
);

/* ── Platform side: review and assign ───────────────────────────────── */
export const adminVehicleRequestRouter = Router();
adminVehicleRequestRouter.use(authenticate, requireRole("super_admin"));

adminVehicleRequestRouter.get(
  "/",
  validate({ query: paginationQuery.extend({ status: z.enum(REQUEST_STATUSES).optional() }) }),
  handler(async (req, res) => {
    const { page, limit, status } = req.query as never as {
      page: number; limit: number; status?: string;
    };
    const filter = status ? { status } : {};

    const [items, total] = await Promise.all([
      allSchools(VehicleRequest.find(filter))
        .populate("schoolId", "name code city")
        .populate(anySchool("assignedVehicleIds", "vehicleNumber capacity"))
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      allSchools(VehicleRequest.find(filter)).countDocuments(),
    ]);
    res.json({ items, total, page, limit });
  })
);

/** The pool a request can be filled from. */
adminVehicleRequestRouter.get(
  "/:id/candidates",
  validate({ params: idParam }),
  handler(async (req, res) => {
    const request = await allSchools(VehicleRequest.findById(req.params.id));
    if (!request) throw notFound("request not found");

    res.json(
      await allSchools(
        Vehicle.find({
          schoolId: null,
          status: "available",
          capacity: { $gte: request.seatingCapacity },
        })
      )
        .populate(anySchool("ownerId", "name companyName phone"))
        .sort({ capacity: 1 })
        .lean()
    );
  })
);

/**
 * Assign vehicles to the requesting school. This is the moment an owner's
 * vehicle becomes part of a school's fleet, so it sets the tenant on the
 * vehicle and pulls its driver into the same school.
 */
adminVehicleRequestRouter.post(
  "/:id/assign",
  validate({ params: idParam, body: z.object({ vehicleIds: z.array(objectId).min(1), note: z.string().optional() }) }),
  handler(async (req, res) => {
    const request = await allSchools(VehicleRequest.findById(req.params.id));
    if (!request) throw notFound("request not found");
    if (!["pending", "approved"].includes(request.status))
      throw badRequest(`this request is already ${request.status}`);
    if (req.body.vehicleIds.length > request.vehicleCount)
      throw badRequest(`this request is for ${request.vehicleCount} vehicle(s)`);

    const school = await School.findById(request.schoolId);
    if (!school) throw notFound("school not found");

    // Claim each vehicle conditionally, so two admins working the queue at once
    // cannot hand the same bus to two schools.
    const claimed: string[] = [];
    for (const vehicleId of req.body.vehicleIds) {
      const vehicle = await allSchools(
        Vehicle.findOneAndUpdate(
          { _id: vehicleId, schoolId: null, status: "available" },
          {
            schoolId: request.schoolId,
            status: "assigned",
            assignedAt: new Date(),
            assignmentEndsAt: request.endsOn,
            routeId: request.routeId,
          },
          { new: true }
        )
      );
      if (!vehicle) continue; // taken by someone else in the meantime

      claimed.push(String(vehicle._id));

      // The driver follows the vehicle, otherwise they cannot sign in and see it.
      if (vehicle.driverId) {
        await allSchools(User.updateOne({ _id: vehicle.driverId }, { schoolId: request.schoolId }));
      }
    }

    if (!claimed.length) throw badRequest("none of those vehicles are still available");

    request.assignedVehicleIds = claimed as never;
    request.status = claimed.length >= request.vehicleCount ? "assigned" : "approved";
    request.reviewedBy = requireContext().userId as never;
    request.reviewedAt = new Date();
    request.reviewNote = req.body.note;
    await request.save();

    // Both sides of the deal get told.
    const vehicles = await allSchools(Vehicle.find({ _id: { $in: claimed } })).select("ownerId vehicleNumber").lean();
    const ownerIds = [...new Set(vehicles.map((v) => v.ownerId).filter(Boolean).map(String))];
    const admins = await allSchools(User.find({ schoolId: request.schoolId, role: "school_admin" })).select("_id").lean();

    await notify({
      userIds: ownerIds,
      type: "announcement",
      title: "Vehicle assigned",
      body: `${claimed.length} of your vehicle(s) have been assigned to ${school.name}.`,
      data: { requestId: String(request._id) },
    });
    await notify({
      userIds: admins.map((a) => a._id),
      type: "announcement",
      title: "Buses assigned",
      body: `${claimed.length} vehicle(s) have been added to your fleet.`,
      data: { requestId: String(request._id) },
      schoolId: request.schoolId,
    });

    await audit(req, "vehicleRequest.assign", "VehicleRequest", request._id, undefined, { claimed });
    res.json(request);
  })
);

adminVehicleRequestRouter.post(
  "/:id/reject",
  validate({ params: idParam, body: z.object({ note: z.string().trim().min(1) }) }),
  handler(async (req, res) => {
    const request = await allSchools(
      VehicleRequest.findOneAndUpdate(
        { _id: req.params.id, status: "pending" },
        {
          status: "rejected",
          reviewedBy: requireContext().userId,
          reviewedAt: new Date(),
          reviewNote: req.body.note,
        },
        { new: true }
      )
    );
    if (!request) throw badRequest("only a pending request can be rejected");
    await audit(req, "vehicleRequest.reject", "VehicleRequest", request._id);
    res.json(request);
  })
);

/** Release an assignment when the term or contract ends. */
adminVehicleRequestRouter.post(
  "/:id/complete",
  validate({ params: idParam }),
  handler(async (req, res) => {
    const request = await allSchools(VehicleRequest.findById(req.params.id));
    if (!request) throw notFound("request not found");

    const running = await allSchools(
      Vehicle.find({ _id: { $in: request.assignedVehicleIds }, status: "running" })
    ).countDocuments();
    if (running) throw badRequest("one of these vehicles is on a trip");

    await allSchools(
      Vehicle.updateMany(
        { _id: { $in: request.assignedVehicleIds } },
        { schoolId: null, status: "available", busNumber: null, routeId: null, assignedAt: null }
      )
    );

    request.status = "completed";
    await request.save();
    await audit(req, "vehicleRequest.complete", "VehicleRequest", request._id);
    res.json(request);
  })
);

/* ── Owner side: what has been assigned to them ─────────────────────── */
export const ownerAssignmentRouter = Router();
ownerAssignmentRouter.use(authenticate, requireRole("owner"));

ownerAssignmentRouter.get(
  "/",
  handler(async (_req, res) => {
    const ownerId = requireContext().userId;
    const vehicles = await allSchools(Vehicle.find({ ownerId, schoolId: { $ne: null } }))
      .populate("schoolId", "name code city phone")
      .select("vehicleNumber busNumber capacity status schoolId assignedAt assignmentEndsAt")
      .lean();
    res.json(vehicles);
  })
);
