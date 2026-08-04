import { Link } from "react-router-dom";
import { usePolling, useQuery } from "../../lib/api";
import { useSocket } from "../../lib/socket";
import { ago, time } from "../../lib/format";
import {
  Badge, Card, EmptyState, LiveDot, PageHeader, Stat, StatGrid, Table,
} from "../../components/ui";
import { IconAlert, IconBus, IconStudent, IconUsers } from "../../components/icons";
import BusMap from "../../components/BusMap";

export function SchoolDashboard() {
  const { data } = useQuery<any>("/dashboard");
  const live = usePolling<any[]>("/school/trips/live", 15_000);

  return (
    <>
      <PageHeader title="Today" subtitle="Everything moving right now." />

      <StatGrid>
        <Stat label="Buses" value={data?.vehicles} icon={<IconBus className="h-5 w-5" />}
          hint={`${data?.runningTrips ?? 0} on a trip`} />
        <Stat label="Students" value={data?.students} tone="leaf" icon={<IconStudent className="h-5 w-5" />}
          hint={data?.studentsWithoutBus ? `${data.studentsWithoutBus} without a bus` : "all assigned"} />
        <Stat label="Picked up" value={data?.pickedUp} tone="sun" icon={<IconUsers className="h-5 w-5" />}
          hint={`${data?.dropped ?? 0} dropped · ${data?.absent ?? 0} absent`} />
        <Stat label="Needs attention" value={(data?.pendingRouteRequests ?? 0) + (data?.openEmergencies ?? 0)}
          tone="slate" icon={<IconAlert className="h-5 w-5" />}
          hint={`${data?.pendingRouteRequests ?? 0} route requests`} />
      </StatGrid>

      {data?.openEmergencies > 0 && (
        <Link to="/school/alerts" className="mt-4 flex items-center gap-3 rounded-card border border-red-200 bg-red-50 p-4 transition hover:bg-red-100">
          <IconAlert className="h-6 w-6 shrink-0 text-red-600" />
          <div>
            <p className="font-semibold text-red-800">
              {data.openEmergencies} open emergency alert{data.openEmergencies > 1 ? "s" : ""}
            </p>
            <p className="text-sm text-red-700">Open the alerts screen and acknowledge them.</p>
          </div>
        </Link>
      )}

      <Card className="mt-4" title="Buses on the road" actions={<Link to="/school/live" className="text-sm font-semibold text-brand-600 hover:underline">Live view</Link>} padded={false}>
        <LiveTable rows={live.data} loading={live.loading} />
      </Card>
    </>
  );
}

function LiveTable({ rows, loading }: { rows?: any[] | null; loading?: boolean }) {
  return (
    <Table
      rows={rows}
      loading={loading}
      rowKey={(t) => t._id}
      empty={<EmptyState title="No trips running" hint="Buses appear here the moment a driver starts a trip." />}
      columns={[
        {
          header: "Bus",
          cell: (t) => (
            <div className="flex items-center gap-2">
              <LiveDot live={!t.gpsStale} />
              <div>
                <div className="font-medium">{t.vehicleId?.busNumber ?? "—"}</div>
                <div className="text-xs text-slate-500">{t.vehicleId?.vehicleNumber}</div>
              </div>
            </div>
          ),
        },
        { header: "Driver", cell: (t) => t.driverId?.name ?? "—", secondary: true },
        { header: "Route", cell: (t) => t.routeId?.name ?? "—", secondary: true },
        { header: "Trip", cell: (t) => <Badge value={t.type} /> },
        { header: "Started", cell: (t) => time(t.startedAt), secondary: true },
        {
          header: "Last GPS",
          align: "right",
          cell: (t) => (
            <span className={t.gpsStale ? "text-amber-600" : "text-slate-600"}>
              {t.lastPosition?.at ? ago(t.lastPosition.at) : "waiting…"}
            </span>
          ),
        },
      ]}
    />
  );
}

export function SchoolLive() {
  // Poll slowly as a safety net; the socket carries the fast updates. The school
  // room is joined automatically from the token — the client never names it.
  const live = usePolling<any[]>("/school/trips/live", 30_000);

  useSocket({
    "fleet:position": (p: { tripId: string; lat: number; lng: number; at: string }) =>
      live.setData(
        (live.data ?? []).map((t) =>
          String(t._id) === String(p.tripId)
            ? { ...t, lastPosition: { lat: p.lat, lng: p.lng, at: p.at }, gpsStale: false }
            : t
        )
      ),
    // A trip starting or ending changes the list itself, so refetch.
    "trip:started": () => live.reload(),
    "trip:ended": () => live.reload(),
  }, [live.data]);

  const busesOnMap = (live.data ?? [])
    .filter((t) => t.lastPosition?.lat != null)
    .map((t) => ({ lat: t.lastPosition.lat, lng: t.lastPosition.lng }));

  return (
    <>
      <PageHeader
        title="Live buses"
        subtitle="Positions arrive over a live connection as each bus reports."
        actions={<span className="flex items-center gap-2 text-sm text-slate-500"><LiveDot /> live</span>}
      />

      {busesOnMap.length > 0 && (
        <Card className="mb-4" title="Fleet map" padded={false}>
          {/* One marker per reporting bus. Follow is off — the office is
              watching several at once, not chasing one. */}
          <BusMap
            bus={busesOnMap[0]}
            stops={busesOnMap.map((b, i) => ({ name: `Bus ${i + 1}`, lat: b.lat, lng: b.lng, sequence: i + 1 }))}
            follow={false}
            height={340}
          />
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {live.data?.map((trip) => {
          const stops = trip.routeId?.stops ?? [];
          const reached = trip.currentStopIndex ?? 0;
          return (
            <Card key={trip._id} title={trip.vehicleId?.busNumber ?? "Bus"} subtitle={trip.routeId?.name}
              actions={<Badge value={trip.gpsStale ? "pending" : "running"}>{trip.gpsStale ? "GPS stale" : "live"}</Badge>}>
              {trip.startSelfieUrl && (
                <div className="mb-4 flex items-center gap-3 rounded-lg bg-slate-50 p-2.5">
                  <img
                    src={trip.startSelfieUrl}
                    alt={`Check-in photo — ${trip.driverId?.name ?? "driver"}`}
                    className="h-14 w-14 rounded-lg object-cover"
                  />
                  <div className="text-xs">
                    <div className="font-semibold text-slate-700">Driver checked in</div>
                    <div className="text-slate-500">{time(trip.selfieAt ?? trip.startedAt)}</div>
                  </div>
                </div>
              )}

              <div className="mb-4 grid grid-cols-2 gap-3 text-sm">
                <Detail label="Driver" value={trip.driverId?.name ?? "—"} />
                <Detail label="Started" value={time(trip.startedAt)} />
                <Detail label="Picked up" value={String(trip.stats?.pickedUp ?? 0)} />
                <Detail label="Last GPS" value={trip.lastPosition?.at ? ago(trip.lastPosition.at) : "waiting…"} />
              </div>

              {/* Stop-by-stop progress alongside the fleet map above. */}
              <ol className="space-y-0">
                {stops.map((stop: any, i: number) => {
                  const done = i < reached;
                  const current = i === reached;
                  return (
                    <li key={stop._id} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <span className={`mt-1 h-3 w-3 rounded-full ring-4 ${
                          done ? "bg-leaf-500 ring-leaf-100" : current ? "bg-brand-600 ring-brand-100" : "bg-slate-300 ring-slate-100"
                        }`} />
                        {i < stops.length - 1 && <span className={`w-0.5 flex-1 ${done ? "bg-leaf-400" : "bg-slate-200"}`} />}
                      </div>
                      <div className="pb-4">
                        <div className={`text-sm font-medium ${current ? "text-brand-700" : done ? "text-slate-500" : "text-slate-700"}`}>
                          {stop.name}
                        </div>
                        <div className="text-xs text-slate-400">
                          {current ? "next stop" : done ? "passed" : stop.pickupTime ?? ""}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </Card>
          );
        })}
      </div>

      {!live.loading && !live.data?.length && (
        <Card><EmptyState title="No buses are running" hint="This fills up as drivers start their trips." /></Card>
      )}
    </>
  );
}

const Detail = ({ label, value }: { label: string; value: string }) => (
  <div>
    <div className="text-xs uppercase tracking-wide text-slate-400">{label}</div>
    <div className="font-medium text-slate-800">{value}</div>
  </div>
);
