import { StyleSheet, View } from "react-native";
import { useQuery } from "../api";
import { date } from "../format";
import { colors, radius } from "../theme";
import { Badge, Card, EmptyState, Loading, Muted, Screen, T } from "../ui";
import { IconBus } from "../icons";

type Vehicle = {
  _id: string;
  busNumber?: string;
  vehicleNumber: string;
  status: string;
  capacity?: number;
  nextMaintenanceDueAt?: string | null;
  schoolId?: { name?: string } | null;
  driverId?: { name?: string; phone?: string } | null;
  documents?: { type: string; expiresOn?: string | null }[];
};

/** Thirty days is the window the owner dashboard already counts as "due". */
const SOON_MS = 30 * 86_400_000;

const isSoon = (value?: string | null) =>
  Boolean(value && new Date(value).getTime() - Date.now() < SOON_MS);

/**
 * An owner's vehicles, and the two things that actually cost them money if
 * missed: a service coming due and a document about to expire.
 */
export default function OwnerFleet() {
  const { data, loading, error, reload } = useQuery<Vehicle[]>("/owner/vehicles");

  if (loading && !data) return <Loading />;
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
          <EmptyState title="No vehicles yet" hint="Vehicles you add to the platform appear here." />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen refreshing={loading} onRefresh={reload}>
      {data.map((v) => {
        const expiring = (v.documents ?? []).filter((d) => isSoon(d.expiresOn));
        const serviceDue = isSoon(v.nextMaintenanceDueAt);

        return (
          <Card key={v._id}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <View style={s.icon}>
                <IconBus size={20} color={colors.brand600} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <T size={15} weight="700" numberOfLines={1}>
                  {v.busNumber ?? v.vehicleNumber}
                </T>
                <Muted size={11} numberOfLines={1}>
                  {v.vehicleNumber}
                  {v.capacity ? ` · ${v.capacity} seats` : ""}
                </Muted>
              </View>
              <Badge value={v.status} />
            </View>

            <View style={{ gap: 8, marginTop: 12 }}>
              <Row label="School" value={v.schoolId?.name ?? "Unassigned"} />
              <Row label="Driver" value={v.driverId?.name ?? "None"} />
              {!!v.nextMaintenanceDueAt && (
                <Row label="Service due" value={date(v.nextMaintenanceDueAt)} warn={serviceDue} />
              )}
            </View>

            {expiring.length > 0 && (
              <View style={s.warn}>
                <T size={12} weight="600" color={colors.amber800}>
                  {expiring.map((d) => d.type).join(", ")} expiring within 30 days
                </T>
              </View>
            )}
          </Card>
        );
      })}
    </Screen>
  );
}

const Row = ({ label, value, warn }: { label: string; value: string; warn?: boolean }) => (
  <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
    <Muted size={13}>{label}</Muted>
    <T
      size={13}
      weight="600"
      color={warn ? colors.amber600 : colors.slate800}
      style={{ flex: 1, textAlign: "right" }}
      numberOfLines={1}
    >
      {value}
    </T>
  </View>
);

const s = StyleSheet.create({
  icon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.brand50,
    alignItems: "center",
    justifyContent: "center",
  },
  warn: {
    marginTop: 12,
    backgroundColor: colors.amber50,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
});
