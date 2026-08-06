import { useState } from "react";
import { useQuery } from "../../lib/api";
import { classOf, date, dateTime, time } from "../../lib/format";
import {
  Avatar, Badge, Card, EmptyState, Field, Loading, Modal, PageHeader, Select, Table, cx,
} from "../../components/ui";
import { IconCamera } from "../../components/icons";
import BusMap from "../../components/BusMap";

type Trip = {
  _id: string;
  tripDate: string;
  type: string;
  status: string;
  startedAt?: string;
  endedAt?: string;
  autoClosed?: boolean;
  delayMinutes?: number;
  startSelfieUrl?: string | null;
  selfieAt?: string | null;
  stats?: { pickedUp?: number; dropped?: number; absent?: number; distanceKm?: number };
  vehicleId?: { _id: string; busNumber?: string; vehicleNumber?: string } | null;
  driverId?: { name?: string; phone?: string } | null;
};

const todayKey = () => new Date().toISOString().slice(0, 10);

/**
 * Completed trips, and the driver check-in photo attached to each one.
 *
 * The photo was already being taken and stored, but only ever appeared on the
 * Live buses screen — so it vanished the moment a driver ended the trip, which
 * is precisely when someone would want to check who had been driving. The
 * endpoints for this existed and had no screen; this is that screen.
 */
export default function SchoolTrips() {
  const [day, setDay] = useState(todayKey());
  const [vehicleId, setVehicleId] = useState("");
  const [status, setStatus] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const buses = useQuery<any[]>("/school/buses");
  const query =
    `/school/trips?limit=50&date=${day}` +
    (vehicleId ? `&vehicleId=${vehicleId}` : "") +
    (status ? `&status=${status}` : "");
  const trips = useQuery<{ items: Trip[]; total: number }>(query, [day, vehicleId, status]);

  const checkedIn = trips.data?.items.filter((t) => t.startSelfieUrl).length ?? 0;

  return (
    <>
      <PageHeader
        title="Trips"
        subtitle={
          trips.data
            ? `${trips.data.total} trip${trips.data.total === 1 ? "" : "s"} · ${checkedIn} with a check-in photo`
            : undefined
        }
      />

      <Card className="mb-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Date" type="date" value={day} onChange={(e) => setDay(e.target.value)} />
          <Select label="Bus" value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
            <option value="">All buses</option>
            {buses.data?.map((b) => (
              <option key={b._id} value={b._id}>{b.busNumber ?? b.vehicleNumber}</option>
            ))}
          </Select>
          <Select label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Any status</option>
            <option value="running">Running</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </Select>
        </div>
      </Card>

      <Card padded={false}>
        <Table
          rows={trips.data?.items}
          loading={trips.loading}
          rowKey={(t) => t._id}
          empty={
            <EmptyState
              title="No trips that day"
              hint="Pick another date, or check that the driver started the trip from their app."
            />
          }
          columns={[
            {
              header: "Check-in",
              cell: (t: Trip) =>
                t.startSelfieUrl ? (
                  <button
                    onClick={() => setOpenId(t._id)}
                    className="block rounded-lg ring-brand-500 transition hover:ring-2"
                    title="View the check-in photo"
                  >
                    <img
                      src={t.startSelfieUrl}
                      alt={`Check-in — ${t.driverId?.name ?? "driver"}`}
                      className="h-11 w-11 rounded-lg object-cover"
                    />
                  </button>
                ) : (
                  // Worth showing loudly: a trip with no photo means nobody can
                  // prove who was behind the wheel.
                  <span
                    className="grid h-11 w-11 place-items-center rounded-lg bg-amber-50 text-amber-600"
                    title="No check-in photo for this trip"
                  >
                    <IconCamera className="h-5 w-5" />
                  </span>
                ),
            },
            {
              header: "Bus",
              cell: (t: Trip) => (
                <div>
                  <div className="font-semibold text-slate-900">
                    {t.vehicleId?.busNumber ?? t.vehicleId?.vehicleNumber ?? "—"}
                  </div>
                  <div className="text-xs capitalize text-slate-500">{t.type}</div>
                </div>
              ),
            },
            {
              header: "Driver",
              cell: (t: Trip) => (
                <div className="text-sm">
                  <div>{t.driverId?.name ?? "—"}</div>
                  <div className="text-xs text-slate-500">
                    {t.selfieAt ? `checked in ${time(t.selfieAt)}` : "no check-in"}
                  </div>
                </div>
              ),
            },
            {
              header: "Timing",
              cell: (t: Trip) => (
                <div className="text-sm">
                  {time(t.startedAt)} → {t.endedAt ? time(t.endedAt) : "—"}
                  {t.autoClosed && (
                    <div className="text-xs text-amber-600">auto-closed — driver never ended it</div>
                  )}
                  {(t.delayMinutes ?? 0) >= 10 && (
                    <div className="text-xs text-amber-600">{t.delayMinutes} min behind</div>
                  )}
                </div>
              ),
            },
            {
              header: "Children",
              secondary: true,
              cell: (t: Trip) => (
                <span className="text-sm">
                  {t.stats?.pickedUp ?? 0} on · {t.stats?.dropped ?? 0} off
                  {(t.stats?.absent ?? 0) > 0 ? ` · ${t.stats?.absent} absent` : ""}
                </span>
              ),
            },
            { header: "Status", align: "right", cell: (t: Trip) => <Badge value={t.status} /> },
          ]}
          onRowClick={(t: Trip) => setOpenId(t._id)}
        />
      </Card>

      <TripDetail id={openId} onClose={() => setOpenId(null)} />
    </>
  );
}

/** One trip in full: the photo, who was marked, and the path the bus took. */
function TripDetail({ id, onClose }: { id: string | null; onClose: () => void }) {
  const detail = useQuery<{ trip: Trip & { timeline?: any[] }; attendance: any[] }>(
    id ? `/school/trips/${id}` : null,
    [id]
  );
  const replay = useQuery<{ points: { lat: number; lng: number }[] }>(
    id ? `/school/trips/${id}/replay` : null,
    [id]
  );

  if (!id) return null;

  const trip = detail.data?.trip;
  const marks = detail.data?.attendance ?? [];
  const points = replay.data?.points ?? [];

  return (
    <Modal open onClose={onClose} title={trip ? `${trip.vehicleId?.busNumber ?? "Bus"} — ${date(trip.tripDate)}` : "Trip"}>
      {detail.loading && !detail.data ? (
        <Loading />
      ) : (
        <div className="space-y-4">
          <div className="flex items-start gap-4 rounded-lg bg-slate-50 p-3">
            {trip?.startSelfieUrl ? (
              <a href={trip.startSelfieUrl} target="_blank" rel="noreferrer">
                <img
                  src={trip.startSelfieUrl}
                  alt="Driver check-in"
                  className="h-24 w-24 rounded-lg object-cover ring-1 ring-slate-200"
                />
              </a>
            ) : (
              <span className="grid h-24 w-24 place-items-center rounded-lg bg-amber-50 text-amber-600">
                <IconCamera className="h-7 w-7" />
              </span>
            )}
            <div className="min-w-0 text-sm">
              <div className="font-semibold text-slate-900">{trip?.driverId?.name ?? "Unknown driver"}</div>
              <div className="text-slate-500">{trip?.driverId?.phone}</div>
              <div className="mt-1 text-xs text-slate-500">
                {trip?.selfieAt
                  ? `Checked in ${dateTime(trip.selfieAt)}`
                  : "No check-in photo was taken for this trip."}
              </div>
              {trip?.stats?.distanceKm != null && (
                <div className="mt-1 text-xs text-slate-500">
                  {trip.stats.distanceKm.toFixed(1)} km travelled
                </div>
              )}
            </div>
          </div>

          {points.length > 1 && (
            <div>
              <div className="mb-2 text-sm font-semibold text-slate-700">Route travelled</div>
              <BusMap bus={points[points.length - 1]} trail={points} follow={false} height={240} />
            </div>
          )}

          <div>
            <div className="mb-2 text-sm font-semibold text-slate-700">
              Attendance ({marks.length})
            </div>
            {marks.length === 0 ? (
              <p className="text-sm text-slate-500">Nobody was marked on this trip.</p>
            ) : (
              <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                {marks.map((m) => (
                  <li key={m._id} className="flex items-center gap-3 px-3 py-2.5">
                    <Avatar name={m.studentId?.name ?? "?"} className="h-8 w-8 text-xs" />
                    <div className="min-w-0 flex-1 text-sm">
                      <div className="font-medium text-slate-800">{m.studentId?.name ?? "Unknown"}</div>
                      <div className="text-xs text-slate-500">{classOf(m.studentId ?? {})}</div>
                    </div>
                    <span className="text-xs text-slate-500">{time(m.at)}</span>
                    <Badge value={m.event} />
                  </li>
                ))}
              </ul>
            )}
          </div>

          {(trip?.timeline?.length ?? 0) > 0 && (
            <div>
              <div className="mb-2 text-sm font-semibold text-slate-700">Timeline</div>
              <ol className="space-y-2">
                {trip!.timeline!.map((entry: any, i: number) => (
                  <li key={i} className="flex items-center gap-3 text-sm">
                    <span className={cx("h-2 w-2 shrink-0 rounded-full", "bg-leaf-500")} />
                    <span className="flex-1 capitalize">
                      {entry.event.replace(/_/g, " ")}
                      {entry.stopName ? ` · ${entry.stopName}` : ""}
                    </span>
                    <span className="text-xs text-slate-400">{time(entry.at)}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
