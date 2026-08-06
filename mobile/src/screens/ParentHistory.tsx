import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useQuery } from "../api";
import { date, time } from "../format";
import { colors, radius } from "../theme";
import { Badge, Card, Divider, EmptyState, Loading, Muted, Screen, T } from "../ui";
import { IconBus, IconClock } from "../icons";

type Child = { _id: string; name: string };

export default function ParentHistory() {
  const children = useQuery<Child[]>("/parent/children");
  const [childId, setChildId] = useState<string | null>(null);
  const id = childId ?? children.data?.[0]?._id ?? null;

  const history = useQuery<{ date: string; events: any[] }[]>(
    id ? `/parent/children/${id}/history?days=7` : null,
    [id]
  );

  return (
    <Screen refreshing={history.loading} onRefresh={history.reload}>
      {(children.data?.length ?? 0) > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {children.data!.map((c) => {
            const on = c._id === id;
            return (
              <Pressable
                key={c._id}
                onPress={() => setChildId(c._id)}
                style={[s.chip, on && { backgroundColor: colors.brand600, borderColor: colors.brand600 }]}
              >
                <T size={13} weight="600" color={on ? colors.white : colors.slate600}>{c.name}</T>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      {history.loading && !history.data && <Loading />}

      {history.data?.length === 0 && (
        <Card>
          <EmptyState
            title="No records yet"
            hint="Pickup and drop history from the last 7 days appears here."
          />
        </Card>
      )}

      {history.data?.map((day) => (
        <Card key={day.date} title={date(day.date)} padded={false}>
          {day.events.map((event, i) => (
            <View key={event._id}>
              {i > 0 && <Divider />}
              <View style={s.row}>
                <View
                  style={[
                    s.icon,
                    {
                      backgroundColor:
                        event.event === "boarded"
                          ? colors.brand50
                          : event.event === "dropped"
                            ? colors.leaf50
                            : colors.slate100,
                    },
                  ]}
                >
                  {event.event === "absent" ? (
                    <IconClock size={16} color={colors.slate500} />
                  ) : (
                    <IconBus size={16} color={event.event === "boarded" ? colors.brand600 : colors.leaf600} />
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <T size={13} weight="600">{event.event}</T>
                  <Muted size={11}>{time(event.at)}</Muted>
                </View>
                <Badge value={event.event} />
              </View>
            </View>
          ))}
        </Card>
      ))}
    </Screen>
  );
}

const s = StyleSheet.create({
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.slate300,
    backgroundColor: colors.white,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  icon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
});
