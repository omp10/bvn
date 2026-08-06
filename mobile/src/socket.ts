import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import { io, type Socket } from "socket.io-client";
import { tokens } from "./api";
import { API_URL } from "./theme";

/**
 * One shared connection for the whole app. Screens subscribe to the events they
 * care about; nobody opens a second socket.
 *
 * The token is read at connect time, so a socket created before sign-in is not
 * reused afterwards — `closeSocket()` on sign-out is what guarantees that.
 */
let socket: Socket | null = null;

export function getSocket(): Socket | null {
  const token = tokens.access();
  if (!token) return null;

  if (!socket) {
    socket = io(API_URL, {
      path: "/socket.io",
      auth: { token },
      /* Polling stays in the list. A websocket is better on every count, but
         Indian mobile carriers and school Wi-Fi captive portals both break the
         upgrade often enough that websocket-only means "no live tracking at
         all" for whoever is behind one — and falling back to a slower transport
         beats a parent watching a bus that never moves. */
      transports: ["websocket", "polling"],
      reconnectionDelay: 1000,
      reconnectionDelayMax: 8000,
    });
  }
  return socket;
}

export function closeSocket() {
  socket?.disconnect();
  socket = null;
}

/**
 * Subscribes for the life of the component. `handlers` is read through a ref so
 * a screen can pass fresh closures every render without tearing listeners down.
 */
export function useSocket(handlers: Record<string, (payload: any) => void>, deps: unknown[] = []) {
  const ref = useRef(handlers);
  ref.current = handlers;

  useEffect(() => {
    const s = getSocket();
    if (!s) return;

    const bound = Object.keys(ref.current).map((name) => {
      const fn = (payload: unknown) => ref.current[name]?.(payload);
      s.on(name, fn);
      return [name, fn] as const;
    });

    return () => bound.forEach(([name, fn]) => s.off(name, fn));
  }, deps);
}

/**
 * Joins a trip room. The server checks this user may watch this trip before
 * accepting — naming a room is never enough to receive another school's buses.
 *
 * Re-joins on reconnect *and* when the app returns to the foreground: Android
 * kills idle sockets, and a silently lost room looks exactly like a parked bus.
 */
export function useTripRoom(tripId: string | null | undefined) {
  useEffect(() => {
    const s = getSocket();
    if (!s || !tripId) return;

    const join = () => s.emit("trip:watch", { tripId }, () => {});
    join();
    s.on("connect", join);
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      if (!s.connected) s.connect();
      join();
    });

    return () => {
      s.off("connect", join);
      sub.remove();
      s.emit("trip:unwatch", { tripId });
    };
  }, [tripId]);
}
