import { useState } from "react";
import { api, useAction, useQuery } from "../../lib/api";
import { date, rupees } from "../../lib/format";
import {
  Alert, Avatar, Badge, Button, Card, EmptyState, Field, Modal, PageHeader, Stat, StatGrid, Table,
} from "../../components/ui";
import { IconWallet } from "../../components/icons";

type Row = {
  staff: { _id: string; name: string; phone: string; role: string };
  salary: {
    _id: string; period: string; baseAmountInPaise: number; allowancesInPaise: number;
    deductionsInPaise: number; netAmountInPaise: number; status: string; paidOn?: string;
  } | null;
  status: string;
};

/**
 * The last 12 months.
 *
 * Built from the 1st of each month, never by stepping setMonth() back from
 * today: on the 29th, "five months before 29 July" is 29 February, which does
 * not exist in a common year and silently rolls forward into March — producing
 * March twice and no February at all.
 */
const monthOptions = () => {
  const now = new Date();
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
};

const monthLabel = (period: string) =>
  new Date(period + "-01").toLocaleDateString("en-IN", { month: "long", year: "numeric" });

export default function SchoolSalaries() {
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const payroll = useQuery<{ rows: Row[]; totalPaidInPaise: number; totalPendingInPaise: number }>(
    `/school/salaries?period=${period}`,
    [period]
  );
  const { busy, error, run } = useAction();
  const [editing, setEditing] = useState<Row | null>(null);

  const rows = payroll.data?.rows ?? [];
  const notRecorded = rows.filter((r) => !r.salary).length;

  return (
    <>
      <PageHeader
        title="Driver & staff salaries"
        subtitle={monthLabel(period)}
        actions={
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-brand-500"
          >
            {monthOptions().map((m) => (
              <option key={m} value={m}>{monthLabel(m)}</option>
            ))}
          </select>
        }
      />
      <Alert>{error}</Alert>

      <StatGrid>
        <Stat label="Paid this month" value={rupees(payroll.data?.totalPaidInPaise)} icon={<IconWallet className="h-5 w-5" />} tone="leaf" />
        <Stat label="Pending" value={rupees(payroll.data?.totalPendingInPaise)} tone="sun" />
        <Stat label="On payroll" value={rows.length} />
        <Stat label="Not recorded yet" value={notRecorded} tone="slate"
          hint={notRecorded ? "these people have no entry for this month" : "everyone is entered"} />
      </StatGrid>

      <Card className="mt-4" padded={false}>
        <Table
          rows={rows}
          loading={payroll.loading}
          rowKey={(r) => r.staff._id}
          empty={<EmptyState title="No drivers or attendants yet" />}
          columns={[
            {
              header: "Name",
              cell: (r) => (
                <div className="flex items-center gap-3">
                  <Avatar name={r.staff.name} />
                  <div>
                    <div className="font-medium text-slate-900">{r.staff.name}</div>
                    <div className="text-xs capitalize text-slate-500">
                      {r.staff.role === "staff" ? "attendant" : r.staff.role} · {r.staff.phone}
                    </div>
                  </div>
                </div>
              ),
            },
            { header: "Base", secondary: true, cell: (r) => (r.salary ? rupees(r.salary.baseAmountInPaise) : "—") },
            {
              header: "Allow. / Deduct.",
              secondary: true,
              cell: (r) =>
                r.salary ? (
                  <span className="text-xs">
                    <span className="text-leaf-600">+{rupees(r.salary.allowancesInPaise)}</span>{" "}
                    <span className="text-red-600">−{rupees(r.salary.deductionsInPaise)}</span>
                  </span>
                ) : "—",
            },
            {
              header: "Net pay",
              cell: (r) => (r.salary ? <span className="font-semibold">{rupees(r.salary.netAmountInPaise)}</span> : "—"),
            },
            {
              header: "Status",
              cell: (r) =>
                r.salary ? (
                  <div>
                    <Badge value={r.salary.status} />
                    {r.salary.paidOn && <div className="mt-0.5 text-xs text-slate-500">{date(r.salary.paidOn)}</div>}
                  </div>
                ) : (
                  <Badge value="pending">Not recorded</Badge>
                ),
            },
            {
              header: "",
              align: "right",
              cell: (r) => (
                <div className="flex justify-end gap-2">
                  {/* A paid salary is a historical record, so it is not editable. */}
                  {r.salary?.status !== "paid" && (
                    <Button size="sm" variant="secondary" onClick={() => setEditing(r)}>
                      {r.salary ? "Edit" : "Record"}
                    </Button>
                  )}
                  {r.salary?.status === "pending" && (
                    <Button
                      size="sm"
                      variant="success"
                      loading={busy}
                      onClick={() => void run(() => api(`/school/salaries/${r.salary!._id}/pay`, { body: {} }), payroll.reload)}
                    >
                      Mark paid
                    </Button>
                  )}
                </div>
              ),
            },
          ]}
        />
      </Card>

      <SalaryForm row={editing} period={period} onClose={() => setEditing(null)} onDone={payroll.reload} />
    </>
  );
}

function SalaryForm({
  row, period, onClose, onDone,
}: { row: Row | null; period: string; onClose: () => void; onDone: () => void }) {
  const { busy, error, run } = useAction();
  const [base, setBase] = useState("");
  const [allowances, setAllowances] = useState("");
  const [deductions, setDeductions] = useState("");
  const [seeded, setSeeded] = useState("");

  if (row && seeded !== row.staff._id + period) {
    setSeeded(row.staff._id + period);
    // Rupees in the form, paise on the wire — money never touches a float here.
    setBase(row.salary ? String(row.salary.baseAmountInPaise / 100) : "");
    setAllowances(row.salary ? String(row.salary.allowancesInPaise / 100) : "");
    setDeductions(row.salary ? String(row.salary.deductionsInPaise / 100) : "");
  }

  if (!row) return null;

  const paise = (value: string) => Math.round(Number(value || 0) * 100);
  const net = Math.max(0, paise(base) + paise(allowances) - paise(deductions));

  return (
    <Modal
      open
      onClose={onClose}
      title={`${row.salary ? "Edit" : "Record"} salary — ${row.staff.name}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            loading={busy}
            disabled={!base}
            onClick={() =>
              void run(
                () =>
                  api("/school/salaries", {
                    body: {
                      staffId: row.staff._id,
                      period,
                      baseAmountInPaise: paise(base),
                      allowancesInPaise: paise(allowances),
                      deductionsInPaise: paise(deductions),
                    },
                  }),
                () => { onDone(); onClose(); }
              )
            }
          >
            Save
          </Button>
        </>
      }
    >
      <Alert>{error}</Alert>
      <div className="space-y-4">
        <Field label="Basic salary (₹)" type="number" min={0} value={base} onChange={(e) => setBase(e.target.value)} autoFocus />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Allowances (₹)" type="number" min={0} value={allowances} onChange={(e) => setAllowances(e.target.value)} />
          <Field label="Deductions (₹)" type="number" min={0} value={deductions} onChange={(e) => setDeductions(e.target.value)} />
        </div>

        <div className="flex items-center justify-between rounded-lg bg-brand-50 px-3 py-2.5">
          <span className="text-sm font-medium text-brand-700">Net payable</span>
          <span className="text-lg font-bold text-brand-700">{rupees(net)}</span>
        </div>
        <p className="text-xs text-slate-500">
          The server recomputes this total — the figure sent from here is never trusted.
        </p>
      </div>
    </Modal>
  );
}
