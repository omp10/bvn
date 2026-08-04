# BalVahini

School bus tracking and transportation management, multi-tenant SaaS.
*Safe Journeys, Brighter Futures.*

```
balvahini/
  backend/    Express + TypeScript + MongoDB + Redis + Socket.IO
  frontend/   React + Vite + TypeScript + Tailwind (wrapped as an APK later)
  deploy/     nginx config + deploy script
```

## Running it

Three things must be up. Mongo and Redis run in Docker:

```bash
docker start balvahini-mongo balvahini-redis
```

```bash
cd backend && npm run seed && npm run dev
```

```bash
cd frontend && npm run dev
```

- API → http://localhost:4000
- Web → http://localhost:5174 *(5173 is taken by another project on this machine)*

## Demo logins

Password accounts sign in at **`/login`**. Parents sign in at **`/parent/login`**
with their school code and OTP `123456`.

**School codes are regenerated on every `npm run seed`** — the codes below are
from the current seed. The super admin can always read a school's code from
`/admin/schools/:id`.

| Role | Mobile | Password | Lands on |
|---|---|---|---|
| Super admin | `9000000001` | `admin123` | `/admin` |
| Fleet owner | `9000000002` | `owner123` | `/fleet` |

**Sunrise Public School** — code `V3BSS9`

| Role | Mobile | Password |
|---|---|---|
| School admin | `9111100001` | `school123` |
| Driver | `9111100002` | `driver123` |
| Attendant | `9111100003` | `staff123` |
| Parent | `9111100004` | OTP `123456` |
| Restricted staff (Transport Coordinator role) | `9871230001` | `coord123` |

**Green Valley School** — code `5WMRPD`

| Role | Mobile | Password |
|---|---|---|
| School admin | `9222200001` | `school123` |
| Driver | `9222200002` | `driver123` |
| Attendant | `9222200003` | `staff123` |
| Parent | `9222200004` | OTP `123456` |

Two schools exist on purpose: one school proves nothing about tenant isolation.
Sign in as each school admin and confirm neither can see the other's data.

## Web routes

Each role owns its own URL space, so a link is never ambiguous about who it is
for. Signing in lands you at your own home; visiting another role's URL bounces
you back to yours rather than showing an error.

**Public**

| Route | Purpose |
|---|---|
| `/login` | staff, drivers, attendants, fleet owners |
| `/parent/login` | school code → OTP |
| `/forgot-password` | OTP reset for password accounts |
| `/join/:code` | QR / invitation landing, pre-fills the school code |

**`/admin` — platform admin** *(sidebar layout)*

| Route | Screen |
|---|---|
| `/admin` | platform overview, revenue, expiring subscriptions |
| `/admin/schools` | all schools, search, add |
| `/admin/schools/:id` | one school: counts, subscription, **QR code + invite link** |
| `/admin/billing` | plans, invoices, mark paid |
| `/admin/owners` | fleet owner registration and suspension |
| `/admin/requests` | vehicle requests from schools |
| `/admin/reports` | schools, revenue, fleet owners, vehicle assignments (CSV + PDF) |

**`/school` — school office** *(sidebar layout)*

| Route | Screen |
|---|---|
| `/school` | today: buses, students, picked up, needs attention |
| `/school/live` | fleet map + stop-by-stop progress, live |
| `/school/buses` | fleet, crew assignment, documents |
| `/school/drivers` · `/school/attendants` | staff, licence expiry |
| `/school/routes` | routes and stops, with coordinates |
| `/school/students` | enrolment, transport assignment, search |
| `/school/requests` | parent route-change approvals |
| `/school/alerts` | emergency alerts |
| `/school/salaries` | monthly payroll for drivers and attendants |
| `/school/reports` | students, attendance, trips (CSV + PDF), subscription, **pay invoice** |
| `/school/roles` | custom roles and staff accounts |
| `/school/activity` | audit log |

**`/fleet` — fleet owner** *(sidebar layout)*

| Route | Screen |
|---|---|
| `/fleet` | fleet overview and current assignments |
| `/fleet/vehicles` | register vehicles, status, driver assignment |
| `/fleet/drivers` | own drivers |

**Phone-first** *(big targets, bottom tabs — used on a moving bus)*

| Route | Screen |
|---|---|
| `/driver` | assigned bus, start/end trip, **live GPS**, emergency |
| `/driver/history` | past trips |
| `/attendant` | roster, one tap per child |
| `/parent` | live tracking, ETA, map, contacts |
| `/parent/history` | last 7 days |
| `/parent/alerts` | notifications |

## API routes

All under `/api`. Every request carries `Authorization: Bearer <accessToken>`.

| Prefix | Who | What |
|---|---|---|
| `/auth` | everyone | login, parent OTP, refresh, logout, forgot/reset password, push token |
| `/dashboard` | everyone | one shape per role |
| `/notifications` | everyone | list, mark read |
| `/announcements` | school admin, super admin | broadcast |
| `/emergencies` | driver, attendant | raise an alert |
| `/uploads` | staff roles | files → local disk |
| `/super-admin/schools` | super admin | CRUD, branding, status, invite, `qr.svg` |
| `/super-admin/subscriptions` | super admin | plans, invoices, expiring |
| `/super-admin/owners` | super admin | fleet owner registration |
| `/super-admin/vehicle-requests` | super admin | review, assign, complete |
| `/super-admin/reports` | super admin | schools, revenue, fleet owners, assignments |
| `/school/buses` | school | fleet, crew, documents |
| `/school/people` | school | drivers, attendants, parents |
| `/school/students` | school | enrolment, transport assignment |
| `/school/routes` | school | routes and stops |
| `/school/trips` | school | live, history, replay |
| `/school/vehicle-requests` | school | ask for extra buses |
| `/school/route-changes` | school | approve or reject |
| `/school/emergencies` | school | acknowledge, resolve |
| `/school/billing` | school | subscription, invoices, **pay / confirm** |
| `/school/reports` | school | students, attendance, trips |
| `/school/salaries` | school | payroll |
| `/school/roles` | school | roles, permissions, staff accounts |
| `/school/activity` | school | audit log |
| `/owner` | fleet owner | vehicles, drivers, maintenance |
| `/owner/assignments` | fleet owner | where their vehicles are placed |
| `/driver` | driver | my bus, start/end trip, position batches |
| `/staff/attendance` | attendant | roster, mark boarding/drop |
| `/parent` | parent | children, live, history, route change, contacts |
| `/webhooks/razorpay` | Razorpay | unauthenticated, HMAC-verified |
| `/uploads/...` | public | uploaded files, served from disk |

## How it works — the flow

### 1. Onboarding a school

The super admin adds a school at `/admin/schools`, which in one step creates the
school, generates a **unique 6-character code** (no I/O/0/1 — it gets read aloud
over the phone), raises the first invoice, and creates the first school admin.
A school with no admin cannot be used, so the two are never separate.

Branding — logo, theme colour, app name — is set per school and appears on every
screen its users see.

### 2. The office sets up transport

At `/school`, the office adds **buses**, **drivers** (with licence number and
expiry), **attendants**, then **routes** with stops and coordinates. Those
coordinates matter: they decide when the "bus approaching your stop" alert fires.

Then **students** are enrolled. Adding a student with a parent's mobile creates
the parent account at the same time — that is what makes the child appear in the
parent app the moment they are enrolled. Finally each student is assigned a bus,
a route, and pickup/drop stops.

> A student with no bus never appears in the parent app. `/school/students` has
> an "only students without a bus" filter, which is the list to clear at the
> start of term.

If the school needs more buses than it owns, it raises a **vehicle request**.
The super admin reviews it, picks from the pool of fleet-owner vehicles, and
assigns — at which point the vehicle becomes part of that school's fleet and its
driver is pulled into the same school so they can sign in.

### 3. Parents join

The office shares the **school code**, the **QR code**, or the **invite link**
from `/admin/schools/:id`. The parent enters the code and their mobile, receives
an OTP, and their account is bound to that one school. This is what makes it
impossible for a parent to end up in the wrong school's data.

### 4. A trip runs

1. The driver opens `/driver` and taps **Start morning trip**. Tapping twice is
   safe — the database index returns the same trip rather than creating a second.
2. The phone starts streaming GPS. Points are buffered on the device and flushed
   in batches, so a tunnel or a dead zone loses nothing.
3. Each position updates the live map, and when the bus nears a stop the parents
   waiting at *that* stop are alerted — once, not on every fix.
4. The attendant opens `/attendant` and marks each child **boarded**. The parent
   is notified. Marking twice does not double-count or send twice.
5. Parents watch at `/parent`: the bus on a map, minutes to their stop, next
   stop, and whether the GPS has gone quiet. The ETA is computed once on the
   server and broadcast — no parent's phone ever calls a maps API.
6. The driver taps **End trip**. The bus is released and the trip is archived
   with its full breadcrumb trail for replay.

If a driver forgets to end a trip, the scheduler closes it after 8 hours so the
bus is free for tomorrow. If a trip overruns or its GPS goes quiet, it is
flagged **delayed**.

### 5. Emergencies

Driver or attendant taps **Emergency**, picks a type, and the school office, the
platform, and every parent on that bus are notified at once. The office
acknowledges and resolves it at `/school/alerts`; the incident is kept.

### 6. Money and access

Subscriptions renew from the current expiry, so renewing early loses nothing.
Seven days out the office is reminded; on expiry the school is locked until it
pays. Invoices can be paid by card at `/school/reports` or settled manually by
the platform.

The office can create **custom roles** at `/school/roles` — for example a
Transport Coordinator who runs buses and students but cannot see salaries or
billing — and assign them to staff accounts. Every administrative change is
recorded in the activity log.

## The rules that hold it together

- **Tenant isolation is enforced at the query layer.** Every query is rewritten
  to filter on the school in the signed token. A query with no school in scope
  throws rather than returning everything.
- **Sockets are authorised at join time.** A client never names the room it
  joins; the server checks a parent has a child on that bus first.
- **Retries are safe.** Start Trip, attendance marks, emergencies, salary
  payments and invoice settlement are all idempotent, enforced by database
  indexes rather than by handler code.
- **The server decides money and permissions.** Amounts come from the invoice,
  net pay is recomputed, and a hidden button is also a refused request.

## Not built yet

SMS, WhatsApp and FCM delivery are stubs — OTPs return `123456` in development
and notifications are stored and pushed over the socket but not delivered to
devices. The APK is phase two: a Flutter WebView around this web app, which
needs geolocation permission granted in the WebView and HTTPS hosting.
