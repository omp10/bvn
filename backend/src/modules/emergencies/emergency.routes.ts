import { Router } from "express";
import { audit } from "../../middleware/audit.js";
import { authenticate, requireActiveSchool, requireRole } from "../../middleware/auth.js";
import { handler, isDuplicateKey, notFound } from "../../lib/errors.js";
import { requireContext } from "../../lib/context.js";
import { idParam, objectId, validate, z } from "../../lib/validate.js";
import { Emergency, EMERGENCY_TYPES } from "../../models/emergency.model.js";
import { Student } from "../../models/student.model.js";
import { Trip } from "../../models/trip.model.js";
import { User } from "../../models/user.model.js";
import { Vehicle } from "../../models/vehicle.model.js";
import { allSchools } from "../../models/plugins/tenant.js";
import { emitToSchool, emitToTrip } from "../../realtime/socket.js";
import { messages, notify } from "../notifications/notification.service.js";

/* ── Raising an alert: drivers and attendants ───────────────────────── */
export const emergencyRouter = Router();
emergencyRouter.use(authenticate, requireRole("driver", "staff"), requireActiveSchool);

/**
 * Raise an emergency.
 *
 * Idempotent on a client-supplied key rather than on state: unlike Start Trip,
 * a second breakdown on the same trip is a real second event, so the app sends
 * a fresh key per press of the button and reuses it across retries.
 */
emergencyRouter.post(
  "/",
  validate({
    body: z.object({
      idempotencyKey: z.string().min(8).max(64),
      type: z.enum(EMERGENCY_TYPES),
      tripId: objectId.optional(),
      note: z.string().trim().max(500).optional(),
      lat: z.number().min(-90).max(90).optional(),
      lng: z.number().min(-180).max(180).optional(),
    }),
  }),
  handler(async (req, res) => {
    const ctx = requireContext();
    const trip = req.body.tripId ? await Trip.findOne({ _id: req.body.tripId }) : null;
    const vehicleId =
      trip?.vehicleId ??
      (await Vehicle.findOne({
        $or: [{ driverId: ctx.userId }, { attendantId: ctx.userId }],
      }).select("_id"))?._id;

    let emergency;
    try {
      emergency = await Emergency.create({ ...req.body, vehicleId, raisedBy: ctx.userId });
    } catch (err) {
      if (!isDuplicateKey(err)) throw err;
      // A retry of the same press — return the alert already raised.
      return res.json(await Emergency.findOne({ idempotencyKey: req.body.idempotencyKey }));
    }

    const vehicle = vehicleId ? await Vehicle.findById(vehicleId).select("busNumber vehicleNumber").lean() : null;
    const label = vehicle?.busNumber ?? vehicle?.vehicleNumber ?? "a bus";

    // School staff, the platform, and every affected parent — all at once.
    const [admins, students, superAdmins] = await Promise.all([
      User.find({ role: "school_admin" }).select("_id").lean(),
      vehicleId ? Student.find({ vehicleId, active: true }).select("parentId").lean() : [],
      allSchools(User.find({ role: "super_admin" })).select("_id").lean(),
    ]);

    await notify({
      userIds: [
        ...admins.map((a) => a._id),
        ...students.map((s) => s.parentId),
        ...superAdmins.map((s) => s._id),
      ],
      ...messages.emergency(req.body.type, label),
      type: "emergency",
      data: { emergencyId: String(emergency._id), tripId: req.body.tripId ?? null },
      schoolId: ctx.schoolId,
    });

    emitToSchool(ctx.schoolId!, "emergency:raised", emergency);
    if (req.body.tripId) emitToTrip(req.body.tripId, "emergency:raised", emergency);

    await audit(req, "emergency.raise", "Emergency", emergency._id);
    res.status(201).json(emergency);
  })
);

emergencyRouter.get(
  "/mine",
  handler(async (_req, res) => {
    res.json(
      await Emergency.find({ raisedBy: requireContext().userId }).sort({ createdAt: -1 }).limit(20).lean()
    );
  })
);

/* ── Handling alerts: the school office ─────────────────────────────── */
export const emergencyAdminRouter = Router();
emergencyAdminRouter.use(authenticate, requireRole("school_admin"), requireActiveSchool);

emergencyAdminRouter.get(
  "/",
  validate({ query: z.object({ status: z.enum(["open", "acknowledged", "resolved"]).optional() }) }),
  handler(async (req, res) => {
    const status = (req.query as { status?: string }).status;
    res.json(
      await Emergency.find(status ? { status } : {})
        .populate("raisedBy", "name phone role")
        .populate("vehicleId", "busNumber vehicleNumber")
        .sort({ createdAt: -1 })
        .limit(100)
        .lean()
    );
  })
);

emergencyAdminRouter.post(
  "/:id/acknowledge",
  validate({ params: idParam }),
  handler(async (req, res) => {
    const emergency = await Emergency.findOneAndUpdate(
      { _id: req.params.id, status: "open" },
      { status: "acknowledged", acknowledgedBy: requireContext().userId, acknowledgedAt: new Date() },
      { new: true }
    );
    if (!emergency) throw notFound("no open alert with that id");
    await audit(req, "emergency.acknowledge", "Emergency", emergency._id);
    res.json(emergency);
  })
);

emergencyAdminRouter.post(
  "/:id/resolve",
  validate({ params: idParam, body: z.object({ note: z.string().trim().min(1) }) }),
  handler(async (req, res) => {
    const emergency = await Emergency.findOneAndUpdate(
      { _id: req.params.id, status: { $ne: "resolved" } },
      { status: "resolved", resolvedAt: new Date(), resolutionNote: req.body.note },
      { new: true }
    );
    if (!emergency) throw notFound("no open alert with that id");
    await audit(req, "emergency.resolve", "Emergency", emergency._id);
    res.json(emergency);
  })
);
