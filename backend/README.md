# BalVahini API

School bus tracking and transportation management, multi-tenant.
Express + TypeScript + MongoDB + Socket.IO.

## Running it

Needs MongoDB, and Redis once you run more than one instance:

```bash
docker run -d -p 27017:27017 --name balvahini-mongo --restart unless-stopped mongo:7
```

```bash
docker run -d -p 6379:6379 --name balvahini-redis --restart unless-stopped redis:7-alpine
```

Then:

```bash
cp .env.example .env
npm install
npm run seed
npm run dev
```

`npm run seed` prints the demo logins. It creates **two** schools on purpose —
one school proves nothing about tenant isolation. Sign in as each school admin
and confirm neither can see the other's buses, students or trips.

```bash
npm test          # unit tests, plus DB-backed isolation tests when mongod is up
npm run typecheck
npm run e2e        # core walkthrough (37 checks)
npm run e2e:phase2 # uploads, salaries, owners, reset, QR, PDF (27 checks)
npm run e2e:roles  # custom roles and the Razorpay handshake (24 checks)
```

Both walkthroughs assume a fresh `npm run seed` — they assert on first-run
state, so re-running without re-seeding will fail on the idempotency checks
(which is the point: a salary already paid must refuse a second payment).

`npm run e2e` drives a whole morning trip against the running API: six roles sign
in, a driver starts a trip and double-taps it, an offline buffer flushes out of
order, an attendant marks boarding twice, a parent watches the bus, reports
export, the trip ends twice. It also tries to break tenant isolation with a
valid token from the wrong school. 37 checks; all should pass.

## How tenant isolation works

This is the part to understand before changing anything.

Every school-owned collection carries `schoolId`, and `tenantPlugin` rewrites
every query to filter on the school in the current request:

```ts
Student.find()            // becomes Student.find({ schoolId })
Student.findById(someId)  // another school's id resolves to null
```

The school comes from the **signed JWT only**, carried through the request in
`AsyncLocalStorage` — never from a header, query string or body. There is no way
to forget the filter: a query with no tenant in scope throws rather than
returning everything.

Cross-school reads are real (super admin, fleet owners) and must say so:

```ts
allSchools(Vehicle.find({ ownerId }))   // explicit, greppable, reviewable
```

Sockets bypass Mongoose entirely, so they are authorised separately: a client
never names the room it joins. `trip:watch` checks that the trip belongs to the
caller's school *and* that a parent has a child on that bus before the join is
accepted. See `src/realtime/socket.ts`.

## Idempotency

Three operations happen on flaky mobile connections and are safe to retry:

| Operation | Guard | Why that guard |
|---|---|---|
| Start Trip | partial unique index on `(vehicleId, tripDate, type)` where `status: running` | a double tap must not fork attendance and notifications across two trips |
| Mark attendance | unique index on `(tripId, studentId, event)` | otherwise the parent gets two "boarded safely" pushes and stats double-count |
| Raise emergency | unique `(schoolId, idempotencyKey)` from the client | a second real breakdown is legitimate, so state can't be the guard |

The database enforces all three. Handlers catch the duplicate-key error and
return the record that already exists.

## Layout

```
src/
  config/env.ts          validated environment, refuses a default secret in prod
  lib/                   context (ALS), jwt, password, otp, geo, csv, validate
  models/                one file per collection
    plugins/tenant.ts    the isolation plugin + allSchools() escape hatch
  middleware/            auth, error handling, rate limits, audit log
  modules/<feature>/     routes, and a service where the logic is real
  realtime/socket.ts     live tracking, with join-time authorisation
  app.ts                 route table
  server.ts              boot and graceful shutdown
```

## Route map

| Prefix | Role |
|---|---|
| `/api/auth` | everyone — password login, parent OTP login, refresh, logout |
| `/api/dashboard` | everyone — one shape per role |
| `/api/notifications` | everyone |
| `/api/emergencies` | driver, attendant — raise an alert |
| `/api/super-admin/*` | schools, subscriptions, vehicle requests, reports |
| `/api/school/*` | buses, people, students, routes, trips, billing, reports |
| `/api/owner/*` | fleet owner's vehicles, drivers, assignments |
| `/api/driver/*` | assigned bus, start/end trip, position batches |
| `/api/staff/attendance` | roster and boarding/drop marks |
| `/api/parent/*` | children, live tracking, history, route change requests |
| `/webhooks/razorpay` | unauthenticated, HMAC-verified |

## Redis

Set `REDIS_URL` and four things become instance-safe. Leave it unset and each
falls back to an in-process equivalent that is correct for exactly one process.

| Used for | Why Redis | Without it |
|---|---|---|
| Socket.IO adapter | a bus reporting to instance A must reach parents connected to B | fan-out stays inside one process |
| OTP codes | request on A, verify on B | a parent can be told their own code is wrong |
| Rate limits | one shared counter | N instances allow N× the attempts |
| Live bus positions | read constantly, written every few seconds | falls back to the copy on the trip document |

`redis.ts` connects **on import**, not from an `init()` call. The rate limiters
build their store at module load, which happens before anything in `server.ts`
runs — resolve the client later and they silently become per-process counters.

## File uploads

Files are written to **`uploads/`** on this server's disk and served from
`/uploads/...`. No Cloudinary, no S3.

- Filenames are random with the extension derived from the *validated* mime
  type, so a client filename can never contain `../` and a `.php` cannot ride in
  on an image upload.
- Images: PNG/JPEG/WebP. Vehicle documents also accept PDF. 5 MB ceiling,
  enforced while streaming so an oversized file never lands on disk.
- Replacing a logo or photo deletes the old file, after the new one is safely
  saved.

Two operational consequences: `uploads/` is **per-machine state**, so two API
instances need a shared volume (or a move to S3); and it must survive deploys —
it is not part of the build.

## Scheduled jobs

| Job | When | What |
|---|---|---|
| Renewal reminders | 08:00 daily | warns schools lapsing within 7 days, once each |
| Subscription expiry | 00:15 daily | moves lapsed schools to `expired`, locking them out |
| Compliance reminders | Mondays 08:30 | licences and vehicle documents expiring within 30 days |
| Delayed trips | every 5 min | flags a trip running over 2 hours or silent for 15 min |
| Stale trips | hourly | auto-closes trips a driver forgot to end, freeing the bus |

Every job is safe to run twice — each filters on a "not done yet" marker — and
takes a short Redis lock so only one instance runs it. `npm test` covers all of
them, including asserting a second run changes nothing.

## Custom roles (FRD 27)

A custom role is a named permission set **inside one school**. It sits under
`school_admin` rather than beside the six built-in roles: a "Transport
Coordinator" is still a school_admin to routing and tenant scoping, just one
with a narrower permission list. Authentication, the URL spaces and the tenant
plugin are untouched — the new concept is confined to authorisation.

- `lib/permissions.ts` is the single catalogue. The role editor renders from it
  and `requirePermission()` checks against it, so the two cannot drift.
- `manage` implies `view`, expanded on write. A role that can edit students but
  not see them is only ever a support ticket.
- A school_admin with **no** role has `permissions: undefined` — unrestricted,
  they own the school. An empty array is a real, empty grant.
- Permissions ride in the access token, so a change applies on the next refresh
  (≤15 min). "Sign them all out" on the role screen makes it immediate, and
  changing someone's role does that automatically.
- The built-in administrator role cannot be edited or deleted, and a role still
  held by staff cannot be deleted — removing it would silently promote them.

## Payments

`RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` / `RAZORPAY_WEBHOOK_SECRET`. Without
them the API runs normally and the Pay button is hidden rather than offered and
failing.

The amount always comes from the invoice on the server, never the browser. Two
independent paths settle an invoice — the checkout callback (HMAC of
`orderId|paymentId`) and the webhook — and `markInvoicePaid` is idempotent, so
whichever lands second changes nothing. No SDK: it is two REST calls and an
HMAC.

## Deliberate shortcuts

Everything below is marked with a `ponytail:` comment at the code that does it.

- **Notifications send inline.** FCM is a logged stub. Put the fan-out on BullMQ
  before a 500-parent broadcast starts blocking the request that triggered it.
- **ETA is straight-line distance × 1.35.** Real ETA needs the Directions API —
  called once per bus per tick on the server and broadcast, never once per
  watching parent, which is how the Maps bill explodes.
- **Reports export CSV and PDF** (`?format=csv|pdf`). The PDF is streamed, not
  buffered, so a year of trips does not sit in memory before the first byte.
- **Route replay sends every point.** ~540 for a 90-minute trip; no
  simplification pass until trips get much longer.
- **No refresh-token blacklist beyond the session list on the user document.**
- **SMS, WhatsApp and FCM are still stubs**, and Razorpay order creation is not
  built — only the webhook that settles an invoice.
