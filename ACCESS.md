# BalVahini — live access reference

**https://balvahini.com** · also `www.balvahini.com` and `bvn.balvahini.com`
HTTP redirects to HTTPS. Certificate valid to 2 Nov 2026, auto-renewing.

> These are seeded demo accounts with public passwords, in a public repo.
> **Change or delete them before any real school uses this.**

---

## Credentials

Staff sign in at **`/login`** with mobile + password.
Parents sign in at **`/parent/login`** with a school code + OTP `123456`.

### Platform

| Role | Mobile | Password | Lands on |
|---|---|---|---|
| Super admin | `9000000001` | `admin123` | `/admin` |
| Fleet owner | `9000000002` | `owner123` | `/fleet` |

### Sunrise Public School — code `UV3QUE`

| Role | Mobile | Password | Lands on |
|---|---|---|---|
| School admin | `9111100001` | `school123` | `/school` |
| Driver — Ramesh Patil | `9111100002` | `driver123` | `/driver` |
| Attendant — Sunita Kale | `9111100003` | `staff123` | `/attendant` |
| Parent — Anil Deshmukh | `9111100004` | OTP `123456` | `/parent` |

### Green Valley School — code `MEVEQQ`

| Role | Mobile | Password | Lands on |
|---|---|---|---|
| School admin | `9222200001` | `school123` | `/school` |
| Driver — Suresh Jadhav | `9222200002` | `driver123` | `/driver` |
| Attendant — Manda Shinde | `9222200003` | `staff123` | `/attendant` |
| Parent — Vijay More | `9222200004` | OTP `123456` | `/parent` |

Two schools exist deliberately: one school proves nothing about tenant
isolation. Sign in as each school admin and confirm neither sees the other's
buses, students or trips.

**School codes change on every re-seed.** The super admin can always read the
current code at `/admin/schools/:id`.

---

## Modules and routes

Each role owns its own URL space. Signing in lands you at your own home;
visiting another role's URL bounces you back to yours.

### Public

| Route | Module |
|---|---|
| `/login` | Staff sign-in |
| `/parent/login` | Parent sign-in — school code, then OTP |
| `/forgot-password` | Password reset by OTP |
| `/join/:code` | QR / invitation landing |

### `/admin` — Platform admin · `9000000001 / admin123`

| Route | Module | FRD |
|---|---|---|
| `/admin` | Dashboard: schools, revenue, expiring subscriptions | 25.1 |
| `/admin/schools` | School management — add, search, suspend | 9 |
| `/admin/schools/:id` | School overview, branding, **QR code + invite link** | 8, 16 |
| `/admin/billing` | Subscription plans and invoices | 7 |
| `/admin/owners` | Fleet owner registration | 10.1 |
| `/admin/requests` | Vehicle request review and assignment | 14 |
| `/admin/reports` | Schools, revenue, fleet owners, assignments — CSV + PDF | 26.1 |

### `/school` — School office · `9111100001 / school123`

| Route | Module | FRD |
|---|---|---|
| `/school` | Today: buses, students, picked up, needs attention | 25.2 |
| `/school/live` | Live fleet map + stop-by-stop progress | 19 |
| `/school/buses` | Bus management, crew assignment, documents | 11 |
| `/school/drivers` | Driver records, licence expiry monitoring | 12 |
| `/school/attendants` | Support staff management | 13 |
| `/school/routes` | Routes and stops with coordinates | 15 |
| `/school/students` | Enrolment, transport assignment, search | 17, 18 |
| `/school/requests` | Route change approvals | 22 |
| `/school/alerts` | Emergency alerts | 23 |
| `/school/salaries` | Driver and staff payroll | 9.5 |
| `/school/reports` | Students, attendance, trips — CSV + PDF; pay invoice | 26 |
| `/school/roles` | Custom roles and staff accounts | 27 |
| `/school/activity` | Audit log | 27 |

### `/fleet` — Fleet owner · `9000000002 / owner123`

| Route | Module | FRD |
|---|---|---|
| `/fleet` | Fleet dashboard and current assignments | 25.3 |
| `/fleet/vehicles` | Vehicle registration, availability, documents | 10 |
| `/fleet/drivers` | Own drivers | 10.4 |

### Phone-first — used on a moving bus

| Route | Module | Login | FRD |
|---|---|---|---|
| `/driver` | Assigned bus, start/end trip, **live GPS**, emergency | `9111100002 / driver123` | 20, 23 |
| `/driver/history` | Trip history | | 20.6 |
| `/attendant` | Roster, boarding and drop marking | `9111100003 / staff123` | 21 |
| `/parent` | Live tracking, ETA, map, emergency contacts | `9111100004` + code `UV3QUE` | 17, 19 |
| `/parent/history` | Pickup and drop history, last 7 days | | 21.7 |
| `/parent/alerts` | Notifications | | 24 |

---

## API

All under `https://balvahini.com/api`, bearer token on every request.

| Prefix | Who |
|---|---|
| `/auth` | login, parent OTP, refresh, logout, forgot/reset password, push token |
| `/dashboard` · `/notifications` · `/announcements` | everyone |
| `/emergencies` | driver, attendant |
| `/uploads` | staff roles — files written to disk |
| `/super-admin/{schools,subscriptions,owners,vehicle-requests,reports}` | super admin |
| `/school/{buses,people,students,routes,trips,vehicle-requests,route-changes,emergencies,billing,reports,salaries,roles,activity}` | school office |
| `/owner` · `/owner/assignments` | fleet owner |
| `/driver` · `/staff/attendance` · `/parent` | on the bus, at home |
| `/webhooks/razorpay` | unauthenticated, HMAC-verified |

---

## Operations

```bash
ssh root@200.141.11.186
```

| Task | Command |
|---|---|
| Deploy latest | `~/balvahini/deploy/deploy.sh` |
| Logs | `pm2 logs balvahini-api --lines 100` |
| Restart | `pm2 restart balvahini-api --update-env` |
| Nginx check | `nginx -t && systemctl reload nginx` |
| Re-seed (**wipes data**) | `cd ~/balvahini/backend && npm run seed` |

**This server also hosts `inride.co.in`.** Never remove
`/etc/nginx/sites-enabled/default.conf`, never add `quic reuseport` or
`default_server` to the BalVahini block, and never run `redis-cli flushall` —
BalVahini uses Redis database 3, other things may use others. Nginx backup:
`/root/nginx-backup-2026-08-04-1306.tar.gz`.

## Not yet live

SMS, WhatsApp and FCM delivery are stubs — OTP is `123456` in every environment
until an SMS gateway is configured. Razorpay needs keys in
`~/balvahini/backend/.env`; until then the Pay button is hidden rather than
broken.
