import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, useAction } from "../lib/api";
import { Alert, Button, Field } from "../components/ui";
import { normaliseOtp, normalisePhone } from "../lib/input";
import { AuthLayout } from "./Login";

/** Staff password reset. Parents sign in with an OTP anyway, so they never need this. */
export default function ForgotPassword() {
  const navigate = useNavigate();
  const { busy, error, setError, run } = useAction();

  const [step, setStep] = useState<"phone" | "reset">("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [done, setDone] = useState(false);

  const request = (e: React.FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const res = await api<{ devOtp?: string }>("/auth/forgot-password", { body: { phone } });
      // Development convenience; in production this arrives by SMS.
      if (res.devOtp) setOtp(res.devOtp);
      setStep("reset");
    });
  };

  const reset = (e: React.FormEvent) => {
    e.preventDefault();
    void run(async () => {
      await api("/auth/reset-password", { body: { phone, otp, newPassword } });
      setDone(true);
      setTimeout(() => navigate("/login", { replace: true }), 1800);
    });
  };

  if (done) {
    return (
      <AuthLayout>
        <div className="text-center">
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-leaf-50 text-3xl">✓</div>
          <h2 className="text-2xl font-bold">Password changed</h2>
          <p className="mt-2 text-sm text-slate-500">
            Every other device has been signed out. Taking you to sign in…
          </p>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      footer={
        <p className="mt-8 text-center text-sm text-slate-500">
          Remembered it?{" "}
          <Link to="/login" className="font-semibold text-brand-600 hover:underline">Back to sign in</Link>
        </p>
      }
    >
      {step === "phone" ? (
        <>
          <h2 className="text-2xl font-bold">Reset your password</h2>
          <p className="mb-6 text-sm text-slate-500">
            We'll send a code to the mobile number registered with your school.
          </p>
          <form onSubmit={request} className="space-y-4">
            <Alert>{error}</Alert>
            <Field
              label="Mobile number"
              inputMode="numeric"
              value={phone}
              onChange={(e) => setPhone(normalisePhone(e.target.value))}
              required
              autoFocus
            />
            <Button type="submit" size="lg" block loading={busy}>Send reset code</Button>
          </form>
        </>
      ) : (
        <>
          <h2 className="text-2xl font-bold">Choose a new password</h2>
          <p className="mb-6 text-sm text-slate-500">
            If <strong className="text-slate-700">{phone}</strong> is registered, a code has been sent to it.
          </p>
          <form onSubmit={reset} className="space-y-4">
            <Alert>{error}</Alert>
            <Field
              label="6-digit code"
              inputMode="numeric"
              value={otp}
              onChange={(e) => setOtp(normaliseOtp(e.target.value))}
              className="[&_input]:text-center [&_input]:tracking-[0.4em] [&_input]:font-bold"
              required
              autoFocus
            />
            <Field
              label="New password"
              type="password"
              hint="At least 6 characters"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
            />
            <Button type="submit" size="lg" block loading={busy}>Change password</Button>
            <button
              type="button"
              onClick={() => { setStep("phone"); setOtp(""); setError(null); }}
              className="w-full text-sm font-medium text-slate-500 hover:text-slate-700"
            >
              Use a different number
            </button>
          </form>
        </>
      )}
    </AuthLayout>
  );
}
