import express from "express";
import { UPLOAD_ROOT } from "./lib/uploads.js";
import cors from "cors";
import helmet from "helmet";
import { env } from "./config/env.js";
import { apiLimiter } from "./middleware/rateLimit.js";
import { errorHandler, notFoundHandler } from "./middleware/error.js";

import { authRouter } from "./modules/auth/auth.routes.js";
import { dashboardRouter } from "./modules/dashboard/dashboard.routes.js";
import { schoolRouter } from "./modules/schools/school.routes.js";
import {
  razorpayWebhookRouter,
  schoolBillingRouter,
  subscriptionRouter,
} from "./modules/subscriptions/subscription.routes.js";
import { fleetRouter } from "./modules/fleet/fleet.routes.js";
import { peopleRouter } from "./modules/people/people.routes.js";
import { studentRouter } from "./modules/students/student.routes.js";
import { routeRouter } from "./modules/transport/route.routes.js";
import { driverRouter, tripRouter } from "./modules/trips/trip.routes.js";
import { attendanceRouter } from "./modules/attendance/attendance.routes.js";
import { parentRouter } from "./modules/parents/parent.routes.js";
import { ownerRouter } from "./modules/owners/owner.routes.js";
import {
  adminVehicleRequestRouter,
  ownerAssignmentRouter,
  schoolVehicleRequestRouter,
} from "./modules/vehicleRequests/vehicleRequest.routes.js";
import { routeChangeRouter } from "./modules/routeChanges/routeChange.routes.js";
import { emergencyAdminRouter, emergencyRouter } from "./modules/emergencies/emergency.routes.js";
import { announcementRouter, notificationRouter } from "./modules/notifications/notification.routes.js";
import { platformReportRouter, schoolReportRouter } from "./modules/reports/report.routes.js";
import { uploadRouter } from "./modules/uploads/upload.routes.js";
import { salaryRouter } from "./modules/salaries/salary.routes.js";
import { ownerAdminRouter } from "./modules/owners/ownerAdmin.routes.js";
import { activityRouter, roleRouter } from "./modules/roles/role.routes.js";

export function createApp() {
  const app = express();

  app.set("trust proxy", 1); // behind nginx — needed for correct client IPs
  app.use(helmet());
  app.use(cors({ origin: env.corsOrigin, credentials: true }));

  /* The payment webhook must see the exact bytes the provider signed, so it is
     mounted with a raw parser before express.json() rewrites the body. */
  app.use(
    "/webhooks",
    express.raw({ type: "application/json" }),
    (req, _res, next) => {
      (req as unknown as { rawBody: Buffer }).rawBody = req.body as Buffer;
      next();
    },
    razorpayWebhookRouter
  );

  app.use(express.json({ limit: "1mb" }));

  /* Uploaded files, served straight from disk.
     Public on purpose: a school logo appears on the login screen before anyone
     has signed in, and filenames are random so they cannot be guessed. Nothing
     sensitive belongs here — treat every path as world-readable. */
  app.use(
    "/uploads",
    express.static(UPLOAD_ROOT, {
      maxAge: "7d",
      // Never let a request execute or negotiate its way to something else.
      index: false,
      dotfiles: "deny",
      setHeaders: (res) => res.setHeader("X-Content-Type-Options", "nosniff"),
    })
  );
  app.get("/health", (_req, res) => res.json({ ok: true, env: env.nodeEnv }));
  app.use("/api", apiLimiter);

  /* ── Shared ─────────────────────────────────────────────────────── */
  app.use("/api/auth", authRouter);
  app.use("/api/dashboard", dashboardRouter);
  app.use("/api/notifications", notificationRouter);
  app.use("/api/announcements", announcementRouter);
  app.use("/api/emergencies", emergencyRouter); // driver and attendant raise here
  app.use("/api/uploads", uploadRouter);

  /* ── Super admin: the platform ──────────────────────────────────── */
  app.use("/api/super-admin/schools", schoolRouter);
  app.use("/api/super-admin/subscriptions", subscriptionRouter);
  app.use("/api/super-admin/vehicle-requests", adminVehicleRequestRouter);
  app.use("/api/super-admin/reports", platformReportRouter);
  app.use("/api/super-admin/owners", ownerAdminRouter);

  /* ── School admin: one school's transport operation ─────────────── */
  app.use("/api/school/buses", fleetRouter);
  app.use("/api/school/people", peopleRouter);
  app.use("/api/school/students", studentRouter);
  app.use("/api/school/routes", routeRouter);
  app.use("/api/school/trips", tripRouter);
  app.use("/api/school/vehicle-requests", schoolVehicleRequestRouter);
  app.use("/api/school/route-changes", routeChangeRouter);
  app.use("/api/school/emergencies", emergencyAdminRouter);
  app.use("/api/school/billing", schoolBillingRouter);
  app.use("/api/school/reports", schoolReportRouter);
  app.use("/api/school/salaries", salaryRouter);
  app.use("/api/school/roles", roleRouter);
  app.use("/api/school/activity", activityRouter);

  /* ── Fleet owner ────────────────────────────────────────────────── */
  app.use("/api/owner", ownerRouter);
  app.use("/api/owner/assignments", ownerAssignmentRouter);

  /* ── On the bus, and at home ────────────────────────────────────── */
  app.use("/api/driver", driverRouter);
  app.use("/api/staff/attendance", attendanceRouter);
  app.use("/api/parent", parentRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
