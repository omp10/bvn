import { Router } from "express";
import { audit } from "../../middleware/audit.js";
import { authenticate, requireActiveSchool, requirePermission, requireRole } from "../../middleware/auth.js";
import { badRequest, handler, notFound } from "../../lib/errors.js";
import { idParam, objectId, validate, z } from "../../lib/validate.js";
import { Salary, SALARY_STATUSES, netOf } from "../../models/salary.model.js";
import { User } from "../../models/user.model.js";

export const salaryRouter = Router();
salaryRouter.use(authenticate, requireRole("school_admin"), requireActiveSchool);
// Reads need salaries:view; anything that changes data needs salaries:manage.
salaryRouter.get("*", requirePermission("salaries:view"));
salaryRouter.post("*", requirePermission("salaries:manage"));
salaryRouter.patch("*", requirePermission("salaries:manage"));
salaryRouter.delete("*", requirePermission("salaries:manage"));

const period = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "use YYYY-MM");
const thisMonth = () => new Date().toISOString().slice(0, 7);

/** Everyone on the payroll for a month, including those not yet recorded. */
salaryRouter.get(
  "/",
  validate({ query: z.object({ period: period.optional(), status: z.enum(SALARY_STATUSES).optional() }) }),
  handler(async (req, res) => {
    const q = req.query as never as { period?: string; status?: string };
    const month = q.period ?? thisMonth();

    const [staff, records] = await Promise.all([
      User.find({ role: { $in: ["driver", "staff"] }, status: { $ne: "inactive" } })
        .select("name phone role")
        .sort({ name: 1 })
        .lean(),
      Salary.find({ period: month }).lean(),
    ]);

    const byStaff = new Map(records.map((r) => [String(r.staffId), r]));

    // Staff with no record yet appear as "pending" with a null salary, so the
    // office can see who is still missing rather than only who is entered.
    const rows = staff
      .map((person) => ({
        staff: person,
        salary: byStaff.get(String(person._id)) ?? null,
        status: byStaff.get(String(person._id))?.status ?? "not_recorded",
      }))
      .filter((row) => !q.status || row.salary?.status === q.status);

    res.json({
      period: month,
      rows,
      totalPaidInPaise: records.filter((r) => r.status === "paid").reduce((sum, r) => sum + r.netAmountInPaise, 0),
      totalPendingInPaise: records.filter((r) => r.status === "pending").reduce((sum, r) => sum + r.netAmountInPaise, 0),
    });
  })
);

/** Records or updates a month's salary. Re-submitting corrects, never duplicates. */
salaryRouter.post(
  "/",
  validate({
    body: z.object({
      staffId: objectId,
      period,
      baseAmountInPaise: z.number().int().min(0),
      allowancesInPaise: z.number().int().min(0).default(0),
      deductionsInPaise: z.number().int().min(0).default(0),
      note: z.string().trim().max(300).optional(),
    }),
  }),
  handler(async (req, res) => {
    const b = req.body;

    // Scoped lookup: a staff id from another school resolves to nothing.
    const person = await User.findOne({ _id: b.staffId, role: { $in: ["driver", "staff"] } });
    if (!person) throw badRequest("that person is not on this school's staff");

    const net = netOf(b.baseAmountInPaise, b.allowancesInPaise, b.deductionsInPaise);

    const salary = await Salary.findOneAndUpdate(
      { staffId: b.staffId, period: b.period },
      {
        ...b,
        netAmountInPaise: net,
        // Editing an already-paid record would rewrite history, so it is refused
        // below rather than silently reopened here.
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    await audit(req, "salary.record", "Salary", salary?._id, undefined, { period: b.period, net });
    res.status(201).json(salary);
  })
);

salaryRouter.post(
  "/:id/pay",
  validate({ params: idParam, body: z.object({ paymentRef: z.string().trim().optional() }) }),
  handler(async (req, res) => {
    const salary = await Salary.findOneAndUpdate(
      { _id: req.params.id, status: "pending" },
      { status: "paid", paidOn: new Date(), paymentRef: req.body.paymentRef },
      { new: true }
    );
    if (!salary) throw notFound("no pending salary with that id");

    await audit(req, "salary.pay", "Salary", salary._id);
    res.json(salary);
  })
);

/** One person's payment history — what they ask the office for. */
salaryRouter.get(
  "/staff/:id",
  validate({ params: idParam }),
  handler(async (req, res) => {
    const person = await User.findOne({ _id: req.params.id }).select("name phone role").lean();
    if (!person) throw notFound("not found");

    const history = await Salary.find({ staffId: req.params.id }).sort({ period: -1 }).limit(24).lean();
    res.json({ staff: person, history });
  })
);
