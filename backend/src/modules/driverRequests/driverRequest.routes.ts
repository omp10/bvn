import { Router } from "express";
import { audit } from "../../middleware/audit.js";
import { authenticate, requireActiveSchool, requireRole } from "../../middleware/auth.js";
import { badRequest, handler, notFound } from "../../lib/errors.js";
import { requireContext } from "../../lib/context.js";
import { idParam, objectId, paginationQuery, validate, z } from "../../lib/validate.js";
import { DriverRequest, DRIVER_REQUEST_STATUSES } from "../../models/driverRequest.model.js";
import { School } from "../../models/school.model.js";
import { User } from "../../models/user.model.js";
import { allSchools, anySchool } from "../../models/plugins/tenant.js";
import { notify } from "../notifications/notification.service.js";

/* ── School side: ask the platform for drivers ──────────────────────── */

export const schoolDriverRequestRouter = Router();
schoolDriverRequestRouter.use(authenticate, requireRole("school_admin"), requireActiveSchool);

schoolDriverRequestRouter.get(
  "/",
  handler(async (_req, res) => {
    res.json(
      await DriverRequest.find()
        .populate("vehicleId", "busNumber vehicleNumber")
        .populate(anySchool("assignedDriverIds", "name phone licenseNumber experienceYears"))
        .sort({ createdAt: -1 })
        .lean()
    );
  })
);

schoolDriverRequestRouter.post(
  "/",
  validate({
    body: z.object({
      driverCount: z.number().int().min(1).max(20).default(1),
      minExperienceYears: z.number().int().min(0).max(40).default(0),
      vehicleId: objectId.optional(),
      neededFrom: z.coerce.date().optional(),
      note: z.string().trim().max(400).optional(),
    }),
  }),
  handler(async (req, res) => {
    const request = await DriverRequest.create({
      ...req.body,
      requestedBy: requireContext().userId,
    });

    const admins = await allSchools(User.find({ role: "super_admin" })).select("_id").lean();
    const school = await School.findById(requireContext().schoolId).select("name").lean();
    await notify({
      userIds: admins.map((a) => a._id),
      type: "announcement",
      title: "Driver request",
      body: `${school?.name ?? "A school"} needs ${req.body.driverCount} driver(s).`,
      data: { driverRequestId: String(request._id) },
    });

    await audit(req, "driverRequest.create", "DriverRequest", request._id);
    res.status(201).json(request);
  })
);

schoolDriverRequestRouter.post(
  "/:id/cancel",
  validate({ params: idParam }),
  handler(async (req, res) => {
    const request = await DriverRequest.findOneAndUpdate(
      { _id: req.params.id, status: "pending" },
      { status: "cancelled" },
      { new: true }
    );
    if (!request) throw badRequest("this request can no longer be cancelled");
    res.json(request);
  })
);

/* ── Platform side: fill it from the pool ───────────────────────────── */

export const adminDriverRequestRouter = Router();
adminDriverRequestRouter.use(authenticate, requireRole("super_admin"));

adminDriverRequestRouter.get(
  "/",
  validate({ query: paginationQuery.extend({ status: z.enum(DRIVER_REQUEST_STATUSES).optional() }) }),
  handler(async (req, res) => {
    const { page, limit, status } = req.query as never as {
      page: number; limit: number; status?: string;
    };
    const filter = status ? { status } : {};

    const [items, total] = await Promise.all([
      allSchools(DriverRequest.find(filter))
        .populate("schoolId", "name code city")
        .populate(anySchool("assignedDriverIds", "name phone"))
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      allSchools(DriverRequest.find(filter)).countDocuments(),
    ]);
    res.json({ items, total, page, limit });
  })
);

/** Approved drivers who belong to no school yet. */
adminDriverRequestRouter.get(
  "/:id/candidates",
  validate({ params: idParam }),
  handler(async (req, res) => {
    const request = await allSchools(DriverRequest.findById(req.params.id));
    if (!request) throw notFound("request not found");

    const candidates = await allSchools(
      User.find({
        role: "driver",
        status: { $ne: "inactive" },
        schoolId: null,
        // An expired licence is not a candidate, whatever the school asked for.
        licenseExpiry: { $gt: new Date() },
        ...(request.minExperienceYears
          ? { experienceYears: { $gte: request.minExperienceYears } }
          : {}),
      })
    )
      .select("name phone licenseNumber licenseExpiry experienceYears ownerId")
      .sort({ experienceYears: -1 })
      .lean();

    res.json(candidates);
  })
);

adminDriverRequestRouter.post(
  "/:id/assign",
  validate({
    params: idParam,
    body: z.object({ driverIds: z.array(objectId).min(1), note: z.string().trim().optional() }),
  }),
  handler(async (req, res) => {
    const request = await allSchools(DriverRequest.findById(req.params.id));
    if (!request) throw notFound("request not found");
    if (request.status !== "pending") throw badRequest(`this request is already ${request.status}`);
    if (req.body.driverIds.length > request.driverCount)
      throw badRequest(`this request is for ${request.driverCount} driver(s)`);

    const school = await School.findById(request.schoolId);
    if (!school) throw notFound("school not found");

    // Claim each driver conditionally, so two admins working the queue cannot
    // hand the same person to two schools.
    const claimed: string[] = [];
    for (const driverId of req.body.driverIds) {
      const driver = await allSchools(
        User.findOneAndUpdate(
          { _id: driverId, role: "driver", schoolId: null },
          { schoolId: request.schoolId, status: "active" },
          { new: true }
        )
      );
      if (!driver) continue; // taken in the meantime
      claimed.push(String(driver._id));

      await notify({
        userIds: [driver._id],
        type: "announcement",
        title: "You have been placed with a school",
        body: `You are now driving for ${school.name}. Sign in to see your bus.`,
        schoolId: request.schoolId,
      });
    }

    if (!claimed.length) throw badRequest("none of those drivers are still available");

    request.assignedDriverIds = claimed as never;
    request.status = claimed.length >= request.driverCount ? "assigned" : "pending";
    request.reviewedBy = requireContext().userId as never;
    request.reviewedAt = new Date();
    request.reviewNote = req.body.note;
    await request.save();

    const admins = await allSchools(
      User.find({ schoolId: request.schoolId, role: "school_admin" })
    ).select("_id").lean();
    await notify({
      userIds: admins.map((a) => a._id),
      type: "announcement",
      title: "Drivers assigned",
      body: `${claimed.length} driver(s) have been added to your school. Assign them to a bus.`,
      schoolId: request.schoolId,
    });

    await audit(req, "driverRequest.assign", "DriverRequest", request._id, undefined, { claimed });
    res.json(request);
  })
);

adminDriverRequestRouter.post(
  "/:id/reject",
  validate({ params: idParam, body: z.object({ note: z.string().trim().min(1) }) }),
  handler(async (req, res) => {
    const request = await allSchools(
      DriverRequest.findOneAndUpdate(
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
    res.json(request);
  })
);
