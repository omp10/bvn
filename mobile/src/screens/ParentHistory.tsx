import { useState, type ReactElement } from "react";
import { ScrollView, View } from "react-native";
import { useQuery } from "../api";
import { date, time } from "../format";
import { colors, space } from "../theme";
import { str } from "../strings";
import {
  Avatar, Card, Chip, Divider, EmptyState, ErrorState, IconChip, ListRow, Screen, SectionHeader,
  SkeletonRow,
} from "../ui";
import { IconAlert, IconBus, IconSchool } from "../icons";

type Child = { _id: string; name: string; photoUrl?: string | null };

/**
 * Which icon, tint and wording an attendance event gets.
 *
 * The row says the event in words as well as in colour. The design pairs the
 * tinted icon with a status pill, but the pill would only repeat the title —
 * so the title is the sentence and the icon is the colour.
 */
const LOOK: Record<string, { bg: string; fg: string; icon: (p: any) => ReactElement; label: string }> = {
  boarded: { bg: colors.brand50, fg: colors.brand600, icon: IconBus, label: str.history.boarded },
  dropped: { bg: colors.leaf50, fg: colors.leaf600, icon: IconSchool, label: str.history.dropped },
  absent: { bg: colors.slate100, fg: colors.slate500, icon: IconAlert, label: str.history.absent },
};

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
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space(2) }}>
          {children.data!.map((c) => (
            <Chip
              key={c._id}
              label={c.name.split(" ")[0]}
              selected={c._id === id}
              onPress={() => setChildId(c._id)}
              icon={<Avatar name={c.name} photoUrl={c.photoUrl} size={24} onDark={c._id === id} />}
            />
          ))}
        </ScrollView>
      )}

      {history.loading && !history.data && (
        <Card>
          <View style={{ gap: space(4) }}>
            <SkeletonRow />
            <SkeletonRow />
          </View>
        </Card>
      )}

      {!!history.error && <ErrorState message={history.error} onRetry={history.reload} />}

      {history.data?.length === 0 && (
        <Card>
          <EmptyState title={str.history.noneTitle} hint={str.history.noneHint} />
        </Card>
      )}

      {/* Grouped by day with the date as a run-in header rather than a card
          title, so a week reads as a week instead of seven identical boxes. */}
      {history.data?.map((day) => (
        <View key={day.date} style={{ gap: space(2) }}>
          <SectionHeader>{date(day.date)}</SectionHeader>
          <Card padded={false}>
            {day.events.map((event, i) => {
              const look = LOOK[event.event] ?? LOOK.absent;
              const Icon = look.icon;
              return (
                <View key={event._id}>
                  {i > 0 && <Divider />}
                  <ListRow
                    icon={
                      <IconChip bg={look.bg}>
                        <Icon size={18} color={look.fg} />
                      </IconChip>
                    }
                    title={look.label}
                    value={time(event.at)}
                  />
                </View>
              );
            })}
          </Card>
        </View>
      ))}
    </Screen>
  );
}
