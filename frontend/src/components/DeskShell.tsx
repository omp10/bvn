import { useState, type ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { useAuth, ROLE_LABEL } from "../lib/auth";
import { Logo, Tagline } from "./Logo";
import { Avatar, cx } from "./ui";
import { IconLogout, IconMenu } from "./icons";

export type NavItem = { to: string; label: string; icon: (p: { className?: string }) => ReactNode; end?: boolean };

/**
 * Desk layout for the roles that work at a computer all day — platform admin,
 * school office, fleet owner. Drivers, attendants and parents get PhoneShell.
 */
export default function DeskShell({ nav, children }: { nav: NavItem[]; children: ReactNode }) {
  const { user, school, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  if (!user) return null;

  const links = (
    <nav className="flex flex-col gap-0.5">
      {nav.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={() => setOpen(false)}
          className={({ isActive }) =>
            cx(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition",
              isActive ? "bg-white/15 text-white" : "text-white/70 hover:bg-white/10 hover:text-white"
            )
          }
        >
          <Icon className="h-5 w-5 shrink-0" />
          {label}
        </NavLink>
      ))}
    </nav>
  );

  /* On a desktop the shell owns the viewport and the two columns scroll
     independently: the sidebar was `static` inside a `min-h-screen` row, so the
     document scrolled and took the nav with it. The school office has fourteen
     nav items — taller than most laptop screens — so the sidebar needs its own
     scroll as well, not just a fixed position.

     Mobile keeps document scrolling; there the sidebar is a drawer that is
     already full-height. */
  return (
    <div className="min-h-screen lg:flex lg:h-screen lg:overflow-hidden">
      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex items-center gap-3 bg-shield px-4 py-3 text-white lg:hidden">
        <button onClick={() => setOpen((v) => !v)} aria-label="Menu" className="rounded p-1 hover:bg-white/10">
          <IconMenu />
        </button>
        <Logo size="sm" onDark />
      </header>

      {open && <div className="fixed inset-0 z-30 bg-slate-900/40 lg:hidden" onClick={() => setOpen(false)} />}

      <aside
        className={cx(
          "bg-shield fixed inset-y-0 left-0 z-40 flex w-64 flex-col p-4 transition-transform lg:static lg:h-screen lg:shrink-0 lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="mb-1 px-1">
          <Logo onDark />
        </div>
        <Tagline className="mb-6 px-1 text-white/50" />

        {/* min-h-0 is what actually lets a flex child scroll — without it the
            nav grows to its content and pushes the account block off-screen. */}
        {/* pr-1 keeps the link labels off the bar rather than under it. */}
        <div className="slim-scrollbar-light min-h-0 flex-1 overflow-y-auto pr-1">{links}</div>

        <div className="mt-4 border-t border-white/15 pt-3">
          <div className="mb-2 flex items-center gap-2.5 px-1">
            <Avatar name={user.name} className="h-9 w-9 bg-white/20 text-white" />
            <div className="min-w-0 text-sm">
              <div className="truncate font-semibold text-white">{user.name}</div>
              <div className="truncate text-xs text-white/60">
                {school?.code ? `${ROLE_LABEL[user.role]} · ${school.code}` : ROLE_LABEL[user.role]}
              </div>
            </div>
          </div>
          <button
            onClick={signOut}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-white/70 transition hover:bg-white/10 hover:text-white"
          >
            <IconLogout className="h-5 w-5" /> Sign out
          </button>
        </div>
      </aside>

      <main className="slim-scrollbar min-w-0 flex-1 p-4 lg:h-screen lg:overflow-y-auto lg:p-8">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
