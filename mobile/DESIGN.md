# BalVahini mobile — design system and IA

What the redesign decided, where it lives, and what it deliberately did not do.

Everything here is in `src/theme.ts` (tokens), `src/ui.tsx` (components) and
`src/strings.ts` (copy). Screens compose those three and own nothing else.

---

## 1. Tokens — `src/theme.ts`

### Type

Six named roles. Sizes are unscaled points; line heights are explicit so a
larger system font grows the text without collapsing the leading.

| Role | Size / line height | Weight | Used for |
|---|---|---|---|
| `display` | 48 / 52 | 800 | The one number a screen exists for — the parent's ETA, the fleet's buses-out |
| `title` | 24 / 30 | 800 | Screen headline, hero name, bus number |
| `heading` | 17 / 23 | 700 | Card titles, row titles that carry weight |
| `body` | 15 / 21 | 400 | Prose, list row titles |
| `label` | 13 / 18 | 600 | Field labels, secondary rows, metadata |
| `caption` | 11 / 15 | 500 | Timestamps, counts, section headers |

`<T role="body">` is the API. `size`/`weight` still override, so screens that
predate the scale keep working — that is why the migration could be a card at a
time rather than one commit that touches everything.

**Font scaling** is capped at **130%** (`MAX_FONT_SCALE`), applied by `T` and
`Field` via `maxFontSizeMultiplier`. 130% is the brief's floor and what the
layouts are built for; above it a driver's stat tiles shear apart and the number
they need becomes unreadable rather than merely large. Nothing sets a fixed
height on a box containing text — `minHeight` throughout.

### Spacing

`space(n) = n * 4`. Every gap in the app is `space(n)`, never a bare number.
`GUTTER = space(4)` (16px) is the screen margin, matching the design.

### Colour

The palette is unchanged — it is lifted from the web app's `index.css` and the
Stitch designs use the same hexes. What is new is a semantic layer, `tone`:

`surface` · `surfaceRaised` · `surfaceSunken` · `textPrimary` · `textSecondary`
· `textMuted` · `textOnDark` · `textOnDarkMuted` · `border` · `borderStrong` ·
`success` / `successTint` · `warning` / `warningTint` · `danger` / `dangerTint`

`brand` is deliberately **not** in `tone`. It is per-school and comes from
`useBrand()`; a static token would be a second source of truth that quietly
ignores the school's colour.

**Per-school branding.** Only the primary button, the shield gradient, the
active tab, selected chips and tinted wells take the school's hue. Danger stays
red regardless — a delete button that turned green because a school picked green
is a hazard, not a theme. The neutral greys never move, which is what keeps an
arbitrary (or ugly) brand hue legible.

### Elevation, radii, motion

Three elevations (`flat`, `raised`, `floating`), and mostly the border does the
work — a screen full of drop shadows reads as noise and costs more to render on
Android. Three radii (`sm 8`, `md 12`, `card 14`) plus `lg 18` for sheets and
`pill`.

Motion is `fast 120` / `base 200` / `slow 320` / `pulse 2000`. `useReducedMotion()`
is honoured by `Enter`, `LiveDot` and `Skeleton` — under reduce-motion they
render their final state and start no animation loop at all.

### Dark mode — no, and why

`userInterfaceStyle` stays `"light"`.

- `brand.tsx` mixes a school's whole shade scale from one colour on the
  assumption of light surfaces. A dark mode means a second mixer, and a school
  that picks a dark blue has no contrast left in either direction.
- The map is CARTO Positron in a WebView. There is no dark tile style
  configured, and a light map inside a dark app is worse than a light app.
- The driver's phone is in a cradle in direct sun. Maximum brightness and
  maximum contrast is the correct answer there, and it is the same answer for a
  parent glancing at a phone on a kitchen counter at 07:15.

Revisit if a school asks. It is a token-layer change, not a rewrite — that is
what `tone` is for.

---

## 2. Components — `src/ui.tsx`

**Text and structure** — `T`, `Muted`, `SectionHeader`, `Card`, `Divider`,
`Screen`.

**Action** — `Button` (`primary` · `secondary` · `success` · `danger` ·
`dangerOutline` · `ghost`; `sm/md/lg` at 44/50/60pt minimum height), `Field`
(with `prefix`, `reveal`, and `error` for server validation shown against the
field it names), `Chip`, `Modal`, `Confirm`.

**Status** — `Badge`, `LiveDot`, `Alert`, `OfflineBanner`, `IconChip`, `Avatar`,
`StatTile`, `ListRow`, `Timeline`, `Dots`, `CheckLine`.

**States** — `Loading`, `Skeleton`, `SkeletonRow`, `EmptyState` (takes an
`action`, so it can say what to do next rather than "no data"), `ErrorState`.

**Motion** — `Enter`, `useReducedMotion`, `tick`.

### Haptics without a native module

`tick()` is React Native's own `Vibration`, not `expo-haptics`. The buzz a
driver feels through a phone in a cradle is the same, it adds no native module
to either APK, and it costs one line in the permission list. Fired on marking a
child, bulk marking, trip start/end, and the emergency send.

### The offline banner

`useOnline()` lives in `src/api.ts` and is derived from real request outcomes —
a failed fetch flips it false, any success flips it true. Not NetInfo: a phone
on a bus holds full signal behind a captive portal, and "is there a network" is
not the question any screen is asking. It also means no native module in the
parent app for one banner. `Screen` mounts the banner, so every screen has it.

---

## 3. Information architecture

**Rules applied:** at most five tabs, four preferred. Labels always visible.
Every tab is a noun someone would say out loud. Secondary destinations are
pushed from a tab, not given one.

| Role | Before | After |
|---|---|---|
| Parent | Home · History · Alerts · Profile | **Home · History · Profile** |
| **Driver** | **Trip · Students · Live · History · Alerts · Profile** | **Trip · Students · Map · Profile** |
| Attendant | Roster · Alerts · Profile | **Roster · Profile** |
| School admin | Overview · Live · Alerts · Profile | **Today · Live · Profile** |
| Fleet owner | Overview · Vehicles · Alerts · Profile | **Overview · Vehicles · Profile** |
| Super admin | Platform · Alerts · Profile | **Platform · Profile** |

### Where each destination went, and why

**Alerts → header bell, every role.** It is somewhere people *arrive* from a
notification, not somewhere they navigate on purpose, and it was costing every
role a tab slot. The bell shows a count, not just a dot — a red dot says
something happened and nothing about whether it matters. Notification taps push
the Alerts screen, which is now one route for every role instead of a per-role
tab index.

**Driver's History → Profile.** Nobody opens last week's trips mid-shift. It is
a row in the account screen, with a subtitle saying what it holds.

**Parent's History stays a tab.** A parent's history is a weekly habit — "was
she on the bus on Thursday" — not an archive. It earns its slot.

**Driver's Live → the Map tab.** Trip and Live were the same job at two zoom
levels. Trip keeps a compact map preview while a trip runs; Map is the whole
route, the trail and the stop list. The two-tab split stayed because a driver
does genuinely switch between "what do I do next" and "where am I".

**Two-tab bars** (attendant, super admin) are left as two tabs. Padding a bar
with a destination nobody asked for is worse than a short one.

### The active trip

A running trip changes the Trip screen from a decision surface to a status one,
and puts a floating SOS above the tab bar that stays there while the driver
scrolls. That is deliberate: the emergency control cannot be something you have
to scroll to find.

**On the emergency button.** The brief asks for something impossible to hit by
accident and impossible to miss in a crisis. Those pull in opposite directions,
so they are solved separately: the FAB handles "impossible to miss" — same
corner, all day, red, 68pt. It only *opens* the sheet. Sending still requires
choosing a type and pressing a red button inside it, so a knee against the phone
costs a dismissed sheet, not a false alarm to sixty parents. The two-step is the
guard; making the FAB itself hard to press would have hurt the crisis case to
protect the accident case.

---

## 4. Onboarding — `src/screens/Onboarding.tsx`

Skippable but not hidden. Completion is persisted in AsyncStorage under
versioned keys (`bv_onboarded_v1`, `bv_onboarded_role_v1`) — not SecureStore,
because "has seen the welcome" is not a secret. A storage failure is treated as
"already seen", so a broken read never locks anyone out of their own app.

**Parent, before sign-in (4):** welcome → how it works → **where to find your
school code** → notification primer. The third screen earns its place: it is
the single biggest drop-off point, so it draws the circular the code is actually
printed on, with the code ringed and a QR beside it.

**Staff, before sign-in (1):** who the app is for. Everything else needs to know
the role, which needs a session.

**After sign-in, by role.** Driver gets the two screens that prevent the field
failures: why location is needed *all the time* (with what is and is not shared,
before the system dialog), and the battery-optimisation exemption — which reads
the manufacturer off `expo-device` and says "your phone is a Xiaomi, so this
step matters" when it is one of the ones that kill background services.
Attendant gets one screen on marking. Desk roles get one screen saying the phone
is the read-only view.

Every permission screen explains *then* asks. On Android a cold dialog is how
you earn a permanent denial, and there is no second chance at it.

The whole thing replays from **Profile → How the app works**, because drivers
change and phones get replaced.

---

## 5. Copy — `src/strings.ts`

One nested object, typed. Hindi and Marathi are coming; adding them is a second
object and a locale switch rather than a hunt through seventeen screens.

It is not i18next. A plain object means TypeScript catches
`str.parent.busNotStarrted` at build time, which a string-key `t("...")` never
does, and the runtime is zero lines. Interpolation is a function on the object.
Nothing is padded to a fixed width, so a string 40% longer still fits.

---

## 6. What was deliberately not done

- **Bespoke illustrations.** None were drawn. The four that exist are the ones
  generated alongside the designs — see §6b.
- **A Language row in Profile.** Only English ships. A settings row that opens
  nothing is worse than no row; it goes in with the second locale.
- **Undo on an attendance mark.** There is no endpoint that removes one. The
  status sheet can add a different event, which is what the data model supports.
- **Per-stop bulk marking** ("mark all at this stop", as the design shows).
  Bulk marks the *filtered* list instead, which is strictly more general —
  filter, then mark all — and reuses the search and filter chips that were
  already there.
- **Dark mode.** §1.
- **A native map.** `react-native-maps` on Android is Google Maps, which is an
  API key and a billing account. `BusMap`'s props are the whole contract if that
  ever changes.
**One backend change was made**, deliberately and additively: `publicUser` in
`auth.service.ts` now projects `photoUrl`. The office could already set it —
`/uploads/people/:id/photo` writes it and `/people` accepts it — but it was
never sent, so the phone apps had a photo on file and no way to know. Adding a
field cannot break the web app, which reads the fields it names; both
typecheck, and the backend's 19 tests still pass. **It needs deploying before
Profile shows anything but initials.**

## 6b. Onboarding illustrations

Four of the seven onboarding screens carry a bundled illustration, taken from
the ones generated with the designs and living in `assets/onboarding`:

| Screen | Asset | |
|---|---|---|
| Parent welcome | `parent-welcome.jpg` | 94 KB |
| Where is my school code | `school-code.jpg` | 69 KB |
| Staff welcome | `staff-welcome.jpg` | 98 KB |
| Driver location primer | `location.jpg` | 35 KB |

The other three — how it works, notifications, battery — were designed as icon
rows and had no illustration to take; they use the app's own stroke set at
display size in a tinted well.

Notes on how they are handled:

- **Bundled, not fetched.** Onboarding is the first thing a new install shows,
  and a parent on a bad connection should not be judging the app by four grey
  rectangles. Under 300 KB for all four.
- **Downloaded at `=w1200`.** The default the design tool serves is 512px wide,
  which is visibly soft upscaled to full width; the native maximum is 1408.
  1200 covers a 3× phone with no meaningful size cost.
- **`staff-welcome.jpg` was cropped.** It shipped with the words "Staff Welcome"
  rendered *into* the image — a screen title baked into the artwork. It would
  have duplicated the real headline and could never be translated, so the title
  band is cropped off.
- **Aspect ratio is read off the asset** at render time rather than written into
  the stylesheet, so recropping an image cannot silently letterbox or stretch
  it.
- **They are described, not decorative.** Each has alt text in `strings.ts` —
  the circular especially, since it is a picture of the thing the parent is
  hunting for.

Two things to know about them. They are fixed-palette raster art, so they do not
follow a school's brand hue the way every other surface does — acceptable
because they sit on white, on onboarding only, and nowhere else in the app.
And the circular shows "ACADEMIC YEAR 2024/2025" and a placeholder web address
in small print; it reads as an illustration rather than a claim, but it will
want regenerating eventually.

## 6a. Dynamic values

Nothing user-visible is a literal where the data exists to make it real:

- **Photos** resolve through `assetUrl` **inside `Avatar`**, so every caller is
  correct by construction. The API sends `/uploads/…`; `Image` needs an origin,
  and passing the raw path silently rendered a blank circle. Covers students
  (roster, child switcher, parent hero) and, once the backend above ships, the
  signed-in person on Profile.
- **App name** comes from `useBrand().appName` on the sign-in header, the staff
  welcome screen and the overview hero — so a school that has set its own name
  sees it, not ours.
- **Helpline and school office** in Profile come from
  `/parent/emergency-contacts` for parents, who have that endpoint. `112` is
  India's single emergency number and a genuine constant, so it is the fallback
  rather than a setting — but the endpoint wins when it answers.
- **Departure time** on the driver's tile is the first stop's `pickupTime`;
  **scheduled arrival** on the parent's stop card is their own stop's.
- The only literal `"BalVahini"` left in the app is the default in
  `brand.tsx`, which is what a school overrides.

## 7. Verification

```bash
npx tsc --noEmit -p tsconfig.json
npm test
APP_VARIANT=parent npx expo export --platform android
APP_VARIANT=staff  npx expo export --platform android
npx expo-doctor
```

All pass. `expo-doctor` reports eight `expo-*` packages behind their SDK 57
patch versions — that predates this work and was left alone rather than bundling
a dependency bump into a redesign.
