import { api, download, useAction, useQuery } from "../../lib/api";
import { date, rupees, titleCase } from "../../lib/format";
import { Alert, Badge, Button, Card, EmptyState, PageHeader, Table } from "../../components/ui";
import { IconDownload } from "../../components/icons";

type Invoice = {
  _id: string; invoiceNo: string; planKey: string; amountInPaise: number; status: string;
  periodEnd: string; paidAt?: string; schoolId?: { name?: string; code?: string };
};

export function AdminBilling() {
  const invoices = useQuery<{ items: Invoice[]; total: number }>("/super-admin/subscriptions/invoices?limit=50");
  const plans = useQuery<any[]>("/super-admin/subscriptions/plans");
  const { busy, error, run } = useAction();

  const markPaid = (id: string) =>
    void run(() => api(`/super-admin/subscriptions/invoices/${id}/mark-paid`, { body: {} }), invoices.reload);

  const collected = invoices.data?.items
    .filter((i) => i.status === "paid")
    .reduce((sum, i) => sum + i.amountInPaise, 0);

  return (
    <>
      <PageHeader
        title="Subscriptions & billing"
        subtitle={collected !== undefined ? `${rupees(collected)} collected` : undefined}
        actions={
          <Button variant="secondary" onClick={() => download("/super-admin/reports/revenue?format=csv", "revenue.csv")}>
            <IconDownload className="h-4 w-4" /> Export revenue
          </Button>
        }
      />
      <Alert>{error}</Alert>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {plans.data?.map((plan) => (
          <Card key={plan._id}>
            <div className="flex items-baseline justify-between">
              <span className="font-semibold">{plan.name}</span>
              <Badge value={plan.active ? "active" : "expired"} />
            </div>
            <p className="mt-2 text-2xl font-bold text-brand-600">
              {plan.priceInPaise ? rupees(plan.priceInPaise) : "Free"}
            </p>
            <p className="text-xs text-slate-500">{plan.durationDays} days</p>
          </Card>
        ))}
      </div>

      <Card title="Invoices" padded={false}>
        <Table
          rows={invoices.data?.items}
          loading={invoices.loading}
          rowKey={(i) => i._id}
          empty={<EmptyState title="No invoices yet" hint="Invoices are raised when a paid plan is activated." />}
          columns={[
            { header: "Invoice", cell: (i) => <span className="font-mono text-xs">{i.invoiceNo}</span> },
            { header: "School", cell: (i) => i.schoolId?.name ?? "—" },
            { header: "Plan", cell: (i) => titleCase(i.planKey), secondary: true },
            { header: "Period ends", cell: (i) => date(i.periodEnd), secondary: true },
            { header: "Amount", align: "right", cell: (i) => <span className="font-semibold">{rupees(i.amountInPaise)}</span> },
            {
              header: "Status",
              align: "right",
              cell: (i) =>
                i.status === "pending" ? (
                  <Button size="sm" variant="secondary" loading={busy} onClick={() => markPaid(i._id)}>
                    Mark paid
                  </Button>
                ) : (
                  <Badge value={i.status} />
                ),
            },
          ]}
        />
      </Card>
    </>
  );
}

type Request = {
  _id: string; seatingCapacity: number; vehicleCount: number; status: string;
  specialRequirements?: string; createdAt: string; schoolId?: { name?: string; city?: string };
};

export function AdminVehicleRequests() {
  const list = useQuery<{ items: Request[] }>("/super-admin/vehicle-requests?limit=50");

  return (
    <>
      <PageHeader title="Vehicle requests" subtitle="Schools asking the platform for extra buses." />
      <Card padded={false}>
        <Table
          rows={list.data?.items}
          loading={list.loading}
          rowKey={(r) => r._id}
          empty={<EmptyState title="No requests" hint="Schools needing extra buses will appear here." />}
          columns={[
            {
              header: "School",
              cell: (r) => (
                <div>
                  <div className="font-medium">{r.schoolId?.name ?? "—"}</div>
                  <div className="text-xs text-slate-500">{r.schoolId?.city ?? ""}</div>
                </div>
              ),
            },
            { header: "Needs", cell: (r) => `${r.vehicleCount} × ${r.seatingCapacity} seats` },
            { header: "Notes", cell: (r) => r.specialRequirements ?? "—", secondary: true },
            { header: "Raised", cell: (r) => date(r.createdAt), secondary: true },
            { header: "Status", align: "right", cell: (r) => <Badge value={r.status} /> },
          ]}
        />
      </Card>
    </>
  );
}

export function AdminReports() {
  const reports = [
    ["School-wise report", "Every school with student, bus and parent counts.", "/super-admin/reports/schools", "schools"],
    ["Revenue report", "All settled invoices with school and plan.", "/super-admin/reports/revenue", "revenue"],
    ["Fleet owner report", "Owners and how their vehicles are placed.", "/super-admin/reports/fleet-owners", "fleet-owners"],
    ["Vehicle assignments", "Which bus is with which school, and since when.", "/super-admin/reports/vehicle-assignments", "vehicle-assignments"],
  ];

  const expired = useQuery<any[]>("/super-admin/reports/expired");

  return (
    <>
      <PageHeader title="Reports" subtitle="Exports open directly in Excel." />
      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        {reports.map(([title, hint, path, file]) => (
          <Card key={title}>
            <h3 className="font-semibold">{title}</h3>
            <p className="mb-3 mt-0.5 text-sm text-slate-500">{hint}</p>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => download(`${path}?format=csv`, `${file}.csv`)}>
                <IconDownload className="h-4 w-4" /> Excel
              </Button>
              <Button variant="secondary" size="sm" onClick={() => download(`${path}?format=pdf`, `${file}.pdf`)}>
                <IconDownload className="h-4 w-4" /> PDF
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <Card title="Expired or suspended schools" padded={false}>
        <Table
          rows={expired.data}
          loading={expired.loading}
          rowKey={(s: any) => s._id}
          empty={<EmptyState title="All schools are current" hint="Nothing lapsed or suspended." />}
          columns={[
            { header: "School", cell: (s: any) => s.name },
            { header: "Code", cell: (s: any) => <code className="text-xs">{s.code}</code>, secondary: true },
            { header: "Expired", cell: (s: any) => date(s.subscription?.expiresAt), secondary: true },
            { header: "Status", align: "right", cell: (s: any) => <Badge value={s.status} /> },
          ]}
        />
      </Card>
    </>
  );
}
