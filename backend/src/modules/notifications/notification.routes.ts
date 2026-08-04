import { Router } from "express";
import { authenticate, requireRole } from "../../middleware/auth.js";
import { handler, notFound } from "../../lib/errors.js";
import { requireContext } from "../../lib/context.js";
import { idParam, paginationQuery, validate, z } from "../../lib/validate.js";
import { Notification } from "../../models/notification.model.js";
import { School } from "../../models/school.model.js";
import { User } from "../../models/user.model.js";
import { allSchools } from "../../models/plugins/tenant.js";
import { notify } from "./notification.service.js";

/** Every signed-in user reads their own notifications here. */
export const notificationRouter = Router();
notificationRouter.use(authenticate);

notificationRouter.get(
  "/",
  validate({ query: paginationQuery.extend({ unreadOnly: z.coerce.boolean().optional() }) }),
  handler(async (req, res) => {
    const { page, limit, unreadOnly } = req.query as never as {
      page: number; limit: number; unreadOnly?: boolean;
    };
    // Scoped by userId, not by tenant: a super admin has no school, and a user
    // must only ever see their own notifications regardless of role.
    const filter: Record<string, unknown> = { userId: requireContext().userId };
    if (unreadOnly) filter.readAt = null;

    const [items, total, unread] = await Promise.all([
      allSchools(Notification.find(filter)).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      allSchools(Notification.find(filter)).countDocuments(),
      allSchools(Notification.find({ userId: requireContext().userId, readAt: null })).countDocuments(),
    ]);
    res.json({ items, total, unread, page, limit });
  })
);

notificationRouter.post(
  "/:id/read",
  validate({ params: idParam }),
  handler(async (req, res) => {
    const updated = await allSchools(
      Notification.findOneAndUpdate(
        { _id: req.params.id, userId: requireContext().userId, readAt: null },
        { readAt: new Date() },
        { new: true }
      )
    );
    // Already read is a success, not a 404 — the app retries this freely.
    if (!updated) {
      const exists = await allSchools(
        Notification.findOne({ _id: req.params.id, userId: requireContext().userId })
      );
      if (!exists) throw notFound("notification not found");
    }
    res.json({ ok: true });
  })
);

notificationRouter.post(
  "/read-all",
  handler(async (_req, res) => {
    const result = await allSchools(
      Notification.updateMany({ userId: requireContext().userId, readAt: null }, { readAt: new Date() })
    );
    res.json({ ok: true, updated: result.modifiedCount });
  })
);

/* ── Broadcasts ─────────────────────────────────────────────────────── */
export const announcementRouter = Router();
announcementRouter.use(authenticate, requireRole("school_admin", "super_admin"));

/** Holiday notices, delays, anything the office needs to push out at once. */
announcementRouter.post(
  "/",
  validate({
    body: z.object({
      title: z.string().trim().min(3).max(120),
      body: z.string().trim().min(3).max(1000),
      audience: z.enum(["parents", "drivers", "staff", "all"]).default("parents"),
      schoolId: z.string().optional(), // super admin targeting one school
    }),
  }),
  handler(async (req, res) => {
    const ctx = requireContext();
    const schoolId = ctx.role === "super_admin" ? req.body.schoolId : ctx.schoolId;

    const ROLE_FOR: Record<"parents" | "drivers" | "staff", string> = {
      parents: "parent",
      drivers: "driver",
      staff: "staff",
    };
    const audience = req.body.audience as "parents" | "drivers" | "staff" | "all";
    const roles = audience === "all" ? Object.values(ROLE_FOR) : [ROLE_FOR[audience]];

    const recipients = await allSchools(
      User.find({ role: { $in: roles }, status: { $ne: "inactive" }, ...(schoolId ? { schoolId } : {}) })
    )
      .select("_id")
      .lean();

    // ponytail: sends inline. A whole-platform broadcast should go through a
    // queue — this blocks the request for as long as the write takes.
    await notify({
      userIds: recipients.map((r) => r._id),
      type: "announcement",
      title: req.body.title,
      body: req.body.body,
      schoolId,
    });

    res.status(201).json({ ok: true, recipients: recipients.length });
  })
);

/** What the school looks like to its own admins, for the settings screen. */
announcementRouter.get(
  "/audience-counts",
  handler(async (_req, res) => {
    const ctx = requireContext();
    const filter = ctx.schoolId ? { schoolId: ctx.schoolId } : {};
    const [parents, drivers, staff, schools] = await Promise.all([
      allSchools(User.find({ ...filter, role: "parent" })).countDocuments(),
      allSchools(User.find({ ...filter, role: "driver" })).countDocuments(),
      allSchools(User.find({ ...filter, role: "staff" })).countDocuments(),
      ctx.role === "super_admin" ? School.countDocuments() : 0,
    ]);
    res.json({ parents, drivers, staff, schools });
  })
);
