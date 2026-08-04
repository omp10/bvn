import { Router, type Request, type Response } from "express";
import { authenticate, requireActiveSchool, requireRole } from "../../middleware/auth.js";
import { handler } from "../../lib/errors.js";
import { csvHeaders, toCsv, type Column } from "../../lib/csv.js";
import { streamTablePdf } from "../../lib/pdf.js";
import { validate, z } from "../../lib/validate.js";
import { Attendance } from "../../models/attendance.model.js";
import { Invoice } from "../../models/invoice.model.js";
import { School } from "../../models/school.model.js";
import { Student } from "../../models/student.model.js";
import { Trip } from "../../models/trip.model.js";
import { User } from "../../models/user.model.js";
import { Vehicle } from "../../models/vehicle.model.js";
import { allSchools, anySchool } from "../../models/plugins/tenant.js";

const dateRange = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  format: z.enum(["json", "csv", "pdf"]).default("json"),
});

/** JSON, CSV or PDF from one handler, chosen by ?format=. */
function send<T>(
  req: Request,
  res: Response,
  rows: T[],
  filename: string,
  columns: Column<T>[],
  meta?: { title: string; subtitle?: string; summary?: string[] }
): void {
  const format = (req.query as { format?: string }).format;

  if (format === "csv") {
    res.set(csvHeaders(filename + ".csv")).send(toCsv(rows, columns));
    return;
  }

  if (format === "pdf") {
    // Landscape A4 minus margins, shared evenly — good enough for report tables
    // and far simpler than measuring every cell.
    const width = Math.floor((842 - 72) / columns.length);
    streamTablePdf({
      res,
      filename: filename + ".pdf",
      title: meta?.title ?? filename,
      subtitle: meta?.subtitle,
      summary: meta?.summary,
      rows,
      columns: columns.map(([header, get]) => ({
        header,
        width,
        cell: (row: T) => {
          const value = get(row);
          if (value === null || value === undefined) return "";
          return value instanceof Date ? value.toLocaleDateString("en-IN") : String(value);
        },
      })),
    });
    return;
  }

  res.json(rows);
}

/* ── Platform reports ─────────────────────────────────────────────── */
export const platformReportRouter = Router();
platformReportRouter.use(authenticate, requireRole("super_admin"));

platformReportRouter.get(
  "/schools",
  validate({ query: dateRange }),
  handler(async (req, res) => {
    const schools = await School.find().sort({ name: 1 }).lean();

    // One grouped count per collection rather than three queries per school.
    const [students, vehicles, parents] = await Promise.all([
      allSchools(Student.find({ active: true })).select("schoolId").lean(),
      allSchools(Vehicle.find({ schoolId: { $ne: null } })).select("schoolId").lean(),
      allSchools(User.find({ role: "parent" })).select("schoolId").lean(),
    ]);
    const tally = (rows: { schoolId?: unknown }[]) => {
      const map = new Map<string, number>();
      for (const r of rows) map.set(String(r.schoolId), (map.get(String(r.schoolId)) ?? 0) + 1);
      return map;
    };
    const [byStudents, byVehicles, byParents] = [tally(students), tally(vehicles), tally(parents)];

    const rows = schools.map((s) => ({
      name: s.name,
      code: s.code,
      city: s.city ?? "",
      status: s.status,
      plan: s.subscription?.plan ?? "",
      expiresAt: s.subscription?.expiresAt ?? null,
      students: byStudents.get(String(s._id)) ?? 0,
      buses: byVehicles.get(String(s._id)) ?? 0,
      parents: byParents.get(String(s._id)) ?? 0,
    }));

    send(req, res, rows, "schools", [
      ["School", (r) => r.name],
      ["Code", (r) => r.code],
      ["City", (r) => r.city],
      ["Status", (r) => r.status],
      ["Plan", (r) => r.plan],
      ["Expires", (r) => r.expiresAt],
      ["Students", (r) => r.students],
      ["Buses", (r) => r.buses],
      ["Parents", (r) => r.parents],
    ], { title: "School-wise report", subtitle: `${rows.length} schools on the platform` });
  })
);

platformReportRouter.get(
  "/revenue",
  validate({ query: dateRange }),
  handler(async (req, res) => {
    const q = req.query as never as { from?: Date; to?: Date };
    const filter: Record<string, unknown> = { status: "paid" };
    if (q.from || q.to) filter.paidAt = { ...(q.from ? { $gte: q.from } : {}), ...(q.to ? { $lte: q.to } : {}) };

    const invoices = await allSchools(Invoice.find(filter)).populate("schoolId", "name code").sort({ paidAt: -1 }).lean();
    const rows = invoices.map((i) => ({
      invoiceNo: i.invoiceNo,
      school: (i.schoolId as { name?: string })?.name ?? "",
      plan: i.planKey,
      amount: (i.amountInPaise ?? 0) / 100,
      paidAt: i.paidAt ?? null,
    }));

    send(req, res, rows, "revenue", [
      ["Invoice", (r) => r.invoiceNo],
      ["School", (r) => r.school],
      ["Plan", (r) => r.plan],
      ["Amount (INR)", (r) => r.amount],
      ["Paid on", (r) => r.paidAt],
    ], {
      title: "Revenue report",
      summary: [`Total collected: Rs ${rows.reduce((sum, r) => sum + r.amount, 0).toLocaleString("en-IN")}`],
    });
  })
);

platformReportRouter.get(
  "/expired",
  handler(async (_req, res) => {
    res.json(
      await School.find({
        $or: [{ status: { $in: ["expired", "suspended"] } }, { "subscription.expiresAt": { $lt: new Date() } }],
      })
        .select("name code city status subscription")
        .lean()
    );
  })
);

/** Fleet owners and how their vehicles are placed (FRD 26.1). */
platformReportRouter.get(
  "/fleet-owners",
  validate({ query: dateRange }),
  handler(async (req, res) => {
    const owners = await allSchools(User.find({ role: "owner" })).sort({ name: 1 }).lean();
    const vehicles = await allSchools(Vehicle.find({ ownerId: { $ne: null } }))
      .populate("schoolId", "name")
      .lean();

    const rows = owners.map((owner) => {
      const mine = vehicles.filter((v) => String(v.ownerId) === String(owner._id));
      return {
        name: owner.name,
        company: owner.companyName ?? "",
        phone: owner.phone,
        total: mine.length,
        assigned: mine.filter((v) => v.schoolId).length,
        available: mine.filter((v) => v.status === "available").length,
        maintenance: mine.filter((v) => v.status === "maintenance").length,
      };
    });

    send(req, res, rows, "fleet-owners", [
      ["Owner", (r) => r.name],
      ["Company", (r) => r.company],
      ["Mobile", (r) => r.phone],
      ["Vehicles", (r) => r.total],
      ["Assigned", (r) => r.assigned],
      ["Available", (r) => r.available],
      ["Maintenance", (r) => r.maintenance],
    ], { title: "Fleet owner report", subtitle: `${rows.length} owners` });
  })
);

/** Which vehicle is placed with which school, and since when (FRD 26.1). */
platformReportRouter.get(
  "/vehicle-assignments",
  validate({ query: dateRange }),
  handler(async (req, res) => {
    const vehicles = await allSchools(Vehicle.find({ schoolId: { $ne: null } }))
      .populate("schoolId", "name city")
      .populate(anySchool("ownerId", "name companyName"))
      .sort({ assignedAt: -1 })
      .lean();

    const rows = vehicles.map((v) => ({
      vehicleNumber: v.vehicleNumber,
      busNumber: v.busNumber ?? "",
      capacity: v.capacity,
      owner: (v.ownerId as { companyName?: string; name?: string })?.companyName
        ?? (v.ownerId as { name?: string })?.name
        ?? "School owned",
      school: (v.schoolId as { name?: string })?.name ?? "",
      city: (v.schoolId as { city?: string })?.city ?? "",
      assignedAt: v.assignedAt ?? null,
      status: v.status,
    }));

    send(req, res, rows, "vehicle-assignments", [
      ["Vehicle", (r) => r.vehicleNumber],
      ["Bus", (r) => r.busNumber],
      ["Seats", (r) => r.capacity],
      ["Owner", (r) => r.owner],
      ["School", (r) => r.school],
      ["City", (r) => r.city],
      ["Assigned", (r) => r.assignedAt],
      ["Status", (r) => r.status],
    ], { title: "Vehicle assignment report", subtitle: `${rows.length} vehicles placed` });
  })
);

/* ── School reports ───────────────────────────────────────────────── */
export const schoolReportRouter = Router();
schoolReportRouter.use(authenticate, requireRole("school_admin"), requireActiveSchool);

schoolReportRouter.get(
  "/attendance",
  validate({ query: dateRange }),
  handler(async (req, res) => {
    const q = req.query as never as { from?: Date; to?: Date };
    const from = q.from ?? new Date(Date.now() - 7 * 86_400_000);
    const to = q.to ?? new Date();

    const marks = await Attendance.find({ at: { $gte: from, $lte: to } })
      .populate("studentId", "name class section")
      .populate("tripId", "type tripDate")
      .sort({ at: -1 })
      .limit(5000)
      .lean();

    const rows = marks.map((m) => {
      const student = m.studentId as { name?: string; class?: string; section?: string };
      const trip = m.tripId as { type?: string; tripDate?: string };
      return {
        date: trip?.tripDate ?? "",
        trip: trip?.type ?? "",
        student: student?.name ?? "",
        cls: [student?.class, student?.section].filter(Boolean).join(" "),
        event: m.event,
        at: m.at,
      };
    });

    send(req, res, rows, "attendance", [
      ["Date", (r) => r.date],
      ["Trip", (r) => r.trip],
      ["Student", (r) => r.student],
      ["Class", (r) => r.cls],
      ["Event", (r) => r.event],
      ["Time", (r) => r.at],
    ], { title: "Attendance report", subtitle: `${from.toLocaleDateString("en-IN")} to ${to.toLocaleDateString("en-IN")}` });
  })
);

schoolReportRouter.get(
  "/trips",
  validate({ query: dateRange }),
  handler(async (req, res) => {
    const q = req.query as never as { from?: Date; to?: Date };
    const filter: Record<string, unknown> = {};
    if (q.from || q.to)
      filter.startedAt = { ...(q.from ? { $gte: q.from } : {}), ...(q.to ? { $lte: q.to } : {}) };

    const trips = await Trip.find(filter)
      .populate("vehicleId", "busNumber vehicleNumber")
      .populate("driverId", "name")
      .sort({ startedAt: -1 })
      .limit(2000)
      .lean();

    const rows = trips.map((t) => ({
      date: t.tripDate,
      bus: (t.vehicleId as { busNumber?: string })?.busNumber ?? "",
      driver: (t.driverId as { name?: string })?.name ?? "",
      type: t.type,
      status: t.status,
      startedAt: t.startedAt ?? null,
      endedAt: t.endedAt ?? null,
      // Minutes, because "how long did that trip take" is the actual question.
      minutes: t.startedAt && t.endedAt ? Math.round((+new Date(t.endedAt) - +new Date(t.startedAt)) / 60000) : "",
      pickedUp: t.stats?.pickedUp ?? 0,
      dropped: t.stats?.dropped ?? 0,
      km: Math.round((t.stats?.distanceKm ?? 0) * 10) / 10,
    }));

    send(req, res, rows, "trips", [
      ["Date", (r) => r.date],
      ["Bus", (r) => r.bus],
      ["Driver", (r) => r.driver],
      ["Trip", (r) => r.type],
      ["Status", (r) => r.status],
      ["Started", (r) => r.startedAt],
      ["Ended", (r) => r.endedAt],
      ["Minutes", (r) => r.minutes],
      ["Picked up", (r) => r.pickedUp],
      ["Dropped", (r) => r.dropped],
      ["Distance (km)", (r) => r.km],
    ], { title: "Trip log" });
  })
);

schoolReportRouter.get(
  "/students",
  validate({ query: dateRange }),
  handler(async (req, res) => {
    const students = await Student.find({ active: true })
      .populate("vehicleId", "busNumber")
      .populate("routeId", "name")
      .populate("parentId", "name phone")
      .sort({ class: 1, name: 1 })
      .lean();

    const rows = students.map((s) => ({
      name: s.name,
      cls: [s.class, s.section].filter(Boolean).join(" "),
      rollNo: s.rollNo ?? "",
      bus: (s.vehicleId as { busNumber?: string })?.busNumber ?? "",
      route: (s.routeId as { name?: string })?.name ?? "",
      parent: (s.parentId as { name?: string })?.name ?? "",
      parentPhone: (s.parentId as { phone?: string })?.phone ?? "",
    }));

    send(req, res, rows, "students", [
      ["Student", (r) => r.name],
      ["Class", (r) => r.cls],
      ["Roll no", (r) => r.rollNo],
      ["Bus", (r) => r.bus],
      ["Route", (r) => r.route],
      ["Parent", (r) => r.parent],
      ["Parent mobile", (r) => r.parentPhone],
    ], { title: "Student transport list", subtitle: `${rows.length} students` });
  })
);
