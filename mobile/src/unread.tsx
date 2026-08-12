import { createContext, useContext, useMemo, type ReactNode } from "react";
import { usePolling } from "./api";
import { useSocket } from "./socket";

/**
 * How many alerts are unread, for the header bell.
 *
 * One poll for the whole app. The bell renders in every tab's header, and a
 * `usePolling` inside it would mean one request per mounted tab — four, for a
 * driver, all asking the same question.
 *
 * Its own module rather than living in `navigation.tsx`: the Alerts screen
 * needs to clear the count after "mark all read", and importing it from the
 * navigator that imports Alerts is a cycle. Cycles mostly work under Metro and
 * fail in the one ordering nobody tested.
 */
const UnreadContext = createContext<{ unread: number; refresh: () => void }>({
  unread: 0,
  refresh: () => {},
});

export function UnreadProvider({ children }: { children: ReactNode }) {
  const { data, reload } = usePolling<{ unread: number }>("/notifications?limit=1", 60_000);
  useSocket({ notification: () => reload() }, []);

  const value = useMemo(() => ({ unread: data?.unread ?? 0, refresh: reload }), [data?.unread, reload]);
  return <UnreadContext.Provider value={value}>{children}</UnreadContext.Provider>;
}

export const useUnread = () => useContext(UnreadContext);
