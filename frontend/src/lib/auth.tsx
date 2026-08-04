import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, tokens } from "./api";

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

/** Each role gets its own URL space, and this is the source of truth for it. */
export const HOME: Record<Role, string> = {
  super_admin: "/admin",
  school_admin: "/school",
  owner: "/fleet",
  driver: "/driver",
  staff: "/attendant",
  parent: "/parent",
};

export const ROLE_LABEL: Record<Role, string> = {
  super_admin: "Platform Admin",
  school_admin: "School Admin",
  owner: "Fleet Owner",
  driver: "Driver",
  staff: "Bus Attendant",
  parent: "Parent",
};

export type Session = { accessToken: string; refreshToken: string; user: User; school: School | null };

type AuthValue = {
  user: User | null;
  school: School | null;
  ready: boolean;
  signIn: (session: Session) => void;
  signOut: () => void;
};

const AuthContext = createContext<AuthValue>(null!);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [school, setSchool] = useState<School | null>(null);
  const [ready, setReady] = useState(false);

  const apply = useCallback((nextUser: User | null, nextSchool: School | null) => {
    setUser(nextUser);
    setSchool(nextSchool);
    // One CSS variable carries the school's own colour across every screen.
    document.documentElement.style.setProperty("--brand", nextSchool?.themeColor ?? "");
    document.title = nextSchool?.appName
      ? `${nextSchool.appName} — BalVahini`
      : "BalVahini — Safe Journeys, Brighter Futures";
  }, []);

  useEffect(() => {
    if (!tokens.access()) return setReady(true);
    api<{ user: User; school: School | null }>("/auth/me")
      .then((me) => apply(me.user, me.school))
      .catch(() => tokens.clear())
      .finally(() => setReady(true));
  }, [apply]);

  return (
    <AuthContext.Provider
      value={{
        user,
        school,
        ready,
        signIn: (session) => {
          tokens.save(session.accessToken, session.refreshToken);
          apply(session.user, session.school);
        },
        signOut: () => {
          // Best effort: clear locally even if the server call fails.
          void api("/auth/logout", { method: "POST" }).catch(() => {});
          tokens.clear();
          apply(null, null);
          location.href = "/login";
        },
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
