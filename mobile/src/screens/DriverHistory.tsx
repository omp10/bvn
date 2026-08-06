import { StyleSheet, View } from "react-native";
import { useQuery } from "../api";
import { date, time } from "../format";
import { colors } from "../theme";
import { Badge, Card, Divider, EmptyState, Loading, Muted, Screen, T } from "../ui";

export default function DriverHistory() {
  const { data, loading, reload } = useQuery<{ items: any[] }>("/driver/trips?limit=30");

  return (
    <Screen refreshing={loading} onRefresh={reload}>
      {loading && !data && <Loading />}

      {data?.items.length === 0 && (
        <Card><EmptyState title="No trips yet" hint="Completed trips are listed here." /></Card>
      )}

      {!!data?.items.length && (
        <Card title="Recent trips" padded={false}>
          {data.items.map((t, i) => (
            <View key={t._id}>
              {i > 0 && <Divider />}
              <View style={s.row}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <T size={14} weight="600">{date(t.tripDate)}</T>
                  <Muted size={11}>
                    {t.type} · {time(t.startedAt)} → {t.endedAt ? time(t.endedAt) : "—"}
                  </Muted>
                </View>
                <View style={{ alignItems: "flex-end", gap: 4 }}>
                  <Badge value={t.status} />
                  <Muted size={11}>{t.stats?.pickedUp ?? 0} picked up</Muted>
                </View>
              </View>
            </View>
          ))}
        </Card>
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: colors.white,
  },
});
