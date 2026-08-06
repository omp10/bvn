import { User } from "../../models/user.model.js";
import { allSchools } from "../../models/plugins/tenant.js";

/**
 * Delivery to phones, through Expo's push service.
 *
 * ponytail: Expo relays to FCM rather than this process talking to FCM directly.
 * That trades a hop for a service-account JSON, a Google auth library and a key
 * rotation story we would otherwise own — at school-run volume the relay is the
 * right side of that trade. If it ever has to go direct, this file is the only
 * one that changes: `sendPush` is the whole seam.
 */
const EXPO_ENDPOINT = "https://exp.host/--/api/v2/push/send";

/** Expo rejects a request with more than 100 messages in it. */
const CHUNK = 100;

/** A token Expo did not mint will never work — do not waste a request on it. */
export const isExpoToken = (t: unknown): t is string =>
  typeof t === "string" && /^Expo(nent)?PushToken\[.+\]$/.test(t);

export type PushMessage = {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  /** Emergencies ride the high-importance channel the app registers at launch. */
  channelId?: "default" | "emergency";
};

/**
 * Wakes the given users' devices. Never throws: a push that fails must not roll
 * back the attendance mark or the emergency that triggered it — the record is
 * already written and the socket has already fired.
 */
export async function sendPush(userIds: string[], message: PushMessage): Promise<number> {
  if (!userIds.length) return 0;

  // Scoped by userId across tenants on purpose: a super admin has no school, and
  // the ids were already resolved by the caller inside its own scope.
  const users = await allSchools(User.find({ _id: { $in: userIds } }))
    .select("pushTokens")
    .lean();

  const tokens = [...new Set(users.flatMap((u) => u.pushTokens ?? []))].filter(isExpoToken);
  if (!tokens.length) return 0;

  const base = {
    title: message.title,
    body: message.body,
    data: message.data ?? {},
    sound: "default" as const,
    channelId: message.channelId ?? "default",
    priority: "high" as const,
  };

  let sent = 0;
  for (let i = 0; i < tokens.length; i += CHUNK) {
    const chunk = tokens.slice(i, i + CHUNK);
    try {
      const res = await fetch(EXPO_ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify(chunk.map((to) => ({ to, ...base }))),
      });

      const payload = (await res.json().catch(() => null)) as
        | { data?: { status: string; details?: { error?: string } }[] }
        | null;

      const tickets = payload?.data ?? [];
      sent += tickets.filter((t) => t.status === "ok").length;

      /* A device that has been reinstalled or wiped reports DeviceNotRegistered
         for good. Dropping the token here is what stops the list growing without
         bound and the same dead device being retried on every trip, forever. */
      const dead = chunk.filter((_, n) => tickets[n]?.details?.error === "DeviceNotRegistered");
      if (dead.length) {
        await allSchools(User.updateMany({ pushTokens: { $in: dead } }, { $pull: { pushTokens: { $in: dead } } }));
      }
    } catch (err) {
      console.error("[push] send failed:", (err as Error).message);
    }
  }

  return sent;
}
