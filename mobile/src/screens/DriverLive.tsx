import { useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useQuery } from "../api";
import { useTrackerStatus, type Fix } from "../tracker";
import { metresBetween, prettyDistance } from "../geo";
import { ago } from "../format";
import { colors, elevation, radius, space, tone } from "../theme";
import { str } from "../strings";
import { Card, EmptyState, ErrorState, IconChip, Loading, Muted, Screen, T } from "../ui";
import { IconPin } from "../icons";
import BusMap, { type MapStop } from "../BusMap";

/**
 * The whole route on one screen: every stop, the bus, and the path travelled so
 * far. The Trip tab is for deciding things; this one is for looking.
 *
 * The map is the page, not a card sitting on it — so the stop list floats over
 * the bottom of it rather than pushing it into a strip. Panning still happens
 * in BusMap's full-screen view, because a drag here scrolls the list.
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

  if (error) return <Screen><ErrorState message={error} /></Screen>;

  if (!stops.length) {
    return (
      <Screen>
        <Card>
          <EmptyState title={str.map.noRouteTitle} hint={str.map.noRouteHint} />
        </Card>
      </Screen>
    );
  }

  const next = gps.lastFix ? nearestStop(gps.lastFix, stops) : null;

  return (
    <Screen scroll={false}>
      <View style={{ flex: 1 }}>
        <BusMap
          bus={gps.lastFix}
          stops={stops}
          trail={trail}
          highlightStopId={next?.stop._id ?? null}
          height="fill"
        />

        <View style={s.sheet}>
          <View style={s.grabber} />

          <View style={s.head}>
            <IconChip bg={colors.brand50}>
              <IconPin size={20} color={colors.brand600} />
            </IconChip>
            <View style={{ flex: 1, minWidth: 0 }}>
              <T role="body" weight="700" numberOfLines={1}>
                {next
                  ? str.map.nearest(next.stop.name)
                  : gps.tracking
                    ? str.map.gettingFix
                    : str.map.notStarted}
              </T>
              <Muted numberOfLines={1}>
                {next
                  ? str.map.awayFix(prettyDistance(next.metres), ago(gps.lastFix!.at))
                  : gps.tracking
                    ? str.map.sharingNote
                    : str.map.routeSummary(stops.length, route.name)}
              </Muted>
            </View>
            {gps.buffered > 0 && (
              <View style={s.queued}>
                <T role="caption" weight="700" color={tone.textSecondary}>
                  {str.driver.queued(gps.buffered)}
                </T>
              </View>
            )}
          </View>

          <ScrollView style={{ maxHeight: 168 }} contentContainerStyle={{ padding: space(2.5), gap: space(0.5) }}>
            {stops.map((stop, i) => {
              const away = gps.lastFix ? metresBetween(gps.lastFix, stop) : null;
              const isNext = next?.stop === stop;
              return (
                <View key={stop._id ?? i} style={[s.stop, isNext && { backgroundColor: colors.brand50 }]}>
                  <IconChip bg={isNext ? colors.brand600 : colors.slate100} size={26}>
                    <T role="caption" weight="700" color={isNext ? colors.white : tone.textSecondary}>
                      {i + 1}
                    </T>
                  </IconChip>
                  <T role="label" weight={isNext ? "700" : "500"} style={{ flex: 1 }} numberOfLines={1}>
                    {stop.name}
                  </T>
                  <Muted>{away === null ? ((stop as any).pickupTime ?? "") : prettyDistance(away)}</Muted>
                </View>
              );
            })}
          </ScrollView>
        </View>
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
  sheet: {
    position: "absolute",
    left: space(2.5),
    right: space(2.5),
    bottom: space(2.5),
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: tone.border,
    overflow: "hidden",
    ...elevation.floating,
  },
  grabber: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: tone.border,
    marginTop: space(2),
  },
  head: { flexDirection: "row", alignItems: "center", gap: space(3), padding: space(3) },
  queued: {
    backgroundColor: colors.slate100,
    paddingHorizontal: space(2.5),
    paddingVertical: space(1),
    borderRadius: radius.pill,
  },
  stop: {
    flexDirection: "row",
    alignItems: "center",
    gap: space(2.5),
    paddingHorizontal: space(2),
    paddingVertical: space(1.5),
    borderRadius: radius.sm,
    minHeight: 44,
  },
});
