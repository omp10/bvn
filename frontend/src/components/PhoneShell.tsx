import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { useAuth, ROLE_LABEL } from "../lib/auth";
import { LogoMark } from "./Logo";
import { cx } from "./ui";
import type { NavItem } from "./DeskShell";

/**
 * Phone-first layout for the people who use this on the move: drivers and
 * attendants on a bus, parents at a stop. Big targets, thumb-reachable tabs,
 * and nothing that needs a mouse.
 */
export default function PhoneShell({ nav, children }: { nav: NavItem[]; children: ReactNode }) {
  const { user, school } = useAuth();
  if (!user) return null;

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <header className="bg-shield sticky top-0 z-20 text-white">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3">
          <LogoMark className="h-9 w-9" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-bold leading-tight">{school?.appName ?? "BalVahini"}</div>
            <div className="truncate text-xs text-white/70">
              {user.name} · {ROLE_LABEL[user.role]}
            </div>
          </div>
          {/* No sign-out here on purpose: this is exactly where a thumb lands
              on a moving bus, and a driver logging out mid-trip takes the bus
              off the school's live map. It lives under Profile. */}
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 p-4 pb-24">{children}</main>

      {nav.length > 1 && (
        <nav className="safe-bottom fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 backdrop-blur">
          <div className="mx-auto flex max-w-2xl">
            {nav.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  cx(
                    "flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-semibold transition",
                    isActive ? "text-brand-600" : "text-slate-400"
                  )
                }
              >
                <Icon className="h-6 w-6" />
                {label}
              </NavLink>
            ))}
          </div>
        </nav>
      )}
    </div>
  );
}
