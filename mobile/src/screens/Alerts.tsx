import { StyleSheet, View } from "react-native";
import { api, useAction, usePolling } from "../api";
import { useSocket } from "../socket";
import { ago } from "../format";
import { useUnread } from "../unread";
import { colors, radius, space, tone } from "../theme";
import { str } from "../strings";
import {
  Button, Card, CrossFade, EmptyState, Enter, IconChip, LiveDot, Muted, Screen, SkeletonRow, T,
} from "../ui";
import { IconAlert, IconBell } from "../icons";

/**
 * Notifications, for both apps. Everyone signed in reads their own from the same
 * endpoint, so there is nothing role-specific to branch on here.
 *
 * Pushed from the header bell rather than owning a tab: this is where a tapped
 * notification lands, not somewhere people navigate to on purpose.
 */
export default function Alerts() {
  /* Polled, not just socket-driven: a parent is never in the school room, so
     the `notification` broadcast below reaches staff only. */
  const { data, loading, reload } = usePolling<{ items: any[]; unread: number }>(
    "/notifications?limit=50",
    60_000
  );
  const { run } = useAction();
  // The bell in every header counts the same unread total, so clearing them
  // here has to clear it there in the same breath.
  const unread = useUnread();

  useSocket({ notification: () => reload() }, []);

  const markAllRead = () =>
    void run(() => api("/notifications/read-all", { body: {} }), () => {
      reload();
      unread.refresh();
    });

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
        {(data?.unread ?? 0) > 0 && (
          <Button variant="secondary" block onPress={markAllRead}>
            {str.alerts.markAllRead(data!.unread)}
          </Button>
        )}

        {data?.items.length === 0 && (
          <Card>
            <EmptyState art={require("../../assets/empty/no-alerts.png")} title={str.alerts.noneTitle} hint={str.alerts.noneHint} />
          </Card>
        )}

        {data?.items.map((n, i) => {
          const urgent = n.type === "emergency";
          const unreadRow = !n.readAt;

          return (
            <Enter delay={i < 8 ? i * 30 : 0} key={n._id}>
              <View
                style={[
                  s.item,
                  urgent && { backgroundColor: colors.red50, borderColor: colors.red500 },
                  !urgent && unreadRow && { backgroundColor: colors.brand50, borderColor: colors.brand200 },
                  // An emergency reads differently at a glance, not just in colour:
                  // the red edge is the thing you see before you read anything.
                  urgent && s.urgentEdge,
                ]}
              >
            <IconChip bg={urgent ? colors.white : unreadRow ? colors.white : colors.slate100}>
              {urgent ? (
                <IconAlert size={18} color={tone.danger} />
              ) : (
                <IconBell size={18} color={unreadRow ? colors.brand600 : tone.textMuted} />
              )}
            </IconChip>

            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: space(2) }}>
                {urgent && (
                  <T role="caption" weight="800" color={tone.danger}>
                    {str.alerts.emergency.toUpperCase()}
                  </T>
                )}
                <T role="body" weight="700" style={{ flex: 1 }}>
                  {n.title}
                </T>
              </View>
              <T role="label" weight="400" color={tone.textSecondary}>
                {n.body}
              </T>
              <Muted style={{ marginTop: space(1) }}>{ago(n.createdAt)}</Muted>
            </View>

            {unreadRow && (
              <View accessibilityLabel={str.alerts.unread}>
                <LiveDot color={urgent ? colors.red500 : colors.brand500} />
              </View>
            )}
          </View>
          </Enter>
        );
      })}
    </Screen>
    </CrossFade>
  );
}

const s = StyleSheet.create({
  item: {
    flexDirection: "row",
    gap: space(3),
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: tone.border,
    borderRadius: radius.card,
    padding: space(3.5),
  },
  urgentEdge: { borderLeftWidth: 5, borderLeftColor: tone.danger },
});
