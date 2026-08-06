# BalVahini mobile

Two Android apps, one Expo codebase.

| App | Who signs in | Package |
|---|---|---|
| **BalVahini Parent** | parents (school code → OTP) | `com.balvahini.parent` |
| **BalVahini Staff** | drivers and attendants (mobile → password) | `com.balvahini.staff` |

`APP_VARIANT` picks which one a build is. `app.config.js` turns it into the app
name, package id, icon colour and Android permission list; everything
role-specific in the source keys off `extra.variant`. A second project would
have meant maintaining two copies of the API client forever.

## Why an APK at all

The web app already runs on a phone. One thing it cannot do is keep reporting
the bus position with the screen off — a browser suspends timers the moment the
tab is hidden, so the driver has to keep staring at it. `src/tracker.ts` runs an
Android **foreground service** through `expo-location`, which survives a locked
screen and a backgrounded app. That, plus real push, is the whole reason these
exist.

## Running it

The API and web app come up as usual (see the root README). Then:

```bash
cd mobile && npm install
```

```bash
npm start
```

```bash
npm run start:staff
```

`10.0.2.2` is how the Android emulator reaches `localhost` on the host, and it
is the default `EXPO_PUBLIC_API_URL`. **On a real phone that address is wrong** —
point it at your machine's LAN address instead:

```bash
EXPO_PUBLIC_API_URL=http://192.168.1.5:4000 npm start
```

Push notifications and the driver's foreground service do not work in Expo Go.
Build a development or preview APK to exercise either.

## Building the APKs

Both go through EAS, so no local Android SDK is needed:

```bash
npx eas login
```

```bash
npx eas init
```

```bash
npm run build:parent
```

```bash
npm run build:staff
```

Each finishes with a download link for an installable APK. Two things to set
before a real release:

1. **`EXPO_PUBLIC_API_URL` in `eas.json`.** The `parent`/`staff` profiles point
   at the emulator loopback, which is right for testing and useless on a
   handset. The `-prod` profiles carry `https://YOUR_DOMAIN` — substitute the
   real domain there, the same one `deploy/nginx.conf` serves. It must be HTTPS:
   Android blocks cleartext traffic by default.
2. **An FCM key on the Expo project** (`eas credentials` → Android → *Push
   Notifications*). Without it a standalone build gets a push token but never
   receives anything, which looks exactly like the server not sending.

## How the pieces map to the API

Nothing new was added to the backend for these apps except actually sending the
push that `notify()` had always been stubbing.

| Screen | Endpoint |
|---|---|
| Parent sign-in | `POST /auth/parent/request-otp`, `/auth/parent/verify` |
| Staff sign-in | `POST /auth/login` |
| Parent home | `GET /parent/children`, `/parent/children/:id/live` |
| Parent history | `GET /parent/children/:id/history` |
| Route change | `GET /parent/routes`, `POST /parent/children/:id/route-change` |
| Driver trip | `GET /driver/my-bus`, `POST /driver/trips/start`, `/trips/:id/end` |
| Position stream | `POST /driver/trips/:id/positions` (batched) |
| Attendant roster | `GET /staff/attendance/roster`, `POST /staff/attendance` |
| Emergency | `POST /emergencies` |
| Alerts | `GET /notifications`, `POST /notifications/read-all` |
| Push registration | `POST /auth/push-token` |

Live positions arrive over the same Socket.IO rooms the web app uses; the poll
behind them is a safety net for a dropped connection, not the primary path.

## Things deliberately left out

- **Maps are Leaflet in a WebView**, not `react-native-maps` — on Android that
  is Google Maps, which needs an API key and a billing account before one parent
  sees one bus. Swap it when a key exists; `src/BusMap.tsx` props are the whole
  contract.
- **Push goes through Expo's relay**, not straight to FCM. `sendPush` in
  `backend/src/modules/notifications/push.ts` is the single seam if that changes.
- **No offline cache of the roster.** An attendant with no signal sees the last
  loaded list and marks queue as failed requests rather than silently.
- **No iOS build.** The config is there; nobody has run it on a Mac.
- **Per-app icon art.** Both apps ship the same mark on a different background
  colour — blue for parents, green for staff.
