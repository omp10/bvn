import { useState } from "react";
import { Link } from "react-router-dom";
import { api, useAction } from "../lib/api";
import { Alert, Button, Field, Select, cx } from "../components/ui";
import { IconBus, IconCheck, IconSchool, IconUsers } from "../components/icons";
import { AuthLayout } from "./Login";

type Kind = "school" | "owner" | "driver";

const KINDS: { key: Kind; label: string; blurb: string; icon: (p: { className?: string }) => JSX.Element }[] = [
  { key: "school", label: "School", blurb: "Track your buses and keep parents informed", icon: IconSchool },
  { key: "owner", label: "Fleet owner", blurb: "Offer your buses to schools", icon: IconBus },
  { key: "driver", label: "Driver", blurb: "Drive for a school on the platform", icon: IconUsers },
];

export default function Register() {
  const [kind, setKind] = useState<Kind>("school");
  const [form, setForm] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);
  const { busy, error, run } = useAction();

  const set = (k: string) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });
  const digits = (k: string, max: number) => (e: { target: { value: string } }) =>
    setForm({ ...form, [k]: e.target.value.replace(/\D/g, "").slice(0, max) });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const shared = {
        name: form.name,
        phone: form.phone,
        email: form.email || undefined,
        city: form.city || undefined,
        password: form.password,
        note: form.note || undefined,
      };

      const body =
        kind === "school"
          ? { ...shared, schoolName: form.schoolName, contactPerson: form.contactPerson || undefined,
              address: form.address || undefined, state: form.state || undefined,
              studentCount: form.studentCount || undefined, busCount: form.busCount || undefined }
          : kind === "owner"
            ? { ...shared, companyName: form.companyName || undefined,
                gstNumber: form.gstNumber || undefined, vehicleCount: form.vehicleCount || undefined }
            : { ...shared, licenseNumber: form.licenseNumber, licenseExpiry: form.licenseExpiry,
                experienceYears: form.experienceYears || undefined,
                schoolCode: form.schoolCode || undefined };

      await api(`/register/${kind}`, { body });
      setDone(true);
    });
  };

  if (done) {
    return (
      <AuthLayout>
        <div className="text-center">
          <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full bg-leaf-50 text-leaf-600">
            <IconCheck className="h-8 w-8" />
          </div>
          <h2 className="text-2xl font-bold">Application received</h2>
          <p className="mt-2 text-sm text-slate-500">
            Our team reviews every application before an account goes live. You'll be able to sign in
            with <strong className="text-slate-700">{form.phone}</strong> and the password you chose
            as soon as it's approved.
          </p>
          <Link to="/login" className="mt-6 inline-block text-sm font-semibold text-brand-600 hover:underline">
            Back to sign in
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      footer={
        <p className="mt-8 text-center text-sm text-slate-500">
          Already have an account?{" "}
          <Link to="/login" className="font-semibold text-brand-600 hover:underline">Sign in</Link>
        </p>
      }
    >
      <h2 className="text-2xl font-bold">Join BalVahini</h2>
      <p className="mb-5 text-sm text-slate-500">Tell us who you are and we'll get you set up.</p>

      {/* Which kind of account — chosen first, because it decides the form. */}
      <div className="mb-5 grid gap-2">
        {KINDS.map(({ key, label, blurb, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setKind(key)}
            className={cx(
              "flex items-center gap-3 rounded-lg border p-3 text-left transition",
              kind === key ? "border-brand-600 bg-brand-50/60 ring-1 ring-brand-200" : "border-slate-200 hover:bg-slate-50"
            )}
          >
            <span className={cx("grid h-9 w-9 shrink-0 place-items-center rounded-lg",
              kind === key ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-500")}>
              <Icon className="h-5 w-5" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-slate-800">{label}</span>
              <span className="block text-xs text-slate-500">{blurb}</span>
            </span>
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="space-y-4">
        <Alert>{error}</Alert>

        {kind === "school" && (
          <>
            <Field label="School name" value={form.schoolName ?? ""} onChange={set("schoolName")} required />
            <Field label="Contact person" value={form.contactPerson ?? ""} onChange={set("contactPerson")} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Students (approx.)" type="number" min={0} value={form.studentCount ?? ""} onChange={set("studentCount")} />
              <Field label="Buses (approx.)" type="number" min={0} value={form.busCount ?? ""} onChange={set("busCount")} />
            </div>
          </>
        )}

        {kind === "owner" && (
          <>
            <Field label="Company name (optional)" value={form.companyName ?? ""} onChange={set("companyName")} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="GST number (optional)" value={form.gstNumber ?? ""} onChange={set("gstNumber")} />
              <Field label="Vehicles you run" type="number" min={0} value={form.vehicleCount ?? ""} onChange={set("vehicleCount")} />
            </div>
          </>
        )}

        {kind === "driver" && (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Licence number" value={form.licenseNumber ?? ""} onChange={set("licenseNumber")} required />
              <Field label="Licence expiry" type="date" value={form.licenseExpiry ?? ""} onChange={set("licenseExpiry")} required />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Years of experience" type="number" min={0} value={form.experienceYears ?? ""} onChange={set("experienceYears")} />
              <Field
                label="School code (optional)"
                hint="If you already drive for a school"
                value={form.schoolCode ?? ""}
                onChange={(e) => setForm({ ...form, schoolCode: e.target.value.toUpperCase().slice(0, 6) })}
              />
            </div>
          </>
        )}

        <Field label={kind === "school" ? "Your name" : "Full name"} value={form.name ?? ""} onChange={set("name")} required />

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Mobile number" inputMode="numeric" hint="You'll sign in with this"
            value={form.phone ?? ""} onChange={digits("phone", 10)} required />
          <Field label="City" value={form.city ?? ""} onChange={set("city")} />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Email (optional)" type="email" value={form.email ?? ""} onChange={set("email")} />
          <Field label="Choose a password" type="password" hint="At least 6 characters"
            value={form.password ?? ""} onChange={set("password")} required />
        </div>

        <Button type="submit" size="lg" block loading={busy}>Send application</Button>

        <p className="text-center text-xs text-slate-500">
          Applications are reviewed by our team before an account is created.
        </p>
      </form>
    </AuthLayout>
  );
}

/** Lets an applicant check progress without an account. */
export function RegistrationStatus() {
  const [phone, setPhone] = useState("");
  const [result, setResult] = useState<any>(null);
  const { busy, error, run } = useAction();

  return (
    <AuthLayout
      footer={
        <p className="mt-8 text-center text-sm text-slate-500">
          <Link to="/login" className="font-semibold text-brand-600 hover:underline">Back to sign in</Link>
        </p>
      }
    >
      <h2 className="text-2xl font-bold">Application status</h2>
      <p className="mb-6 text-sm text-slate-500">Enter the mobile number you applied with.</p>

      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => setResult(await api("/register/status", { body: { phone } })));
        }}
      >
        <Alert>{error}</Alert>
        <Field label="Mobile number" inputMode="numeric" value={phone}
          onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))} required autoFocus />
        <Button type="submit" size="lg" block loading={busy}>Check status</Button>
      </form>

      {result && (
        <div className="mt-6 rounded-lg border border-slate-200 p-4 text-sm">
          <div className="flex items-center justify-between">
            <span className="capitalize text-slate-500">{result.type} application</span>
            <span className={cx("rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize",
              result.status === "approved" ? "bg-leaf-50 text-leaf-700"
              : result.status === "rejected" ? "bg-red-50 text-red-700"
              : "bg-sun-100 text-amber-800")}>
              {result.status}
            </span>
          </div>
          {result.reviewNote && <p className="mt-2 text-slate-600">{result.reviewNote}</p>}
          {result.status === "approved" && (
            <p className="mt-2 text-slate-600">You can sign in now with your mobile number and password.</p>
          )}
        </div>
      )}
    </AuthLayout>
  );
}
