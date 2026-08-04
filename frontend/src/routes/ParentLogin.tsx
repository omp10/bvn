import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { api, useAction } from "../lib/api";
import { HOME, useAuth, type Session } from "../lib/auth";
import { Alert, Button, Field } from "../components/ui";
import { AuthLayout } from "./Login";

/**
 * Parents prove which school they belong to before anything else — that school
 * code is what binds their account to exactly one school's data.
 */
export default function ParentLogin() {
  const { user, ready, signIn } = useAuth();
  const navigate = useNavigate();
  const { busy, error, setError, run } = useAction();

  const [step, setStep] = useState<"identify" | "verify">("identify");
  const [schoolCode, setSchoolCode] = useState("");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [schoolName, setSchoolName] = useState("");

  if (ready && user) return <Navigate to={HOME[user.role]} replace />;

  const requestOtp = (e: React.FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const res = await api<{ school: { name: string }; devOtp?: string }>("/auth/parent/request-otp", {
        body: { schoolCode, phone },
      });
      setSchoolName(res.school.name);
      // Development convenience — the real gateway sends this by SMS.
      if (res.devOtp) setOtp(res.devOtp);
      setStep("verify");
    });
  };

  const verify = (e: React.FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const session = await api<Session>("/auth/parent/verify", { body: { schoolCode, phone, otp } });
      signIn(session);
      navigate("/parent", { replace: true });
    });
  };

  return (
    <AuthLayout
      footer={
        <p className="mt-8 text-center text-sm text-slate-500">
          School staff?{" "}
          <Link to="/login" className="font-semibold text-brand-600 hover:underline">
            Sign in here
          </Link>
        </p>
      }
    >
      {step === "identify" ? (
        <>
          <h2 className="text-2xl font-bold">Track your child's bus</h2>
          <p className="mb-6 text-sm text-slate-500">
            Enter the school code printed on the circular from your school.
          </p>
          <form onSubmit={requestOtp} className="space-y-4">
            <Alert>{error}</Alert>
            <Field
              label="School code"
              placeholder="ABC123"
              value={schoolCode}
              onChange={(e) => setSchoolCode(e.target.value.toUpperCase().slice(0, 6))}
              className="[&_input]:tracking-[0.3em] [&_input]:font-semibold [&_input]:uppercase"
              required
              autoFocus
            />
            <Field
              label="Mobile number"
              inputMode="numeric"
              placeholder="The number registered with school"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
              required
            />
            <Button type="submit" size="lg" block loading={busy}>
              Send OTP
            </Button>
          </form>
        </>
      ) : (
        <>
          <h2 className="text-2xl font-bold">Enter the OTP</h2>
          <p className="mb-6 text-sm text-slate-500">
            Sent to <strong className="text-slate-700">{phone}</strong> for{" "}
            <strong className="text-slate-700">{schoolName}</strong>.
          </p>
          <form onSubmit={verify} className="space-y-4">
            <Alert>{error}</Alert>
            <Field
              label="6-digit OTP"
              inputMode="numeric"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
              className="[&_input]:text-center [&_input]:text-lg [&_input]:tracking-[0.5em] [&_input]:font-bold"
              required
              autoFocus
            />
            <Button type="submit" size="lg" block loading={busy}>
              Verify and continue
            </Button>
            <button
              type="button"
              onClick={() => {
                setStep("identify");
                setOtp("");
                setError(null);
              }}
              className="w-full text-sm font-medium text-slate-500 hover:text-slate-700"
            >
              Change number or school code
            </button>
          </form>
        </>
      )}
    </AuthLayout>
  );
}
