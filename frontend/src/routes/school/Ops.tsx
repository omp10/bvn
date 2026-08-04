import { useState } from "react";
import { api, download, useAction, useQuery } from "../../lib/api";
import { payInvoice } from "../../lib/razorpay";
import { ago, classOf, date, dateTime, titleCase } from "../../lib/format";
import {
  Alert, Badge, Button, Card, EmptyState, Field, Modal, PageHeader, Table,
} from "../../components/ui";
import { IconAlert, IconDownload, IconPlus } from "../../components/icons";

/* ── Routes and stops ───────────────────────────────────────────────── */

type Stop = { _id?: string; name: string; lat: number; lng: number; sequence: number; pickupTime?: string; dropTime?: string };
type Route = { _id: string; name: string; number?: string; type: string; distanceKm?: number; stops: Stop[]; studentCount?: number; buses?: string[] };

export function SchoolRoutes() {
  const list = useQuery<Route[]>("/school/routes");
  const [editing, setEditing] = useState<Route | "new" | null>(null);

  return (
    <>
      <PageHeader
        title="Routes & stops"
        subtitle={list.data ? `${list.data.length} routes` : undefined}
        actions={<Button onClick={() => setEditing("new")}><IconPlus className="h-4 w-4" /> Add route</Button>}
      />

      {list.data?.length === 0 && (
        <Card><EmptyState title="No routes yet" hint="A route is the ordered list of stops a bus visits." /></Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {list.data?.map((route) => (
          <Card
            key={route._id}
            title={route.name}
            subtitle={`${route.type} · ${route.stops.length} stops · ${route.studentCount ?? 0} students`}
            actions={<Button size="sm" variant="secondary" onClick={() => setEditing(route)}>Edit</Button>}
          >
            <ol className="space-y-3">
              {route.stops.map((stop, i) => (
                <li key={stop._id ?? i} className="flex items-start gap-3">
                  <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-50 text-xs font-bold text-brand-600">
                    {stop.sequence}
                  </span>
                  <div className="flex-1">
                    <div className="text-sm font-medium text-slate-800">{stop.name}</div>
                    <div className="text-xs text-slate-500">
                      {stop.pickupTime ? `Pickup ${stop.pickupTime}` : ""}
                      {stop.dropTime ? ` · Drop ${stop.dropTime}` : ""}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
            {route.buses?.length ? (
              <p className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-500">
                Served by {route.buses.join(", ")}
              </p>
            ) : (
              <p className="mt-4 border-t border-slate-100 pt-3 text-xs text-amber-600">No bus assigned to this route yet.</p>
            )}
          </Card>
        ))}
      </div>

      {editing && <RouteEditor route={editing === "new" ? null : editing} onClose={() => setEditing(null)} onDone={list.reload} />}
    </>
  );
}

function RouteEditor({ route, onClose, onDone }: { route: Route | null; onClose: () => void; onDone: () => void }) {
  const { busy, error, run } = useAction();
  const [name, setName] = useState(route?.name ?? "");
  const [number, setNumber] = useState(route?.number ?? "");
  const [stops, setStops] = useState<Stop[]>(
    route?.stops.map((s) => ({ ...s })) ?? [{ name: "", lat: 18.5204, lng: 73.8567, sequence: 1 }]
  );

  const update = (i: number, patch: Partial<Stop>) =>
    setStops(stops.map((s, index) => (index === i ? { ...s, ...patch } : s)));

  const save = () =>
    void run(
      () =>
        api(route ? `/school/routes/${route._id}` : "/school/routes", {
          method: route ? "PATCH" : "POST",
          body: {
            name,
            number: number || undefined,
            // Re-numbered on save so the sequence can never have holes.
            stops: stops.map((s, i) => ({ ...s, sequence: i + 1, lat: Number(s.lat), lng: Number(s.lng) })),
          },
        }),
      () => { onDone(); onClose(); }
    );

  return (
    <Modal
      open
      onClose={onClose}
      title={route ? `Edit ${route.name}` : "Add a route"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={busy} onClick={save}>Save route</Button>
        </>
      }
    >
      <Alert>{error}</Alert>
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Route name" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
          <Field label="Route number" value={number} onChange={(e) => setNumber(e.target.value)} />
        </div>

        <div>
          <p className="mb-2 text-sm font-semibold text-slate-700">Stops, in order</p>
          <div className="space-y-3">
            {stops.map((stop, i) => (
              <div key={i} className="rounded-lg border border-slate-200 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-bold text-brand-600">Stop {i + 1}</span>
                  {stops.length > 1 && (
                    <button type="button" onClick={() => setStops(stops.filter((_, index) => index !== i))}
                      className="text-xs font-medium text-red-600 hover:underline">
                      Remove
                    </button>
                  )}
                </div>
                <Field label="Stop name" value={stop.name} onChange={(e) => update(i, { name: e.target.value })} />
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <Field label="Latitude" type="number" step="any" value={stop.lat}
                    onChange={(e) => update(i, { lat: Number(e.target.value) })} />
                  <Field label="Longitude" type="number" step="any" value={stop.lng}
                    onChange={(e) => update(i, { lng: Number(e.target.value) })} />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <Field label="Pickup time" type="time" value={stop.pickupTime ?? ""}
                    onChange={(e) => update(i, { pickupTime: e.target.value })} />
                  <Field label="Drop time" type="time" value={stop.dropTime ?? ""}
                    onChange={(e) => update(i, { dropTime: e.target.value })} />
                </div>
              </div>
            ))}
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="mt-3"
            onClick={() => setStops([...stops, { name: "", lat: 18.5204, lng: 73.8567, sequence: stops.length + 1 }])}
          >
            <IconPlus className="h-4 w-4" /> Add stop
          </Button>
          <p className="mt-2 text-xs text-slate-500">
            Coordinates decide when the "bus approaching" alert fires, so put them on the actual stop.
          </p>
        </div>
      </div>
    </Modal>
  );
}

/* ── Route change requests and emergency alerts ─────────────────────── */

export function SchoolRequests() {
  const list = useQuery<any[]>("/school/route-changes?status=pending");
  const { busy, error, run } = useAction();
  const [rejecting, setRejecting] = useState<any | null>(null);
  const [note, setNote] = useState("");

  return (
    <>
      <PageHeader title="Route change requests" subtitle="Raised by parents, applied once you approve." />
      <Alert>{error}</Alert>

      <Card padded={false}>
        <Table
          rows={list.data}
          loading={list.loading}
          rowKey={(r) => r._id}
          empty={<EmptyState title="Nothing awaiting approval" hint="Parent requests land here." />}
          columns={[
            {
              header: "Student",
              cell: (r) => (
                <div>
                  <div className="font-medium">{r.studentId?.name}</div>
                  <div className="text-xs text-slate-500">{classOf(r.studentId ?? {})}</div>
                </div>
              ),
            },
            {
              header: "Change",
              cell: (r) => (
                <div className="text-sm">
                  <span className="text-slate-500">{r.currentRouteId?.name ?? "no route"}</span>
                  <span className="mx-1.5 text-slate-400">→</span>
                  <span className="font-medium">{r.requestedRouteId?.name}</span>
                </div>
              ),
            },
            { header: "Reason", cell: (r) => r.reason ?? "—", secondary: true },
            { header: "Raised", cell: (r) => date(r.createdAt), secondary: true },
            {
              header: "",
              align: "right",
              cell: (r) => (
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="secondary" onClick={() => { setRejecting(r); setNote(""); }}>Reject</Button>
                  <Button
                    size="sm"
                    variant="success"
                    loading={busy}
                    onClick={() => void run(() => api(`/school/route-changes/${r._id}/approve`, { body: {} }), list.reload)}
                  >
                    Approve
                  </Button>
                </div>
              ),
            },
          ]}
        />
      </Card>

      <Modal
        open={Boolean(rejecting)}
        onClose={() => setRejecting(null)}
        title="Reject this request"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRejecting(null)}>Cancel</Button>
            <Button
              variant="danger"
              loading={busy}
              onClick={() =>
                void run(
                  () => api(`/school/route-changes/${rejecting._id}/reject`, { body: { note } }),
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
          label="Reason for the parent"
          placeholder="That route is already full."
          value={note}
          onChange={(e) => setNote(e.target.value)}
          autoFocus
        />
      </Modal>
    </>
  );
}

export function SchoolAlerts() {
  const list = useQuery<any[]>("/school/emergencies");
  const { busy, error, run } = useAction();

  return (
    <>
      <PageHeader title="Emergency alerts" subtitle="Raised from the bus by a driver or attendant." />
      <Alert>{error}</Alert>

      {list.data?.length === 0 && (
        <Card><EmptyState title="No alerts" hint="Nothing has been reported from any bus." /></Card>
      )}

      <div className="space-y-3">
        {list.data?.map((alert) => (
          <Card key={alert._id} className={alert.status === "open" ? "border-red-300 bg-red-50/40" : undefined}>
            <div className="flex flex-wrap items-start gap-3">
              <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${
                alert.status === "open" ? "bg-red-100 text-red-600" : "bg-slate-100 text-slate-500"
              }`}>
                <IconAlert />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{titleCase(alert.type)}</span>
                  <Badge value={alert.status} />
                </div>
                <p className="mt-0.5 text-sm text-slate-600">
                  {alert.vehicleId?.busNumber ?? "Unknown bus"} · raised by {alert.raisedBy?.name ?? "—"}
                  {alert.raisedBy?.phone ? ` (${alert.raisedBy.phone})` : ""}
                </p>
                {alert.note && <p className="mt-1 text-sm text-slate-700">{alert.note}</p>}
                <p className="mt-1 text-xs text-slate-400">{dateTime(alert.createdAt)} · {ago(alert.createdAt)}</p>
              </div>
              <div className="flex gap-2">
                {alert.status === "open" && (
                  <Button size="sm" variant="secondary" loading={busy}
                    onClick={() => void run(() => api(`/school/emergencies/${alert._id}/acknowledge`, { body: {} }), list.reload)}>
                    Acknowledge
                  </Button>
                )}
                {alert.status !== "resolved" && (
                  <Button size="sm" variant="success" loading={busy}
                    onClick={() => void run(() => api(`/school/emergencies/${alert._id}/resolve`, { body: { note: "Resolved from the office." } }), list.reload)}>
                    Resolve
                  </Button>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}

function Invoices({
  invoices, paymentsEnabled, onPaid,
}: { invoices: any[]; paymentsEnabled?: boolean; onPaid: () => void }) {
  const { busy, error, run } = useAction();

  if (!invoices.length) return <p className="text-sm text-slate-500">No invoices yet.</p>;

  return (
    <>
      <Alert>{error}</Alert>
      <ul className="divide-y divide-slate-100">
        {invoices.map((invoice) => (
          <li key={invoice._id} className="flex flex-wrap items-center gap-3 py-2.5">
            <div className="min-w-0 flex-1">
              <div className="font-mono text-xs text-slate-500">{invoice.invoiceNo}</div>
              <div className="text-sm">
                {titleCase(invoice.planKey)} · until {date(invoice.periodEnd)}
              </div>
            </div>
            <span className="font-semibold">₹{(invoice.amountInPaise / 100).toLocaleString("en-IN")}</span>
            {invoice.status === "pending" ? (
              paymentsEnabled ? (
                <Button size="sm" loading={busy} onClick={() => void run(() => payInvoice(invoice._id), onPaid)}>
                  Pay now
                </Button>
              ) : (
                // No keys configured — offering a button that only errors is worse
                // than saying so plainly.
                <Badge value="pending">Pay offline</Badge>
              )
            ) : (
              <Badge value={invoice.status} />
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

export function SchoolReports() {
  const billing = useQuery<any>("/school/billing");

  const reports = [
    ["Student list", "Every student with bus, route and parent contact.", "/school/reports/students", "students"],
    ["Attendance", "Boarding and drop records for the last 7 days.", "/school/reports/attendance", "attendance"],
    ["Trip log", "Every trip with timings, distance and counts.", "/school/reports/trips", "trips"],
  ];

  return (
    <>
      <PageHeader title="Reports" subtitle="Exports open directly in Excel." />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
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

      <Card title="Subscription & invoices">
        {billing.data ? (
          <>
            <div className="flex flex-wrap items-center gap-x-8 gap-y-3 text-sm">
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-400">Plan</div>
                <div className="font-semibold">{titleCase(billing.data.subscription?.plan ?? "—")}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-400">Valid until</div>
                <div className="font-semibold">{date(billing.data.subscription?.expiresAt)}</div>
              </div>
              <Badge value={billing.data.status} />
            </div>

            <div className="mt-4 border-t border-slate-100 pt-3">
              <Invoices
                invoices={billing.data.invoices ?? []}
                paymentsEnabled={billing.data.paymentsEnabled}
                onPaid={billing.reload}
              />
            </div>
          </>
        ) : (
          <EmptyState title="Loading…" />
        )}
      </Card>
    </>
  );
}
