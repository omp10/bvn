import { useRef, useState } from "react";
import { api, uploadFile, useAction, useQuery } from "../../lib/api";
import { date, daysLeft } from "../../lib/format";
import {
  Alert, Avatar, Badge, Button, Card, EmptyState, Field, Modal, PageHeader, Select, Table, cx,
} from "../../components/ui";
import { IconCamera, IconPlus } from "../../components/icons";

type Bus = {
  _id: string; busNumber: string; vehicleNumber: string; capacity: number; status: string;
  driverId?: { _id: string; name: string; licenseExpiry?: string };
  attendantId?: { _id: string; name: string };
  routeId?: { _id: string; name: string };
};

type Person = {
  _id: string; name: string; phone: string; status: string;
  licenseNumber?: string; licenseExpiry?: string;
  assignedVehicle?: { busNumber?: string } | null;
};

export function SchoolBuses() {
  const buses = useQuery<Bus[]>("/school/buses");
  const drivers = useQuery<Person[]>("/school/people/drivers");
  const attendants = useQuery<Person[]>("/school/people/attendants");
  const routes = useQuery<any[]>("/school/routes");
  const [adding, setAdding] = useState(false);
  const [crewFor, setCrewFor] = useState<Bus | null>(null);

  return (
    <>
      <PageHeader
        title="Buses"
        subtitle={buses.data ? `${buses.data.length} in the fleet` : undefined}
        actions={<Button onClick={() => setAdding(true)}><IconPlus className="h-4 w-4" /> Add bus</Button>}
      />

      <Card padded={false}>
        <Table
          rows={buses.data}
          loading={buses.loading}
          rowKey={(b) => b._id}
          empty={<EmptyState title="No buses yet" hint="Add your first bus to start assigning students." />}
          columns={[
            {
              header: "Bus",
              cell: (b) => (
                <div>
                  <div className="font-semibold text-slate-900">{b.busNumber}</div>
                  <div className="text-xs text-slate-500">{b.vehicleNumber}</div>
                </div>
              ),
            },
            { header: "Seats", cell: (b) => b.capacity, secondary: true },
            {
              header: "Crew",
              cell: (b) => (
                <div className="text-sm">
                  <div>{b.driverId?.name ?? <span className="text-amber-600">No driver</span>}</div>
                  <div className="text-xs text-slate-500">{b.attendantId?.name ?? "No attendant"}</div>
                </div>
              ),
            },
            {
              header: "Route",
              cell: (b) =>
                b.routeId?.name ?? <span className="text-amber-600">Not set</span>,
              secondary: true,
            },
            { header: "Status", cell: (b) => <Badge value={b.status} /> },
            {
              header: "",
              align: "right",
              cell: (b) => (
                // Named for what the modal actually does. "Assign crew" hid the
                // route dropdown from anyone who came here looking for it — the
                // route is the setting that decides whether parents get ETAs.
                <Button size="sm" variant="secondary" onClick={() => setCrewFor(b)}>
                  Crew &amp; route
                </Button>
              ),
            },
          ]}
        />
      </Card>

      <AddBus open={adding} onClose={() => setAdding(false)} onDone={buses.reload} />

      <CrewModal
        bus={crewFor}
        drivers={drivers.data ?? []}
        attendants={attendants.data ?? []}
        routes={routes.data ?? []}
        onClose={() => setCrewFor(null)}
        onDone={buses.reload}
      />
    </>
  );
}

function AddBus({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const { busy, error, run } = useAction();
  const [form, setForm] = useState<Record<string, string>>({});
  const set = (k: string) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  return (
    <Modal open={open} onClose={onClose} title="Add a bus">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void run(
            () =>
              api("/school/buses", {
                body: {
                  busNumber: form.busNumber,
                  vehicleNumber: form.vehicleNumber,
                  capacity: Number(form.capacity),
                  // Optional in the FRD and in the schema; sending "" would fail
                  // a min-length check that an absent field passes.
                  ...(form.name ? { name: form.name } : {}),
                  ...(form.type ? { type: form.type } : {}),
                },
              }),
            () => { setForm({}); onDone(); onClose(); }
          );
        }}
      >
        <Alert>{error}</Alert>
        <Field label="Bus number" placeholder="Bus 4" value={form.busNumber ?? ""} onChange={set("busNumber")} required autoFocus />
        <Field label="Vehicle number" placeholder="MH12 AB 1234" value={form.vehicleNumber ?? ""}
          onChange={(e) => setForm({ ...form, vehicleNumber: e.target.value.toUpperCase() })} required />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Seating capacity" type="number" min={1} max={100} value={form.capacity ?? ""} onChange={set("capacity")} required />
          <Select label="Bus type" value={form.type ?? "bus"} onChange={set("type")}>
            <option value="bus">Bus</option>
            <option value="minibus">Minibus</option>
            <option value="van">Van</option>
          </Select>
        </div>
        <Field label="Bus name" hint="Optional — what the children call it" placeholder="Sunflower"
          value={form.name ?? ""} onChange={set("name")} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={busy}>Add bus</Button>
        </div>
      </form>
    </Modal>
  );
}

function CrewModal({
  bus, drivers, attendants, routes, onClose, onDone,
}: {
  bus: Bus | null; drivers: Person[]; attendants: Person[]; routes: any[];
  onClose: () => void; onDone: () => void;
}) {
  const { busy, error, run } = useAction();
  const [driverId, setDriverId] = useState("");
  const [attendantId, setAttendantId] = useState("");
  const [routeId, setRouteId] = useState("");

  // Re-seed the selects whenever a different bus is opened.
  const key = bus?._id ?? "";
  const [seeded, setSeeded] = useState("");
  if (bus && seeded !== key) {
    setSeeded(key);
    setDriverId(bus.driverId?._id ?? "");
    setAttendantId(bus.attendantId?._id ?? "");
    setRouteId(bus.routeId?._id ?? "");
  }

  if (!bus) return null;

  const save = () =>
    void run(async () => {
      await api(`/school/buses/${bus._id}/crew`, {
        body: { driverId: driverId || null, attendantId: attendantId || null },
      });
      await api(`/school/buses/${bus._id}`, { method: "PATCH", body: { routeId: routeId || null } });
    }, () => { onDone(); onClose(); });

  return (
    <Modal
      open
      onClose={onClose}
      title={`${bus.busNumber} — crew and route`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={busy} onClick={save}>Save</Button>
        </>
      }
    >
      <Alert>{error}</Alert>
      <div className="space-y-4">
        <Select label="Driver" value={driverId} onChange={(e) => setDriverId(e.target.value)}>
          <option value="">No driver</option>
          {drivers.map((d) => {
            const left = daysLeft(d.licenseExpiry);
            return (
              <option key={d._id} value={d._id}>
                {d.name}{left !== null && left < 0 ? " — licence expired" : ""}
              </option>
            );
          })}
        </Select>
        <Select label="Attendant" value={attendantId} onChange={(e) => setAttendantId(e.target.value)}>
          <option value="">No attendant</option>
          {attendants.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
        </Select>
        <Select label="Route" value={routeId} onChange={(e) => setRouteId(e.target.value)}>
          <option value="">No route</option>
          {routes.map((r) => <option key={r._id} value={r._id}>{r.name}</option>)}
        </Select>
        <p className="text-xs text-slate-500">
          A driver can only be on one bus, and a bus cannot start a trip without one.
        </p>
      </div>
    </Modal>
  );
}

/**
 * Profile photo — FRD §12.1 and §13.1.
 *
 * Uploaded before the person exists, so it is a plain URL the create call
 * carries rather than a second request afterwards. A file orphaned by an
 * abandoned form is a far smaller problem than a half-created driver.
 */
function PhotoField({ url, onChange }: { url: string | null; onChange: (url: string | null) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const result = await uploadFile<{ url: string }>("/uploads/photos", file);
      onChange(result.url);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
      // Reset, so picking the same file again still fires onChange.
      if (input.current) input.current.value = "";
    }
  };

  return (
    <div>
      <span className="mb-1 block text-sm font-medium text-slate-700">Photo</span>
      <Alert>{error}</Alert>
      <input ref={input} type="file" accept="image/*" className="hidden"
        onChange={(e) => void pick(e.target.files?.[0])} />

      <div className="flex items-center gap-3">
        {url ? (
          <img src={url} alt="" className="h-14 w-14 rounded-lg object-cover ring-1 ring-slate-200" />
        ) : (
          <span className="grid h-14 w-14 place-items-center rounded-lg bg-slate-100 text-slate-400">
            <IconCamera className="h-5 w-5" />
          </span>
        )}
        <Button type="button" size="sm" variant="secondary" loading={busy} onClick={() => input.current?.click()}>
          {url ? "Replace" : "Upload"}
        </Button>
        {url && (
          <Button type="button" size="sm" variant="ghost" onClick={() => onChange(null)}>
            Remove
          </Button>
        )}
        <span className="text-xs text-slate-500">Optional</span>
      </div>
    </div>
  );
}

/* ── Drivers and attendants ─────────────────────────────────────────── */

export function SchoolPeople({ kind }: { kind: "drivers" | "attendants" }) {
  const isDriver = kind === "drivers";
  const list = useQuery<Person[]>(`/school/people/${kind}`, [kind]);
  const [adding, setAdding] = useState(false);

  return (
    <>
      <PageHeader
        title={isDriver ? "Drivers" : "Attendants"}
        subtitle={list.data ? `${list.data.length} on staff` : undefined}
        actions={<Button onClick={() => setAdding(true)}><IconPlus className="h-4 w-4" /> Add {isDriver ? "driver" : "attendant"}</Button>}
      />

      <Card padded={false}>
        <Table
          rows={list.data}
          loading={list.loading}
          rowKey={(p) => p._id}
          empty={<EmptyState title={`No ${kind} yet`} />}
          columns={[
            {
              header: "Name",
              cell: (p) => (
                <div className="flex items-center gap-3">
                  <Avatar name={p.name} />
                  <div>
                    <div className="font-medium text-slate-900">{p.name}</div>
                    <div className="text-xs text-slate-500">{p.phone}</div>
                  </div>
                </div>
              ),
            },
            ...(isDriver
              ? [{
                  header: "Licence",
                  cell: (p: Person) => {
                    const left = daysLeft(p.licenseExpiry);
                    return (
                      <div>
                        <div className="text-sm">{p.licenseNumber ?? "—"}</div>
                        <div className={cx("text-xs", left !== null && left < 30 ? "font-semibold text-amber-600" : "text-slate-500")}>
                          {p.licenseExpiry ? `expires ${date(p.licenseExpiry)}` : "no expiry on record"}
                        </div>
                      </div>
                    );
                  },
                }]
              : []),
            { header: "Bus", cell: (p) => p.assignedVehicle?.busNumber ?? <span className="text-slate-400">Unassigned</span> },
            { header: "Status", align: "right", cell: (p) => <Badge value={p.status} /> },
          ]}
        />
      </Card>

      <AddPerson kind={kind} open={adding} onClose={() => setAdding(false)} onDone={list.reload} />
    </>
  );
}

function AddPerson({
  kind, open, onClose, onDone,
}: { kind: "drivers" | "attendants"; open: boolean; onClose: () => void; onDone: () => void }) {
  const { busy, error, run } = useAction();
  const [form, setForm] = useState<Record<string, string>>({});
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const set = (k: string) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  return (
    <Modal open={open} onClose={onClose} title={`Add ${kind === "drivers" ? "a driver" : "an attendant"}`}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void run(
            () =>
              api(`/school/people/${kind}`, {
                body: {
                  name: form.name,
                  phone: form.phone,
                  password: form.password,
                  // Every optional field is omitted rather than sent empty — an
                  // empty string fails the length and email checks that an
                  // absent field passes cleanly.
                  ...(form.email ? { email: form.email } : {}),
                  ...(form.address ? { address: form.address } : {}),
                  ...(form.aadhaar ? { aadhaar: form.aadhaar } : {}),
                  ...(photoUrl ? { photoUrl: new URL(photoUrl, location.origin).href } : {}),
                  ...(kind === "drivers"
                    ? {
                        licenseNumber: form.licenseNumber,
                        licenseExpiry: form.licenseExpiry,
                        ...(form.experienceYears
                          ? { experienceYears: Number(form.experienceYears) }
                          : {}),
                      }
                    : {}),
                },
              }),
            () => { setForm({}); setPhotoUrl(null); onDone(); onClose(); }
          );
        }}
      >
        <Alert>{error}</Alert>
        <Field label="Full name" value={form.name ?? ""} onChange={set("name")} required autoFocus />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Mobile number" inputMode="numeric" value={form.phone ?? ""}
            onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/\D/g, "").slice(0, 10) })} required />
          <Field label="Password" type="password" hint="They sign in with this" value={form.password ?? ""} onChange={set("password")} required />
        </div>
        {kind === "drivers" && (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Licence number" value={form.licenseNumber ?? ""} onChange={set("licenseNumber")} required />
              <Field label="Licence expiry" type="date" value={form.licenseExpiry ?? ""} onChange={set("licenseExpiry")} required />
            </div>
            <Field label="Years of experience" type="number" min={0} max={60} hint="Optional"
              value={form.experienceYears ?? ""} onChange={set("experienceYears")} />
          </>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Aadhaar number" inputMode="numeric" hint="Optional — 12 digits"
            value={form.aadhaar ?? ""}
            onChange={(e) => setForm({ ...form, aadhaar: e.target.value.replace(/\D/g, "").slice(0, 12) })} />
          <Field label="Email" type="email" hint="Optional" value={form.email ?? ""} onChange={set("email")} />
        </div>
        <Field label="Address" hint="Optional" value={form.address ?? ""} onChange={set("address")} />

        <PhotoField url={photoUrl} onChange={setPhotoUrl} />

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={busy}>Add</Button>
        </div>
      </form>
    </Modal>
  );
}
