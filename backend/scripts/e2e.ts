/**
 * Live walkthrough of a morning trip against a running server.
 * Throwaway verification script — run with the API up:  npx tsx e2e.ts
 */
const API = "http://127.0.0.1:4000/api";
let failures = 0;

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

const check = (label: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "  ok  " : "  FAIL"}  ${label}${detail ? "  — " + detail : ""}`);
  if (!ok) failures++;
};

const login = async (phone: string, password: string) =>
  (await call("/auth/login", { body: { phone, password } })).body;

console.log("\nA. sign in");
const admin = await login("9111100001", "school123");
check("school admin signs in", !!admin.accessToken, admin.school?.name);
const driver = await login("9111100002", "driver123");
check("driver signs in", !!driver.accessToken);
const staff = await login("9111100003", "staff123");
check("attendant signs in", !!staff.accessToken);
const superAdmin = await login("9000000001", "admin123");
check("super admin signs in", !!superAdmin.accessToken);

const badLogin = await call("/auth/login", { body: { phone: "9111100001", password: "wrong" } });
check("wrong password is rejected", badLogin.status === 401);

const schoolCode = admin.school.code;
const otp = await call("/auth/parent/request-otp", { body: { schoolCode, phone: "9111100004" } });
check("parent requests OTP", otp.status === 200, `dev otp ${otp.body.devOtp}`);
const parent = (await call("/auth/parent/verify", {
  body: { schoolCode, phone: "9111100004", otp: otp.body.devOtp },
})).body;
check("parent verifies OTP", !!parent.accessToken, parent.user?.name);

console.log("\nB. tenant isolation");
const otherAdmin = await login("9222200001", "school123");
const mine = await call("/school/buses", { token: admin.accessToken });
const theirs = await call("/school/buses", { token: otherAdmin.accessToken });
check("each school sees exactly its own bus", mine.body.length === 1 && theirs.body.length === 1);
check(
  "the two schools see different buses",
  mine.body[0]._id !== theirs.body[0]._id,
  `${mine.body[0].busNumber} vs ${theirs.body[0].busNumber}`
);

// The break-in: a valid token from school B asking for school A's bus by id.
const stolen = await call(`/school/buses/${mine.body[0]._id}`, {
  token: otherAdmin.accessToken,
  method: "PATCH",
  body: { busNumber: "STOLEN" },
});
check("cross-tenant write is refused", stolen.status === 404, `status ${stolen.status}`);
const stillMine = await call("/school/buses", { token: admin.accessToken });
check("the target bus is unchanged", stillMine.body[0].busNumber === mine.body[0].busNumber);

const wrongRole = await call("/school/buses", { token: driver.accessToken });
check("a driver cannot reach admin routes", wrongRole.status === 403);

console.log("\nC. the morning trip");
const myBus = await call("/driver/my-bus", { token: driver.accessToken });
check("driver sees the assigned bus", myBus.status === 200, `${myBus.body.vehicle?.busNumber}, ${myBus.body.studentCount} students`);

const start = await call("/driver/trips/start", { token: driver.accessToken, body: { type: "morning" } });
check("trip starts", start.status === 201, `trip ${start.body._id}`);
const retry = await call("/driver/trips/start", { token: driver.accessToken, body: { type: "morning" } });
check(
  "double tap returns the SAME trip, not a second one",
  retry.status === 200 && retry.body._id === start.body._id
);
const tripId = start.body._id;

// Approach the first stop, then arrive at it.
const now = Date.now();
const away = await call(`/driver/trips/${tripId}/positions`, {
  token: driver.accessToken,
  body: { points: [{ lat: 18.5025, lng: 73.8077, at: new Date(now).toISOString(), speedKmph: 24 }] },
});
check("position batch accepted", away.status === 200, `${away.body.accepted} point(s)`);

const arrive = await call(`/driver/trips/${tripId}/positions`, {
  token: driver.accessToken,
  body: {
    points: [
      // Deliberately out of order, as an offline buffer flush would arrive.
      { lat: 18.5074, lng: 73.8077, at: new Date(now + 60_000).toISOString() },
      { lat: 18.5050, lng: 73.8077, at: new Date(now + 30_000).toISOString() },
    ],
  },
});
check("out-of-order buffer flush accepted", arrive.status === 200, `${arrive.body.accepted} points`);

const live = await call("/school/trips/live", { token: admin.accessToken });
check("office sees the bus live", live.body[0]?.lastPosition?.lat === 18.5074, `stale=${live.body[0]?.gpsStale}`);

console.log("\nD. attendance");
const roster = await call("/staff/attendance/roster", { token: staff.accessToken });
check("attendant sees the roster", roster.body.students?.length === 2);
const child = roster.body.students[0];

const board = await call("/staff/attendance", {
  token: staff.accessToken,
  body: { tripId, studentId: child._id, event: "boarded" },
});
check("child marked boarded", board.status === 201, child.name);
const boardAgain = await call("/staff/attendance", {
  token: staff.accessToken,
  body: { tripId, studentId: child._id, event: "boarded" },
});
check("double tap does NOT double-count", boardAgain.status === 200 && boardAgain.body._id === board.body._id);

const otherChild = await call("/staff/attendance", {
  token: staff.accessToken,
  body: { tripId, studentId: theirs.body[0]._id, event: "boarded" },
});
check("cannot mark a student from another school", otherChild.status >= 400);

console.log("\nE. the parent's view");
const kids = await call("/parent/children", { token: parent.accessToken });
check("parent sees only their children", kids.body.length === 2);
const liveChild = await call(`/parent/children/${child._id}/live`, { token: parent.accessToken });
check("parent sees the running trip", liveChild.body.status === "running");
check("parent gets a server-computed ETA", typeof liveChild.body.etaMinutes === "number", `${liveChild.body.etaMinutes} min`);
check("parent sees the boarding mark", liveChild.body.childStatus === "boarded");

const spy = await call(`/parent/children/${theirs.body[0]._id}/live`, { token: parent.accessToken });
check("parent cannot query another school's id", spy.status === 404);

const notes = await call("/notifications", { token: parent.accessToken });
check("parent received notifications", notes.body.total > 0, `${notes.body.total} total, ${notes.body.unread} unread`);

console.log("\nF. dashboards, reports, end of trip");
for (const [who, token] of [["super admin", superAdmin.accessToken], ["school admin", admin.accessToken], ["driver", driver.accessToken], ["parent", parent.accessToken]] as const) {
  const d = await call("/dashboard", { token });
  check(`${who} dashboard`, d.status === 200);
}

const csv = await fetch(`${API}/school/reports/students?format=csv`, {
  headers: { Authorization: `Bearer ${admin.accessToken}` },
});
const csvText = await csv.text();
check("CSV export works", csv.status === 200 && csvText.includes("Student,Class"), csvText.split("\r\n")[1]);

const end = await call(`/driver/trips/${tripId}/end`, { token: driver.accessToken, method: "POST" });
check("trip ends", end.body.status === "completed");
const endAgain = await call(`/driver/trips/${tripId}/end`, { token: driver.accessToken, method: "POST" });
check("ending twice is harmless", endAgain.status === 200 && endAgain.body.status === "completed");

const replay = await call(`/school/trips/${tripId}/replay`, { token: admin.accessToken });
check("route replay has the breadcrumbs", replay.body.points?.length === 3, `${replay.body.points?.length} points`);

console.log(failures ? `\n${failures} CHECK(S) FAILED\n` : "\nall checks passed\n");
process.exit(failures ? 1 : 0);
