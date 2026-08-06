import { useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useQuery } from "../api";
import { useTrackerStatus, type Fix } from "../tracker";
import { metresBetween, prettyDistance } from "../geo";
import { ago } from "../format";
import { colors, radius } from "../theme";
import { Card, EmptyState, Loading, Muted, Screen, T } from "../ui";
import { IconPin } from "../icons";
import BusMap, { type MapStop } from "../BusMap";

/**
 * The whole route on one screen: every stop, the bus, and the path travelled so
 * far. The Trip tab is for deciding things; this one is for looking.
 */
export default function DriverLive() {
  const { data, loading, error } = useQuery<any>("/driver/my-bus");
  const route = data?.vehicle?.routeId;
  const stops: MapStop[] = route?.stops ?? [];

  /* Watches, but does not drive. The Trip tab owns starting and stopping —
     two screens both deciding whether tracking should run is how a bus keeps
     reporting after its trip has ended. */
  const gps = useTrackerStatus();

  // Breadcrumbs for this session only. The server keeps the authoritative
  // history — redrawing it here would be a second copy to keep in sync.
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
      <Screen>
        <Card>
          <EmptyState
            title="No route to show"
            hint={error ?? "This bus has no route with stops yet. Ask your school to set one up."}
          />
        </Card>
      </Screen>
    );
  }

  const next = gps.lastFix ? nearestStop(gps.lastFix, stops) : null;

  return (
    <Screen scroll={false}>
      <View style={{ flex: 1, padding: 12, gap: 10 }}>
        {/* The map is the page here, not a card sitting on it. */}
        <View style={{ flex: 1 }}>
          <BusMap
            bus={gps.lastFix}
            stops={stops}
            trail={trail}
            highlightStopId={next?.stop._id ?? null}
            height="fill"
          />
        </View>

        <Card padded={false}>
          <View style={s.head}>
            <View style={s.icon}>
              <IconPin size={20} color={colors.brand600} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <T size={14} weight="700" numberOfLines={1}>
                {next
                  ? `Nearest stop · ${next.stop.name}`
                  : gps.tracking
                    ? "Getting a GPS fix…"
                    : "Trip not started"}
              </T>
              <Muted size={11}>
                {next
                  ? `${prettyDistance(next.metres)} away · fix ${ago(gps.lastFix!.at)}`
                  : gps.tracking
                    ? "Sharing in the background — the screen can be off"
                    : `${stops.length} stops on ${route.name}`}
              </Muted>
            </View>
            {gps.buffered > 0 && (
              <View style={s.queued}>
                <T size={11} weight="600" color={colors.slate600}>{gps.buffered} queued</T>
              </View>
            )}
          </View>

          <ScrollView style={{ maxHeight: 180 }} contentContainerStyle={{ padding: 10, gap: 2 }}>
            {stops.map((stop, i) => {
              const away = gps.lastFix ? metresBetween(gps.lastFix, stop) : null;
              const isNext = next?.stop === stop;
              return (
                <View
                  key={stop._id ?? i}
                  style={[s.stop, isNext && { backgroundColor: colors.brand50 }]}
                >
                  <View style={[s.stopNumber, isNext && { backgroundColor: colors.brand600 }]}>
                    <T size={11} weight="700" color={isNext ? colors.white : colors.slate600}>{i + 1}</T>
                  </View>
                  <T size={13} weight="500" style={{ flex: 1 }} numberOfLines={1}>{stop.name}</T>
                  <Muted size={11}>
                    {away === null ? ((stop as any).pickupTime ?? "") : prettyDistance(away)}
                  </Muted>
                </View>
              );
            })}
          </ScrollView>
        </Card>
      </View>
    </Screen>
  );
}

function nearestStop(fix: Fix, stops: MapStop[]) {
  return stops
    .map((stop) => ({ stop, metres: metresBetween(fix, stop) }))
    .reduce((best, cur) => (cur.metres < best.metres ? cur : best));
}

const s = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12 },
  icon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.brand50,
    alignItems: "center",
    justifyContent: "center",
  },
  queued: { backgroundColor: colors.slate100, paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill },
  stop: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 8, paddingVertical: 7, borderRadius: radius.sm },
  stopNumber: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.slate100,
    alignItems: "center",
    justifyContent: "center",
  },
});
