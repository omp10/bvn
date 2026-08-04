import { Router } from "express";
import { audit } from "../../middleware/audit.js";
import { authenticate, requireRole } from "../../middleware/auth.js";
import { conflict, handler, notFound } from "../../lib/errors.js";
import { hashPassword } from "../../lib/password.js";
import { idParam, paginationQuery, password, phone, validate, z } from "../../lib/validate.js";
import { User, USER_STATUSES } from "../../models/user.model.js";
import { Vehicle } from "../../models/vehicle.model.js";
import { allSchools } from "../../models/plugins/tenant.js";

/**
 * Fleet-owner registration and approval (FRD 10.1).
 *
 * Owners belong to no school, so every read here is an explicit cross-school
 * one narrowed by role.
 */
export const ownerAdminRouter = Router();
ownerAdminRouter.use(authenticate, requireRole("super_admin"));

ownerAdminRouter.get(
  "/",
  validate({ query: paginationQuery.extend({ q: z.string().trim().optional() }) }),
  handler(async (req, res) => {
    const { page, limit, q } = req.query as never as { page: number; limit: number; q?: string };
    const filter: Record<string, unknown> = { role: "owner" };
    if (q) filter.$or = [{ name: new RegExp(q, "i") }, { companyName: new RegExp(q, "i") }, { phone: new RegExp(q) }];

    const [owners, total] = await Promise.all([
      allSchools(User.find(filter)).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      allSchools(User.find(filter)).countDocuments(),
    ]);

    // Fleet size per owner, in one query rather than one per row.
    const vehicles = await allSchools(Vehicle.find({ ownerId: { $in: owners.map((o) => o._id) } }))
      .select("ownerId status")
      .lean();

    res.json({
      items: owners.map((owner) => {
        const mine = vehicles.filter((v) => String(v.ownerId) === String(owner._id));
        return {
          ...owner,
          vehicleCount: mine.length,
          availableCount: mine.filter((v) => v.status === "available").length,
        };
      }),
      total,
      page,
      limit,
    });
  })
);

ownerAdminRouter.post(
  "/",
  validate({
    body: z.object({
      name: z.string().trim().min(2),
      companyName: z.string().trim().optional(),
      phone,
      email: z.string().email().optional(),
      password,
      address: z.string().trim().optional(),
      gstNumber: z.string().trim().optional(),
      panNumber: z.string().trim().optional(),
      aadhaar: z.string().trim().length(12).optional(),
    }),
  }),
  handler(async (req, res) => {
    if (await allSchools(User.findOne({ phone: req.body.phone })))
      throw conflict("that mobile number is already registered");

    const { password: plain, ...rest } = req.body;
    // No schoolId: an owner serves many schools, or none yet.
    const owner = await User.create({ ...rest, role: "owner", passwordHash: await hashPassword(plain) });

    await audit(req, "owner.create", "User", owner._id);
    res.status(201).json(owner);
  })
);

ownerAdminRouter.get(
  "/:id",
  validate({ params: idParam }),
  handler(async (req, res) => {
    const owner = await allSchools(User.findOne({ _id: req.params.id, role: "owner" })).lean();
    if (!owner) throw notFound("owner not found");

    const vehicles = await allSchools(Vehicle.find({ ownerId: owner._id }))
      .populate("schoolId", "name code city")
      .lean();
    const drivers = await allSchools(User.find({ ownerId: owner._id, role: "driver" })).lean();

    res.json({ owner, vehicles, drivers });
  })
);

ownerAdminRouter.patch(
  "/:id",
  validate({
    params: idParam,
    body: z.object({
      name: z.string().trim().min(2).optional(),
      companyName: z.string().trim().optional(),
      email: z.string().email().optional(),
      address: z.string().trim().optional(),
      gstNumber: z.string().trim().optional(),
      status: z.enum(USER_STATUSES).optional(),
    }),
  }),
  handler(async (req, res) => {
    const owner = await allSchools(
      User.findOneAndUpdate({ _id: req.params.id, role: "owner" }, req.body, { new: true })
    );
    if (!owner) throw notFound("owner not found");

    // Suspending an owner also signs them out everywhere.
    if (req.body.status === "inactive") {
      await allSchools(User.updateOne({ _id: owner._id }, { sessions: [] }));
    }

    await audit(req, "owner.update", "User", owner._id);
    res.json(owner);
  })
);
