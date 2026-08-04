import { Router } from "express";
import { audit } from "../../middleware/audit.js";
import { authenticate, requireActiveSchool, requireRole } from "../../middleware/auth.js";
import { badRequest, handler, notFound } from "../../lib/errors.js";
import { requireContext } from "../../lib/context.js";
import { idParam, objectId, validate, z } from "../../lib/validate.js";
import { RouteChangeRequest, ROUTE_CHANGE_STATUSES } from "../../models/routeChangeRequest.model.js";
import { Student } from "../../models/student.model.js";
import { Vehicle } from "../../models/vehicle.model.js";
import { messages, notify } from "../notifications/notification.service.js";

export const routeChangeRouter = Router();
routeChangeRouter.use(authenticate, requireRole("school_admin"), requireActiveSchool);

routeChangeRouter.get(
  "/",
  validate({ query: z.object({ status: z.enum(ROUTE_CHANGE_STATUSES).default("pending") }) }),
  handler(async (req, res) => {
    const status = (req.query as never as { status: string }).status;
    res.json(
      await RouteChangeRequest.find({ status })
        .populate("studentId", "name class section")
        .populate("requestedBy", "name phone")
        .populate("currentRouteId requestedRouteId", "name number stops")
        .sort({ createdAt: 1 })
        .lean()
    );
  })
);

/**
 * Approving applies the change to the student record in the same step. A
 * two-step "approve, then remember to edit the student" is how a child ends up
 * waiting at a stop no bus visits.
 */
routeChangeRouter.post(
  "/:id/approve",
  validate({
    params: idParam,
    // The office may put the child on a different bus than the parent guessed at.
    body: z.object({ vehicleId: objectId.optional(), note: z.string().trim().optional() }),
  }),
  handler(async (req, res) => {
    const request = await RouteChangeRequest.findOne({ _id: req.params.id, status: "pending" });
    if (!request) throw badRequest("this request has already been reviewed");

    const student = await Student.findOne({ _id: request.studentId });
    if (!student) throw notFound("student not found");

    if (req.body.vehicleId) {
      const vehicle = await Vehicle.findOne({ _id: req.body.vehicleId });
      if (!vehicle) throw badRequest("that bus does not belong to this school");

      const seated = await Student.countDocuments({ vehicleId: vehicle._id, _id: { $ne: student._id } });
      if (seated >= vehicle.capacity) throw badRequest("that bus is full");
      student.vehicleId = vehicle._id;
    }

    student.routeId = request.requestedRouteId;
    student.pickupStopId = request.requestedPickupStopId ?? undefined;
    student.dropStopId = request.requestedDropStopId ?? undefined;
    await student.save();

    request.status = "approved";
    request.reviewedBy = requireContext().userId as never;
    request.reviewedAt = new Date();
    request.reviewNote = req.body.note;
    await request.save();

    await notify({
      userIds: [request.requestedBy],
      ...messages.routeChanged(student.name),
      type: "route_changed",
      data: { studentId: String(student._id) },
      schoolId: requireContext().schoolId,
    });

    await audit(req, "routeChange.approve", "RouteChangeRequest", request._id);
    res.json(request);
  })
);

routeChangeRouter.post(
  "/:id/reject",
  validate({ params: idParam, body: z.object({ note: z.string().trim().min(1) }) }),
  handler(async (req, res) => {
    const request = await RouteChangeRequest.findOneAndUpdate(
      { _id: req.params.id, status: "pending" },
      {
        status: "rejected",
        reviewedBy: requireContext().userId,
        reviewedAt: new Date(),
        reviewNote: req.body.note,
      },
      { new: true }
    );
    if (!request) throw badRequest("this request has already been reviewed");

    await notify({
      userIds: [request.requestedBy],
      type: "route_changed",
      title: "Route change not approved",
      body: req.body.note,
      data: { requestId: String(request._id) },
      schoolId: requireContext().schoolId,
    });

    await audit(req, "routeChange.reject", "RouteChangeRequest", request._id);
    res.json(request);
  })
);
