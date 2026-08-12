import { StyleSheet, View } from "react-native";
import { usePolling } from "../api";
import { useAuth, type Role } from "../auth";
import { useBrand } from "../brand";
import { rupees } from "../format";
import { colors, elevation, radius, space, tone } from "../theme";
import { str } from "../strings";
import {
  Card, EmptyState, ErrorState, IconChip, ListRow, Muted, Screen, SectionHeader, Shield, Skeleton,
  StatTile, T,
} from "../ui";
import { IconAlert, IconCheck } from "../icons";

/**
 * The desk roles' home screen, from the one `/dashboard` endpoint that already
 * answers per role. A phone is not where a school admin does their work — this
 * is the "is anything on fire right now" view, and the sidebar-sized job stays
 * on the web app.
 *
 * A flat grid of eleven equal numbers hides the one that matters. Anything
 * flagged `warn` and non-zero is lifted out into its own band at the top, in
 * words rather than as a tile — a school admin should be able to tell from the
 * first screenful whether they need to do anything today.
 */
type Tile = { label: string; value: string | number; tone?: "plain" | "warn" | "good" };

const TILES: Partial<Record<Role, (d: any) => Tile[]>> = {
  super_admin: (d) => [
    { label: str.overview.schools, value: d.schools?.total ?? 0 },
    { label: str.overview.active, value: d.schools?.active ?? 0, tone: "good" },
    { label: str.overview.onTrial, value: d.schools?.trial ?? 0 },
    { label: str.overview.expired, value: d.schools?.expired ?? 0, tone: d.schools?.expired ? "warn" : "plain" },
    { label: str.overview.buses, value: d.vehicles ?? 0 },
    { label: str.overview.parents, value: d.parents ?? 0 },
    { label: str.overview.fleetOwners, value: d.fleetOwners ?? 0 },
    {
      label: str.overview.busRequests,
      value: d.pendingVehicleRequests ?? 0,
      tone: d.pendingVehicleRequests ? "warn" : "plain",
    },
    { label: str.overview.revenue, value: rupees(d.revenueInPaise ?? 0) },
  ],
  school_admin: (d) => [
    { label: str.overview.buses, value: d.vehicles ?? 0 },
    { label: str.overview.students, value: d.students ?? 0 },
    { label: str.overview.drivers, value: d.drivers ?? 0 },
    { label: str.overview.pickedUp, value: d.pickedUp ?? 0, tone: "good" },
    { label: str.overview.dropped, value: d.dropped ?? 0, tone: "good" },
    { label: str.overview.absent, value: d.absent ?? 0 },
    {
      label: str.overview.withoutBus,
      value: d.studentsWithoutBus ?? 0,
      tone: d.studentsWithoutBus ? "warn" : "plain",
    },
    {
      label: str.overview.routeRequests,
      value: d.pendingRouteRequests ?? 0,
      tone: d.pendingRouteRequests ? "warn" : "plain",
    },
    { label: str.overview.openAlerts, value: d.openEmergencies ?? 0, tone: d.openEmergencies ? "warn" : "plain" },
  ],
  owner: (d) => [
    { label: str.overview.vehicles, value: d.total ?? 0 },
    { label: str.overview.running, value: d.running ?? 0, tone: "good" },
    { label: str.overview.assigned, value: d.assigned ?? 0 },
    { label: str.overview.available, value: d.available ?? 0 },
    { label: str.overview.maintenance, value: d.maintenance ?? 0, tone: d.maintenance ? "warn" : "plain" },
    { label: str.overview.serviceDue, value: d.maintenanceDue ?? 0, tone: d.maintenanceDue ? "warn" : "plain" },
    { label: str.overview.drivers, value: d.drivers ?? 0 },
  ],
};

/** What the big number on the hero card should be, per role. */
const HEADLINE: Partial<Record<Role, (d: any) => { value: number; caption: string }>> = {
  super_admin: (d) => ({ value: d.runningTrips ?? 0, caption: str.overview.tripsPlatform }),
  school_admin: (d) => ({ value: d.runningTrips ?? 0, caption: str.overview.busesOut(d.todaysTrips ?? 0) }),
  owner: (d) => ({ value: d.running ?? 0, caption: str.overview.vehiclesOut }),
};

export default function Overview() {
  const { user, school } = useAuth();
  const { appName } = useBrand();
  const { data, loading, error, reload } = usePolling<any>("/dashboard", 60_000);

  if (loading && !data) {
    return (
      <Screen>
        <Skeleton height={150} style={{ borderRadius: radius.card }} />
        <View style={{ flexDirection: "row", gap: space(2.5) }}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} height={84} style={{ flex: 1, borderRadius: radius.card }} />
          ))}
        </View>
      </Screen>
    );
  }

  if (error) return <Screen><ErrorState message={error} onRetry={reload} /></Screen>;

  const role = user?.role as Role;
  const tiles = TILES[role]?.(data ?? {}) ?? [];
  const headline = HEADLINE[role]?.(data ?? {});

  const attention = tiles.filter((t) => t.tone === "warn" && Number(t.value) > 0);
  const rest = tiles.filter((t) => !attention.includes(t));

  return (
    <Screen refreshing={loading} onRefresh={reload}>
      <Shield style={s.hero}>
        <T role="label" weight="400" color={tone.textOnDarkMuted} numberOfLines={1}>
          {school?.name ?? appName}
        </T>
        {!!headline && (
          <>
            <T role="display" color={colors.white} style={{ marginTop: space(1.5) }}>
              {headline.value}
            </T>
            <T role="body" color={tone.textOnDarkMuted}>
              {headline.caption}
            </T>
          </>
        )}
      </Shield>

      {attention.length > 0 ? (
        <>
          <SectionHeader>{str.overview.needsAttention}</SectionHeader>
          <Card padded={false} style={{ borderColor: colors.amber400 }}>
            {attention.map((tile) => (
              <ListRow
                key={tile.label}
                icon={
                  <IconChip bg={colors.amber50}>
                    <IconAlert size={18} color={colors.amber600} />
                  </IconChip>
                }
                title={tile.label}
                value={String(tile.value)}
              />
            ))}
          </Card>
        </>
      ) : (
        <Card>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space(3) }}>
            <IconChip bg={colors.leaf50}>
              <IconCheck size={18} color={tone.success} />
            </IconChip>
            <View style={{ flex: 1, minWidth: 0 }}>
              <T role="body" weight="700">
                {str.overview.allClear}
              </T>
              <Muted role="label" weight="400">
                {str.overview.allClearHint}
              </Muted>
            </View>
          </View>
        </Card>
      )}

      <SectionHeader>{str.overview.everythingElse}</SectionHeader>
      <View style={s.grid}>
        {rest.map((tile) => (
          <View key={tile.label} style={{ width: "31.5%" }}>
            <StatTile
              value={tile.value}
              label={tile.label}
              color={tile.tone === "good" ? tone.success : tone.textPrimary}
            />
          </View>
        ))}
      </View>

      {!tiles.length && (
        <Card>
          <EmptyState title={str.common.somethingWrong} hint={str.common.tryAgainHint} />
        </Card>
      )}

      <Muted role="label" weight="400" style={{ textAlign: "center" }}>
        {str.overview.webNote}
      </Muted>
    </Screen>
  );
}

const s = StyleSheet.create({
  hero: { borderRadius: radius.card, padding: space(4.5), overflow: "hidden", ...elevation.raised },
  // Three across on a phone, and the gap is subtracted so the last one fits.
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space(2.5) },
});
