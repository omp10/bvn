/**
 * Covers everything added after the first walkthrough: file uploads to local
 * disk, driver salaries, fleet-owner registration, password reset, the QR
 * image, PDF export, and the scheduled jobs.
 *
 *   npm run e2e:phase2      (API must be running and seeded)
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";

const API = "http://127.0.0.1:4000";
let failures = 0;

const check = (label: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "  ok  " : "  FAIL"}  ${label}${detail ? "  — " + detail : ""}`);
  if (!ok) failures++;
};

const call = async (path: string, opts: { token?: string; method?: string; body?: unknown } = {}) => {
  const res = await fetch(API + "/api" + path, {
    method: opts.method ?? (opts.body ? "POST" : "GET"),
    headers: {
      "content-type": "application/json",
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as any };
};

const login = async (phone: string, password: string) =>
  (await call("/auth/login", { body: { phone, password } })).body;

const admin = await login("9000000001", "admin123");
const school = await login("9111100001", "school123");

/* A tiny but genuinely valid PNG, so the mime sniffing has something real. */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);
const pngPath = path.join(tmpdir(), "bv-test.png");
writeFileSync(pngPath, PNG);

const uploadFile = async (endpoint: string, token: string, buffer: Buffer, name: string, type: string) => {
  const form = new FormData();
  form.append("file", new Blob([buffer], { type }), name);
  const res = await fetch(API + "/api" + endpoint, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as any };
};

console.log("\nA. uploads to local disk");
const photo = await uploadFile("/uploads/photos", school.accessToken, PNG, "kid.png", "image/png");
check("image upload accepted", photo.status === 201, photo.body.url);

// The URL must actually serve the bytes back.
const fetched = await fetch(API + photo.body.url);
check("uploaded file is served back", fetched.status === 200 && fetched.headers.get("content-type")?.includes("image"));

const badType = await uploadFile("/uploads/photos", school.accessToken, Buffer.from("#!/bin/sh\necho hi"), "x.sh", "application/x-sh");
check("a non-image is rejected for a photo", badType.status === 400, badType.body.error);

const bigFile = await uploadFile("/uploads/photos", school.accessToken, Buffer.alloc(6 * 1024 * 1024), "big.png", "image/png");
check("a file over 5 MB is rejected", bigFile.status === 400, bigFile.body.error);

const students = await call("/school/students?limit=1", { token: school.accessToken });
const studentId = students.body.items[0]._id;
const studentPhoto = await uploadFile(`/uploads/student/${studentId}/photo`, school.accessToken, PNG, "s.png", "image/png");
check("student photo attaches to the record", studentPhoto.status === 201, studentPhoto.body.url);

const buses = await call("/school/buses", { token: school.accessToken });
const busId = buses.body[0]._id;
const doc = await uploadFile(
  `/uploads/vehicle/${busId}/document?type=insurance&number=INS-9&expiresOn=2027-01-01`,
  school.accessToken, PNG, "ins.png", "image/png"
);
check("vehicle document attaches", doc.status === 201, `${doc.body.length} documents on file`);

// Cross-tenant: the other school must not be able to touch this bus.
const other = await login("9222200001", "school123");
const stolen = await uploadFile(`/uploads/vehicle/${busId}/document?type=permit`, other.accessToken, PNG, "p.png", "image/png");
check("another school cannot attach to this bus", stolen.status === 404, `status ${stolen.status}`);

console.log("\nB. driver salaries");
const drivers = await call("/school/people/drivers", { token: school.accessToken });
const driverId = drivers.body[0]._id;
const period = new Date().toISOString().slice(0, 7);

const salary = await call("/school/salaries", {
  token: school.accessToken,
  body: { staffId: driverId, period, baseAmountInPaise: 1800000, allowancesInPaise: 200000, deductionsInPaise: 50000 },
});
check("salary recorded", salary.status === 201, `net ₹${(salary.body.netAmountInPaise ?? 0) / 100}`);
check("net is computed, not trusted from the client", salary.body.netAmountInPaise === 1950000);

const again = await call("/school/salaries", {
  token: school.accessToken,
  body: { staffId: driverId, period, baseAmountInPaise: 1900000 },
});
check("re-submitting corrects instead of duplicating", again.body._id === salary.body._id);

const paid = await call(`/school/salaries/${salary.body._id}/pay`, { token: school.accessToken, body: {} });
check("salary marked paid", paid.body.status === "paid");
const payTwice = await call(`/school/salaries/${salary.body._id}/pay`, { token: school.accessToken, body: {} });
check("paying twice is refused", payTwice.status === 404);

const payroll = await call(`/school/salaries?period=${period}`, { token: school.accessToken });
check("payroll lists staff, including those not yet recorded", payroll.body.rows?.length >= 2,
  `${payroll.body.rows.length} staff, ₹${(payroll.body.totalPaidInPaise ?? 0) / 100} paid`);

console.log("\nC. fleet owner registration");
const newOwner = await call("/super-admin/owners", {
  token: admin.accessToken,
  body: { name: "Kadam Transport", companyName: "Kadam Travels Pvt Ltd", phone: "9812345678", password: "owner123", gstNumber: "27AAAAA0000A1Z5" },
});
check("super admin registers an owner", newOwner.status === 201, newOwner.body.name);
const dupOwner = await call("/super-admin/owners", {
  token: admin.accessToken,
  body: { name: "Copy", phone: "9812345678", password: "owner123" },
});
check("duplicate mobile refused", dupOwner.status === 409);

const ownerLogin = await login("9812345678", "owner123");
check("the new owner can sign in", !!ownerLogin.accessToken);

const ownerList = await call("/super-admin/owners", { token: admin.accessToken });
check("owner list shows fleet size", ownerList.body.items?.length >= 2,
  `${ownerList.body.total} owners`);

console.log("\nD. password reset");
const forgot = await call("/auth/forgot-password", { body: { phone: "9111100002" } });
check("reset code issued", forgot.status === 200, `dev otp ${forgot.body.devOtp}`);
const unknown = await call("/auth/forgot-password", { body: { phone: "9999999999" } });
check("an unknown number gets the same answer", unknown.status === 200 && !unknown.body.devOtp);

const reset = await call("/auth/reset-password", {
  body: { phone: "9111100002", otp: forgot.body.devOtp, newPassword: "newpass123" },
});
check("password reset accepted", reset.status === 200);
check("the new password works", !!(await login("9111100002", "newpass123")).accessToken);
const oldPassword = await call("/auth/login", { body: { phone: "9111100002", password: "driver123" } });
check("the old password no longer works", oldPassword.status === 401);
// Put it back so the other walkthrough keeps passing.
const back = await call("/auth/forgot-password", { body: { phone: "9111100002" } });
await call("/auth/reset-password", { body: { phone: "9111100002", otp: back.body.devOtp, newPassword: "driver123" } });

console.log("\nE. QR code and PDF export");
const schools = await call("/super-admin/schools?limit=1", { token: admin.accessToken });
const schoolId = schools.body.items[0]._id;

const qr = await fetch(`${API}/api/super-admin/schools/${schoolId}/qr.svg`, {
  headers: { Authorization: `Bearer ${admin.accessToken}` },
});
const svg = await qr.text();
check("QR renders as SVG", qr.status === 200 && svg.startsWith("<svg"), `${svg.length} bytes`);

for (const [label, url] of [
  ["students", `${API}/api/school/reports/students?format=pdf`],
  ["fleet owners", `${API}/api/super-admin/reports/fleet-owners?format=pdf`],
  ["vehicle assignments", `${API}/api/super-admin/reports/vehicle-assignments?format=pdf`],
] as const) {
  const token = label === "students" ? school.accessToken : admin.accessToken;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const head = Buffer.from(await res.arrayBuffer()).subarray(0, 5).toString();
  check(`${label} PDF`, res.status === 200 && head === "%PDF-", `${head}`);
}

const csvOwners = await fetch(`${API}/api/super-admin/reports/fleet-owners?format=csv`, {
  headers: { Authorization: `Bearer ${admin.accessToken}` },
});
check("fleet owner CSV still works", csvOwners.status === 200 && (await csvOwners.text()).includes("Owner,Company"));

console.log(failures ? `\n${failures} CHECK(S) FAILED\n` : "\nall checks passed\n");
process.exit(failures ? 1 : 0);
