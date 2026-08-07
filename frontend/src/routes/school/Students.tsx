import { useState } from "react";
import { api, useAction, useQuery } from "../../lib/api";
import { PhotoCell } from "../../components/Upload";
import { classOf } from "../../lib/format";
import {
  Alert, Avatar, Badge, Button, Card, EmptyState, Field, Modal, PageHeader, Select, Table,
} from "../../components/ui";
import { IconPlus, IconSearch } from "../../components/icons";

type Student = {
  _id: string; name: string; class?: string; section?: string; rollNo?: string;
  vehicleId?: { _id: string; busNumber: string } | null;
  routeId?: { _id: string; name: string; stops?: Stop[] } | null;
  pickupStopId?: string; dropStopId?: string;
  parentId?: { name: string; phone: string } | null;
  photoUrl?: string | null;
};
type Stop = { _id: string; name: string; sequence: number };

export function SchoolStudents() {
  const [q, setQ] = useState("");
  const [unassigned, setUnassigned] = useState(false);
  const list = useQuery<{ items: Student[]; total: number }>(
    `/school/students?limit=100${q ? `&q=${encodeURIComponent(q)}` : ""}${unassigned ? "&unassigned=true" : ""}`,
    [q, unassigned]
  );
  const buses = useQuery<any[]>("/school/buses");
  const routes = useQuery<any[]>("/school/routes");

  const [adding, setAdding] = useState(false);
  const [transportFor, setTransportFor] = useState<Student | null>(null);

  return (
    <>
      <PageHeader
        title="Students"
        subtitle={list.data ? `${list.data.total} enrolled` : undefined}
        actions={<Button onClick={() => setAdding(true)}><IconPlus className="h-4 w-4" /> Add student</Button>}
      />

      <Card padded={false}>
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3">
          <div className="relative min-w-52 flex-1">
            <IconSearch className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search students…"
              className="h-9 w-full rounded-lg border border-slate-300 pl-9 pr-3 text-sm outline-none focus:border-brand-500"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={unassigned} onChange={(e) => setUnassigned(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 accent-brand-600" />
            Only students without a bus
          </label>
        </div>

        <Table
          rows={list.data?.items}
          loading={list.loading}
          rowKey={(s) => s._id}
          empty={<EmptyState title="No students found" hint="Try clearing the search, or add a student." />}
          columns={[
            {
              header: "Student",
              cell: (s) => (
                <div className="flex items-center gap-3">
                  {s.photoUrl ? (
                    <img src={s.photoUrl} alt="" className="h-9 w-9 rounded-full object-cover ring-1 ring-slate-200" />
                  ) : (
                    <Avatar name={s.name} />
                  )}
                  <div>
                    <div className="font-medium text-slate-900">{s.name}</div>
                    <div className="text-xs text-slate-500">
                      {classOf(s)}{s.rollNo ? ` · Roll ${s.rollNo}` : ""}
                    </div>
                  </div>
                </div>
              ),
            },
            {
              /* An attendant matching a face to a name on a crowded bus is the
                 whole reason to keep these. */
              header: "Photo",
              secondary: true,
              cell: (s: any) => (
                <PhotoCell
                  url={s.photoUrl}
                  name={s.name}
                  path={`/uploads/student/${s._id}/photo`}
                  onDone={list.reload}
                />
              ),
            },
            {
              header: "Transport",
              cell: (s) =>
                s.vehicleId ? (
                  <div>
                    <div className="text-sm font-medium">{s.vehicleId.busNumber}</div>
                    <div className="text-xs text-slate-500">{s.routeId?.name ?? "no route"}</div>
                  </div>
                ) : (
                  // A student with no bus never appears in the parent app, so
                  // this is the list the office works through at term start.
                  <Badge value="pending">Not assigned</Badge>
                ),
            },
            {
              header: "Parent",
              secondary: true,
              cell: (s) =>
                s.parentId ? (
                  <div>
                    <div className="text-sm">{s.parentId.name}</div>
                    <div className="text-xs text-slate-500">{s.parentId.phone}</div>
                  </div>
                ) : <span className="text-amber-600">No parent linked</span>,
            },
            {
              header: "",
              align: "right",
              cell: (s) => (
                <Button size="sm" variant="secondary" onClick={() => setTransportFor(s)}>
                  {s.vehicleId ? "Change" : "Assign"}
                </Button>
              ),
            },
          ]}
        />
      </Card>

      <AddStudent open={adding} onClose={() => setAdding(false)} onDone={list.reload} />
      <TransportModal
        student={transportFor}
        buses={buses.data ?? []}
        routes={routes.data ?? []}
        onClose={() => setTransportFor(null)}
        onDone={list.reload}
      />
    </>
  );
}

function AddStudent({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const { busy, error, run } = useAction();
  const [form, setForm] = useState<Record<string, string>>({});
  const set = (k: string) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  return (
    <Modal open={open} onClose={onClose} title="Add a student">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void run(
            () =>
              api("/school/students", {
                body: {
                  name: form.name,
                  class: form.class || undefined,
                  section: form.section || undefined,
                  rollNo: form.rollNo || undefined,
                  // Creating the parent here is what makes the child show up in
                  // the parent app the moment they are enrolled.
                  parent: form.parentPhone
                    ? { name: form.parentName || `${form.name}'s parent`, phone: form.parentPhone }
                    : undefined,
                },
              }),
            () => { setForm({}); onDone(); onClose(); }
          );
        }}
      >
        <Alert>{error}</Alert>
        <Field label="Student name" value={form.name ?? ""} onChange={set("name")} required autoFocus />
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Class" value={form.class ?? ""} onChange={set("class")} />
          <Field label="Section" value={form.section ?? ""} onChange={set("section")} />
          <Field label="Roll no." value={form.rollNo ?? ""} onChange={set("rollNo")} />
        </div>

        <div className="rounded-lg bg-slate-50 p-3">
          <p className="mb-3 text-sm font-semibold text-slate-700">Parent</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name" value={form.parentName ?? ""} onChange={set("parentName")} />
            <Field label="Mobile" inputMode="numeric" hint="They sign in with this"
              value={form.parentPhone ?? ""}
              onChange={(e) => setForm({ ...form, parentPhone: e.target.value.replace(/\D/g, "").slice(0, 10) })} />
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={busy}>Add student</Button>
        </div>
      </form>
    </Modal>
  );
}

function TransportModal({
  student, buses, routes, onClose, onDone,
}: {
  student: Student | null; buses: any[]; routes: any[];
  onClose: () => void; onDone: () => void;
}) {
  const { busy, error, run } = useAction();
  const [vehicleId, setVehicleId] = useState("");
  const [routeId, setRouteId] = useState("");
  const [pickupStopId, setPickup] = useState("");
  const [dropStopId, setDrop] = useState("");
  const [seeded, setSeeded] = useState("");

  if (student && seeded !== student._id) {
    setSeeded(student._id);
    setVehicleId(student.vehicleId?._id ?? "");
    setRouteId(student.routeId?._id ?? "");
    setPickup(student.pickupStopId ?? "");
    setDrop(student.dropStopId ?? "");
  }

  if (!student) return null;

  const stops: Stop[] = routes.find((r) => r._id === routeId)?.stops ?? [];

  return (
    <Modal
      open
      onClose={onClose}
      title={`Transport for ${student.name}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            loading={busy}
            onClick={() =>
              void run(
                () =>
                  api(`/school/students/${student._id}/transport`, {
                    body: {
                      vehicleId: vehicleId || null,
                      routeId: routeId || null,
                      pickupStopId: pickupStopId || null,
                      dropStopId: dropStopId || null,
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
        <Select label="Bus" value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
          <option value="">No bus</option>
          {buses.map((b) => <option key={b._id} value={b._id}>{b.busNumber} · {b.capacity} seats</option>)}
        </Select>

        <Select
          label="Route"
          value={routeId}
          onChange={(e) => {
            setRouteId(e.target.value);
            // Stops belong to a route — clear them so a stale pair can't be saved.
            setPickup("");
            setDrop("");
          }}
        >
          <option value="">No route</option>
          {routes.map((r) => <option key={r._id} value={r._id}>{r.name}</option>)}
        </Select>

        {stops.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Select label="Pickup stop" value={pickupStopId} onChange={(e) => setPickup(e.target.value)}>
              <option value="">Choose…</option>
              {stops.map((s) => <option key={s._id} value={s._id}>{s.sequence}. {s.name}</option>)}
            </Select>
            <Select label="Drop stop" value={dropStopId} onChange={(e) => setDrop(e.target.value)}>
              <option value="">Choose…</option>
              {stops.map((s) => <option key={s._id} value={s._id}>{s.sequence}. {s.name}</option>)}
            </Select>
          </div>
        )}
      </div>
    </Modal>
  );
}
