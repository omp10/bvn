import { Router } from "express";
import { audit } from "../../middleware/audit.js";
import { authenticate, requireActiveSchool, requirePermission, requireRole } from "../../middleware/auth.js";
import { badRequest, conflict, handler, isDuplicateKey, notFound } from "../../lib/errors.js";
import { idParam, objectId, paginationQuery, phone, validate, z } from "../../lib/validate.js";
import { requireContext } from "../../lib/context.js";
import { Student } from "../../models/student.model.js";
import { TransportRoute } from "../../models/route.model.js";
import { User } from "../../models/user.model.js";
import { Vehicle } from "../../models/vehicle.model.js";
import { allSchools } from "../../models/plugins/tenant.js";

export const studentRouter = Router();
studentRouter.use(authenticate, requireRole("school_admin"), requireActiveSchool);
// Reads need students:view; anything that changes data needs students:manage.
studentRouter.get("*", requirePermission("students:view"));
studentRouter.post("*", requirePermission("students:manage"));
studentRouter.patch("*", requirePermission("students:manage"));
studentRouter.delete("*", requirePermission("students:manage"));

studentRouter.get(
  "/",
  validate({
    query: paginationQuery.extend({
      class: z.string().trim().optional(),
      section: z.string().trim().optional(),
      vehicleId: objectId.optional(),
      routeId: objectId.optional(),
      q: z.string().trim().optional(),
      unassigned: z.coerce.boolean().optional(),
    }),
  }),
  handler(async (req, res) => {
    const q = req.query as never as {
      page: number; limit: number; class?: string; section?: string;
      vehicleId?: string; routeId?: string; q?: string; unassigned?: boolean;
    };

    const filter: Record<string, unknown> = { active: true };
    if (q.class) filter.class = q.class;
    if (q.section) filter.section = q.section;
    if (q.vehicleId) filter.vehicleId = q.vehicleId;
    if (q.routeId) filter.routeId = q.routeId;
    if (q.q) filter.name = new RegExp(q.q, "i");
    // Students with no bus never appear in the parent app — this is the list the
    // office works through at the start of term.
    if (q.unassigned) filter.vehicleId = null;

    const [items, total] = await Promise.all([
      Student.find(filter)
        .populate("vehicleId", "busNumber vehicleNumber")
        .populate("routeId", "name number stops")
        .populate("parentId", "name phone")
        .sort({ class: 1, section: 1, name: 1 })
        .skip((q.page - 1) * q.limit)
        .limit(q.limit)
        .lean(),
      Student.countDocuments(filter),
    ]);

    res.json({ items, total, page: q.page, limit: q.limit });
  })
);

studentRouter.post(
  "/",
  validate({
    body: z.object({
      name: z.string().trim().min(2),
      class: z.string().trim().optional(),
      section: z.string().trim().optional(),
      rollNo: z.string().trim().optional(),
      photoUrl: z.string().url().optional(),
      parent: z
        .object({
          name: z.string().trim().min(2),
          phone,
          email: z.string().email().optional(),
          relationship: z.string().trim().optional(),
        })
        .optional(),
    }),
  }),
  handler(async (req, res) => {
    const { parent, ...fields } = req.body;
    const schoolId = requireContext().schoolId;

    // Creating the parent alongside the student is what makes the child show up
    // in the parent app the moment they are enrolled.
    let parentId: unknown;
    if (parent) {
      const existing = await allSchools(User.findOne({ phone: parent.phone }));
      if (existing) {
        if (String(existing.schoolId) !== String(schoolId))
          throw conflict("that mobile number is registered at another school");
        if (existing.role !== "parent") throw conflict("that mobile number belongs to a staff account");
        parentId = existing._id;
      } else {
        parentId = (await User.create({ ...parent, role: "parent", schoolId }))._id;
      }
    }

    try {
      const student = await Student.create({ ...fields, parentId });
      await audit(req, "student.create", "Student", student._id);
      res.status(201).json(student);
    } catch (err) {
      if (isDuplicateKey(err)) throw conflict("that roll number already exists");
      throw err;
    }
  })
);

studentRouter.patch(
  "/:id",
  validate({
    params: idParam,
    body: z.object({
      name: z.string().trim().min(2).optional(),
      class: z.string().trim().optional(),
      section: z.string().trim().optional(),
      rollNo: z.string().trim().optional(),
      photoUrl: z.string().url().optional(),
      active: z.boolean().optional(),
    }),
  }),
  handler(async (req, res) => {
    const student = await Student.findOneAndUpdate({ _id: req.params.id }, req.body, { new: true });
    if (!student) throw notFound("student not found");
    await audit(req, "student.update", "Student", student._id);
    res.json(student);
  })
);

/**
 * Transport assignment. Separate from the profile edit because it has real
 * rules: the bus, the route and the stops all have to line up, and getting it
 * wrong means a child waits at a stop no bus visits.
 */
studentRouter.post(
  "/:id/transport",
  validate({
    params: idParam,
    body: z.object({
      vehicleId: objectId.nullable(),
      routeId: objectId.nullable(),
      pickupStopId: objectId.nullable().optional(),
      dropStopId: objectId.nullable().optional(),
    }),
  }),
  handler(async (req, res) => {
    const student = await Student.findOne({ _id: req.params.id });
    if (!student) throw notFound("student not found");

    const { vehicleId, routeId, pickupStopId, dropStopId } = req.body;

    if (vehicleId) {
      const vehicle = await Vehicle.findOne({ _id: vehicleId });
      if (!vehicle) throw badRequest("that bus does not belong to this school");

      // Refuse to overfill a bus — the seat count is a safety limit, not a hint.
      const seated = await Student.countDocuments({ vehicleId, _id: { $ne: student._id } });
      if (seated >= vehicle.capacity)
        throw badRequest(`${vehicle.busNumber ?? vehicle.vehicleNumber} is full (${vehicle.capacity} seats)`);
    }

    if (routeId) {
      const route = await TransportRoute.findOne({ _id: routeId });
      if (!route) throw badRequest("that route does not belong to this school");

      // Stops must exist on the chosen route, otherwise the parent app shows a
      // pickup point the bus never passes.
      const stopIds = new Set(route.stops.map((s) => String(s._id)));
      for (const [label, id] of [["pickup", pickupStopId], ["drop", dropStopId]] as const) {
        if (id && !stopIds.has(String(id))) throw badRequest(`${label} stop is not on that route`);
      }
    } else if (pickupStopId || dropStopId) {
      throw badRequest("choose a route before choosing stops");
    }

    Object.assign(student, { vehicleId, routeId, pickupStopId, dropStopId });
    await student.save();
    await audit(req, "student.transport", "Student", student._id, undefined, req.body);
    res.json(student);
  })
);

studentRouter.delete(
  "/:id",
  validate({ params: idParam }),
  handler(async (req, res) => {
    // Soft delete: attendance history for past trips must keep resolving.
    const student = await Student.findOneAndUpdate(
      { _id: req.params.id },
      { active: false, vehicleId: null, routeId: null },
      { new: true }
    );
    if (!student) throw notFound("student not found");
    await audit(req, "student.delete", "Student", student._id);
    res.json({ ok: true });
  })
);
