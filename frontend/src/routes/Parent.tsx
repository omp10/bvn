import { useState } from "react";
import { api, useAction, usePolling, useQuery } from "../lib/api";
import { useSocket, useTripRoom } from "../lib/socket";
import { ago, classOf, date, dateTime, time } from "../lib/format";
import {
  Alert, Avatar, Badge, Button, Card, EmptyState, LiveDot, Loading, Modal, Select, cx,
} from "../components/ui";
import { IconBell, IconBus, IconClock, IconPhone, IconPin } from "../components/icons";
import BusMap from "../components/BusMap";

type Stop = { _id: string; name: string; sequence: number; lat: number; lng: number };
type Child = {
  _id: string; name: string; class?: string; section?: string;
  pickupStopId?: string; dropStopId?: string;
  vehicleId?: { busNumber: string; vehicleNumber: string } | null;
  routeId?: { name: string; stops?: Stop[] } | null;
};

export function ParentHome() {
  const children = useQuery<Child[]>("/parent/children");
  const [selectedId, setSelected] = useState<string | null>(null);
  const childId = selectedId ?? children.data?.[0]?._id ?? null;

  // The socket delivers positions the instant the bus reports; the slow poll is
  // only a safety net for a dropped connection.
  const live = usePolling<any>(childId ? `/parent/children/${childId}/live` : null, 30_000);
  const [changing, setChanging] = useState(false);

  const tripId = live.data?.trip?.id ?? null;
  useTripRoom(tripId);

  useSocket({
    "trip:position": (p: { lat: number; lng: number; at: string }) =>
      live.data && live.setData({ ...live.data, position: { ...live.data.position, ...p }, gpsStale: false }),
    "trip:stop_reached": () => live.reload(),
    "attendance:marked": () => live.reload(),
    "trip:ended": () => live.reload(),
  }, [live.data]);

  if (children.loading && !children.data) return <Loading />;
  if (!children.data?.length) {
    return (
      <Card>
        <EmptyState
          title="No children linked yet"
          hint="Ask the school office to add your mobile number to your child's record."
        />
      </Card>
    );
  }

  const child = children.data.find((c) => c._id === childId) ?? children.data[0];
  const status = live.data?.status;

  // The live endpoint only names the stop while a trip is running. Before the
  // bus sets off, fall back to the child's own assignment — telling a parent
  // "not set" when a stop exists is worse than saying nothing.
  const assignedStop =
    live.data?.myStop?.name ??
    child.routeId?.stops?.find((s) => String(s._id) === String(child.pickupStopId))?.name ??
    "Not set";

  return (
    <div className="space-y-4">
      {children.data.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {children.data.map((c) => (
            <button
              key={c._id}
              onClick={() => setSelected(c._id)}
              className={cx(
                "flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition",
                c._id === child._id ? "border-brand-600 bg-brand-600 text-white" : "border-slate-300 bg-white text-slate-600"
              )}
            >
              <Avatar name={c.name} className={cx("h-6 w-6 text-[10px]", c._id === child._id && "bg-white/25 text-white")} />
              {c.name.split(" ")[0]}
            </button>
          ))}
        </div>
      )}

      {/* The one card a parent actually opens the app for. */}
      <div className="overflow-hidden rounded-card bg-shield text-white shadow-lg">
        <div className="p-5">
          <div className="flex items-start gap-3">
            <Avatar name={child.name} className="h-12 w-12 bg-white/20 text-white" />
            <div className="min-w-0 flex-1">
              <div className="text-lg font-bold">{child.name}</div>
              <div className="text-sm text-white/70">
                {classOf(child)} · {child.vehicleId?.busNumber ?? "No bus assigned"}
              </div>
            </div>
            {status === "running" && (
              <span className="flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-xs font-semibold">
                <LiveDot /> Live
              </span>
            )}
          </div>

          <div className="mt-5">
            {status === "running" ? (
              <>
                <div className="flex items-end gap-2">
                  <span className="text-4xl font-extrabold leading-none">
                    {live.data.etaMinutes ?? "—"}
                  </span>
                  <span className="mb-1 text-sm text-white/80">min to your stop</span>
                </div>
                <p className="mt-1 text-sm text-white/70">
                  {live.data.nextStop ? `Next stop: ${live.data.nextStop.name}` : "On the way"}
                  {" · "}
                  {live.data.stopsRemaining} stop{live.data.stopsRemaining === 1 ? "" : "s"} left
                </p>
                {live.data.gpsStale && (
                  <p className="mt-2 rounded-lg bg-white/15 px-2.5 py-1.5 text-xs">
                    GPS last updated {ago(live.data.position?.at)} — the bus may be in a low-signal area.
                  </p>
                )}
              </>
            ) : status === "no_bus_assigned" ? (
              <p className="text-white/80">No bus is assigned yet. Please contact the school office.</p>
            ) : (
              <p className="text-white/80">The bus has not started its trip yet.</p>
            )}
          </div>
        </div>

        {live.data?.childStatus && (
          <div className="flex items-center gap-2 bg-black/15 px-5 py-3 text-sm">
            <IconBus className="h-4 w-4" />
            <span>
              {child.name.split(" ")[0]} is marked <strong className="capitalize">{live.data.childStatus}</strong>
            </span>
          </div>
        )}
      </div>

      {status === "running" && live.data?.position?.lat != null && (
        <Card title="On the map" padded={false}>
          <BusMap
            bus={{ lat: live.data.position.lat, lng: live.data.position.lng }}
            stops={child.routeId?.stops ?? []}
            highlightStopId={child.pickupStopId}
            height={280}
          />
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <Card title="Bus details">
          <dl className="space-y-2.5 text-sm">
            <Row label="Bus" value={child.vehicleId?.busNumber ?? "—"} />
            <Row label="Vehicle" value={child.vehicleId?.vehicleNumber ?? "—"} />
            <Row label="Route" value={child.routeId?.name ?? "—"} />
            <Row label="Your stop" value={assignedStop} />
          </dl>
          <Button variant="secondary" size="sm" block className="mt-4" onClick={() => setChanging(true)}>
            Request a route change
          </Button>
        </Card>

        <Card title="Emergency contacts">
          <Contacts driver={live.data?.driver} />
        </Card>
      </div>

      {live.data?.trip?.timeline?.length > 0 && (
        <Card title="Today's journey">
          <ol className="space-y-3">
            {live.data.trip.timeline.map((entry: any, i: number) => (
              <li key={i} className="flex gap-3">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-leaf-500" />
                <div className="flex-1 text-sm">
                  <span className="font-medium capitalize">{entry.event.replace(/_/g, " ")}</span>
                  {entry.stopName && <span className="text-slate-500"> · {entry.stopName}</span>}
                </div>
                <span className="text-xs text-slate-400">{time(entry.at)}</span>
              </li>
            ))}
          </ol>
        </Card>
      )}

      <RouteChangeModal childId={child._id} open={changing} onClose={() => setChanging(false)} />
    </div>
  );
}

const Row = ({ label, value }: { label: string; value: string }) => (
  <div className="flex justify-between gap-3">
    <dt className="text-slate-500">{label}</dt>
    <dd className="text-right font-medium text-slate-800">{value}</dd>
  </div>
);

function Contacts({ driver }: { driver?: { name: string; phone: string } | null }) {
  const { data } = useQuery<any>("/parent/emergency-contacts");
  const entries = [
    driver && { label: "Driver", name: driver.name, phone: driver.phone },
    data?.transportOffice && { label: "School office", name: data.transportOffice.name, phone: data.transportOffice.phone },
    { label: "Emergency helpline", name: "Police / Ambulance", phone: data?.helpline ?? "112" },
  ].filter(Boolean) as { label: string; name: string; phone: string }[];

  return (
    <ul className="space-y-2">
      {entries.map((entry) => (
        <li key={entry.label}>
          <a href={`tel:${entry.phone}`} className="flex items-center gap-3 rounded-lg border border-slate-200 p-2.5 transition hover:bg-slate-50">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-leaf-50 text-leaf-600">
              <IconPhone className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">{entry.name}</div>
              <div className="text-xs text-slate-500">{entry.label}</div>
            </div>
            <span className="text-sm font-semibold text-brand-600">{entry.phone}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}

function RouteChangeModal({ childId, open, onClose }: { childId: string; open: boolean; onClose: () => void }) {
  const routes = useQuery<any[]>(open ? "/parent/routes" : null, [open]);
  const { busy, error, run } = useAction();
  const [routeId, setRouteId] = useState("");
  const [pickupStopId, setPickup] = useState("");
  const [reason, setReason] = useState("");

  const stops = routes.data?.find((r) => r._id === routeId)?.stops ?? [];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Request a route change"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            loading={busy}
            disabled={!routeId}
            onClick={() =>
              void run(
                () =>
                  api(`/parent/children/${childId}/route-change`, {
                    body: {
                      requestedRouteId: routeId,
                      requestedPickupStopId: pickupStopId || undefined,
                      reason: reason || undefined,
                    },
                  }),
                onClose
              )
            }
          >
            Send request
          </Button>
        </>
      }
    >
      <Alert>{error}</Alert>
      <div className="space-y-4">
        <Select label="New route" value={routeId} onChange={(e) => { setRouteId(e.target.value); setPickup(""); }}>
          <option value="">Choose a route…</option>
          {routes.data?.map((r) => <option key={r._id} value={r._id}>{r.name}</option>)}
        </Select>

        {stops.length > 0 && (
          <Select label="Preferred pickup stop" value={pickupStopId} onChange={(e) => setPickup(e.target.value)}>
            <option value="">Choose a stop…</option>
            {stops.map((s: any) => <option key={s._id} value={s._id}>{s.sequence}. {s.name}</option>)}
          </Select>
        )}

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">Reason</span>
          <textarea
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="We have moved to a new address."
            className="w-full rounded-lg border border-slate-300 p-3 text-sm outline-none focus:border-brand-500"
          />
        </label>

        <p className="text-xs text-slate-500">
          The school office reviews every request. You will be notified once it is decided.
        </p>
      </div>
    </Modal>
  );
}

export function ParentHistory() {
  const children = useQuery<Child[]>("/parent/children");
  const [childId, setChildId] = useState<string | null>(null);
  const id = childId ?? children.data?.[0]?._id ?? null;
  const history = useQuery<{ date: string; events: any[] }[]>(
    id ? `/parent/children/${id}/history?days=7` : null,
    [id]
  );

  return (
    <div className="space-y-4">
      {(children.data?.length ?? 0) > 1 && (
        <Select value={id ?? ""} onChange={(e) => setChildId(e.target.value)}>
          {children.data?.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
        </Select>
      )}

      {history.loading && !history.data && <Loading />}
      {history.data?.length === 0 && (
        <Card><EmptyState title="No records yet" hint="Pickup and drop history from the last 7 days appears here." /></Card>
      )}

      {history.data?.map((day) => (
        <Card key={day.date} title={date(day.date)} padded={false}>
          <ul className="divide-y divide-slate-100">
            {day.events.map((event) => (
              <li key={event._id} className="flex items-center gap-3 px-4 py-3">
                <span className={cx(
                  "grid h-9 w-9 shrink-0 place-items-center rounded-full",
                  event.event === "boarded" ? "bg-brand-50 text-brand-600" :
                  event.event === "dropped" ? "bg-leaf-50 text-leaf-600" : "bg-slate-100 text-slate-500"
                )}>
                  {event.event === "absent" ? <IconClock className="h-4 w-4" /> : <IconBus className="h-4 w-4" />}
                </span>
                <div className="flex-1">
                  <div className="text-sm font-medium capitalize">{event.event}</div>
                  <div className="text-xs text-slate-500">{time(event.at)}</div>
                </div>
                <Badge value={event.event} />
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}

export function ParentAlerts() {
  const { data, loading, reload } = useQuery<{ items: any[]; unread: number }>("/notifications?limit=50");
  const { run } = useAction();

  return (
    <div className="space-y-4">
      {(data?.unread ?? 0) > 0 && (
        <Button variant="secondary" block onClick={() => void run(() => api("/notifications/read-all", { body: {} }), reload)}>
          Mark all {data!.unread} as read
        </Button>
      )}

      {loading && !data && <Loading />}
      {data?.items.length === 0 && (
        <Card><EmptyState title="No notifications yet" hint="Trip and safety alerts appear here." /></Card>
      )}

      <div className="space-y-2">
        {data?.items.map((n) => (
          <Card key={n._id} className={cx(!n.readAt && "border-brand-200 bg-brand-50/40")}>
            <div className="flex gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white text-brand-600 ring-1 ring-slate-200">
                {n.type === "emergency" ? <IconPin className="h-4 w-4" /> : <IconBell className="h-4 w-4" />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-slate-900">{n.title}</div>
                <p className="text-sm text-slate-600">{n.body}</p>
                <p className="mt-1 text-xs text-slate-400">{dateTime(n.createdAt)}</p>
              </div>
              {!n.readAt && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-brand-500" />}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
