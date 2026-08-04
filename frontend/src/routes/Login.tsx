import { useState, type ReactNode } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { api, useAction } from "../lib/api";
import { HOME, useAuth, type Session } from "../lib/auth";
import { Logo, LogoFull, Tagline } from "../components/Logo";
import { Alert, Button, Field } from "../components/ui";
import { IconBell, IconPin, IconShield } from "../components/icons";

/** Split screen: brand story on the left, the form on the right. */
export function AuthLayout({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <aside className="bg-shield relative hidden overflow-hidden p-12 text-white lg:flex lg:w-1/2 lg:flex-col lg:justify-between">
        <div className="pointer-events-none absolute -right-20 -top-20 h-80 w-80 rounded-full bg-white/10" />
        <div className="pointer-events-none absolute -bottom-24 -left-16 h-72 w-72 rounded-full bg-sun-400/20" />

        <Logo size="lg" onDark />

        <div className="relative max-w-md">
          <h1 className="text-4xl font-extrabold leading-tight">
            Every child accounted for, every journey.
          </h1>
          <p className="mt-3 text-white/80">
            India's trusted school transportation and child safety platform.
          </p>
          <ul className="mt-8 space-y-4">
            {[
              [IconShield, "Child safety first", "Boarding and drop confirmed by the bus attendant."],
              [IconPin, "Live GPS tracking", "Parents follow the bus in real time, stop by stop."],
              [IconBell, "Caring always", "Instant alerts the moment anything changes."],
            ].map(([Icon, title, line]) => {
              const I = Icon as (p: { className?: string }) => ReactNode;
              return (
                <li key={title as string} className="flex gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/15">
                    <I className="h-5 w-5" />
                  </span>
                  <div>
                    <div className="font-semibold">{title as string}</div>
                    <div className="text-sm text-white/70">{line as string}</div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        <Tagline className="relative text-white/50" />
      </aside>

      <main className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-6 flex justify-center lg:hidden">
            <LogoFull className="w-56" />
          </div>
          {children}
          {footer}
        </div>
      </main>
    </div>
  );
}

export default function Login() {
  const { user, ready, signIn } = useAuth();
  const navigate = useNavigate();
  const { busy, error, run } = useAction();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");

  if (ready && user) return <Navigate to={HOME[user.role]} replace />;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const session = await api<Session>("/auth/login", { body: { phone, password } });
      signIn(session);
      navigate(HOME[session.user.role], { replace: true });
    });
  };

  return (
    <AuthLayout
      footer={
        <p className="mt-8 text-center text-sm text-slate-500">
          Are you a parent?{" "}
          <Link to="/parent/login" className="font-semibold text-brand-600 hover:underline">
            Sign in with your school code
          </Link>
        </p>
      }
    >
      <h2 className="text-2xl font-bold">Welcome back</h2>
      <p className="mb-6 text-sm text-slate-500">
        For school staff, drivers, attendants and fleet owners.
      </p>

      <form onSubmit={submit} className="space-y-4">
        <Alert>{error}</Alert>
        <Field
          label="Mobile number"
          inputMode="numeric"
          autoComplete="username"
          placeholder="10-digit number"
          value={phone}
          onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
          required
          autoFocus
        />
        <Field
          label="Password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <Button type="submit" size="lg" block loading={busy}>
          Sign in
        </Button>
        <p className="text-center">
          <Link to="/forgot-password" className="text-sm font-medium text-slate-500 hover:text-brand-600">
            Forgot your password?
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}
