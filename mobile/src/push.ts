import { useEffect } from "react";
import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { api } from "./api";
import { colors, VARIANT } from "./theme";

/**
 * Push, over FCM.
 *
 * The token is an Expo push token and the server sends through Expo's push
 * service, which hands off to FCM on Android. That is one `fetch` on the server
 * instead of a service-account JSON, a Google auth library and a key rotation
 * story — for the volume a school run generates, the hosted relay is the right
 * trade. If it ever needs to go direct, `sendPush` in the backend is the only
 * function that changes.
 */

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

/** Android needs the channel to exist before the first notification arrives. */
async function ensureChannel() {
  if (Platform.OS !== "android") return;

  await Notifications.setNotificationChannelAsync("default", {
    name: "Trip updates",
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: colors.brand600,
  });

  // Emergencies get their own channel so a parent can silence trip chatter
  // without silencing the alert that matters.
  await Notifications.setNotificationChannelAsync("emergency", {
    name: "Emergency alerts",
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 400, 200, 400],
    lightColor: colors.red600,
    sound: "default",
  });
}

/**
 * Asks for permission, gets the token, tells the server.
 *
 * Safe to call on every launch: `/auth/push-token` is a `$addToSet`, so
 * repeating it is free, and it is how a reinstalled app re-attaches itself.
 */
export async function registerPushToken(): Promise<string | null> {
  try {
    await ensureChannel();

    // An emulator has no push service; asking produces a confusing failure.
    if (!Device.isDevice) return null;

    const existing = await Notifications.getPermissionsAsync();
    const granted =
      existing.granted || (await Notifications.requestPermissionsAsync()).granted;
    if (!granted) return null;

    const projectId =
      (Constants.expoConfig?.extra as any)?.eas?.projectId ??
      (Constants as any).easConfig?.projectId;
    if (!projectId) return null; // Not an EAS build — nothing to register against.

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await api("/auth/push-token", { body: { token } });
    return token;
  } catch {
    // Push failing must never stop the app from working — the socket and the
    // poll still deliver everything, just without waking the phone.
    return null;
  }
}

/**
 * Reacts to a notification the user tapped.
 *
 * Both apps only ever have one sensible destination per alert, so this is a
 * tab switch rather than a routing table.
 */
export function useNotificationTaps(onOpen: (type: string, data: Record<string, any>) => void) {
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const content = response.notification.request.content;
      const data = (content.data ?? {}) as Record<string, any>;
      onOpen(String(data.type ?? ""), data);
    });
    return () => sub.remove();
  }, [onOpen]);
}

/** Where a tapped notification should land, per app. */
export const NOTIFICATION_TARGET = VARIANT === "parent" ? "Alerts" : "Trip";
