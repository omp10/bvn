import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { usePolling } from "../api";
import { useSocket } from "../socket";
import { ago } from "../format";
import { colors, radius } from "../theme";
import { Badge, Card, EmptyState, LiveDot, Loading, Muted, Screen, T } from "../ui";
import { IconBus } from "../icons";
import BusMap from "../BusMap";

type LiveTrip = {
  _id: string;
  type: string;
  gpsStale: boolean;
  lastPosition?: { lat: number; lng: number; at: string } | null;
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

  if (loading && !data) return <Loading label="Finding your buses…" />;
  if (error) {
    return (
      <Screen>
        <Card><EmptyState title="Could not load" hint={error} /></Card>
      </Screen>
    );
  }

  if (!data?.length) {
    return (
      <Screen refreshing={loading} onRefresh={reload}>
        <Card>
          <EmptyState
            title="No buses are out"
            hint="Running trips appear here the moment a driver starts one."
          />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen refreshing={loading} onRefresh={reload}>
      {data.map((trip) => {
        const open = openId === trip._id;
        const label = trip.vehicleId?.busNumber ?? trip.vehicleId?.vehicleNumber ?? "Bus";
        const fix = trip.lastPosition;

        return (
          <Card key={trip._id} padded={false}>
            <Pressable
              onPress={() => setOpen(open ? null : trip._id)}
              style={({ pressed }) => [s.row, pressed && { backgroundColor: colors.slate50 }]}
            >
              <View style={s.icon}>
                <IconBus size={20} color={colors.brand600} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <T size={15} weight="700" numberOfLines={1}>{label}</T>
                  {!trip.gpsStale && <LiveDot />}
                </View>
                <Muted size={11} numberOfLines={1}>
                  {trip.driverId?.name ?? "No driver"} · {trip.routeId?.name ?? "no route"}
                </Muted>
                <Muted size={11}>
                  {/* A three-minute-old fix is not "live". Saying so is the
                      difference between a parked bus and a dead phone. */}
                  {trip.gpsStale
                    ? `GPS ${ago(fix?.at)} — low signal or phone asleep`
                    : `Reporting · ${trip.stats?.pickedUp ?? 0} picked up`}
                </Muted>
              </View>
              <View style={{ alignItems: "flex-end", gap: 4 }}>
                <Badge value={trip.gpsStale ? "open" : "running"} />
                <Muted size={11}>{trip.type}</Muted>
              </View>
            </Pressable>

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

const s = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12 },
  icon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.brand50,
    alignItems: "center",
    justifyContent: "center",
  },
});
