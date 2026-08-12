# BalVahini mobile — artwork and motion brief

Paste this whole file as the task. It is written to be executed, not skimmed.

You are working in an existing, working, production app. Your job is **not** to
redesign it. The design system, the navigation and the screens are done and
shipped. You are adding two things that are genuinely missing:

1. **Artwork** — illustrations for the screens that have none, and a set of
   default child avatars.
2. **Motion** — considered animation on the state changes that currently just
   snap.

Everything else you find, leave alone.

---

## 0. The project

```
D:\projects\balvahini\mobile          ← you work only in here
```

One Expo codebase builds **two Android apps**, chosen at build time by the
`APP_VARIANT` environment variable:

| Variant | Package | Who uses it |
|---|---|---|
| `parent` | `com.balvahini.parent` | parents — school code, then an OTP |
| `staff` | `com.balvahini.staff` | drivers, bus attendants, school office, fleet owners |

It is a school-bus tracking app used in India. Two moments define it:

- A **parent** opens it once at 07:15 while making breakfast and wants one
  number: how many minutes until the bus reaches their stop.
- A **driver** checks it in a parked bus, in direct sunlight, with thick
  fingers, one-handed.

Design for those two people. Not for a design award.

### Stack

Expo SDK 57 · React Native 0.86 · React 19 · New Architecture enabled ·
TypeScript strict.

### Commands you must be able to run and pass

```bash
npx tsc --noEmit
npm test
APP_VARIANT=parent npx expo export --platform android
APP_VARIANT=staff  npx expo export --platform android
```

All four must pass when you are finished. `npm test` is 17 tests and none of
them are about UI — if you break one, you broke something real.

---

## 1. Hard constraints — breaking any of these breaks a live product

1. **Do not touch `src/tracker.ts`.** It runs an Android foreground service for
   background GPS. It is the reason the driver app exists at all. You may
   restyle or animate anything that *displays* its status. You may not change
   when it starts, stops, or flushes.
2. **Exactly one mounted screen may call `useTripTracker`.** Today that is
   `src/screens/DriverTrip.tsx`. Everything else uses `useTrackerStatus`, which
   is read-only. Two owners fight over whether tracking should run, and the bus
   keeps reporting after the trip ended.
3. **Do not change any API request or response shape.** Every endpoint serves a
   live production web app as well.
4. **The map stays Leaflet in a WebView** (`src/BusMap.tsx`), on CARTO Positron
   tiles. There is no Google Maps key and no billing account. Restyle the
   chrome around it freely; do not swap the engine, and do not animate anything
   *inside* the WebView — it is a separate JS context.
5. **Per-school branding must survive.** `src/brand.tsx` mixes a whole shade
   scale from the single colour a school picks. Every surface must work with an
   arbitrary hue, including an ugly one. Danger actions stay red regardless.
   **This is the main constraint on artwork** — see §2.
6. **No new native modules without written justification.** See §4 for the
   animation-library decision, which is the one place this bites.
7. **No hardcoded user-facing strings.** Every word a person reads lives in
   `src/strings.ts`. Hindi and Marathi are coming and run 30–40% longer than
   English, so nothing gets a fixed width or height.
8. **Respect reduce-motion.** `useReducedMotion()` already exists in
   `src/ui.tsx`. Every animation you add must check it.
9. **Font scaling to 130%** must not clip anything.
10. **Minimum touch target 44×44.**

---

## 2. Artwork style guide

### The palette

| Role | Hex |
|---|---|
| Primary blue | `#1155A5` |
| Secondary green | `#368A29` |
| Accent yellow — sparingly | `#F0AC00` |
| Background | `#F8FAFC` |
| Card white | `#FFFFFF` |
| Secondary text grey | `#64748B` |

### The style

Flat vector illustration. Soft, rounded shapes. Gentle gradients are fine;
hard drop shadows are not. Friendly and warm, but **not childish** — the parent
looking at this is mildly anxious and wants to feel competence, not whimsy.

Four illustrations already exist and set the language. **Look at them before
you generate anything:**

```
assets/onboarding/parent-welcome.jpg
assets/onboarding/school-code.jpg
assets/onboarding/staff-welcome.jpg
assets/onboarding/location.jpg
```

Match `parent-welcome.jpg` and `staff-welcome.jpg` in particular. Note that
`location.jpg` is a 3D-ish render and is the odd one out — **do not** use it as
the reference.

### Five rules that are not negotiable

1. **No text inside any image. Ever.** Not a word, not a label, not a sign, not
   a number. One of the existing illustrations arrived with its screen title
   rendered into the artwork and had to be cropped out — it would have
   duplicated the real headline and could never be translated. Every word on
   screen comes from `src/strings.ts`. The only exception is
   `school-code.jpg`, which already exists and which you are not regenerating.
2. **Indian context.** This app is used in India. Children wear Indian school
   uniforms — shirt with pinafore, or shirt with salwar kameez, or shirt and
   shorts, often with a school tie and a backpack. Skin tones are Indian and
   varied. Streets have auto-rickshaws, scooters, compound walls, neem and
   banyan trees, low-rise concrete buildings. **Do not** generate American
   yellow school buses with the US snub-nose shape, US suburban streets, or
   white children. The bus should read as an Indian school bus: yellow, boxy,
   often with a black stripe.
3. **Brand-hue safe.** These sit on a white or `#F8FAFC` surface and do **not**
   inherit the school's colour. So keep them chromatically calm — lean on the
   yellow bus, greens, and neutrals, and avoid large flat fields of saturated
   blue that would fight a school whose brand colour is, say, magenta. Nothing
   you draw should look wrong next to an arbitrary hue.
4. **No faces that identify a real person**, no logos, no brand marks, no
   recognisable real-world buildings.
5. **Transparent PNG for spot art, JPG for full scenes.** Specified per asset
   in §3.

---

## 3. TASK A — the images to generate

### A1. Onboarding illustrations (4 missing)

`src/screens/Onboarding.tsx` has **ten** steps. Four already have artwork. Of
the remaining six, **only four are placeholders you should replace.**

The other two — the steps keyed `how` and `rhythm` — are **not** placeholders.
They render a list of labelled rows (`HowRow`), each with its own icon and its
own line of text from `strings.ts`: three beats for "how BalVahini works", four
for the driver's daily rhythm. That structure is deliberate and it carries
information a single picture cannot. **Leave both exactly as they are.**
Replacing them with an illustration would delete content.

The four that *are* placeholders each render one stroke icon in a tinted
circle (`<Art>`), which is decoration standing in for artwork:

**Format for all four:** JPG, **1200 × 656**, near-white `#F8FAFC` background,
subject centred with breathing room, quality ~88.

**Path:** `assets/onboarding/<name>.jpg`

| # | File | Step key | Replaces | Subject to generate |
|---|---|---|---|---|
| 1 | `notifications.jpg` | `notify` | `IconBell` in blue | A phone held in a parent's hand, a soft notification card sliding onto the screen, a gentle bell with light radiating. Warm and reassuring, not alarming. Indian woman's hand; bangles are fine. The notification card shows abstract grey lines only — no words. |
| 2 | `battery.jpg` | `battery` | `IconShield` in amber | A phone with a healthy battery icon and a small shield, sitting in a bus-dashboard cradle, with a subtle "keeps running" motif such as a looping arrow. Calm and instructional, amber accent. No text. |
| 3 | `attendant.jpg` | `attendant` | `IconUsers` in blue | An Indian bus attendant — a woman in a sari or salwar kameez with a lanyard — helping an Indian child in school uniform up the steps of a yellow bus, holding a simple clipboard. Warm and caring. No text on the clipboard. |
| 4 | `desk.jpg` | `desk` | `IconSchool` in blue | A school office desk seen from slightly above: a laptop showing an abstract dashboard of simple coloured blocks, a small potted plant, a mug. Calm and professional. Absolutely no readable text on the laptop screen. |

### A2. Empty-state spot illustrations (7)

Right now every empty state is a title and a line of hint text. These give them
a face. They render small, so they must read at 120 dp.

**Format for all seven:** PNG with **transparent background**, **600 × 600**,
subject filling ~80% of the frame.

**Path:** `assets/empty/<name>.png`

| # | File | Used where | Subject |
|---|---|---|---|
| 1 | `no-children.png` | `ParentHome` — no children linked | An empty school bench with a small backpack resting on it. Gentle, hopeful, not sad. |
| 2 | `no-trips.png` | `DriverHistory` — no trips yet | A yellow bus parked under a tree, engine off, calm daylight. |
| 3 | `no-alerts.png` | `Alerts` — nothing to report | A bell at rest with a small green check beside it. Quiet, resolved. |
| 4 | `no-route.png` | `DriverLive` — no route set | A simple map fragment with a dotted path that stops, and one unplaced pin. |
| 5 | `no-students.png` | `Roster` — no students on this bus | Three empty bus seats seen from the aisle. |
| 6 | `no-buses.png` | `SchoolLive` / `OwnerFleet` — nothing running | A quiet depot: two small buses parked side by side, shutters down. |
| 7 | `no-history.png` | `ParentHistory` — no records | A wall calendar with soft blank squares and one small bus icon. No numbers, no month name. |

### A3. Default child avatars — Indian children (8) — **REGENERATE**

Eight already exist at `assets/avatars/child-1.png` … `child-8.png`. **They are
wrong on both counts below. Replace all eight.**

#### What went wrong last time — read this before generating

**1. The background was opaque black, not transparent.** Every PNG came back
with a solid `rgb(0,0,0)` fill behind the subject and **0% transparent pixels**,
so each one rendered as a black circle in the app. It was recoverable only
because the background happened to be *pure* `(0,0,0)` while the children's hair
was `(24,24,27)` — a hair's breadth apart. A flood fill at any looser threshold
made every child bald.

Do not rely on that luck again. **The alpha channel must actually be empty.**
Save as RGBA PNG with genuine transparency and verify it — a correct file has
roughly 60–80% of its pixels at `alpha = 0`:

```python
from PIL import Image
d = Image.open("assets/avatars/child-1.png").convert("RGBA").getdata()
print(sum(1 for p in d if p[3] < 16) / len(d))   # must be > 0.4
```

If your generator cannot emit real transparency, emit a **pure white**
`(255,255,255)` background instead and say so — white is separable from hair,
skin and uniform. **Never black.**

**2. The style was wrong.** They came back as crude flat geometric shapes — a
circle for a head, a triangle for a torso. That is not what this app wants.

#### The style to generate instead

**Photorealistic, or a high-quality 3D character render.** Think a clean studio
portrait of a real Indian schoolchild on a cut-out background — soft even
lighting, natural skin texture, real fabric.

This is deliberately *different* from the flat-vector onboarding illustrations,
and the reason is that these avatars sit directly beside **real uploaded
student photographs** in the roster. A photoreal stand-in blends into that row;
a cartoon does not. The onboarding art has no such neighbour, so it stays flat
vector. Do not "harmonise" the two.

**Reference to match:** an Indian schoolgirl, roughly 9 years old, in a navy-
and-white checked pinafore over a white peter-pan-collar shirt, two braided
plaits, a navy backpack over both shoulders, hands clasped in front, warm
natural smile, soft studio light, transparent cut-out background.

#### Framing — this matters more than it sounds

The reference image is **full body**. An avatar renders inside a **circle as
small as 24 px**. A full-body figure in a 24 px circle is an unreadable smudge.

So: **head and upper chest only.** The face fills roughly 60% of the frame,
shoulders and collar visible at the bottom, a little headroom above. Centred,
with nothing important within 12 px of the edge — the circular crop cuts the
corners off.

**Format:** RGBA PNG, real transparency, **512 × 512** (up from 256 — photoreal
needs the pixels), subject centred.

**Path:** `assets/avatars/child-1.png` … `child-8.png` (overwrite).

#### The eight

Vary them genuinely — this is a roster of sixty children, and repetition shows.

| # | Child |
|---|---|
| 1 | Girl, ~8, two braided plaits with red ribbons, navy checked pinafore over white collared shirt, medium skin tone |
| 2 | Boy, ~7, short side-parted hair, white shirt with navy tie, fair-medium skin tone |
| 3 | Girl, ~11, single ponytail, pale blue shirt with navy pinafore, deeper skin tone |
| 4 | Boy, ~10, cropped hair, white shirt with maroon tie and navy sweater vest, medium-deep skin tone |
| 5 | Girl, ~9, white hijab worn with the uniform, pale blue shirt, medium skin tone |
| 6 | Boy, ~8, patka (small cloth head covering worn by young Sikh boys), white shirt with navy tie, medium skin tone |
| 7 | Girl, ~6, short bob with a hairband, checked pinafore, fair skin tone |
| 8 | Boy, ~12, neat short hair, white shirt with school tie, deep skin tone |

All: facing forward, warm natural smile, eyes to camera. No school crest, no
name badge, no text of any kind on the uniform.

### A4. Connection and failure spot art (2)

**Format:** PNG transparent, **600 × 600**.
**Path:** `assets/empty/<name>.png`

| File | Used where | Subject |
|---|---|---|
| `offline.png` | `ErrorState` when unreachable | A phone with a soft "no signal" motif — a cloud with a gentle broken line beneath it. Calm, not alarming. Amber accent. |
| `error.png` | `ErrorState`, general | A small bus with its bonnet open and a friendly spanner beside it. Reassuring, fixable. |

### A5. Verify every PNG before you finish

The single biggest failure last round was **17 PNGs saved with an opaque black
background** instead of transparency. They all looked correct in a file
browser that renders alpha as black. Run this and fix anything it flags:

```python
from PIL import Image
import glob
for f in glob.glob("assets/{avatars,empty}/*.png", recursive=True):
    d = Image.open(f).convert("RGBA").getdata()
    frac = sum(1 for p in d if p[3] < 16) / len(d)
    print(f, round(frac, 3), "OK" if frac > 0.3 else "*** NO ALPHA ***")
```

### Total budget

**21 images** — 4 onboarding, 7 empty states, 8 avatars, 2 failure
states. Keep the combined weight of `assets/` **under 2.5 MB**. The APK is
already ~110 MB. Compress: JPGs at quality 85–88, PNGs run through a lossy
quantiser (`pngquant`-equivalent) at 256 colours — these are flat vector
illustrations and will barely change.

---

## 4. TASK B — motion

### First, the library decision. Read this before writing any animation.

**`react-native-reanimated` is NOT installed.** Neither is
`react-native-gesture-handler`, `moti`, or `lottie-react-native`. Constraint §1.6
says no new native modules without written justification.

Your default is **React Native's built-in `Animated`**, which the app already
uses in four places (`Enter`, `LiveDot`, `Skeleton` in `src/ui.tsx`). It is
zero new dependencies and it covers everything in the list below.

You may add `react-native-reanimated` **only if** you do all of:

- write the justification into `DESIGN.md`, naming what it does that `Animated`
  cannot;
- add its Babel plugin correctly for SDK 57;
- re-run `npx expo-doctor` **and** both `expo export` commands and show they
  pass.

Do not add `lottie-react-native`. Do not add `moti`. If you cannot do an
animation with `Animated`, cut the animation.

### What already exists — use it, do not reinvent it

| In `src/ui.tsx` | What it does |
|---|---|
| `useReducedMotion()` | Subscribes to the OS setting. **Gate every animation on it.** |
| `Enter` | Fade + 8 px rise on mount. Takes a `delay` prop. |
| `LiveDot` | The pulsing "this is live" dot. |
| `Skeleton`, `SkeletonRow` | Shimmering loading placeholders. |
| `tick("light" \| "heavy")` | A haptic buzz via RN's `Vibration`. Already wired to `Button` through its `haptic` prop. |

| In `src/theme.ts` | Value |
|---|---|
| `motion.fast` | 120 ms |
| `motion.base` | 200 ms |
| `motion.slow` | 320 ms |
| `motion.pulse` | 2000 ms |

**Use these duration tokens.** Do not write bare numbers.

### The animations to add, in priority order

**B1 — The parent's ETA number.** `src/screens/ParentHome.tsx`
The hero shows minutes to the stop as a large number. It currently jumps from
9 to 8. Animate the digit change: a short upward slide with a cross-fade,
`motion.base`. This is the single most-looked-at element in either app; it
should feel alive without being distracting. Never animate it on first paint —
only on change.

**B2 — Marking a child.** `src/screens/Roster.tsx`
Tapping a child marks them boarded or dropped. Today it is a silent re-render.
Add: the row's background washes to the status tint over `motion.fast`, the
status pill scales from 0.8 to 1, and the stat tile at the top counts up. The
`tick()` haptic already fires — keep it. Must feel instant, because a driver is
doing this 60 times at a stop.

**B3 — List entry.** All list screens.
Stagger `Enter` across the first ~8 rows with a 30 ms step, then no delay for
the rest. Applies to `Roster`, `Alerts`, `ParentHistory`, `DriverHistory`,
`SchoolLive`, `OwnerFleet`. Do not stagger 60 rows — it looks broken.

**B4 — Skeleton to content.** Everywhere `Skeleton` is used.
Cross-fade the skeleton out as real content fades in, `motion.base`. Right now
it swaps hard.

**B5 — Trip start and end.** `src/screens/DriverTrip.tsx`
Starting a trip is the moment the driver's day begins. When the GPS panel first
goes green, animate it: the panel border sweeps to green, the icon scales in.
On end, a calm collapse — not a celebration. The `haptic="heavy"` on those
buttons already fires.

**B6 — The bottom sheet.** `Modal` in `src/ui.tsx`
It uses `animationType="slide"`. Add a backdrop fade from 0 to 0.45 opacity so
the dim arrives with the sheet instead of instantly.

**B7 — Tab press.** `src/navigation.tsx`
A small scale-down-and-back on the pressed tab icon, `motion.fast`.

**B8 — The alerts bell.** `AlertsBell` in `src/navigation.tsx`
When the unread count increases while the app is open, a single gentle swing of
the bell and a pop of the badge. Once. Not a loop.

**B9 — Pull to refresh.** Already native `RefreshControl`. **Leave it alone.**

### Motion rules

- Nothing bounces for decoration. No spring overshoot on anything a driver
  taps.
- Nothing animates for longer than `motion.slow`.
- `useNativeDriver: true` wherever the property allows it. Never animate
  `height` or `width` — animate `transform` and `opacity`.
- Every animation is skipped entirely — not shortened — under reduce-motion.
- If an animation delays a person seeing information they asked for, delete it.

---

## 5. How to wire it up

### Onboarding illustrations

`src/screens/Onboarding.tsx` already has the pattern. Extend the `ART` map and
swap the `art:` field for **the four steps that use `<Art>`** — `notify`,
`battery`, `attendant`, `desk`. Do not touch `how` or `rhythm`:

```tsx
const ART = {
  parentWelcome: require("../../assets/onboarding/parent-welcome.jpg"),
  schoolCode:    require("../../assets/onboarding/school-code.jpg"),
  staffWelcome:  require("../../assets/onboarding/staff-welcome.jpg"),
  location:      require("../../assets/onboarding/location.jpg"),
  // add the four new ones here
};
```

Then, for each step:

```tsx
art: <Illustration source={ART.notifications} label={str.onboarding.artNotifications} />,
```

`Illustration` already reads the aspect ratio off the bundled asset, so you do
not write dimensions anywhere. **Every image needs alt text** added to the
`onboarding` block of `src/strings.ts`, following the `artParentWelcome`
pattern that is already there. These illustrations carry meaning; they are not
decorative.

After the swap, `<Art>` has no callers left — delete the component and its
`art` style. `HowRow` is still used by `how` and `rhythm`; keep it.

### Empty-state art

`EmptyState` in `src/ui.tsx` takes `title`, `hint` and `action`. Add an
optional `art?: number` prop that renders above the title at 120 × 120,
`resizeMode="contain"`, and is hidden from screen readers
(`accessibilityElementsHidden`) because the title already says it in words.

Then pass it at each of the seven call sites listed in §3 A2. `ErrorState`
takes the two from A4 — pick `offline.png` when the message is the
"Cannot reach the server" one, `error.png` otherwise.

### Default child avatars

In `src/ui.tsx`, `Avatar` currently does: real photo if `photoUrl`, else
initials. Insert the illustrated avatar as the **middle** step:

1. `photoUrl` → the real photo. Unchanged. **This must stay first.**
2. no photo → one of the eight illustrations, picked **deterministically from
   the name** so the same child always gets the same face across renders,
   screens and app launches. Hash the name; do not use `Math.random()` and do
   not use the array index.
3. no name → initials, as today.

Keep the existing `assetUrl()` resolution on `photoUrl` — it is what makes
server-relative `/uploads/...` paths load, and removing it breaks every real
photo in the app.

Gate it behind a prop, `illustrated`, defaulting **on** for students and **off**
for staff — a driver's account circle showing a cartoon child would be absurd.
`Profile.tsx` passes the signed-in user, so that call site sets
`illustrated={false}`.

---

## 6. Definition of done

- [ ] 21 images generated, at the exact paths and sizes in §3.
- [ ] `assets/` totals under 2.5 MB.
- [ ] **No text inside any generated image.** Check every one.
- [ ] Children depicted are Indian, in Indian school uniform, meaningfully varied.
- [ ] The four placeholder onboarding steps use an illustration; `<Art>` is
      deleted; `how` and `rhythm` are untouched in `git diff`.
- [ ] Every image has alt text in `src/strings.ts`, or is explicitly marked
      decorative and hidden from screen readers.
- [ ] All eight animations in §4 implemented with built-in `Animated`, using
      `motion.*` tokens, each gated on `useReducedMotion()`.
- [ ] `npx tsc --noEmit` — clean.
- [ ] `npm test` — 17 passing.
- [ ] `APP_VARIANT=parent npx expo export --platform android` — succeeds.
- [ ] `APP_VARIANT=staff npx expo export --platform android` — succeeds.
- [ ] `src/tracker.ts` shows **zero** changes in `git diff`.
- [ ] `DESIGN.md` updated: the new artwork inventory, and the motion decisions.

---

## 7. Do not

- Do not redesign screens, change navigation, or move things between tabs. The
  information architecture was decided deliberately and is documented in
  `DESIGN.md`.
- Do not touch `src/tracker.ts`, `src/api.ts`, `src/socket.ts`, or
  `src/brand.tsx`.
- Do not add a second screen calling `useTripTracker`.
- Do not change any endpoint path, request body, or expected response field.
- Do not add `lottie-react-native` or `moti`.
- Do not put text in images.
- Do not animate anything inside the map WebView.
- Do not replace initials with an illustrated avatar when a real `photoUrl`
  exists.
- Do not commit anything to `git` unless asked. Leave the changes in the
  working tree.

---

## 8. Context worth having

- `DESIGN.md` in this folder documents the design system, the tokens, the
  component inventory, the navigation decision for every role, and what was
  deliberately left undone. **Read it first.**
- `REDESIGN-PROMPT.md` is the original brief the current UI was built against.
  Useful for understanding *why* things are as they are.
- `src/strings.ts` is every user-facing string, grouped by screen.
- `src/theme.ts` is every token — colour, spacing, type scale, radii,
  elevation, motion.
- `src/ui.tsx` is the component library. Thirty-odd exports. Check it before
  building anything new; most of what you need is already there.
