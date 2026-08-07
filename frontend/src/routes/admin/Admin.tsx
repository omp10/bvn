import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api, fetchImageUrl, useAction, useQuery } from "../../lib/api";
import { date, daysLeft, rupees, titleCase } from "../../lib/format";
import {
  Alert, Badge, Button, Card, EmptyState, Field, Modal, PageHeader, Select, Stat, StatGrid, Table,
} from "../../components/ui";
import { IconBus, IconPlus, IconSchool, IconUsers, IconWallet } from "../../components/icons";
import { UploadButton } from "../../components/Upload";

type School = {
  _id: string; name: string; code: string; city?: string; status: string;
  subscription?: { plan?: string; expiresAt?: string };
};

export function AdminDashboard() {
  const { data } = useQuery<any>("/dashboard");
  const schools = useQuery<{ items: School[] }>("/super-admin/schools?limit=6");
  const expiring = useQuery<School[]>("/super-admin/subscriptions/expiring?days=14");

  return (
    <>
      <PageHeader title="Platform overview" subtitle="Every school running on BalVahini." />

      <StatGrid>
        <Stat label="Schools" value={data?.schools?.total} icon={<IconSchool className="h-5 w-5" />}
          hint={`${data?.schools?.active ?? 0} active · ${data?.schools?.trial ?? 0} on trial`} />
        <Stat label="Buses" value={data?.vehicles} tone="leaf" icon={<IconBus className="h-5 w-5" />} />
        <Stat label="Parents" value={data?.parents} tone="sun" icon={<IconUsers className="h-5 w-5" />} />
        <Stat label="Revenue" value={rupees(data?.revenueInPaise)} tone="slate" icon={<IconWallet className="h-5 w-5" />} />
      </StatGrid>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Running right now" padded={false}>
          <div className="grid grid-cols-3 divide-x divide-slate-100">
            {[
              ["Trips", data?.runningTrips],
              ["Vehicle requests", data?.pendingVehicleRequests],
              ["Fleet owners", data?.fleetOwners],
            ].map(([label, value]) => (
              <div key={label as string} className="px-4 py-6 text-center">
                <div className="text-3xl font-bold text-brand-600">{(value as number) ?? 0}</div>
                <div className="mt-1 text-xs text-slate-500">{label as string}</div>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Expiring soon" subtitle="Subscriptions lapsing within 14 days" padded={false}>
          <Table
            rows={expiring.data}
            loading={expiring.loading}
            empty={<EmptyState title="Nothing expiring" hint="No school lapses in the next two weeks." />}
            columns={[
              { header: "School", cell: (s) => <span className="font-medium">{s.name}</span> },
              { header: "Plan", cell: (s) => titleCase(s.subscription?.plan ?? ""), secondary: true },
              {
                header: "Days left",
                align: "right",
                cell: (s) => {
                  const left = daysLeft(s.subscription?.expiresAt);
                  return <Badge value={left !== null && left <= 3 ? "expired" : "pending"}>{left ?? "—"} days</Badge>;
                },
              },
            ]}
          />
        </Card>
      </div>

      <Card className="mt-4" title="Recently added schools" padded={false}>
        <SchoolTable rows={schools.data?.items} loading={schools.loading} />
      </Card>
    </>
  );
}

function SchoolTable({ rows, loading }: { rows?: School[]; loading?: boolean }) {
  const navigate = useNavigate();
  return (
    <Table
      rows={rows}
      loading={loading}
      onRowClick={(s) => navigate(`/admin/schools/${s._id}`)}
      rowKey={(s) => s._id}
      empty={<EmptyState title="No schools yet" hint="Add the first school to get started." />}
      columns={[
        {
          header: "School",
          cell: (s) => (
            <div>
              <div className="font-medium text-slate-900">{s.name}</div>
              <div className="text-xs text-slate-500">{s.city ?? "—"}</div>
            </div>
          ),
        },
        {
          header: "Code",
          cell: (s) => (
            <code className="rounded bg-slate-100 px-2 py-1 font-mono text-xs font-semibold tracking-wider">{s.code}</code>
          ),
        },
        { header: "Plan", cell: (s) => titleCase(s.subscription?.plan ?? "—"), secondary: true },
        { header: "Expires", cell: (s) => date(s.subscription?.expiresAt), secondary: true },
        { header: "Status", align: "right", cell: (s) => <Badge value={s.status} /> },
      ]}
    />
  );
}

export function AdminSchools() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const list = useQuery<{ items: School[]; total: number }>(
    `/super-admin/schools?limit=50${q ? `&q=${encodeURIComponent(q)}` : ""}${status ? `&status=${status}` : ""}`,
    [q, status]
  );
  const [adding, setAdding] = useState(false);

  return (
    <>
      <PageHeader
        title="Schools"
        subtitle={list.data ? `${list.data.total} on the platform` : undefined}
        actions={
          <Button onClick={() => setAdding(true)}>
            <IconPlus className="h-4 w-4" /> Add school
          </Button>
        }
      />

      <Card padded={false}>
        <div className="flex flex-wrap gap-2 border-b border-slate-100 p-3">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name or code…"
            className="h-9 min-w-48 flex-1 rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-brand-500"
          />
          <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-40 [&_select]:h-9">
            <option value="">All statuses</option>
            {["active", "trial", "suspended", "expired"].map((s) => (
              <option key={s} value={s}>{titleCase(s)}</option>
            ))}
          </Select>
        </div>
        <SchoolTable rows={list.data?.items} loading={list.loading} />
      </Card>

      <AddSchool open={adding} onClose={() => setAdding(false)} onDone={list.reload} />
    </>
  );
}

function AddSchool({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const { busy, error, run } = useAction();
  const [form, setForm] = useState<Record<string, string>>({ plan: "trial" });
  const set = (k: string) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    void run(
      () =>
        api("/super-admin/schools", {
          body: {
            name: form.name,
            contactPerson: form.contactPerson || undefined,
            city: form.city || undefined,
            plan: form.plan,
            // The school cannot be used until someone can sign in to it, so the
            // first admin is created in the same step.
            admin: { name: form.adminName, phone: form.adminPhone, password: form.adminPassword },
          },
        }),
      () => {
        setForm({ plan: "trial" });
        onDone();
        onClose();
      }
    );
  };

  return (
    <Modal open={open} onClose={onClose} title="Add a school">
      <form onSubmit={submit} className="space-y-4" id="add-school">
        <Alert>{error}</Alert>
        <Field label="School name" value={form.name ?? ""} onChange={set("name")} required autoFocus />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Contact person" value={form.contactPerson ?? ""} onChange={set("contactPerson")} />
          <Field label="City" value={form.city ?? ""} onChange={set("city")} />
        </div>
        <Select label="Subscription plan" value={form.plan} onChange={set("plan")}>
          {["trial", "monthly", "quarterly", "yearly"].map((p) => (
            <option key={p} value={p}>{titleCase(p)}</option>
          ))}
        </Select>

        <div className="rounded-lg bg-slate-50 p-3">
          <p className="mb-3 text-sm font-semibold text-slate-700">First school admin</p>
          <div className="space-y-3">
            <Field label="Name" value={form.adminName ?? ""} onChange={set("adminName")} required />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Mobile" inputMode="numeric" value={form.adminPhone ?? ""}
                onChange={(e) => setForm({ ...form, adminPhone: e.target.value.replace(/\D/g, "").slice(0, 10) })} required />
              <Field label="Password" type="password" value={form.adminPassword ?? ""} onChange={set("adminPassword")} required />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={busy}>Create school</Button>
        </div>
      </form>
    </Modal>
  );
}

export function AdminSchoolDetail() {
  const { id } = useParams();
  const { data, loading, reload } = useQuery<any>(`/super-admin/schools/${id}`, [id]);
  const invite = useQuery<{ code: string; inviteUrl: string }>(`/super-admin/schools/${id}/invite`, [id]);
  const { busy, error, run } = useAction();

  if (loading || !data) return <Card><EmptyState title="Loading school…" /></Card>;
  const school = data.school;

  const setStatus = (status: string) =>
    void run(() => api(`/super-admin/schools/${id}/status`, { body: { status } }), reload);

  return (
    <>
      <PageHeader
        title={school.name}
        subtitle={`${school.city ?? "—"} · code ${school.code}`}
        actions={
          <>
            <Badge value={school.status} />
            {school.status === "suspended" ? (
              <Button variant="success" loading={busy} onClick={() => setStatus("active")}>Reactivate</Button>
            ) : (
              <Button variant="danger" loading={busy} onClick={() => setStatus("suspended")}>Suspend</Button>
            )}
          </>
        }
      />
      <Alert>{error}</Alert>

      <StatGrid>
        <Stat label="Students" value={data.counts.students} icon={<IconUsers className="h-5 w-5" />} />
        <Stat label="Buses" value={data.counts.vehicles} tone="leaf" icon={<IconBus className="h-5 w-5" />} />
        <Stat label="Drivers" value={data.counts.drivers} tone="sun" />
        <Stat label="Parents" value={data.counts.parents} tone="slate" />
      </StatGrid>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {/* FRD §8.1. Until this existed a school could never have a logo, so the
            branding the web app and both mobile apps already support had
            nothing to show and everyone fell back to BalVahini blue. */}
        <Card title="Branding" subtitle="Shown on this school's login screen, dashboards and apps">
          <div className="flex items-center gap-4">
            {school.branding?.logoUrl ? (
              <img
                src={school.branding.logoUrl}
                alt={`${school.name} logo`}
                className="h-16 w-16 rounded-lg object-contain ring-1 ring-slate-200"
              />
            ) : (
              <span className="grid h-16 w-16 place-items-center rounded-lg bg-slate-100 text-xl font-bold text-slate-400">
                {school.name?.[0] ?? "?"}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <UploadButton
                path={`/uploads/school/${id}/logo`}
                label={school.branding?.logoUrl ? "Replace logo" : "Upload logo"}
                onDone={reload}
              />
              <p className="mt-2 text-xs text-slate-500">
                Square PNG or SVG works best. Replacing deletes the old file.
              </p>
            </div>
          </div>

          <dl className="mt-4 space-y-3 border-t border-slate-100 pt-4 text-sm">
            <Row label="App name" value={school.branding?.appName ?? school.name} />
            <Row
              label="Theme colour"
              value={school.branding?.themeColor ?? "BalVahini default"}
            />
          </dl>
        </Card>

        <Card title="Subscription">
          <dl className="space-y-3 text-sm">
            <Row label="Plan" value={titleCase(school.subscription?.plan ?? "—")} />
            <Row label="Started" value={date(school.subscription?.startedAt)} />
            <Row label="Expires" value={date(school.subscription?.expiresAt)} />
            <Row label="Days remaining" value={String(daysLeft(school.subscription?.expiresAt) ?? "—")} />
          </dl>
        </Card>

        <Card title="Parent registration" subtitle="Share this with parents to onboard them">
          <p className="text-xs uppercase tracking-wide text-slate-500">School code</p>
          <p className="mb-4 font-mono text-3xl font-bold tracking-[0.25em] text-brand-600">{school.code}</p>
          {invite.data && (
            <>
              <SchoolQr schoolId={String(id)} />
              <p className="mt-4 text-xs uppercase tracking-wide text-slate-500">Invitation link</p>
              <p className="break-all rounded-lg bg-slate-50 p-2 text-xs text-slate-600">{invite.data.inviteUrl}</p>
              <Button
                variant="secondary"
                size="sm"
                className="mt-3"
                onClick={() => navigator.clipboard?.writeText(invite.data!.inviteUrl)}
              >
                Copy link
              </Button>
            </>
          )}
        </Card>
      </div>
    </>
  );
}

/**
 * The QR image. Fetched rather than linked because the endpoint needs the bearer
 * token, and an <img src> cannot send one.
 */
function SchoolQr({ schoolId }: { schoolId: string }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    fetchImageUrl(`/super-admin/schools/${schoolId}/qr.svg`)
      .then((url) => { objectUrl = url; setSrc(url); })
      .catch(() => setSrc(null));
    // Revoking on unmount stops the blob leaking for the life of the tab.
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [schoolId]);

  if (!src) return null;

  return (
    <div className="mt-4 flex flex-col items-center rounded-lg border border-slate-200 p-3">
      <img src={src} alt="School QR code" className="h-40 w-40" />
      <p className="mt-2 text-xs text-slate-500">Parents scan this to join</p>
      <a href={src} download={`school-${schoolId}-qr.svg`} className="mt-1 text-xs font-semibold text-brand-600 hover:underline">
        Download for printing
      </a>
    </div>
  );
}

const Row = ({ label, value }: { label: string; value: string }) => (
  <div className="flex justify-between border-b border-slate-100 pb-2 last:border-0">
    <dt className="text-slate-500">{label}</dt>
    <dd className="font-medium text-slate-900">{value}</dd>
  </div>
);
