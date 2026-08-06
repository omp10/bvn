import { StyleSheet, View } from "react-native";
import { api, useAction, usePolling } from "../api";
import { useSocket } from "../socket";
import { dateTime } from "../format";
import { colors } from "../theme";
import { Button, Card, EmptyState, Loading, Muted, Screen, T } from "../ui";
import { IconAlert, IconBell } from "../icons";

/**
 * Notifications, for both apps. Everyone signed in reads their own from the same
 * endpoint, so there is nothing role-specific to branch on here.
 */
export default function Alerts() {
  /* Polled, not just socket-driven: a parent is never in the school room, so
     the `notification` broadcast below reaches staff only. */
  const { data, loading, reload } = usePolling<{ items: any[]; unread: number }>(
    "/notifications?limit=50",
    60_000
  );
  const { run } = useAction();

  useSocket({ notification: () => reload() }, []);

  return (
    <Screen refreshing={loading} onRefresh={reload}>
      {(data?.unread ?? 0) > 0 && (
        <Button
          variant="secondary"
          block
          onPress={() => void run(() => api("/notifications/read-all", { body: {} }), reload)}
        >
          Mark all {data!.unread} as read
        </Button>
      )}

      {loading && !data && <Loading />}

      {data?.items.length === 0 && (
        <Card>
          <EmptyState title="No notifications yet" hint="Trip and safety alerts appear here." />
        </Card>
      )}

      {data?.items.map((n) => {
        const urgent = n.type === "emergency";
        return (
          <Card
            key={n._id}
            style={
              n.readAt
                ? undefined
                : { borderColor: urgent ? colors.red500 : colors.brand200, backgroundColor: urgent ? colors.red50 : colors.brand50 }
            }
          >
            <View style={{ flexDirection: "row", gap: 12 }}>
              <View style={[s.icon, urgent && { borderColor: colors.red500 }]}>
                {urgent ? (
                  <IconAlert size={16} color={colors.red600} />
                ) : (
                  <IconBell size={16} color={colors.brand600} />
                )}
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <T size={14} weight="700">{n.title}</T>
                <T size={13} color={colors.slate600} style={{ marginTop: 2, lineHeight: 18 }}>{n.body}</T>
                <Muted size={11} style={{ marginTop: 4 }}>{dateTime(n.createdAt)}</Muted>
              </View>
              {!n.readAt && <View style={s.unread} />}
            </View>
          </Card>
        );
      })}
    </Screen>
  );
}

const s = StyleSheet.create({
  icon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.slate200,
    alignItems: "center",
    justifyContent: "center",
  },
  unread: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.brand500, marginTop: 5 },
});
