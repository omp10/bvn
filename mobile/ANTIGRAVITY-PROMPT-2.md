# BalVahini mobile — round two: fix, finish, and make it feel professional

Paste this whole file as the task. Read `ANTIGRAVITY-PROMPT.md` first — its
constraints all still apply and are not repeated here.

The artwork and motion round landed. This round is about the gap between
"the features are there" and "this looks like a product someone pays for."

There are three parts, in priority order:

1. **Fix what is broken or unfinished** (§2) — small, specific, verifiable.
2. **Regenerate the child avatars** (§3) — the one asset that is still wrong.
3. **Make the two dashboards feel like a professional tracking product** (§4)
   — the actual design work.

---

## 1. Read this first: what went wrong last round

Both previous passes reported all four checks green and both shipped a visible
break. `tsc`, `npm test` and `expo export` prove the code compiles and bundles.
They prove nothing about what renders. Assume you are wrong until you have
looked at a pixel.

**Three specific failures. Do not repeat them.**

### 1.1 Hooks below an early return crashed the driver's main screen

Four hooks were added *after* the `if (loading) return` in `DriverTrip.tsx`. The
first render called four fewer hooks than the second — React error #310, and
the Trip tab crashed on every launch. It is the primary screen of the staff app.

**Rule:** every `useState`, `useEffect`, `useRef`, `useMemo` and every custom
hook goes at the top of the component, above every `return`. No exceptions. If
you add motion to a component that has an early return, the hook goes above it.

### 1.2 Every generated PNG had an opaque black background

17 files, 0% transparent pixels. Avatars rendered as black circles, empty states
as black squares. Verify with the A5 snippet in the first brief. A correct file
is 30–80% `alpha = 0`.

### 1.3 An asset "optimisation" pass flattened the alpha channel

Chasing a size target, a 256-colour lossy quantiser was run across `assets/`,
including files that were never in scope. It took
`android-icon-foreground.png` from 79.9% transparent to 0% — which turns the
Android launcher icon from the shield into a solid square.

**Never touch** `assets/icon.png`, `assets/splash-icon.png`,
`assets/android-icon-foreground.png`, `assets/android-icon-monochrome.png`,
`assets/favicon.png`. **There is no size budget.** The APK is ~110 MB of mostly
native code; artwork is noise.

---

## 2. Fix these first

### 2.1 `no-route.png` is generated but never used

`assets/empty/no-route.png` exists and nothing imports it. The empty state it
was drawn for is in `src/screens/DriverLive.tsx` — the "no route to show" case.
Pass it as the `art` prop, the way the other seven already are:

```tsx
<EmptyState art={require("../../assets/empty/no-route.png")} title={...} hint={...} />
```

Then confirm nothing else in `assets/` is orphaned:

```bash
for f in assets/empty/*.png assets/avatars/*.png assets/onboarding/*.jpg; do
  grep -rq "$(basename $f)" src/ || echo "UNUSED: $f"
done
```

### 2.2 Check every image renders at a sensible size

The four onboarding illustrations shipped with their subject filling only
32–40% of the frame, against 86% for the ones that came with the designs — so
they drew at half the size with empty bands above and below. That has been
fixed by recropping, but **check any image you add or regenerate**:

```python
from PIL import Image, ImageChops
import glob, os
for f in sorted(glob.glob("assets/onboarding/*.jpg")):
    im = Image.open(f).convert("RGB"); w,h = im.size
    bg = Image.new("RGB", im.size, im.getpixel((2,2)))
    bb = ImageChops.difference(im,bg).convert("L").point(lambda p: 255 if p>18 else 0).getbbox()
    print(os.path.basename(f), f"{100*(bb[2]-bb[0])/w:.0f}% of width")   # want >= 80
```

### 2.3 The driver's Trip screen has no hero

Every other dashboard in the app opens on a gradient `Shield` hero — the
parent's home, the desk overview. The driver's opens on a plain white card with
a bus icon in a rounded square. It is the flattest screen in either app and it
belongs to the person who stares at it most.

See §4.2 — this is the single biggest visual win available.

---

## 3. Regenerate the eight child avatars

**§A3 of `ANTIGRAVITY-PROMPT.md` has the full spec. Follow it exactly.** The
short version of why they are being redone:

- They came back as crude flat geometry — a circle for a head, a triangle for a
  torso. The app wants **photorealistic** or a high-quality 3D character render,
  because these sit directly beside **real uploaded student photographs** in the
  roster. A photoreal stand-in blends into that row; a cartoon does not.
- **Head and upper chest only.** The reference is full body; an avatar renders
  in a circle as small as 24 px, where a full figure is an unreadable smudge.
- **512 × 512, RGBA, real transparency.** If your generator cannot emit
  transparency, use **pure white** — never black, which is indistinguishable
  from Indian children's hair and destroyed the last set.

Run the A5 alpha check on all eight before you call this done.

---

## 4. Make it feel like a professional tracking product

This is the part that needs judgement rather than instruction-following. Read
the whole section before changing anything.

### What "professional tracking product" means here

Look at what a good delivery or ride-hailing app does while you wait. It is not
decoration — it is **the screen continuously answering the question you opened
it to ask**, so you never wonder whether it is still working:

- The thing you are tracking is always visibly *live* — something is moving,
  ticking, or updating, so silence never reads as failure.
- The single most important number is unmistakably the largest thing on screen.
- Progress is shown spatially, not just numerically. "3 stops away" is a fact;
  a route line with three dots left is an *answer*.
- State changes are narrated, not just re-rendered.
- Everything else is quiet. One loud thing per screen.

**The trap to avoid:** this is a safety app for anxious parents and for drivers
in bright sunlight. Do not reach for glassmorphism, heavy blurs, dark
translucent panels, neon, or busy gradients. "Professional" here means
*confident and calm*, not *decorated*. If a driver squints, you have failed.

### 4.1 Parent home — `src/screens/ParentHome.tsx`

The hero is good: the ETA is `role="display"` on the shield gradient with the
drifting `ambient` layer behind it. Build on it, do not replace it.

- **Make the wait legible.** Below the ETA, show the journey as a compact
  horizontal progress line: stops as dots, the bus as a marker between them,
  the child's stop marked distinctly. `Timeline` in `ui.tsx` does this
  vertically already — a horizontal variant belongs next to it.
- **Give the map preview presence.** It is currently a bare card. Give it a
  header strip with a live dot, the last-updated stamp, and a clear affordance
  that tapping opens it full screen.
- **Make the three states genuinely distinct.** Before the trip, during it, and
  after it are different screens wearing the same clothes. During is loud and
  live; before is calm and informational; after is a summary that settles.
- **The stale-GPS case must never look like the healthy case.** It already says
  so in words. Give it a visual difference too — the live dot stops pulsing and
  the hero loses its motion. Silence should look like silence.

### 4.2 Driver trip — `src/screens/DriverTrip.tsx`

The biggest gap in the app. Currently: a white card, three stat tiles, a GPS
panel.

- **Give it a `Shield ambient` hero**, like every other dashboard. Put the bus
  number and the trip state in it. When a trip is running, the hero *is* the
  status — "Sharing location, last fix 4 seconds ago" belongs there in a size
  readable at arm's length, not in a panel below the fold.
- **One loud thing.** Before a trip that is the start button. During a trip it
  is the GPS health. Never both.
- **The emergency action must be impossible to hit by accident and impossible
  to miss in a crisis.** Check what is there now and make it true.
- Sunlight is the design constraint. High contrast, large type, generous
  targets. Nothing subtle.

### 4.3 Consistency pass across every screen

- Same gutter, same card radius, same vertical rhythm. All from `theme.ts`
  tokens — no bare numbers.
- Every `EmptyState` renders its art at the same size.
- Section headers used consistently, or not at all.
- One elevation level per surface type; do not mix borders and shadows
  arbitrarily.

### 4.4 What not to do

- Do not restructure navigation. The IA is documented in `DESIGN.md` and was
  decided deliberately.
- Do not add a charting or animation library.
- Do not touch `src/tracker.ts`, and do not add a second `useTripTracker`.
- Do not change any API request or response shape.
- Do not make anything smaller to fit more in. Density is not sophistication.

---

## 5. Definition of done

- [ ] `no-route.png` wired into `DriverLive`; the orphan check reports nothing.
- [ ] Eight avatars regenerated per §A3, photoreal, head-and-chest, and the
      alpha check passes on all eight.
- [ ] Every onboarding image ≥ 80% subject width.
- [ ] Driver trip screen has a `Shield ambient` hero.
- [ ] Parent home shows journey progress spatially.
- [ ] Stale GPS is visually distinct from healthy GPS on both screens.
- [ ] **Every hook above every early return.** Grep each file you touched.
- [ ] Identity assets in `assets/` byte-identical to before you started:
      `git diff --stat assets/icon.png assets/splash-icon.png assets/android-icon-*.png assets/favicon.png`
      must be empty.
- [ ] `npx tsc --noEmit` clean · `npm test` 17 passing · both variants export.
- [ ] `git diff src/tracker.ts` empty.
- [ ] `DESIGN.md` updated.

## 6. And then actually look at it

Every previous round passed all four checks and still shipped something
visibly broken. Before you report done, render the screens you changed and
**look at them** — a screenshot, a dev build, whatever you have. Specifically
confirm:

- avatars are faces, not black circles
- empty-state art is artwork, not black squares
- the launcher icon is still the shield, not a solid square
- the driver's hero is readable at arm's length

If you cannot render anything, say so plainly in your report rather than
implying visual verification you did not do.
