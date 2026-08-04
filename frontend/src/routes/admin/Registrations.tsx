import { useState } from "react";
import { api, useAction, useQuery } from "../../lib/api";
import { dateTime, titleCase } from "../../lib/format";
import {
  Alert, Badge, Button, Card, EmptyState, Field, Modal, PageHeader, Select, Table,
} from "../../components/ui";
import { IconBus, IconSchool, IconUsers } from "../../components/icons";

type Application = {
  _id: string; type: "school" | "owner" | "driver"; status: string;
  name: string; phone: string; email?: string; city?: string; note?: string;
  schoolName?: string; contactPerson?: string; studentCount?: number; busCount?: number; state?: string;
  companyName?: string; gstNumber?: string; vehicleCount?: number;
  licenseNumber?: string; licenseExpiry?: string; experienceYears?: number; schoolCode?: string;
  reviewNote?: string; createdAt: string;
};

const ICON = { school: IconSchool, owner: IconBus, driver: IconUsers };

export default function AdminRegistrations() {
  const [status, setStatus] = useState("pending");
  const list = useQuery<{ items: Application[]; total: number; pending: number }>(
    `/super-admin/registrations?limit=50&status=${status}`,
    [status]
  );
  const { busy, error, run } = useAction();
  const [approving, setApproving] = useState<Application | null>(null);
  const [rejecting, setRejecting] = useState<Application | null>(null);
  const [note, setNote] = useState("");
  const [plan, setPlan] = useState("trial");

  return (
    <>
      <PageHeader
        title="Registrations"
        subtitle={
          list.data ? `${list.data.pending} awaiting review` : "Schools, fleet owners and drivers applying to join"
        }
        actions={
          <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-44">
            {["pending", "approved", "rejected"].map((s) => (
              <option key={s} value={s}>{titleCase(s)}</option>
            ))}
          </Select>
        }
      />
      <Alert>{error}</Alert>

      <Card padded={false}>
        <Table
          rows={list.data?.items}
          loading={list.loading}
          rowKey={(a) => a._id}
          empty={<EmptyState title="Nothing here" hint="Applications from the public sign-up page land here." />}
          columns={[
            {
              header: "Applicant",
              cell: (a) => {
                const Icon = ICON[a.type];
                return (
                  <div className="flex items-center gap-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600">
                      <Icon className="h-5 w-5" />
                    </span>
                    <div>
                      <div className="font-medium text-slate-900">
                        {a.schoolName ?? a.companyName ?? a.name}
                      </div>
                      <div className="text-xs text-slate-500">
                        {a.name} · {a.phone}{a.city ? ` · ${a.city}` : ""}
                      </div>
                    </div>
                  </div>
                );
              },
            },
            { header: "Type", cell: (a) => <Badge value={a.type === "owner" ? "assigned" : "pending"}>{titleCase(a.type)}</Badge> },
            {
              header: "Details",
              secondary: true,
              cell: (a) =>
                a.type === "school" ? `${a.studentCount ?? "?"} students · ${a.busCount ?? "?"} buses`
                : a.type === "owner" ? `${a.vehicleCount ?? "?"} vehicles${a.gstNumber ? ` · GST ${a.gstNumber}` : ""}`
                : `${a.licenseNumber ?? "—"}${a.experienceYears ? ` · ${a.experienceYears} yrs` : ""}${a.schoolCode ? ` · code ${a.schoolCode}` : ""}`,
            },
            { header: "Applied", cell: (a) => dateTime(a.createdAt), secondary: true },
            {
              header: "",
              align: "right",
              cell: (a) =>
                a.status === "pending" ? (
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="secondary" onClick={() => { setRejecting(a); setNote(""); }}>Reject</Button>
                    <Button size="sm" variant="success" onClick={() => { setApproving(a); setPlan("trial"); setNote(""); }}>
                      Approve
                    </Button>
                  </div>
                ) : (
                  <Badge value={a.status === "approved" ? "approved" : "rejected"} />
                ),
            },
          ]}
        />
      </Card>

      <Modal
        open={Boolean(approving)}
        onClose={() => setApproving(null)}
        title={`Approve ${approving?.schoolName ?? approving?.companyName ?? approving?.name ?? ""}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setApproving(null)}>Cancel</Button>
            <Button
              variant="success"
              loading={busy}
              onClick={() =>
                void run(
                  () => api(`/super-admin/registrations/${approving!._id}/approve`, { body: { plan, note: note || undefined } }),
                  () => { setApproving(null); list.reload(); }
                )
              }
            >
              Approve and create account
            </Button>
          </>
        }
      >
        <div className="space-y-4 text-sm">
          <p className="text-slate-600">
            {approving?.type === "school"
              ? "This creates the school, its unique code, the first invoice and the admin account."
              : approving?.type === "driver"
                ? approving?.schoolCode
                  ? `This creates the driver account and attaches them to school ${approving.schoolCode}.`
                  : "This creates the driver account. With no school code they join the platform pool and can be assigned to a school that requests drivers."
                : "This creates the fleet owner account so they can register vehicles."}
          </p>

          {approving?.type === "school" && (
            <Select label="Subscription plan" value={plan} onChange={(e) => setPlan(e.target.value)}>
              {["trial", "monthly", "quarterly", "yearly"].map((p) => (
                <option key={p} value={p}>{titleCase(p)}</option>
              ))}
            </Select>
          )}

          <Field label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />

          <p className="rounded-lg bg-slate-50 p-2.5 text-xs text-slate-500">
            They sign in with <strong>{approving?.phone}</strong> and the password they chose when applying —
            it was hashed on arrival and is never visible here.
          </p>
        </div>
      </Modal>

      <Modal
        open={Boolean(rejecting)}
        onClose={() => setRejecting(null)}
        title="Reject application"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRejecting(null)}>Cancel</Button>
            <Button
              variant="danger"
              loading={busy}
              disabled={!note.trim()}
              onClick={() =>
                void run(
                  () => api(`/super-admin/registrations/${rejecting!._id}/reject`, { body: { note } }),
                  () => { setRejecting(null); list.reload(); }
                )
              }
            >
              Reject
            </Button>
          </>
        }
      >
        <Field
          label="Reason"
          hint="The applicant can see this on the status page"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          autoFocus
        />
      </Modal>
    </>
  );
}

/* ── Driver requests from schools ───────────────────────────────────── */

export function AdminDriverRequests() {
  const list = useQuery<{ items: any[] }>("/super-admin/driver-requests?limit=50");
  const { busy, error, run } = useAction();
  const [filling, setFilling] = useState<any | null>(null);
  const candidates = useQuery<any[]>(
    filling ? `/super-admin/driver-requests/${filling._id}/candidates` : null,
    [filling?._id]
  );
  const [chosen, setChosen] = useState<string[]>([]);

  const toggle = (id: string) =>
    setChosen((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));

  return (
    <>
      <PageHeader title="Driver requests" subtitle="Schools asking the platform for drivers." />
      <Alert>{error}</Alert>

      <Card padded={false}>
        <Table
          rows={list.data?.items}
          loading={list.loading}
          rowKey={(r) => r._id}
          empty={<EmptyState title="No driver requests" hint="Schools short of drivers will appear here." />}
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
            {
              header: "Needs",
              cell: (r) => (
                <div className="text-sm">
                  <div>{r.driverCount} driver{r.driverCount > 1 ? "s" : ""}</div>
                  {r.minExperienceYears > 0 && (
                    <div className="text-xs text-slate-500">min {r.minExperienceYears} yrs experience</div>
                  )}
                </div>
              ),
            },
            { header: "Note", cell: (r) => r.note ?? "—", secondary: true },
            {
              header: "Assigned",
              secondary: true,
              cell: (r) => r.assignedDriverIds?.map((d: any) => d.name).join(", ") || "—",
            },
            { header: "Status", cell: (r) => <Badge value={r.status} /> },
            {
              header: "",
              align: "right",
              cell: (r) =>
                r.status === "pending" && (
                  <Button size="sm" onClick={() => { setFilling(r); setChosen([]); }}>Assign drivers</Button>
                ),
            },
          ]}
        />
      </Card>

      <Modal
        open={Boolean(filling)}
        onClose={() => setFilling(null)}
        title={`Assign drivers — ${filling?.schoolId?.name ?? ""}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setFilling(null)}>Cancel</Button>
            <Button
              loading={busy}
              disabled={!chosen.length}
              onClick={() =>
                void run(
                  () => api(`/super-admin/driver-requests/${filling._id}/assign`, { body: { driverIds: chosen } }),
                  () => { setFilling(null); list.reload(); }
                )
              }
            >
              Assign {chosen.length || ""}
            </Button>
          </>
        }
      >
        {candidates.loading && <p className="text-sm text-slate-500">Finding available drivers…</p>}
        {candidates.data?.length === 0 && (
          <EmptyState
            title="No drivers available"
            hint="Every approved driver already belongs to a school, or none meet the experience asked for."
          />
        )}
        <ul className="space-y-2">
          {candidates.data?.map((d) => (
            <li key={d._id}>
              <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 p-3 hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={chosen.includes(d._id)}
                  onChange={() => toggle(d._id)}
                  className="h-4 w-4 rounded border-slate-300 accent-brand-600"
                />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{d.name}</div>
                  <div className="text-xs text-slate-500">
                    {d.phone} · {d.licenseNumber ?? "no licence"}
                    {d.experienceYears ? ` · ${d.experienceYears} yrs` : ""}
                  </div>
                </div>
              </label>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-slate-500">
          Only approved drivers with a valid licence and no school are listed.
        </p>
      </Modal>
    </>
  );
}
