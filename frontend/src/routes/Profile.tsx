import { useState } from "react";
import { api, useAction } from "../lib/api";
import { ROLE_LABEL, useAuth } from "../lib/auth";
import { Alert, Avatar, Button, Card, Field, Modal } from "../components/ui";
import { IconLogout, IconPhone, IconSchool, IconShield } from "../components/icons";

/**
 * Account screen for the phone-first roles.
 *
 * Signing out lives here rather than in the header: on a moving bus the header
 * is exactly where a thumb lands, and a driver mid-trip logging out by accident
 * stops the school seeing the bus.
 */
export default function Profile() {
  const { user, school, signOut } = useAuth();
  const [changing, setChanging] = useState(false);
  const [confirmOut, setConfirmOut] = useState(false);

  if (!user) return null;

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-center gap-4">
          <Avatar name={user.name} className="h-16 w-16 text-lg" />
          <div className="min-w-0">
            <div className="text-lg font-bold text-slate-900">{user.name}</div>
            <div className="text-sm text-slate-500">{ROLE_LABEL[user.role]}</div>
            <div className="text-sm text-slate-500">{user.phone}</div>
          </div>
        </div>
      </Card>

      {school && (
        <Card>
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600">
              <IconSchool className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <div className="font-semibold text-slate-900">{school.name}</div>
              <div className="text-xs text-slate-500">School code {school.code}</div>
            </div>
          </div>
        </Card>
      )}

      <Card padded={false}>
        <ul className="divide-y divide-slate-100">
          <li>
            <button
              onClick={() => setChanging(true)}
              className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-slate-50"
            >
              <IconShield className="h-5 w-5 shrink-0 text-slate-400" />
              <span className="flex-1 text-sm font-medium">Change password</span>
              <span className="text-slate-300">›</span>
            </button>
          </li>
          <li>
            <a href="tel:112" className="flex items-center gap-3 px-4 py-3.5 transition hover:bg-slate-50">
              <IconPhone className="h-5 w-5 shrink-0 text-slate-400" />
              <span className="flex-1 text-sm font-medium">Emergency helpline</span>
              <span className="text-sm font-semibold text-brand-600">112</span>
            </a>
          </li>
        </ul>
      </Card>

      <Button variant="secondary" block onClick={() => setConfirmOut(true)}>
        <IconLogout className="h-4 w-4" /> Sign out
      </Button>

      <p className="pb-2 text-center text-xs text-slate-400">BalVahini · Safe Journeys, Brighter Futures</p>

      <ChangePassword open={changing} onClose={() => setChanging(false)} />

      <Modal
        open={confirmOut}
        onClose={() => setConfirmOut(false)}
        title="Sign out?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmOut(false)}>Stay signed in</Button>
            <Button variant="danger" onClick={signOut}>Sign out</Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          {user.role === "driver"
            ? "If a trip is running, the school will stop seeing your bus until you sign in and start it again."
            : "You'll need your password to sign back in."}
        </p>
      </Modal>
    </div>
  );
}

function ChangePassword({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { busy, error, run } = useAction();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [done, setDone] = useState(false);

  return (
    <Modal
      open={open}
      onClose={() => { setDone(false); onClose(); }}
      title="Change password"
      footer={
        done ? (
          <Button onClick={() => { setDone(false); onClose(); }}>Close</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button
              loading={busy}
              disabled={!current || next.length < 6}
              onClick={() =>
                void run(
                  () => api("/auth/change-password", { body: { currentPassword: current, newPassword: next } }),
                  () => { setCurrent(""); setNext(""); setDone(true); }
                )
              }
            >
              Change
            </Button>
          </>
        )
      }
    >
      {done ? (
        <p className="py-2 text-sm text-slate-600">
          Password changed. Every other device has been signed out — this one stays.
        </p>
      ) : (
        <div className="space-y-4">
          <Alert>{error}</Alert>
          <Field label="Current password" type="password" value={current}
            onChange={(e) => setCurrent(e.target.value)} autoFocus />
          <Field label="New password" type="password" hint="At least 6 characters" value={next}
            onChange={(e) => setNext(e.target.value)} />
        </div>
      )}
    </Modal>
  );
}
