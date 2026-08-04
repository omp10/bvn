/**
 * Custom roles (FRD 27) and the Razorpay handshake.
 *
 *   npm run e2e:roles      (API must be running and freshly seeded)
 */
const API = "http://127.0.0.1:4000/api";
let failures = 0;

const check = (label: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "  ok  " : "  FAIL"}  ${label}${detail ? "  — " + detail : ""}`);
  if (!ok) failures++;
};

const call = async (path: string, opts: { token?: string; method?: string; body?: unknown } = {}) => {
  const res = await fetch(API + path, {
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

const admin = await login("9111100001", "school123");

console.log("\nA. the catalogue and the seeded roles");
const catalogue = await call("/school/roles/permissions", { token: admin.accessToken });
check("permission catalogue is served", catalogue.body.modules?.length > 10,
  `${catalogue.body.all.length} permissions across ${catalogue.body.modules.length} modules`);

const roles = await call("/school/roles", { token: admin.accessToken });
check("seeded roles are listed", roles.body.length === 2, roles.body.map((r: any) => r.name).join(", "));

const system = roles.body.find((r: any) => r.system);
const blockedEdit = await call(`/school/roles/${system._id}`, {
  token: admin.accessToken, method: "PATCH", body: { name: "Hacked" },
});
check("the built-in role cannot be edited", blockedEdit.status === 400, blockedEdit.body.error);

console.log("\nB. creating a role");
const created = await call("/school/roles", {
  token: admin.accessToken,
  body: { name: "Front Desk", description: "Answers parent calls.", permissions: ["students:view", "live:view"] },
});
check("role created", created.status === 201, created.body.name);

const dup = await call("/school/roles", { token: admin.accessToken, body: { name: "Front Desk", permissions: [] } });
check("duplicate role name refused", dup.status === 409);

const bogus = await call("/school/roles", {
  token: admin.accessToken, body: { name: "Nonsense", permissions: ["students:destroy"] },
});
check("an unknown permission is refused", bogus.status === 400, bogus.body.error);

const implied = await call("/school/roles", {
  token: admin.accessToken, body: { name: "Bus Clerk", permissions: ["buses:manage"] },
});
check('"manage" implies "view"', implied.body.permissions.includes("buses:view"),
  implied.body.permissions.join(" "));

console.log("\nC. a restricted account is genuinely restricted");
const coordinator = roles.body.find((r: any) => r.name === "Transport Coordinator");
const account = await call("/school/roles/staff/accounts", {
  token: admin.accessToken,
  body: { name: "Priya Kulkarni", phone: "9871230001", password: "coord123", roleId: coordinator._id },
});
check("staff account created on a custom role", account.status === 201, account.body.name);

const coord = await login("9871230001", "coord123");
check("the restricted account signs in", !!coord.accessToken);

// Granted by the Transport Coordinator role.
const buses = await call("/school/buses", { token: coord.accessToken });
check("granted read is allowed (buses)", buses.status === 200, `${buses.body.length} buses`);

const addBus = await call("/school/buses", {
  token: coord.accessToken,
  body: { busNumber: "Bus 9", vehicleNumber: "MH12 ZZ 9009", capacity: 30 },
});
check("granted write is allowed (buses)", addBus.status === 201);

// NOT granted: salaries and billing are deliberately excluded from that role.
const salaries = await call("/school/salaries", { token: coord.accessToken });
check("ungranted module is refused (salaries)", salaries.status === 403, salaries.body.error);

const rolesPeek = await call("/school/roles", { token: coord.accessToken });
check("cannot manage roles without the permission", rolesPeek.status === 403);

const activity = await call("/school/activity", { token: coord.accessToken });
check("cannot read the activity log without the permission", activity.status === 403);

// The unrestricted admin still passes everything.
const adminSalaries = await call("/school/salaries", { token: admin.accessToken });
check("the school owner is still unrestricted", adminSalaries.status === 200);

console.log("\nD. changing a role takes effect");
await call(`/school/roles/${coordinator._id}`, {
  token: admin.accessToken,
  method: "PATCH",
  body: { permissions: ["dashboard:view", "live:view"] }, // buses removed
});
const revoke = await call(`/school/roles/${coordinator._id}/revoke-sessions`, { token: admin.accessToken, body: {} });
check("sessions revoked for immediate effect", revoke.body.signedOut >= 1, `${revoke.body.signedOut} signed out`);

const coordAgain = await login("9871230001", "coord123");
const busesNow = await call("/school/buses", { token: coordAgain.accessToken });
check("the removed permission is now refused", busesNow.status === 403, busesNow.body.error);

console.log("\nE. safety rails");
const inUse = await call(`/school/roles/${coordinator._id}`, { token: admin.accessToken, method: "DELETE" });
check("a role in use cannot be deleted", inUse.status === 400, inUse.body.error);

const unused = await call(`/school/roles/${implied.body._id}`, { token: admin.accessToken, method: "DELETE" });
check("an unused role can be deleted", unused.status === 200);

const me = (await call("/auth/me", { token: admin.accessToken })).body;
const selfDemote = await call(`/school/roles/staff/accounts/${me.user.id}`, {
  token: admin.accessToken, method: "PATCH", body: { roleId: coordinator._id },
});
check("you cannot change your own role", selfDemote.status === 400, selfDemote.body.error);

// Cross-tenant: the other school must not see or touch these roles.
const other = await login("9222200001", "school123");
const theirRoles = await call("/school/roles", { token: other.accessToken });
check("roles are per-school", !theirRoles.body.some((r: any) => r.name === "Front Desk"),
  theirRoles.body.map((r: any) => r.name).join(", "));

const crossEdit = await call(`/school/roles/${created.body._id}`, {
  token: other.accessToken, method: "PATCH", body: { name: "Stolen" },
});
check("another school cannot edit this role", crossEdit.status === 404);

console.log("\nF. razorpay");
const billing = await call("/school/billing", { token: admin.accessToken });
check("billing reports whether payments are configured", typeof billing.body.paymentsEnabled === "boolean",
  billing.body.paymentsEnabled ? "configured" : "not configured (no keys set)");

const invoice = billing.body.invoices?.find((i: any) => i.status === "pending");
if (invoice) {
  const order = await call(`/school/billing/invoices/${invoice._id}/pay`, { token: admin.accessToken, body: {} });
  check(
    billing.body.paymentsEnabled ? "order created" : "pay fails cleanly without keys",
    billing.body.paymentsEnabled ? order.status === 200 : order.status === 400,
    order.body.error ?? order.body.orderId
  );

  const forged = await call(`/school/billing/invoices/${invoice._id}/confirm`, {
    token: admin.accessToken,
    body: { razorpay_order_id: "order_fake", razorpay_payment_id: "pay_fake", razorpay_signature: "deadbeef" },
  });
  // Either way this must not settle the invoice.
  check("a forged payment is rejected", forged.status >= 400, forged.body.error);

  const still = await call("/school/billing", { token: admin.accessToken });
  const same = still.body.invoices.find((i: any) => i._id === invoice._id);
  check("the invoice is still unpaid after the forgery", same.status === "pending");
} else {
  console.log("  --    no pending invoice to test against (school is on a yearly plan)");
}

console.log(failures ? `\n${failures} CHECK(S) FAILED\n` : "\nall checks passed\n");
process.exit(failures ? 1 : 0);
