import { Router } from "express";
import { handler, notFound, unauthorized } from "../../lib/errors.js";
import { requireContext } from "../../lib/context.js";
import { hashPassword, verifyPassword } from "../../lib/password.js";
import { verifyRefreshToken } from "../../lib/jwt.js";
import { issueOtp, verifyOtp } from "../../lib/otp.js";
import { password, phone, schoolCode, validate, z } from "../../lib/validate.js";
import { authenticate } from "../../middleware/auth.js";
import { authLimiter, otpLimiter } from "../../middleware/rateLimit.js";
import { School } from "../../models/school.model.js";
import { User } from "../../models/user.model.js";
import { allSchools } from "../../models/plugins/tenant.js";
import {
  assertSchoolOperational,
  issueSession,
  publicSchool,
  publicUser,
  revokeSession,
  rotateSession,
} from "./auth.service.js";

export const authRouter = Router();

/* ── Password login: super admin, school admin, owner, driver, attendant ── */
authRouter.post(
  "/login",
  authLimiter,
  validate({ body: z.object({ phone, password: z.string().min(1) }) }),
  handler(async (req, res) => {
    // Global lookup by unique phone — no tenant is known yet, so the bypass is
    // explicit and narrowed by a unique field.
    const user = await allSchools(User.findOne({ phone: req.body.phone })).select("+passwordHash");

    // Identical response and comparable timing whether or not the phone exists.
    const ok = await verifyPassword(req.body.password, user?.passwordHash);
    if (!user || !ok) throw unauthorized("incorrect mobile number or password");
    if (user.role === "parent") throw unauthorized("parents sign in with their school code");

    res.json(await issueSession(user._id));
  })
);

/* ── Parent login: school code proves the tenant, OTP proves the number ── */
authRouter.post(
  "/parent/request-otp",
  otpLimiter,
  validate({ body: z.object({ schoolCode, phone }) }),
  handler(async (req, res) => {
    const school = await School.findOne({ code: req.body.schoolCode });
    if (!school) throw notFound("invalid school code");
    await assertSchoolOperational(school._id);

    const { devCode } = await issueOtp(req.body.schoolCode, req.body.phone);
    // ponytail: no SMS gateway yet, so development returns the code directly.
    // Wire the gateway here and drop devCode from the response.

    /* Branding comes back before the OTP is entered, so the parent app can put
       the school's own logo and colour on the sign-in screen — which is where
       the FRD asks for it, and the last moment a parent can notice they typed
       another school's code. Nothing here is secret: the same logo is already
       served publicly from /uploads. */
    res.json({
      ok: true,
      school: publicSchool(school as never),
      ...(devCode ? { devOtp: devCode } : {}),
    });
  })
);

authRouter.post(
  "/parent/verify",
  authLimiter,
  validate({ body: z.object({ schoolCode, phone, otp: z.string().length(6) }) }),
  handler(async (req, res) => {
    const school = await School.findOne({ code: req.body.schoolCode });
    if (!school) throw notFound("invalid school code");

    await verifyOtp(req.body.schoolCode, req.body.phone, req.body.otp);

    // The parent must already belong to the school whose code they proved. This
    // is what makes it impossible to land in another school's tenant.
    const parent = await allSchools(
      User.findOne({ phone: req.body.phone, role: "parent", schoolId: school._id })
    );
    if (!parent) throw notFound("no parent is registered with this number at this school");

    res.json(await issueSession(parent._id));
  })
);

/* ── Session management ─────────────────────────────────────────────── */
authRouter.post(
  "/refresh",
  validate({ body: z.object({ refreshToken: z.string().min(1) }) }),
  handler(async (req, res) => {
    const claims = verifyRefreshToken(req.body.refreshToken);
    res.json(await rotateSession(claims.userId, claims.jti));
  })
);

authRouter.post(
  "/logout",
  authenticate,
  handler(async (_req, res) => {
    await revokeSession(requireContext().userId);
    res.json({ ok: true });
  })
);

authRouter.get(
  "/me",
  authenticate,
  handler(async (_req, res) => {
    const ctx = requireContext();
    const user = await allSchools(User.findById(ctx.userId));
    if (!user) throw notFound("account not found");
    const school = user.schoolId ? await School.findById(user.schoolId) : null;
    res.json({
      user: publicUser(user as never),
      school: school ? publicSchool(school as never) : null,
    });
  })
);

authRouter.post(
  "/change-password",
  authenticate,
  authLimiter,
  validate({ body: z.object({ currentPassword: z.string().min(1), newPassword: password }) }),
  handler(async (req, res) => {
    const ctx = requireContext();
    const user = await allSchools(User.findById(ctx.userId)).select("+passwordHash");
    if (!user) throw notFound("account not found");
    if (!(await verifyPassword(req.body.currentPassword, user.passwordHash)))
      throw unauthorized("current password is incorrect");

    user.passwordHash = await hashPassword(req.body.newPassword);
    // Changing a password signs every other device out — that is the point of
    // changing it.
    user.sessions = [];
    await user.save();
    res.json({ ok: true });
  })
);

/* ── Password reset ─────────────────────────────────────────────────
   OTP to the registered mobile. The same "reset" namespace is used for the code
   so it can never be replayed against the parent sign-in flow. */

const RESET_SCOPE = "RESET!";

authRouter.post(
  "/forgot-password",
  otpLimiter,
  validate({ body: z.object({ phone }) }),
  handler(async (req, res) => {
    const user = await allSchools(User.findOne({ phone: req.body.phone }));

    // Always the same answer: this endpoint must not reveal who has an account.
    const response = { ok: true, message: "If that number is registered, a reset code has been sent." };
    if (!user || user.role === "parent" || user.status === "inactive") return res.json(response);

    const { devCode } = await issueOtp(RESET_SCOPE, req.body.phone);
    res.json({ ...response, ...(devCode ? { devOtp: devCode } : {}) });
  })
);

authRouter.post(
  "/reset-password",
  authLimiter,
  validate({ body: z.object({ phone, otp: z.string().length(6), newPassword: password }) }),
  handler(async (req, res) => {
    await verifyOtp(RESET_SCOPE, req.body.phone, req.body.otp);

    const user = await allSchools(User.findOne({ phone: req.body.phone })).select("+passwordHash");
    if (!user) throw notFound("account not found");

    user.passwordHash = await hashPassword(req.body.newPassword);
    // Every existing session dies with the old password.
    user.sessions = [];
    await user.save();

    res.json({ ok: true });
  })
);

/** Device registration for push. Idempotent by construction. */
authRouter.post(
  "/push-token",
  authenticate,
  validate({ body: z.object({ token: z.string().min(10) }) }),
  handler(async (req, res) => {
    await allSchools(
      User.updateOne({ _id: requireContext().userId }, { $addToSet: { pushTokens: req.body.token } })
    );
    res.json({ ok: true });
  })
);
