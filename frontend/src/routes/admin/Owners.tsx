import { useState } from "react";
import { api, useAction, useQuery } from "../../lib/api";
import { date } from "../../lib/format";
import {
  Alert, Avatar, Badge, Button, Card, EmptyState, Field, Modal, PageHeader, Table,
} from "../../components/ui";
import { IconPlus, IconSearch } from "../../components/icons";

type Owner = {
  _id: string; name: string; companyName?: string; phone: string; email?: string;
  gstNumber?: string; status: string; createdAt: string;
  vehicleCount: number; availableCount: number;
};

export default function AdminOwners() {
  const [q, setQ] = useState("");
  const list = useQuery<{ items: Owner[]; total: number }>(
    `/super-admin/owners?limit=50${q ? `&q=${encodeURIComponent(q)}` : ""}`,
    [q]
  );
  const { busy, error, run } = useAction();
  const [adding, setAdding] = useState(false);

  const setStatus = (owner: Owner, status: string) =>
    void run(() => api(`/super-admin/owners/${owner._id}`, { method: "PATCH", body: { status } }), list.reload);

  return (
    <>
      <PageHeader
        title="Fleet owners"
        subtitle={list.data ? `${list.data.total} registered` : undefined}
        actions={<Button onClick={() => setAdding(true)}><IconPlus className="h-4 w-4" /> Register owner</Button>}
      />
      <Alert>{error}</Alert>

      <Card padded={false}>
        <div className="border-b border-slate-100 p-3">
          <div className="relative max-w-sm">
            <IconSearch className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by name, company or mobile…"
              className="h-9 w-full rounded-lg border border-slate-300 pl-9 pr-3 text-sm outline-none focus:border-brand-500"
            />
          </div>
        </div>

        <Table
          rows={list.data?.items}
          loading={list.loading}
          rowKey={(o) => o._id}
          empty={<EmptyState title="No fleet owners yet" hint="Register an owner so their buses can be assigned to schools." />}
          columns={[
            {
              header: "Owner",
              cell: (o) => (
                <div className="flex items-center gap-3">
                  <Avatar name={o.companyName || o.name} />
                  <div>
                    <div className="font-medium text-slate-900">{o.companyName || o.name}</div>
                    <div className="text-xs text-slate-500">{o.companyName ? o.name : o.phone}</div>
                  </div>
                </div>
              ),
            },
            { header: "Mobile", cell: (o) => o.phone, secondary: true },
            { header: "GST", cell: (o) => o.gstNumber ?? "—", secondary: true },
            {
              header: "Fleet",
              cell: (o) => (
                <div className="text-sm">
                  <span className="font-semibold">{o.vehicleCount}</span> vehicles
                  <div className="text-xs text-slate-500">{o.availableCount} available</div>
                </div>
              ),
            },
            { header: "Since", cell: (o) => date(o.createdAt), secondary: true },
            { header: "Status", cell: (o) => <Badge value={o.status} /> },
            {
              header: "",
              align: "right",
              cell: (o) => (
                <Button
                  size="sm"
                  variant={o.status === "inactive" ? "success" : "secondary"}
                  loading={busy}
                  onClick={() => setStatus(o, o.status === "inactive" ? "active" : "inactive")}
                >
                  {o.status === "inactive" ? "Reactivate" : "Suspend"}
                </Button>
              ),
            },
          ]}
        />
      </Card>

      <RegisterOwner open={adding} onClose={() => setAdding(false)} onDone={list.reload} />
    </>
  );
}

function RegisterOwner({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const { busy, error, run } = useAction();
  const [form, setForm] = useState<Record<string, string>>({});
  const set = (k: string) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  return (
    <Modal open={open} onClose={onClose} title="Register a fleet owner">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void run(
            () =>
              api("/super-admin/owners", {
                body: {
                  name: form.name,
                  companyName: form.companyName || undefined,
                  phone: form.phone,
                  email: form.email || undefined,
                  password: form.password,
                  address: form.address || undefined,
                  gstNumber: form.gstNumber || undefined,
                },
              }),
            () => { setForm({}); onDone(); onClose(); }
          );
        }}
      >
        <Alert>{error}</Alert>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Owner name" value={form.name ?? ""} onChange={set("name")} required autoFocus />
          <Field label="Company (optional)" value={form.companyName ?? ""} onChange={set("companyName")} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Mobile number"
            inputMode="numeric"
            hint="They sign in with this"
            value={form.phone ?? ""}
            onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/\D/g, "").slice(0, 10) })}
            required
          />
          <Field label="Password" type="password" value={form.password ?? ""} onChange={set("password")} required />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Email (optional)" type="email" value={form.email ?? ""} onChange={set("email")} />
          <Field label="GST number (optional)" value={form.gstNumber ?? ""} onChange={set("gstNumber")} />
        </div>
        <Field label="Business address (optional)" value={form.address ?? ""} onChange={set("address")} />

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={busy}>Register</Button>
        </div>
      </form>
    </Modal>
  );
}
