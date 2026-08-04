import { useEffect, useRef } from "react";
import { io, type Socket } from "socket.io-client";
import { tokens } from "./api";

/**
 * One shared connection for the whole tab. Each screen subscribes to the events
 * it cares about; nobody opens a second socket.
 */
let socket: Socket | null = null;

export function getSocket(): Socket | null {
  const token = tokens.access();
  if (!token) return null;

  if (!socket) {
    socket = io({
      // Same origin — Vite proxies /socket.io through to the API in dev.
      path: "/socket.io",
      auth: { token },
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
 * Subscribes to socket events for the life of the component.
 *
 * `handlers` is read through a ref, so a screen can pass fresh closures on
 * every render without tearing the listeners down and rebuilding them.
 */
export function useSocket(handlers: Record<string, (payload: any) => void>, deps: unknown[] = []) {
  const ref = useRef(handlers);
  ref.current = handlers;

  useEffect(() => {
    const s = getSocket();
    if (!s) return;

    const names = Object.keys(ref.current);
    const bound = names.map((name) => {
      const fn = (payload: unknown) => ref.current[name]?.(payload);
      s.on(name, fn);
      return [name, fn] as const;
    });

    return () => bound.forEach(([name, fn]) => s.off(name, fn));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/**
 * Joins a trip room. The server checks that this user is allowed to watch this
 * trip before accepting — a client can never simply name a room and receive
 * another school's positions.
 */
export function useTripRoom(tripId: string | null | undefined) {
  useEffect(() => {
    const s = getSocket();
    if (!s || !tripId) return;

    const join = () => s.emit("trip:watch", { tripId }, () => {});
    join();
    // Re-join after a reconnect, otherwise the room is silently lost.
    s.on("connect", join);

    return () => {
      s.off("connect", join);
      s.emit("trip:unwatch", { tripId });
    };
  }, [tripId]);
}
