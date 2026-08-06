import { StyleSheet, View } from "react-native";
import { usePolling } from "../api";
import { useAuth, type Role } from "../auth";
import { rupees } from "../format";
import { colors, radius, shadow } from "../theme";
import { Card, EmptyState, Loading, Muted, Screen, Shield, T } from "../ui";

/**
 * The desk roles' home screen, from the one `/dashboard` endpoint that already
 * answers per role. A phone is not where a school admin does their work — this
 * is the "is anything on fire right now" view, and the sidebar-sized job stays
 * on the web app.
 */
type Tile = { label: string; value: string | number; tone?: "plain" | "warn" | "good" };

const TILES: Partial<Record<Role, (d: any) => Tile[]>> = {
  super_admin: (d) => [
    { label: "Schools", value: d.schools?.total ?? 0 },
    { label: "Active", value: d.schools?.active ?? 0, tone: "good" },
    { label: "On trial", value: d.schools?.trial ?? 0 },
    { label: "Expired", value: d.schools?.expired ?? 0, tone: d.schools?.expired ? "warn" : "plain" },
    { label: "Buses", value: d.vehicles ?? 0 },
    { label: "Parents", value: d.parents ?? 0 },
    { label: "Fleet owners", value: d.fleetOwners ?? 0 },
    { label: "Bus requests", value: d.pendingVehicleRequests ?? 0, tone: d.pendingVehicleRequests ? "warn" : "plain" },
    { label: "Revenue", value: rupees(d.revenueInPaise ?? 0) },
  ],
  school_admin: (d) => [
    { label: "Buses", value: d.vehicles ?? 0 },
    { label: "Students", value: d.students ?? 0 },
    { label: "Drivers", value: d.drivers ?? 0 },
    { label: "Picked up", value: d.pickedUp ?? 0, tone: "good" },
    { label: "Dropped", value: d.dropped ?? 0, tone: "good" },
    { label: "Absent", value: d.absent ?? 0 },
    { label: "Without a bus", value: d.studentsWithoutBus ?? 0, tone: d.studentsWithoutBus ? "warn" : "plain" },
    { label: "Route requests", value: d.pendingRouteRequests ?? 0, tone: d.pendingRouteRequests ? "warn" : "plain" },
    { label: "Open alerts", value: d.openEmergencies ?? 0, tone: d.openEmergencies ? "warn" : "plain" },
  ],
  owner: (d) => [
    { label: "Vehicles", value: d.total ?? 0 },
    { label: "Running", value: d.running ?? 0, tone: "good" },
    { label: "Assigned", value: d.assigned ?? 0 },
    { label: "Available", value: d.available ?? 0 },
    { label: "Maintenance", value: d.maintenance ?? 0, tone: d.maintenance ? "warn" : "plain" },
    { label: "Service due", value: d.maintenanceDue ?? 0, tone: d.maintenanceDue ? "warn" : "plain" },
    { label: "Drivers", value: d.drivers ?? 0 },
  ],
};

/** What the big number on the hero card should be, per role. */
const HEADLINE: Partial<Record<Role, (d: any) => { value: number; caption: string }>> = {
  super_admin: (d) => ({ value: d.runningTrips ?? 0, caption: "trips running across the platform" }),
  school_admin: (d) => ({ value: d.runningTrips ?? 0, caption: `buses out now · ${d.todaysTrips ?? 0} trips today` }),
  owner: (d) => ({ value: d.running ?? 0, caption: "of your vehicles are on the road" }),
};

export default function Overview() {
  const { user, school } = useAuth();
  const { data, loading, error, reload } = usePolling<any>("/dashboard", 60_000);

  if (loading && !data) return <Loading />;
  if (error) {
    return (
      <Screen>
        <Card><EmptyState title="Could not load" hint={error} /></Card>
      </Screen>
    );
  }

  const role = user?.role as Role;
  const tiles = TILES[role]?.(data ?? {}) ?? [];
  const headline = HEADLINE[role]?.(data ?? {});

  return (
    <Screen refreshing={loading} onRefresh={reload}>
      <Shield style={s.hero}>
        <T size={13} color="rgba(255,255,255,0.75)" numberOfLines={1}>
          {school?.name ?? "BalVahini"}
        </T>
        {!!headline && (
          <>
            <T size={44} weight="800" color={colors.white} style={{ marginTop: 6 }}>
              {headline.value}
            </T>
            <T size={13} color="rgba(255,255,255,0.8)">{headline.caption}</T>
          </>
        )}
      </Shield>

      <View style={s.grid}>
        {tiles.map((tile) => (
          <View key={tile.label} style={s.tile}>
            <T
              size={22}
              weight="800"
              color={
                tile.tone === "warn" ? colors.amber600 : tile.tone === "good" ? colors.leaf600 : colors.slate900
              }
            >
              {tile.value}
            </T>
            <Muted size={11} numberOfLines={2}>{tile.label}</Muted>
          </View>
        ))}
      </View>

      <Muted size={11} style={{ textAlign: "center", lineHeight: 16 }}>
        Full management — students, routes, salaries, reports — lives on the web app
        at balvahini.com.
      </Muted>
    </Screen>
  );
}

const s = StyleSheet.create({
  hero: { borderRadius: radius.card, padding: 18, overflow: "hidden", ...shadow },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  tile: {
    // Three across on a phone, and the gap is subtracted so the last one fits.
    width: "31.5%",
    minHeight: 76,
    justifyContent: "center",
    gap: 2,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.slate200,
    borderRadius: radius.md,
    padding: 12,
  },
});
