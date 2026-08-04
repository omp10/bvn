# BalVahini web

React + Vite + TypeScript + Tailwind v4. Talks to the API in `../backend`.

```bash
npm install
npm run dev      # http://localhost:5174, proxies /api and /socket.io to :4000
```

Start the API first (`cd ../backend && npm run dev`), and seed it — `npm run seed`
there prints the demo logins for all six roles.

## The logo

`public/logo.png` is the supplied artwork — the full lockup: shield, wordmark,
tagline and badges. `src/components/Logo.tsx` uses it two ways:

- **`LogoMark`** crops the shield out of the lockup with CSS, for headers and
  the sidebar. Without the crop you get a squashed illegible square beside a
  second copy of the wordmark. The crop window is measured from the artwork
  (x 120–400, y 20–300 of its 500×500 canvas) — re-measure it if the file is
  replaced with a differently composed one.
- **`LogoFull`** shows it whole, on light backgrounds only: its navy tagline has
  no contrast against the brand gradient.

Both fall back to a hand-drawn SVG if the file is missing.

The palette in `src/index.css` is taken from the mark: `brand` is the blue hand,
`leaf` the green one, `sun` the sunrise behind the bus. Each school can override
its own accent through its branding colour.

## One URL space per role

A link is always unambiguous about who it is for.

| Space | Role | Screens |
|---|---|---|
| `/admin` | Platform admin | overview, schools, school detail, subscriptions, vehicle requests, reports |
| `/school` | School office | today, live buses, buses, drivers, attendants, routes & stops, students, route requests, alerts, reports |
| `/fleet` | Fleet owner | overview, vehicles, drivers |
| `/driver` | Driver | today's trip, history |
| `/attendant` | Bus attendant | roster and attendance |
| `/parent` | Parent | track, history, alerts |
| `/login`, `/parent/login`, `/join/:code` | — | staff sign-in, parent school-code sign-in, QR landing |

Signing in lands you at your own home. Visiting another role's URL bounces you
back to yours rather than showing an error.

## Two shells, on purpose

Admin, school office and fleet owner sit at a computer all day, so they get a
sidebar (`DeskShell`). Drivers, attendants and parents are on a phone — often on
a moving bus — so they get big targets and thumb-reachable tabs (`PhoneShell`).

## Packaging as an APK (phase 2)

The plan is a Flutter WebView around this app, so two things must be granted in
the WebView or location silently never starts:

- Android: handle `onGeolocationPermissionsShowPrompt` and grant it, plus
  `ACCESS_FINE_LOCATION` in the manifest.
- Serve over **HTTPS** — `navigator.geolocation` is refused on plain HTTP for
  any origin other than localhost.

## Notes

- **Auth**: 15-minute access token with a refresh token. `src/lib/api.ts` retries
  a 401 once through a shared refresh, so ten parallel calls trigger one refresh
  rather than ten competing rotations.
- **Live updates arrive over Socket.IO.** Screens still poll every 30s purely as
  a safety net for a dropped connection. A client never names the room it joins —
  the server checks that this parent has a child on that bus before accepting.
- **Maps are Leaflet + OpenStreetMap**, not Google: no API key, no billing, and
  it satisfies "parents can see the bus on a map" today. Swap the `TileLayer` in
  `BusMap.tsx` for the Google provider when a key exists; nothing else changes.
- **The driver streams GPS from the browser** (`lib/tracker.ts`) — buffered to
  localStorage, flushed in batches, surviving tunnels and reloads. It is a
  *foreground* tracker: browsers and WebViews throttle a hidden tab, so the
  driver must keep the screen on. A screen wake lock is requested automatically.
  True background tracking needs a native foreground service — phase 2.
- **`useQuery` is ~30 lines instead of TanStack Query** — these screens load once
  and show. Swap it in when cross-screen cache invalidation starts to hurt.
