import { useState } from "react";
import { View } from "react-native";
import { usePolling } from "../api";
import { useSocket } from "../socket";
import { ago } from "../format";
import { colors, space } from "../theme";
import { str } from "../strings";
import {
  Badge, Card, EmptyState, ErrorState, IconChip, ListRow, LiveDot, Muted, Screen, SkeletonRow,
} from "../ui";
import { IconBus } from "../icons";
import BusMap from "../BusMap";

type LiveTrip = {
  _id: string;
  type: string;
  gpsStale: boolean;
  lastPosition?: { lat: number; lng: number; at: string } | null;
  delayed?: boolean;
  delayMinutes?: number;
  stats?: { pickedUp?: number; dropped?: number };
  vehicleId?: { busNumber?: string; vehicleNumber?: string } | null;
  driverId?: { name?: string; phone?: string } | null;
  routeId?: { name?: string; stops?: any[] } | null;
};

/**
 * The school's fleet, right now. Tap a bus to put it on the map.
 *
 * Polled rather than socket-driven for the list itself: positions arrive on the
 * school room, but a bus that starts or ends a trip changes the *set*, and
 * re-fetching is cheaper to reason about than patching an array from four
 * different events.
 */
export default function SchoolLive() {
  const { data, loading, error, reload } = usePolling<LiveTrip[]>("/school/trips/live", 20_000);
  const [openId, setOpen] = useState<string | null>(null);

  useSocket({ "trip:started": reload, "trip:ended": reload }, []);

  if (loading && !data) {
    return (
      <Screen>
        <Card>
          <View style={{ gap: space(4) }}>
            <SkeletonRow />
            <SkeletonRow />
          </View>
        </Card>
      </Screen>
    );
  }

  if (error) return <Screen><ErrorState message={error} onRetry={reload} /></Screen>;

  if (!data?.length) {
    return (
      <Screen refreshing={loading} onRefresh={reload}>
        <Card>
          <EmptyState title={str.live.noneTitle} hint={str.live.noneHint} />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen refreshing={loading} onRefresh={reload}>
      {data.map((trip) => {
        const open = openId === trip._id;
        const label = trip.vehicleId?.busNumber ?? trip.vehicleId?.vehicleNumber ?? str.live.unnamedBus;
        const fix = trip.lastPosition;

        return (
          <Card key={trip._id} padded={false}>
            <ListRow
              icon={
                <IconChip bg={colors.brand50}>
                  <IconBus size={20} color={colors.brand600} />
                </IconChip>
              }
              title={label}
              subtitle={`${trip.driverId?.name ?? str.live.noDriver} · ${trip.routeId?.name ?? str.live.noRoute}`}
              onPress={() => setOpen(open ? null : trip._id)}
              right={
                <View style={{ alignItems: "flex-end", gap: space(1) }}>
                  <Badge value={trip.gpsStale ? "open" : trip.delayed ? "delayed" : "live"} />
                  <Muted>{trip.type}</Muted>
                </View>
              }
            />

            <View style={{ flexDirection: "row", alignItems: "center", gap: space(2), paddingHorizontal: space(4), paddingBottom: space(3) }}>
              {!trip.gpsStale && <LiveDot />}
              {/* A three-minute-old fix is not "live". Saying so is the
                  difference between a parked bus and a dead phone. */}
              <Muted role="label" weight="400" numberOfLines={1} style={{ flex: 1 }}>
                {trip.gpsStale
                  ? str.live.gpsStale(ago(fix?.at))
                  : trip.delayed
                    ? str.live.behind(trip.delayMinutes ?? 0, trip.stats?.pickedUp ?? 0)
                    : str.live.reporting(trip.stats?.pickedUp ?? 0)}
              </Muted>
            </View>

            {open && (
              <BusMap
                bus={fix?.lat != null ? { lat: fix.lat, lng: fix.lng } : null}
                stops={trip.routeId?.stops ?? []}
                height={240}
              />
            )}
          </Card>
        );
      })}
    </Screen>
  );
}
