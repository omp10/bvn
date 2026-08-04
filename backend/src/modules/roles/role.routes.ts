import { Router } from "express";
import { audit } from "../../middleware/audit.js";
import { authenticate, requireActiveSchool, requirePermission, requireRole } from "../../middleware/auth.js";
import { badRequest, conflict, handler, isDuplicateKey, notFound } from "../../lib/errors.js";
import { hashPassword } from "../../lib/password.js";
import { requireContext } from "../../lib/context.js";
import { idParam, objectId, paginationQuery, password, phone, validate, z } from "../../lib/validate.js";
import { ALL_PERMISSIONS, PERMISSION_MODULES, READ_ONLY_PRESET, expandPermissions } from "../../lib/permissions.js";
import { AuditLog } from "../../models/auditLog.model.js";
import { Role } from "../../models/role.model.js";
import { User, USER_STATUSES } from "../../models/user.model.js";
import { allSchools } from "../../models/plugins/tenant.js";

export const roleRouter = Router();
roleRouter.use(authenticate, requireRole("school_admin"), requireActiveSchool);
roleRouter.get("*", requirePermission("roles:view"));
roleRouter.post("*", requirePermission("roles:manage"));
roleRouter.patch("*", requirePermission("roles:manage"));
roleRouter.delete("*", requirePermission("roles:manage"));

/** The catalogue the role editor renders from. */
roleRouter.get(
  "/permissions",
  handler(async (_req, res) => {
    res.json({ modules: PERMISSION_MODULES, all: ALL_PERMISSIONS, readOnlyPreset: READ_ONLY_PRESET });
  })
);

roleRouter.get(
  "/",
  handler(async (_req, res) => {
    const roles = await Role.find().sort({ name: 1 }).lean();
    // How many people are on each role — nobody should delete a role blind.
    const counts = await User.aggregate([
      { $match: { roleId: { $ne: null } } },
      { $group: { _id: "$roleId", count: { $sum: 1 } } },
    ]);
    const byRole = new Map(counts.map((c: { _id: unknown; count: number }) => [String(c._id), c.count]));

    res.json(roles.map((role) => ({ ...role, userCount: byRole.get(String(role._id)) ?? 0 })));
  })
);

const roleBody = z.object({
  name: z.string().trim().min(2).max(40),
  description: z.string().trim().max(200).optional(),
  permissions: z.array(z.string()).default([]),
});

roleRouter.post(
  "/",
  validate({ body: roleBody }),
  handler(async (req, res) => {
    const unknown = req.body.permissions.filter((p: string) => !ALL_PERMISSIONS.includes(p));
    if (unknown.length) throw badRequest(`unknown permission: ${unknown.join(", ")}`);

    try {
      const role = await Role.create({
        ...req.body,
        // "manage" implies "view" — stored expanded so a check is a plain lookup.
        permissions: expandPermissions(req.body.permissions),
      });
      await audit(req, "role.create", "Role", role._id, undefined, { name: role.name });
      res.status(201).json(role);
    } catch (err) {
      if (isDuplicateKey(err)) throw conflict("a role with that name already exists");
      throw err;
    }
  })
);

roleRouter.patch(
  "/:id",
  validate({ params: idParam, body: roleBody.partial().extend({ active: z.boolean().optional() }) }),
  handler(async (req, res) => {
    const role = await Role.findOne({ _id: req.params.id });
    if (!role) throw notFound("role not found");
    if (role.system) throw badRequest("the built-in administrator role cannot be edited");

    if (req.body.permissions) {
      const unknown = req.body.permissions.filter((p: string) => !ALL_PERMISSIONS.includes(p));
      if (unknown.length) throw badRequest(`unknown permission: ${unknown.join(", ")}`);
      role.permissions = expandPermissions(req.body.permissions);
    }
    if (req.body.name !== undefined) role.name = req.body.name;
    if (req.body.description !== undefined) role.description = req.body.description;
    if (req.body.active !== undefined) role.active = req.body.active;

    await role.save();
    await audit(req, "role.update", "Role", role._id, undefined, { permissions: role.permissions });

    // Permissions live in the access token, so a change lands on the next
    // refresh (≤15 min) unless the office signs everyone on this role out.
    const affected = await User.countDocuments({ roleId: role._id });
    res.json({ role, affectedUsers: affected, note: "Changes apply on each user's next sign-in or token refresh." });
  })
);

/** Immediate effect: drops every session held by users on this role. */
roleRouter.post(
  "/:id/revoke-sessions",
  validate({ params: idParam }),
  handler(async (req, res) => {
    const role = await Role.findOne({ _id: req.params.id });
    if (!role) throw notFound("role not found");

    const result = await User.updateMany({ roleId: role._id }, { sessions: [] });
    await audit(req, "role.revokeSessions", "Role", role._id);
    res.json({ ok: true, signedOut: result.modifiedCount });
  })
);

roleRouter.delete(
  "/:id",
  validate({ params: idParam }),
  handler(async (req, res) => {
    const role = await Role.findOne({ _id: req.params.id });
    if (!role) throw notFound("role not found");
    if (role.system) throw badRequest("the built-in administrator role cannot be deleted");

    // Deleting a role out from under its users would silently promote them to
    // unrestricted access, so it is refused while anyone holds it.
    const holders = await User.countDocuments({ roleId: role._id });
    if (holders) throw badRequest(`${holders} staff account(s) still use this role`);

    await Role.deleteOne({ _id: role._id });
    await audit(req, "role.delete", "Role", role._id, { name: role.name });
    res.json({ ok: true });
  })
);

/* ── Staff accounts that hold these roles ───────────────────────────── */

roleRouter.get(
  "/staff/accounts",
  handler(async (_req, res) => {
    const staff = await User.find({ role: "school_admin" })
      .populate("roleId", "name permissions active")
      .sort({ name: 1 })
      .lean();
    res.json(staff);
  })
);

roleRouter.post(
  "/staff/accounts",
  validate({
    body: z.object({
      name: z.string().trim().min(2),
      phone,
      email: z.string().email().optional(),
      password,
      roleId: objectId.optional(),
    }),
  }),
  handler(async (req, res) => {
    if (await allSchools(User.findOne({ phone: req.body.phone })))
      throw conflict("that mobile number is already registered");

    if (req.body.roleId) {
      const role = await Role.findOne({ _id: req.body.roleId, active: true });
      if (!role) throw badRequest("that role does not exist in this school");
    }

    const { password: plain, ...rest } = req.body;
    // A school_admin with a roleId is a restricted staff account; without one
    // they own the school outright.
    const account = await User.create({
      ...rest,
      role: "school_admin",
      schoolId: requireContext().schoolId,
      passwordHash: await hashPassword(plain),
    });

    await audit(req, "staffAccount.create", "User", account._id, undefined, { roleId: req.body.roleId ?? null });
    res.status(201).json(account);
  })
);

roleRouter.patch(
  "/staff/accounts/:id",
  validate({
    params: idParam,
    body: z.object({
      roleId: objectId.nullable().optional(),
      status: z.enum(USER_STATUSES).optional(),
      name: z.string().trim().min(2).optional(),
    }),
  }),
  handler(async (req, res) => {
    const ctx = requireContext();
    // Locking yourself out of your own school is not a recoverable mistake.
    if (req.params.id === ctx.userId && (req.body.roleId !== undefined || req.body.status))
      throw badRequest("you cannot change your own role or status");

    const account = await User.findOneAndUpdate(
      { _id: req.params.id, role: "school_admin" },
      req.body,
      { new: true }
    );
    if (!account) throw notFound("staff account not found");

    // Role or status changed — end their sessions so it takes effect at once.
    if (req.body.roleId !== undefined || req.body.status) {
      await User.updateOne({ _id: account._id }, { sessions: [] });
    }

    await audit(req, "staffAccount.update", "User", account._id, undefined, req.body);
    res.json(account);
  })
);

/* ── Activity log (FRD 27) ──────────────────────────────────────────── */

export const activityRouter = Router();
activityRouter.use(authenticate, requireRole("school_admin"), requireActiveSchool, requirePermission("activity:view"));

activityRouter.get(
  "/",
  validate({
    query: paginationQuery.extend({
      action: z.string().trim().optional(),
      actorId: objectId.optional(),
    }),
  }),
  handler(async (req, res) => {
    const q = req.query as never as { page: number; limit: number; action?: string; actorId?: string };
    const filter: Record<string, unknown> = {};
    if (q.action) filter.action = new RegExp("^" + q.action);
    if (q.actorId) filter.actorId = q.actorId;

    const [items, total] = await Promise.all([
      AuditLog.find(filter)
        .populate("actorId", "name phone")
        .sort({ createdAt: -1 })
        .skip((q.page - 1) * q.limit)
        .limit(q.limit)
        .lean(),
      AuditLog.countDocuments(filter),
    ]);

    res.json({ items, total, page: q.page, limit: q.limit });
  })
);
