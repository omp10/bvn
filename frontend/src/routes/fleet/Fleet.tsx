import { useState } from "react";
import { api, useAction, useQuery } from "../../lib/api";
import { date } from "../../lib/format";
import {
  Alert, Badge, Button, Card, EmptyState, Field, Modal, PageHeader, Select, Stat, StatGrid, Table,
} from "../../components/ui";
import { IconBus, IconPlus, IconUsers } from "../../components/icons";

type Vehicle = {
  _id: string; vehicleNumber: string; busNumber?: string; capacity: number; status: string;
  schoolId?: { name?: string; city?: string } | null;
  driverId?: { _id: string; name: string } | null;
  nextMaintenanceDueAt?: string;
};

export function FleetDashboard() {
  const { data } = useQuery<any>("/dashboard");
  const assignments = useQuery<Vehicle[]>("/owner/assignments");

  return (
    <>
      <PageHeader title="My fleet" subtitle="Vehicles across every school you serve." />

      <StatGrid>
        <Stat label="Vehicles" value={data?.total} icon={<IconBus className="h-5 w-5" />} />
        <Stat label="Assigned" value={data?.assigned} tone="leaf" hint={`${data?.available ?? 0} available`} />
        <Stat label="Running now" value={data?.running} tone="sun" />
        <Stat label="Drivers" value={data?.drivers} tone="slate" icon={<IconUsers className="h-5 w-5" />}
          hint={data?.maintenanceDue ? `${data.maintenanceDue} services due` : undefined} />
      </StatGrid>

      <Card className="mt-4" title="Current assignments" padded={false}>
        <Table
          rows={assignments.data}
          loading={assignments.loading}
          rowKey={(v) => v._id}
          empty={<EmptyState title="No vehicles placed yet" hint="The platform assigns your vehicles to schools that request them." />}
          columns={[
            {
              header: "Vehicle",
              cell: (v) => (
                <div>
                  <div className="font-semibold">{v.vehicleNumber}</div>
                  <div className="text-xs text-slate-500">{v.busNumber ?? "—"} · {v.capacity} seats</div>
                </div>
              ),
            },
            {
              header: "School",
              cell: (v) => (
                <div>
                  <div className="text-sm font-medium">{v.schoolId?.name ?? "Unassigned"}</div>
                  <div className="text-xs text-slate-500">{v.schoolId?.city ?? ""}</div>
                </div>
              ),
            },
            { header: "Status", align: "right", cell: (v) => <Badge value={v.status} /> },
          ]}
        />
      </Card>
    </>
  );
}

export function FleetVehicles() {
  const list = useQuery<Vehicle[]>("/owner/vehicles");
  const drivers = useQuery<any[]>("/owner/drivers");
  const { busy, error, run } = useAction();
  const [adding, setAdding] = useState(false);

  const setStatus = (id: string, status: string) =>
    void run(() => api(`/owner/vehicles/${id}/status`, { method: "PATCH", body: { status } }), list.reload);

  const setDriver = (id: string, driverId: string) =>
    void run(() => api(`/owner/vehicles/${id}/driver`, { body: { driverId: driverId || null } }), list.reload);

  return (
    <>
      <PageHeader
        title="Vehicles"
        subtitle={list.data ? `${list.data.length} registered` : undefined}
        actions={<Button onClick={() => setAdding(true)}><IconPlus className="h-4 w-4" /> Register vehicle</Button>}
      />
      <Alert>{error}</Alert>

      <Card padded={false}>
        <Table
          rows={list.data}
          loading={list.loading}
          rowKey={(v) => v._id}
          empty={<EmptyState title="No vehicles yet" hint="Register a vehicle to make it available to schools." />}
          columns={[
            {
              header: "Vehicle",
              cell: (v) => (
                <div>
                  <div className="font-semibold">{v.vehicleNumber}</div>
                  <div className="text-xs text-slate-500">{v.capacity} seats</div>
                </div>
              ),
            },
            { header: "School", cell: (v) => v.schoolId?.name ?? <span className="text-slate-400">Unassigned</span> },
            {
              header: "Driver",
              secondary: true,
              cell: (v) => (
                <Select
                  value={v.driverId?._id ?? ""}
                  onChange={(e) => setDriver(v._id, e.target.value)}
                  className="[&_select]:h-8 [&_select]:text-xs"
                >
                  <option value="">No driver</option>
                  {drivers.data?.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
                </Select>
              ),
            },
            {
              header: "Status",
              align: "right",
              cell: (v) =>
                // A running bus is mid-trip with children aboard — only the
                // driver ends that, so the control is hidden rather than shown
                // and then rejected.
                v.status === "running" ? (
                  <Badge value="running" />
                ) : (
                  <Select
                    value={v.status}
                    disabled={busy}
                    onChange={(e) => setStatus(v._id, e.target.value)}
                    className="[&_select]:h-8 [&_select]:text-xs"
                  >
                    {["available", "maintenance", "offline"].map((s) => <option key={s} value={s}>{s}</option>)}
                    {v.status === "assigned" && <option value="assigned" disabled>assigned</option>}
                  </Select>
                ),
            },
          ]}
        />
      </Card>

      <RegisterVehicle open={adding} onClose={() => setAdding(false)} onDone={list.reload} />
    </>
  );
}

function RegisterVehicle({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const { busy, error, run } = useAction();
  const [form, setForm] = useState<Record<string, string>>({ type: "bus" });

  return (
    <Modal open={open} onClose={onClose} title="Register a vehicle">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void run(
            () => api("/owner/vehicles", { body: { vehicleNumber: form.vehicleNumber, type: form.type, capacity: Number(form.capacity) } }),
            () => { setForm({ type: "bus" }); onDone(); onClose(); }
          );
        }}
      >
        <Alert>{error}</Alert>
        <Field label="Vehicle number" placeholder="MH12 AB 1234" value={form.vehicleNumber ?? ""}
          onChange={(e) => setForm({ ...form, vehicleNumber: e.target.value.toUpperCase() })} required autoFocus />
        <div className="grid gap-3 sm:grid-cols-2">
          <Select label="Type" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            {["bus", "minibus", "van"].map((t) => <option key={t} value={t}>{t}</option>)}
          </Select>
          <Field label="Seating capacity" type="number" min={1} max={100} value={form.capacity ?? ""}
            onChange={(e) => setForm({ ...form, capacity: e.target.value })} required />
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={busy}>Register</Button>
        </div>
      </form>
    </Modal>
  );
}

export function FleetDrivers() {
  const list = useQuery<any[]>("/owner/drivers");
  const { busy, error, run } = useAction();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const set = (k: string) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  return (
    <>
      <PageHeader
        title="Drivers"
        actions={<Button onClick={() => setAdding(true)}><IconPlus className="h-4 w-4" /> Add driver</Button>}
      />
      <Alert>{error}</Alert>

      <Card padded={false}>
        <Table
          rows={list.data}
          loading={list.loading}
          rowKey={(d) => d._id}
          empty={<EmptyState title="No drivers yet" />}
          columns={[
            { header: "Name", cell: (d) => <span className="font-medium">{d.name}</span> },
            { header: "Mobile", cell: (d) => d.phone },
            { header: "Licence", cell: (d) => d.licenseNumber ?? "—", secondary: true },
            { header: "Expires", cell: (d) => date(d.licenseExpiry), secondary: true },
            { header: "School", align: "right", cell: (d) => d.schoolId?.name ?? <span className="text-slate-400">—</span> },
          ]}
        />
      </Card>

      <Modal open={adding} onClose={() => setAdding(false)} title="Add a driver">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void run(() => api("/owner/drivers", { body: form }), () => { setForm({}); setAdding(false); list.reload(); });
          }}
        >
          <Alert>{error}</Alert>
          <Field label="Full name" value={form.name ?? ""} onChange={set("name")} required autoFocus />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Mobile" inputMode="numeric" value={form.phone ?? ""}
              onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/\D/g, "").slice(0, 10) })} required />
            <Field label="Password" type="password" value={form.password ?? ""} onChange={set("password")} required />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Licence number" value={form.licenseNumber ?? ""} onChange={set("licenseNumber")} required />
            <Field label="Licence expiry" type="date" value={form.licenseExpiry ?? ""} onChange={set("licenseExpiry")} required />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setAdding(false)}>Cancel</Button>
            <Button type="submit" loading={busy}>Add driver</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
