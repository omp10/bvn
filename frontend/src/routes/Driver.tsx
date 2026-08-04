import { useState } from "react";
import { api, useAction, useQuery } from "../lib/api";
import { useTripTracker, clearBuffer } from "../lib/tracker";
import { ago, date, time, titleCase } from "../lib/format";
import {
  Alert, Badge, Button, Card, EmptyState, Loading, Modal, Select, Table,
} from "../components/ui";
import { IconAlert, IconBus, IconCheck, IconClock, IconPin, IconUsers } from "../components/icons";
import BusMap from "../components/BusMap";

/**
 * The driver screen. One decision at a time, big targets, readable at arm's
 * length in a parked bus.
 */
export function DriverToday() {
  const { data, loading, error, reload } = useQuery<any>("/driver/my-bus");
  const action = useAction();
  const [sos, setSos] = useState(false);

  if (loading && !data) return <Loading />;
  if (error) return <Card><EmptyState title="Nothing assigned yet" hint={error} /></Card>;

  const trip = data?.activeTrip;
  const route = data?.vehicle?.routeId;

  // Streams the position for as long as a trip is running, and stops the moment
  // it ends — no trip, no tracking.
  const gps = useTripTracker(trip?._id ?? null);

  const startTrip = (type: "morning" | "evening") =>
    // Safe to press twice: the server returns the same trip on a retry.
    void action.run(() => api("/driver/trips/start", { body: { type } }), reload);

  return (
    <div className="space-y-4">
      <Alert>{action.error}</Alert>

      <Card>
        <div className="flex items-center gap-3">
          <span className="grid h-12 w-12 place-items-center rounded-xl bg-brand-50 text-brand-600">
            <IconBus className="h-6 w-6" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-lg font-bold">{data?.vehicle?.busNumber ?? "—"}</div>
            <div className="text-sm text-slate-500">{data?.vehicle?.vehicleNumber}</div>
          </div>
          <Badge value={trip ? "running" : data?.vehicle?.status} />
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2 border-t border-slate-100 pt-4 text-center">
          <Metric icon={<IconUsers className="h-4 w-4" />} label="Students" value={data?.studentCount ?? 0} />
          <Metric icon={<IconPin className="h-4 w-4" />} label="Stops" value={route?.stops?.length ?? 0} />
          <Metric icon={<IconClock className="h-4 w-4" />} label="Started" value={trip ? time(trip.startedAt) : "—"} />
        </div>
      </Card>

      {trip ? (
        <>
          <GpsPanel gps={gps} />

          {gps.lastFix && (
            <Card title="Where you are" padded={false}>
              <BusMap
                bus={gps.lastFix}
                stops={route?.stops ?? []}
                height={260}
              />
            </Card>
          )}

          <Card>
            <p className="text-sm text-slate-600">
              Your <strong>{trip.type}</strong> trip is running. Keep this screen open so the bus keeps reporting.
            </p>
            <Button
              variant="danger"
              size="lg"
              block
              className="mt-4"
              loading={action.busy}
              onClick={() =>
                void action.run(
                  async () => {
                    await api(`/driver/trips/${trip._id}/end`, { method: "POST" });
                    clearBuffer();
                  },
                  reload
                )
              }
            >
              End trip
            </Button>
          </Card>
        </>
      ) : (
        <Card title="Start today's trip">
          <div className="grid gap-3 sm:grid-cols-2">
            <Button size="lg" loading={action.busy} onClick={() => startTrip("morning")}>Morning trip</Button>
            <Button size="lg" variant="success" loading={action.busy} onClick={() => startTrip("evening")}>Evening trip</Button>
          </div>
          {!data?.vehicle?.routeId && (
            <p className="mt-3 text-sm text-amber-600">
              No route is set for this bus — parents will not see stop-by-stop progress.
            </p>
          )}
        </Card>
      )}

      {route?.stops?.length > 0 && (
        <Card title={route.name} subtitle="Today's stops">
          <ol className="space-y-3">
            {route.stops.map((stop: any, i: number) => (
              <li key={stop._id} className="flex items-center gap-3">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">
                  {i + 1}
                </span>
                <span className="flex-1 text-sm font-medium">{stop.name}</span>
                <span className="text-xs text-slate-500">{stop.pickupTime ?? ""}</span>
              </li>
            ))}
          </ol>
        </Card>
      )}

      <Button variant="danger" size="lg" block onClick={() => setSos(true)}>
        <IconAlert /> Emergency
      </Button>

      <p className="pb-2 text-center text-xs text-slate-400">
        Keep this screen open and the phone unlocked while driving.
      </p>

      <EmergencyModal open={sos} onClose={() => setSos(false)} tripId={trip?._id} />
    </div>
  );
}

function GpsPanel({ gps }: { gps: ReturnType<typeof useTripTracker> }) {
  const healthy = gps.tracking && gps.lastFix && !gps.error;

  return (
    <Card className={healthy ? "border-leaf-400" : gps.error ? "border-amber-400" : undefined}>
      <div className="flex items-center gap-3">
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${
          healthy ? "bg-leaf-50 text-leaf-600" : "bg-amber-50 text-amber-600"
        }`}>
          {healthy ? <IconCheck className="h-5 w-5" /> : <IconPin className="h-5 w-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-semibold">
            {healthy ? "Sharing location" : gps.tracking ? "Getting a GPS fix…" : "Not sharing"}
          </div>
          <div className="text-xs text-slate-500">
            {gps.lastFix
              ? `Last fix ${ago(gps.lastFix.at)}${gps.lastFix.accuracy ? ` · ±${gps.lastFix.accuracy} m` : ""}`
              : "Waiting for the first position"}
          </div>
        </div>
      </div>

      {gps.error && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{gps.error}</p>}

      {gps.buffered > 0 && (
        // Nothing is lost in a dead zone — say so, or the driver will worry.
        <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
          {gps.buffered} point{gps.buffered === 1 ? "" : "s"} saved on this phone, waiting for signal. They upload
          automatically.
        </p>
      )}

      {!gps.screenAwake && gps.tracking && (
        <p className="mt-3 text-xs text-slate-500">
          Keep the screen on — tracking pauses if the phone locks.
        </p>
      )}
    </Card>
  );
}

const Metric = ({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) => (
  <div>
    <div className="flex items-center justify-center gap-1 text-slate-400">{icon}</div>
    <div className="mt-1 text-lg font-bold text-slate-900">{value}</div>
    <div className="text-xs text-slate-500">{label}</div>
  </div>
);

export function EmergencyModal({ open, onClose, tripId }: { open: boolean; onClose: () => void; tripId?: string }) {
  const { busy, error, run } = useAction();
  const [type, setType] = useState("breakdown");
  const [note, setNote] = useState("");
  const [sent, setSent] = useState(false);

  const raise = () =>
    void run(
      () =>
        api("/emergencies", {
          body: {
            type,
            note: note || undefined,
            tripId,
            // A fresh key per press: retries collapse, a genuine second alert
            // still gets through.
            idempotencyKey: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
          },
        }),
      () => setSent(true)
    );

  return (
    <Modal
      open={open}
      onClose={() => { setSent(false); onClose(); }}
      title="Raise an emergency"
      footer={
        sent ? (
          <Button onClick={() => { setSent(false); onClose(); }}>Close</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button variant="danger" loading={busy} onClick={raise}>Send alert</Button>
          </>
        )
      }
    >
      {sent ? (
        <div className="py-4 text-center">
          <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-leaf-50 text-leaf-600">
            <IconAlert />
          </div>
          <p className="font-semibold">Alert sent</p>
          <p className="text-sm text-slate-500">The school office and every parent on this bus have been notified.</p>
        </div>
      ) : (
        <div className="space-y-4">
          <Alert>{error}</Alert>
          <Select label="What has happened?" value={type} onChange={(e) => setType(e.target.value)}>
            {["breakdown", "medical", "accident", "other"].map((t) => (
              <option key={t} value={t}>{titleCase(t)}</option>
            ))}
          </Select>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">Anything to add?</span>
            <textarea
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full rounded-lg border border-slate-300 p-3 text-sm outline-none focus:border-brand-500"
              placeholder="Front tyre punctured near Anand Nagar."
            />
          </label>
          <p className="text-xs text-slate-500">
            This immediately alerts the school office, the platform, and the parents of every child on this bus.
          </p>
        </div>
      )}
    </Modal>
  );
}

export function DriverHistory() {
  const { data, loading } = useQuery<{ items: any[] }>("/driver/trips?limit=30");

  return (
    <Card title="Recent trips" padded={false}>
      <Table
        rows={data?.items}
        loading={loading}
        rowKey={(t) => t._id}
        empty={<EmptyState title="No trips yet" hint="Completed trips are listed here." />}
        columns={[
          {
            header: "Date",
            cell: (t) => (
              <div>
                <div className="font-medium">{date(t.tripDate)}</div>
                <div className="text-xs capitalize text-slate-500">{t.type}</div>
              </div>
            ),
          },
          {
            header: "Timing",
            cell: (t) => (
              <div className="text-sm">
                {time(t.startedAt)} → {t.endedAt ? time(t.endedAt) : "—"}
              </div>
            ),
          },
          { header: "Picked up", cell: (t) => t.stats?.pickedUp ?? 0, secondary: true },
          { header: "Status", align: "right", cell: (t) => <Badge value={t.status} /> },
        ]}
      />
    </Card>
  );
}
