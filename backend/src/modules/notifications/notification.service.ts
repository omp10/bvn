import { Notification, type NOTIFICATION_TYPES } from "../../models/notification.model.js";
import { emitToSchool } from "../../realtime/socket.js";
import { sendPush } from "./push.js";

type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/** Types that must reach a phone even when trip chatter is silenced. */
const URGENT = new Set<string>(["emergency", "child_left_on_bus", "child_unaccounted"]);

export type NotifyInput = {
  userIds: unknown[];
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  schoolId?: unknown;
};

/**
 * Records notifications and hands them to the delivery channels: the row, the
 * socket for anyone with the app open, and a push for everyone who does not.
 *
 * ponytail: the push is fired and not awaited, so a 500-parent fan-out never
 * blocks the request that triggered it — a driver tapping Start Trip must not
 * wait on 500 sends. Move it onto a queue when a failed batch needs retrying
 * rather than only logging; `sendPush` is already the single seam.
 */
export async function notify(input: NotifyInput): Promise<void> {
  const userIds = [...new Set(input.userIds.filter(Boolean).map(String))];
  if (!userIds.length) return;

  const docs = userIds.map((userId) => ({
    userId,
    schoolId: input.schoolId,
    type: input.type,
    title: input.title,
    body: input.body,
    data: input.data ?? {},
  }));

  await Notification.insertMany(docs);

  if (input.schoolId) {
    emitToSchool(String(input.schoolId), "notification", {
      type: input.type,
      title: input.title,
      body: input.body,
      data: input.data ?? {},
    });
  }

  if (process.env.NODE_ENV !== "test") {
    console.log(`[notify] ${input.type} → ${userIds.length} user(s): ${input.title}`);

    void sendPush(userIds, {
      title: input.title,
      body: input.body,
      // The app needs the type to decide where a tap should land.
      data: { ...(input.data ?? {}), type: input.type },
      // A child unaccounted for is an emergency whatever the enum calls it, so
      // it rides the channel a parent cannot mute along with trip chatter.
      channelId: URGENT.has(input.type) ? "emergency" : "default",
    }).catch((err) => console.error("[notify] push failed:", err.message));
  }
}

/** Copy for the events the FRD spells out, kept in one place so wording stays consistent. */
export const messages = {
  tripStarted: (busNumber: string) => ({
    title: "Bus has started",
    body: `${busNumber} has started its trip.`,
  }),
  busLeftStop: (busNumber: string, stopName: string) => ({
    title: "Bus on the move",
    body: `${busNumber} has left ${stopName} and is heading to your stop.`,
  }),
  busApproaching: (busNumber: string, minutes: number) => ({
    title: "Bus approaching",
    body: `${busNumber} is about ${minutes} minute${minutes === 1 ? "" : "s"} from your stop.`,
  }),
  childBoarded: (name: string, busNumber: string) => ({
    title: "Boarded safely",
    body: `${name} has boarded ${busNumber}.`,
  }),
  childDropped: (name: string) => ({
    title: "Dropped safely",
    body: `${name} has been dropped at their stop.`,
  }),
  schoolArrived: (busNumber: string) => ({
    title: "Reached school",
    body: `${busNumber} has reached the school.`,
  }),
  childEnteredSchool: (name: string) => ({
    title: "Arrived at school",
    body: `${name} has reached school safely.`,
  }),
  returnStarted: (busNumber: string) => ({
    title: "Return journey started",
    body: `${busNumber} has left the school for the evening route.`,
  }),
  tripDelayed: (busNumber: string, minutes: number) => ({
    title: "Bus running late",
    body: `${busNumber} is about ${minutes} minute${minutes === 1 ? "" : "s"} behind schedule.`,
  }),
  childLeftOnBus: (name: string, busNumber: string) => ({
    title: "Child still marked on board",
    body: `${name} was boarded onto ${busNumber} but never marked dropped. Check the bus now.`,
  }),
  childUnaccounted: (name: string, busNumber: string) => ({
    title: "Child not accounted for",
    body: `${name} was not marked boarded or absent on ${busNumber} this morning.`,
  }),
  overspeed: (busNumber: string, kmph: number) => ({
    title: "Bus over speed limit",
    body: `${busNumber} was recorded at ${kmph} km/h.`,
  }),
  tripCompleted: (busNumber: string) => ({
    title: "Trip completed",
    body: `${busNumber} has completed its trip.`,
  }),
  emergency: (type: string, busNumber: string) => ({
    title: "Emergency alert",
    body: `${type.replace("_", " ")} reported on ${busNumber}.`,
  }),
  routeChanged: (studentName: string) => ({
    title: "Route updated",
    body: `The route for ${studentName} has been updated.`,
  }),
};
