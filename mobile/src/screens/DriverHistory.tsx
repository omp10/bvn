import { View } from "react-native";
import { useQuery } from "../api";
import { date, time } from "../format";
import { colors, space } from "../theme";
import { str } from "../strings";
import { Badge, Card, CrossFade, Divider, EmptyState, Enter, ErrorState, IconChip, ListRow, Muted, Screen, SkeletonRow,
} from "../ui";
import { IconBus } from "../icons";

/**
 * The driver's finished trips.
 *
 * Reached from Profile rather than a tab: nobody opens last week's runs
 * mid-shift, and the tab it used to occupy was one of six.
 */
export default function DriverHistory() {
  const { data, loading, error, reload } = useQuery<{ items: any[] }>("/driver/trips?limit=30");

  return (
    <CrossFade
      loading={loading && !data}
      skeleton={
        <Screen>
          <Card>
            <View style={{ gap: space(4) }}>
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
            </View>
          </Card>
        </Screen>
      }
    >
      <Screen refreshing={loading} onRefresh={reload}>
        {!!error && <ErrorState message={error} onRetry={reload} />}

        {data?.items.length === 0 && (
          <Card>
            <EmptyState art={require("../../assets/empty/no-history.png")} title={str.history.noTripsTitle} hint={str.history.noTripsHint} />
          </Card>
        )}

        {!!data?.items.length && (
          <Card padded={false}>
            {data.items.map((t, i) => (
              <Enter delay={i < 8 ? i * 30 : 0} key={t._id}>
                <View>
                  {i > 0 && <Divider />}
                  <ListRow
                    icon={
                      <IconChip bg={colors.brand50}>
                        <IconBus size={18} color={colors.brand600} />
                      </IconChip>
                    }
                    title={date(t.tripDate)}
                    subtitle={`${t.type} · ${time(t.startedAt)} → ${t.endedAt ? time(t.endedAt) : str.history.ongoing}`}
                    right={
                      <View style={{ alignItems: "flex-end", gap: space(1) }}>
                        <Badge value={t.status} />
                        <Muted>{str.history.pickedUp(t.stats?.pickedUp ?? 0)}</Muted>
                      </View>
                    }
                  />
                </View>
              </Enter>
            ))}
          </Card>
        )}
      </Screen>
    </CrossFade>
  );
}
