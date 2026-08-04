import { useEffect, useRef, useState } from "react";
import { useQuery } from "../lib/api";
import { useTripTracker, type Fix } from "../lib/tracker";
import { metresBetween, prettyDistance } from "../lib/geo";
import { ago } from "../lib/format";
import { Card, EmptyState, Loading } from "../components/ui";
import { IconPin } from "../components/icons";
import BusMap, { type MapStop } from "../components/BusMap";

/**
 * The whole route on one screen: every stop, the bus, and the path travelled so
 * far. The Trip tab is for deciding things; this one is for looking.
 */
export default function DriverLive() {
  const { data, loading, error } = useQuery<any>("/driver/my-bus");
  const trip = data?.activeTrip;
  const route = data?.vehicle?.routeId;
  const stops: MapStop[] = route?.stops ?? [];

  const gps = useTripTracker(trip?._id ?? null);

  // Breadcrumbs for this session only. The server keeps the authoritative
  // history — redrawing it here would just be a second copy to keep in sync.
  const [trail, setTrail] = useState<Fix[]>([]);
  const lastAt = useRef<string | null>(null);
  useEffect(() => {
    const fix = gps.lastFix;
    if (!fix || fix.at === lastAt.current) return;
    lastAt.current = fix.at;
    setTrail((t) => [...t.slice(-499), fix]);
  }, [gps.lastFix]);

  if (loading && !data) return <Loading />;
  if (error || !stops.length) {
    return (
      <Card>
        <EmptyState
          title="No route to show"
          hint={error ?? "This bus has no route with stops yet. Ask your school to set one up."}
        />
      </Card>
    );
  }

  const next = gps.lastFix ? nearestStop(gps.lastFix, stops) : null;

  return (
    <div className="space-y-3">
      {/* Fills the screen below the header and above the tab bar, so the map is
          the page rather than a card sitting on it. */}
      <div className="overflow-hidden rounded-xl border border-slate-200">
        <BusMap
          bus={gps.lastFix}
          stops={stops}
          trail={trail}
          highlightStopId={next?.stop._id ?? null}
          height="calc(100vh - 15rem)"
        />
      </div>

      <Card padded={false}>
        <div className="flex items-center gap-3 p-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600">
            <IconPin className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold">
              {next ? `Nearest stop · ${next.stop.name}` : trip ? "Getting a GPS fix…" : "Trip not started"}
            </div>
            <div className="text-xs text-slate-500">
              {next
                ? `${prettyDistance(next.metres)} away · fix ${ago(gps.lastFix!.at)}`
                : trip
                  ? "Keep the screen on so the bus keeps reporting"
                  : `${stops.length} stops on ${route.name}`}
            </div>
          </div>
          {gps.buffered > 0 && (
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
              {gps.buffered} queued
            </span>
          )}
        </div>

        <ol className="max-h-56 overflow-y-auto border-t border-slate-100 p-3">
          {stops.map((stop, i) => {
            const away = gps.lastFix ? metresBetween(gps.lastFix, stop) : null;
            const isNext = next?.stop === stop;
            return (
              <li
                key={stop._id ?? i}
                className={`flex items-center gap-3 rounded-lg px-2 py-2 ${isNext ? "bg-brand-50" : ""}`}
              >
                <span
                  className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold ${
                    isNext ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {i + 1}
                </span>
                <span className="flex-1 truncate text-sm font-medium">{stop.name}</span>
                <span className="text-xs text-slate-500">
                  {away === null ? ((stop as any).pickupTime ?? "") : prettyDistance(away)}
                </span>
              </li>
            );
          })}
        </ol>
      </Card>

      {gps.error && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{gps.error}</p>
      )}
    </div>
  );
}

function nearestStop(fix: Fix, stops: MapStop[]) {
  return stops
    .map((stop) => ({ stop, metres: metresBetween(fix, stop) }))
    .reduce((best, cur) => (cur.metres < best.metres ? cur : best));
}
