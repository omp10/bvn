# BalVahini mobile — UI redesign brief

Hand this whole document to the agent doing the redesign. It is written to be
pasted as a prompt.

---

## 1. What you are working on

BalVahini is a school-bus tracking platform used in India. Two Android apps ship
from **one Expo codebase**, selected at build time by `APP_VARIANT`:

| App | Package | Who signs in |
|---|---|---|
| BalVahini Parent | `com.balvahini.parent` | parents (school code → OTP) |
| BalVahini Staff | `com.balvahini.staff` | drivers, attendants, school admins, fleet owners, super admin (mobile + password) |

Your job is to **redesign the interface of both apps to a premium standard**,
add a proper first-run onboarding, and restructure the bottom-tab navigation so
no role feels crowded. You are not changing what the app does — you are changing
how it looks, how it is structured, and how it feels to use.

The people using this are not enthusiasts. A driver checks it in a parked bus
with the sun on the screen and thick fingers. A parent checks it once at 07:15
while making breakfast, wanting one number. Design for those two moments.

---

## 2. Hard constraints — do not break these

These are not style preferences. Breaking any of them breaks a working product.

1. **Do not change any API request or response shape.** Every endpoint is live
   and serving a production web app. You may change what you render and how; you
   may not change what you send. Endpoint list is in §7.
2. **Do not touch `src/tracker.ts` logic.** It runs an Android foreground service
   for background GPS. It is the reason the driver app exists. You may restyle
   anything that *displays* its status; do not alter when it starts, stops, or
   flushes.
3. **Maps stay Leaflet-in-a-WebView** (`src/BusMap.tsx`), on CARTO Positron
   tiles, with the route line snapped to roads by OSRM. There is no Google Maps
   API key and no billing account. You may restyle the markers, the surrounding
   chrome and the full-screen presentation; do not swap the map engine.
4. **Per-school branding must survive.** `src/brand.tsx` mixes a shade scale from
   one colour a school chooses, and supplies its logo and app name. Every surface
   you design must work with an arbitrary brand hue — including an ugly one.
   Danger actions stay red regardless of the school's colour.
5. **Keep the app usable offline and on bad networks.** Every screen needs a
   considered loading, empty, error and stale-data state. "The bus has not
   reported for 4 minutes" is different from "the bus is parked", and the UI must
   never let one read as the other.
6. **No new native modules** unless you justify the addition in writing. Current
   native surface: expo-location, expo-task-manager, expo-notifications,
   expo-camera, expo-image-picker, expo-file-system, expo-secure-store,
   expo-updates, react-native-webview, react-native-svg.
7. **Expo SDK 57 / React Native 0.86 / React 19, New Architecture enabled.** The
   app must still pass `npx tsc --noEmit`, `npx expo export --platform android`
   and `npx expo-doctor`.

---

## 3. The problem you are solving

Be specific about what is currently wrong. It is not "it looks basic" — it is:

**Navigation is congested.** The driver has **six** bottom tabs: Trip, Students,
Live, History, Alerts, Profile. Six tabs on a phone means unreadable labels and
mis-taps. Five is the practical ceiling; four is better. Fix this by
restructuring information, not by shrinking text.

**Everything is a flat list of cards.** Every screen is a vertical stack of
identical white rounded rectangles. There is no hierarchy, so the one number a
parent came for has the same visual weight as the bus's vehicle registration.

**No onboarding at all.** The app opens straight onto a login form. A parent has
no idea what the school code is or where to find it. A driver is never told —
before it matters — that background location and a battery-optimisation
exemption are what keep tracking alive.

**Permissions are requested cold**, at the moment of use, with no explanation of
why. On Android that is how you get a permanent denial.

**No motion, no feedback.** Nothing animates, nothing confirms. Marking a child
boarded produces a silent re-render.

**Density is uniform and wrong.** The same padding on a parent's hero card and on
a 60-row attendance list.

---

## 4. Design language to establish

Produce a real design system, not ad-hoc styles. It must live in
`src/theme.ts` + `src/ui.tsx` and be used everywhere.

**Direction:** calm, trustworthy, unmistakably about children's safety. Warm
rather than corporate. Confident use of white space. Think a modern banking app's
clarity with a softer, more human palette. Not playful, not childish — the parent
is mildly anxious and wants competence.

**Foundations to define:**

- **Type scale** — 6–7 steps with named roles (display, title, heading, body,
  label, caption). Set line heights explicitly. Support Android font scaling to
  at least 130% without clipping.
- **Spacing scale** — a 4pt base. Every gap must come from the scale.
- **Colour tokens** — semantic, not literal: `surface`, `surfaceRaised`,
  `textPrimary`, `textMuted`, `border`, `success`, `warning`, `danger`, `brand`.
  The brand token is per-school. Contrast must pass WCAG AA for body text.
- **Elevation** — 3 levels maximum, defined once. Prefer borders and background
  steps over heavy shadows.
- **Radii** — 3 values maximum.
- **Motion** — durations and easings as tokens. Every state change gets a
  transition: list items entering, numbers changing, sheets opening. Respect
  reduce-motion. Nothing bounces for decoration.
- **Iconography** — the existing stroke set in `src/icons.tsx` is fine as a base;
  make weight and size consistent, and add any icons you need in the same style.

**Decide and justify:** dark mode. If yes, every token needs a dark value and the
map needs a dark tile style. If no, say so and lock `userInterfaceStyle`.

---

## 5. Onboarding — first install

Currently there is none. Design a complete first-run flow for **each** app.

**Shared principles:** skippable but not hidden; never more than 4 screens before
the person can act; never ask for a permission before explaining what it buys
them; remember completion so it never shows twice (`expo-secure-store` or
AsyncStorage).

### Parent app

1. **Welcome** — the school's world, not ours. One sentence on what they get:
   see the bus, know when it is near, know their child got on and off.
2. **How it works** — 3 beats: the bus reports, you watch, you are told. Use
   motion or illustration, not paragraphs.
3. **Where to find your school code** — this is the single biggest drop-off
   point. Show what a school circular looks like with the code circled, and
   point out the QR alternative. This screen earns its place.
4. **Notifications primer** — explain *then* request. "We will tell you when the
   bus is near your stop and when your child is on board." Then the system
   dialog.
5. Then the sign-in flow (code → OTP), which should feel like part of the same
   journey rather than a different app.

**After first sign-in:** if the parent has more than one child, a brief
"here are your children" moment. If a child has no bus assigned, say what to do
about it rather than showing an empty screen.

### Staff app

Onboarding must branch by role after sign-in, because a driver and a school
admin need entirely different things.

1. **Welcome** — who this app is for.
2. Sign in.
3. **Driver-specific, and this is critical:**
   - **Why location "all the time"** — with a plain-language explanation that the
     school and parents see the bus only while a trip runs, and never otherwise.
     Then request.
   - **Battery optimisation** — Xiaomi, Oppo, Vivo and Realme kill background
     services regardless of a correctly declared foreground service. Walk the
     driver through the exemption with device-specific wording where you can
     detect the manufacturer. Deep-link to settings. This screen prevents the
     single most common field failure.
   - **The daily rhythm** — check in with a photo, start the trip, drive, end it.
4. **Attendant-specific:** how marking works, and that a double-tap is harmless.
5. **Admin/owner:** a one-screen orientation; they mostly use the web app.

Add a **"How it works" entry in Profile** that replays onboarding, because
drivers change and phones get replaced.

---

## 6. Navigation — the structure to fix

Rules: **maximum 5 tabs, 4 preferred.** Labels always visible. Every tab is a
noun a user would say out loud. No tab exists solely because an endpoint does.
Secondary destinations belong in stacks pushed from a tab, not in the tab bar.

Current state and the problem:

| Role | Tabs today | Issue |
|---|---|---|
| Parent | Home, History, Alerts, Profile | Acceptable; Home does too much |
| **Driver** | **Trip, Students, Live, History, Alerts, Profile** | **Six. Must be reduced.** |
| Attendant | Roster, Alerts, Profile | Thin; roster screen is dense |
| School admin | Overview, Live buses, Alerts, Profile | Acceptable |
| Fleet owner | Overview, My vehicles, Alerts, Profile | Acceptable |
| Super admin | Platform, Alerts, Profile | Thin |

**Propose and justify a new IA for every role.** For the driver specifically,
consider: Trip and Live are the same job at two zoom levels; History is rarely
opened mid-shift; Alerts could be a header badge rather than a tab. Do not just
delete things — show where each destination moved and why a user will still find
it.

Also design: the tab bar itself (height, safe-area handling, active indicator,
badge treatment for unread alerts), and what the **active trip** does to
navigation — a running trip is a persistent state and the UI should reflect it
everywhere, not only on one tab.

---

## 7. Screens — every one, with every state

For each: the layout, the visual hierarchy, and the **loading / empty / error /
offline** states. The endpoint after each name is fixed; the data it returns is
what you have to work with.

### Parent

- **Home** — `GET /parent/children`, `GET /parent/children/:id/live`
  The most important screen in either app. Live state carries: ETA in minutes,
  next stop, stops remaining, metres away, whether GPS is stale, whether the trip
  is delayed and by how much, the child's boarded/dropped status, the map, bus
  and vehicle number, route, driver name, attendant name, pickup and drop stop,
  and one-tap calls to driver, school office and 112.
  **That is far too much for one flat scroll.** Restructure it. Design the
  before-trip, during-trip and after-trip states as genuinely different screens,
  because they are. Handle multiple children — a switcher that works at a glance.
- **History** — `GET /parent/children/:id/history?days=7` — daily grouping,
  boarded/dropped/absent per day.
- **Alerts** — `GET /notifications` — read/unread, emergency styled distinctly,
  mark-all-read.
- **Profile** — school identity, emergency helpline, sign out.
- **Route change request** — `GET /parent/routes`,
  `POST /parent/children/:id/route-change`.
- **QR scanner** — `src/screens/QrScanner.tsx`, for the school code.

### Driver

- **Trip** — `GET /driver/my-bus`, `POST /driver/trips/start`, `/:id/end`
  Pre-trip: check-in selfie (front camera, required by school setting), then
  Morning or Evening. During: GPS health, buffered-points count, permission
  warnings, battery-optimisation guidance, end trip. Plus today's stops, and a
  large always-reachable **Emergency** action.
  The emergency button must be impossible to hit by accident and impossible to
  miss in a crisis. Solve that properly.
- **Students** — `GET /driver/students`, `POST /staff/attendance`
  Counts (on board / dropped / absent / waiting), filters, search, per-child
  boarded / dropped / absent. Must work one-handed on a moving bus.
- **Live map** — full route, stops, bus, travelled trail, nearest stop, distance.
- **History** — `GET /driver/trips?limit=30`.

### Attendant

- **Roster** — `GET /staff/attendance/roster`, `POST /staff/attendance`
  Same marking problem as the driver's Students, plus bulk "mark all boarded /
  dropped" with confirmation. A 60-child bus is the design target, not a 6-child
  one.

### School admin / owner / super admin (staff app)

- **Overview** — `GET /dashboard` (role-shaped) — a stat grid today; give it
  hierarchy so the one thing that is wrong is what you see first.
- **Live buses** — `GET /school/trips/live` — per-bus status, GPS staleness,
  delay, expandable map.
- **My vehicles** (owner) — `GET /owner/vehicles`, `GET /owner/dashboard` —
  status, service due, documents expiring.

### Both apps

- **Sign-in** — parent: school code → OTP (with QR scan). Staff: mobile +
  password. Show the school's logo and name once the code resolves — it is the
  last moment a parent can notice they typed the wrong school's code.
- **Emergency sheet** — `POST /emergencies` — type, note, confirmation.
- **Wrong app** — someone installed the driver app and signed in as a parent.

---

## 8. Interaction detail expected

- **Every destructive or broadcast action confirms.** Marking 60 children boarded
  tells 60 parents their child is on a bus.
- **Optimistic UI where it is safe**, with clear rollback where it is not.
- **Haptics** on marking, trip start/end and emergency.
- **Skeletons, not spinners**, for content that has a known shape.
- **Pull-to-refresh everywhere**, plus honest "last updated" stamps on live data.
- **Empty states that tell you what to do next**, never just "no data".
- **Errors in plain language.** "Cannot reach the server. Check your connection."
  beats "Network request failed". Server validation errors already come back with
  the offending field — surface them next to the field.
- **A global offline banner** when the API is unreachable, that disappears
  cleanly on recovery.

---

## 9. Accessibility and localisation

- Minimum touch target 44×44.
- Everything interactive has an accessibility label and role.
- Support system font scaling to 130% without breaking layout.
- Colour is never the only carrier of meaning — pair with icon or text.
- **Prepare for Hindi and Marathi.** Do not hardcode strings in components; put
  them behind a lookup even if only English ships. Layouts must tolerate strings
  30–40% longer.

---

## 10. Deliverables

1. Updated `src/theme.ts` and `src/ui.tsx` implementing the full design system.
2. Redesigned screens under `src/screens/`.
3. New onboarding flow, per app variant, with persistence.
4. Restructured `src/navigation.tsx` with the new IA.
5. A short `DESIGN.md` — tokens, component inventory, the IA decision for each
   role, and what you deliberately did not do.
6. Everything passing `npx tsc --noEmit`, `npm test`, `npx expo export
   --platform android` for **both** `APP_VARIANT=parent` and `APP_VARIANT=staff`,
   and `npx expo-doctor`.

## 11. Acceptance criteria

- No role has more than 5 bottom tabs.
- Every screen has designed loading, empty, error and offline states.
- A first-time parent reaches the OTP step without ever wondering what a school
  code is.
- A first-time driver has granted background location and been walked through
  battery optimisation before their first trip.
- The whole UI still looks right when a school picks an unpleasant brand colour.
- Nothing in `src/tracker.ts`'s behaviour changed.
- No API request shape changed.

## 12. How to work

Read the existing code before redesigning it — the comments explain why things
are the way they are, and several are load-bearing. Where you disagree with an
existing decision, say so and explain; do not silently reverse it.

Ship in reviewable stages: design system first, then navigation, then screens by
role, then onboarding. Do not open with a rewrite of everything at once.
