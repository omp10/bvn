import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, setSessionLostHandler, tokens } from "./api";
import { closeSocket } from "./socket";
import { registerPushToken } from "./push";
import { VARIANT } from "./theme";

export type Role = "super_admin" | "school_admin" | "owner" | "driver" | "staff" | "parent";

export type User = { id: string; name: string; phone: string; role: Role; schoolId: string | null };
export type School = {
  id: string;
  name: string;
  code: string;
  status: string;
  themeColor: string;
  logoUrl: string | null;
  appName: string;
};
export type Session = { accessToken: string; refreshToken: string; user: User; school: School | null };

export const ROLE_LABEL: Record<Role, string> = {
  super_admin: "Platform Admin",
  school_admin: "School Admin",
  owner: "Fleet Owner",
  driver: "Driver",
  staff: "Bus Attendant",
  parent: "Parent",
};

/**
 * Which roles each APK is for.
 *
 * The staff app takes everyone who signs in with a password — the same audience
 * as the web `/login`. Drivers and attendants are what it is *for*, but a school
 * admin or a fleet owner checking on a bus from their phone should not be told
 * to go and find a laptop.
 *
 * Checked on the client after sign-in as a courtesy, not as a control: the
 * server already refuses a parent at the password endpoint. The point is a clear
 * message instead of an empty screen when someone installs the wrong app.
 */
export const ROLES_FOR_VARIANT: Record<typeof VARIANT, Role[]> = {
  parent: ["parent"],
  staff: ["driver", "staff", "school_admin", "owner", "super_admin"],
};

type AuthValue = {
  user: User | null;
  school: School | null;
  ready: boolean;
  signIn: (session: Session) => Promise<void>;
  signOut: () => void;
  wrongApp: boolean;
};

const AuthContext = createContext<AuthValue>(null!);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [school, setSchool] = useState<School | null>(null);
  const [ready, setReady] = useState(false);

  const clear = useCallback(() => {
    setUser(null);
    setSchool(null);
    closeSocket();
  }, []);

  const signOut = useCallback(() => {
    // Best effort — the local session goes regardless of what the server says.
    void api("/auth/logout", { method: "POST" }).catch(() => {});
    void tokens.clear();
    clear();
  }, [clear]);

  useEffect(() => {
    // A 401 that survived a refresh means the session is genuinely gone.
    setSessionLostHandler(clear);
  }, [clear]);

  useEffect(() => {
    (async () => {
      const stored = await tokens.load();
      if (!stored.access) return setReady(true);
      try {
        const me = await api<{ user: User; school: School | null }>("/auth/me");
        setUser(me.user);
        setSchool(me.school);
        // The token can change between installs and OS updates; re-register on
        // every launch rather than only at sign-in.
        void registerPushToken();
      } catch {
        await tokens.clear();
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const signIn = useCallback(async (session: Session) => {
    await tokens.save(session.accessToken, session.refreshToken);
    setUser(session.user);
    setSchool(session.school);
    void registerPushToken();
  }, []);

  const wrongApp = Boolean(user && !ROLES_FOR_VARIANT[VARIANT].includes(user.role));

  return (
    <AuthContext.Provider value={{ user, school, ready, signIn, signOut, wrongApp }}>
      {children}
    </AuthContext.Provider>
  );
}
