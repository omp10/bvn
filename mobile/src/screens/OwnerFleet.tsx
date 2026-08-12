import { View } from "react-native";
import { useQuery } from "../api";
import { date } from "../format";
import { colors, space, tone } from "../theme";
import { str } from "../strings";
import {
  Alert, Badge, Card, CrossFade, EmptyState, Enter, ErrorState, IconChip, Muted, Screen, SkeletonRow, T,
} from "../ui";
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
 * missed: a service coming due and a document about to expire. Those two are the
 * only thing on the card allowed to be loud.
 */
export default function OwnerFleet() {
  const { data, loading, error, reload } = useQuery<Vehicle[]>("/owner/vehicles");

  if (error) return <Screen><ErrorState message={error} onRetry={reload} /></Screen>;

  if (!loading && !data?.length) {
    return (
      <Screen refreshing={loading} onRefresh={reload}>
        <Card>
          <EmptyState art={require("../../assets/empty/no-buses.png")} title={str.fleet.noneTitle} hint={str.fleet.noneHint} />
        </Card>
      </Screen>
    );
  }

  return (
    <CrossFade
      loading={loading && !data}
      skeleton={
        <Screen>
          <Card>
            <View style={{ gap: space(4) }}>
              <SkeletonRow />
              <SkeletonRow />
            </View>
          </Card>
        </Screen>
      }
    >
      <Screen refreshing={loading} onRefresh={reload}>
        {(data ?? []).map((v, i) => {
          const expiring = (v.documents ?? []).filter((d) => isSoon(d.expiresOn));
          const serviceDue = isSoon(v.nextMaintenanceDueAt);

          return (
            <Enter delay={i < 8 ? i * 30 : 0} key={v._id}>
              <Card style={expiring.length || serviceDue ? { borderColor: colors.amber400 } : undefined}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: space(3) }}>
                  <IconChip bg={colors.brand50} size={44} square>
                    <IconBus size={22} color={colors.brand600} />
                  </IconChip>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <T role="heading" numberOfLines={1}>
                      {v.busNumber ?? v.vehicleNumber}
                    </T>
                    <Muted numberOfLines={1}>
                      {[v.vehicleNumber, v.capacity ? str.fleet.seats(v.capacity) : null]
                        .filter(Boolean)
                        .join(" · ")}
                    </Muted>
                  </View>
                  <Badge value={v.status} />
                </View>

                <View style={{ gap: space(2), marginTop: space(3) }}>
                  <Row label={str.fleet.school} value={v.schoolId?.name ?? str.fleet.unassigned} />
                  <Row label={str.fleet.driver} value={v.driverId?.name ?? str.fleet.noDriver} />
                  {!!v.nextMaintenanceDueAt && (
                    <Row label={str.fleet.serviceDue} value={date(v.nextMaintenanceDueAt)} warn={serviceDue} />
                  )}
                </View>

                {expiring.length > 0 && (
                  <View style={{ marginTop: space(3) }}>
                    <Alert tone="warn">{str.fleet.expiring(expiring.map((d) => d.type).join(", "))}</Alert>
                  </View>
                )}
              </Card>
            </Enter>
          );
        })}
      </Screen>
    </CrossFade>
  );
}

const Row = ({ label, value, warn }: { label: string; value: string; warn?: boolean }) => (
  <View style={{ flexDirection: "row", justifyContent: "space-between", gap: space(3) }}>
    <Muted role="label" weight="400">
      {label}
    </Muted>
    <T
      role="label"
      color={warn ? colors.amber600 : tone.textPrimary}
      style={{ flex: 1, textAlign: "right" }}
      numberOfLines={1}
    >
      {value}
    </T>
  </View>
);
