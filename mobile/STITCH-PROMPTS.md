# BalVahini — Google Stitch prompts

Stitch generates one screen per prompt. Paste the **Style preamble** at the top
of every prompt, then the screen block under it. Generate in the order given —
the earlier screens set the visual language for the later ones.

Mode: **Mobile**. Use Standard mode for most screens; save Experimental for the
Parent Home and Driver Trip screens, which carry the most hierarchy.

---

## Style preamble — paste at the top of EVERY prompt

> A premium mobile app for Indian school bus tracking called BalVahini.
> Design language: calm, trustworthy, safety-focused, warm rather than corporate.
> The clarity of a modern banking app with a softer, more human palette.
> Colours: deep blue #1155A5 as primary, fresh green #368A29 as secondary,
> warm yellow #F0AC00 as accent used sparingly, near-white #F8FAFC background,
> pure white cards, slate grey #64748B for secondary text.
> Generous white space, 16px screen margins, 14px rounded corners, soft shadows.
> Clean geometric sans-serif. Strong type hierarchy — one clear focal number or
> headline per screen, everything else visibly quieter.
> Light mode. Rounded stroke icons, consistent 2px weight. Large touch targets.
> No clutter, no dense tables, no more than five bottom tabs.

---

# PARENT APP

## P1 — Onboarding: welcome

> First screen a parent sees after installing. Full-bleed illustration in the top
> two thirds: a cheerful yellow school bus on a curved road with a smiling child
> waving, in a friendly flat vector style using the brand blue and green.
> Below it, a bold headline "Know your child is safe, every journey" and one line
> of supporting text. A full-width primary blue button "Get started" and a quiet
> text link "I already have an account". Three small page dots above the button
> showing this is step 1 of 3.

## P2 — Onboarding: how it works

> Onboarding step 2 of 3. Headline "How BalVahini works". Three vertically
> stacked steps, each a horizontal row with a large soft-tinted circular icon on
> the left and two lines of text on the right:
> 1) blue bus icon — "The bus reports its position while the trip runs"
> 2) green map pin icon — "You watch it approach your stop, live"
> 3) yellow bell icon — "You are told the moment your child boards and gets off"
> Thin vertical connector line linking the three icons. Full-width primary button
> "Next" at the bottom with page dots.

## P3 — Onboarding: find your school code

> Onboarding step 3 of 3, explaining where to find a school code. Headline
> "Where is my school code?". Centre of the screen shows an illustrated school
> circular — a sheet of paper at a slight angle with a highlighted six-character
> code "ABC123" circled in yellow marker, and a QR code printed beside it.
> Supporting text: "Your school prints a six-character code on its circular. You
> can also scan the QR code instead of typing it."
> Two buttons: primary "Enter my code", secondary outlined "Scan QR code".

## P4 — Onboarding: notification permission primer

> A permission explanation screen shown before the system dialog. Centred large
> circular icon of a bell with a soft blue halo. Headline "Never miss the bus".
> Body text listing three things they will be told, each with a small green check
> icon: "when the bus is near your stop", "when your child boards", "when your
> child is dropped off". Full-width primary button "Allow notifications" and a
> quiet text link "Maybe later".

## P5 — Parent sign in: school code

> Sign-in screen. Top third is a deep blue to green diagonal gradient panel with
> a white shield-and-bus logo centred and the word BalVahini beneath it. The
> lower two thirds is a white card with rounded top corners overlapping the
> gradient. Inside: heading "Track your child's bus", one line of help text, a
> large six-character code input with wide letter spacing and uppercase
> placeholder "ABC123", a mobile number field with a +91 prefix, a full-width
> primary button "Send OTP", and an outlined button "Scan the school QR code".

## P6 — Parent sign in: OTP

> OTP verification screen, same gradient header and white card layout. At the top
> of the card, a small row showing the school's circular logo, the school name in
> bold, and "School code 4UHYYE" in grey beneath. Heading "Enter the OTP", help
> text "Sent to 91111 00004". Six large individual digit boxes evenly spaced.
> Full-width primary button "Verify and continue" and a quiet centred text link
> "Change number or school code".

## P7 — Parent home: bus not started (MOST IMPORTANT)

> The parent's main screen before the morning trip begins. Compact top bar with a
> small school logo and school name on the left and a bell icon with a red dot on
> the right. Below, a large hero card with a deep blue to green diagonal gradient
> and rounded corners: a child's circular avatar, her name "Isha Deshmukh" in
> bold white, "Class 3-B · Bus 1" beneath, and centred in the card a calm message
> "The bus has not started yet" with a small clock icon and "Expected 07:10".
> Below the hero, a horizontally scrollable row of two child selector chips.
> Then a clean white card "Your stop" showing the stop name, the scheduled time,
> and a small static map thumbnail. Then a compact row of three circular quick
> actions with labels: Call driver, Call school, Emergency.
> Four-tab bottom navigation: Home, History, Alerts, Profile.

## P8 — Parent home: bus is live (MOST IMPORTANT)

> The same parent screen while the bus is on its way, redesigned around one
> number. Hero gradient card dominated by an enormous "8" with "min to your stop"
> beside it in smaller text, a pulsing green LIVE pill in the corner, and beneath
> it a single line "Next stop Mayur Colony · 2 stops away · 1.2 km".
> Directly below the hero, a large rounded map card filling most of the remaining
> screen: a pale light-grey map, a thick blue route line following the roads, a
> green travelled trail behind the bus, numbered green stop pins, a yellow
> starred pin for the parent's own stop, and a prominent circular blue bus marker
> with a soft pulsing halo. A small floating "expand" button in the map corner.
> A slim card under the map: circular driver photo, driver name, and a blue phone
> call button. Four-tab bottom navigation with Home active.

## P9 — Parent home: child boarded

> Same screen after the child has boarded. The hero gradient card now shows a
> large white circular check badge, "Isha is on board" in bold, and "Boarded at
> Mayur Colony · 07:18" beneath. Below, a vertical timeline with small coloured
> dots and connector line: "Trip started 07:02", "Left Anand Nagar 07:12",
> "Isha boarded 07:18" highlighted in green, and a greyed-out upcoming
> "Reaches school ~07:40". Then the map card, smaller. Four-tab bottom nav.

## P10 — Parent history

> A history screen listing the last seven days. Sticky day headers like
> "Tuesday, 5 August" in small bold uppercase grey. Under each, rounded white
> rows: a tinted circular icon on the left (blue bus for boarded, green for
> dropped, grey clock for absent), the event name in medium weight, the time in
> grey on the right, and a small coloured status pill. Generous vertical spacing,
> clear separation between days. Four-tab bottom navigation with History active.

## P11 — Parent alerts

> A notifications list. Unread items have a very light blue tinted background and
> a small blue dot on the right; read items are plain white. Each row: a tinted
> circular icon, a bold title, two lines of body text in grey, and a relative
> timestamp. One emergency notification near the top styled distinctly with a
> soft red background, a red alert triangle icon and a red left edge. A subtle
> "Mark all as read" text button pinned at the top right. Four-tab bottom nav.

---

# STAFF / DRIVER APP

## D1 — Onboarding: welcome

> Welcome screen for the driver and staff version of the app. Deep green to blue
> gradient background. Centred white shield-and-bus logo, the title
> "BalVahini Staff", and beneath it "For drivers, attendants and school offices".
> Flat vector illustration of a bus driver in uniform smiling beside a yellow
> school bus. Full-width white button "Sign in" at the bottom.

## D2 — Driver onboarding: location permission primer

> A permission explanation screen for a bus driver, shown before the Android
> dialog. Large centred illustration of a phone in a bus cradle with a glowing
> location pin above it. Headline "Keep the bus on the map". Body text: "The
> school and parents can see this bus only while a trip is running. Location is
> never shared at any other time." Three bullet rows with green check icons:
> "Works with the screen off", "Stops the moment you end the trip", "Never used
> outside trip hours". Full-width primary button "Allow all the time".

## D3 — Driver onboarding: battery optimisation

> An instructional screen warning about Android battery optimisation. Headline
> "One last step". Body: "Some phones stop apps running in the background, which
> would stop the bus reporting." A soft amber warning card with a battery icon
> listing "Xiaomi · Oppo · Vivo · Realme". Below it, three numbered instruction
> steps with small screenshots or simple diagrams showing Settings → Battery →
> Allow background activity. Full-width primary button "Open settings" and a
> quiet text link "I've done this".

## D4 — Staff sign in

> Sign-in screen for drivers and school staff. Deep green to blue gradient top
> panel with the white shield-and-bus logo. White rounded card below with:
> heading "Sign in", help text "For drivers, attendants, school staff and fleet
> owners", a mobile number field with +91 prefix, a password field with a show
> or hide eye icon, a full-width primary button "Sign in", and small grey text
> "Forgotten your password? Ask the school office."

## D5 — Driver: start of day (check in)

> A driver's home screen before the trip starts, designed to be read at arm's
> length in bright sunlight with very large touch targets.
> Top card: a large bus icon in a tinted square, "Bus 1" in large bold, the
> vehicle number "MH12 AB 1000" in grey beneath, and a grey "Not started" pill.
> Below, a row of three big tappable stat tiles with icons and large numbers:
> 42 Students, 8 Stops, 07:10 Departs.
> Then a prominent dashed-outline check-in card with a large camera icon and
> "Take your check-in photo" in bold, plus "Required before you can start".
> Then two very large stacked buttons: a blue "Start morning trip" and a green
> "Start evening trip", both currently dimmed and disabled.
> Bottom navigation with four tabs: Trip, Students, Map, Profile.

## D6 — Driver: trip running

> The driver's screen while a trip is in progress. A prominent green status card
> at the top with a pulsing dot, "Sharing location" in bold, "Last fix 4 seconds
> ago · ±8 m" beneath, and a small "12 points queued" grey pill.
> Below it a reassuring line: "The bus keeps reporting with the screen off — you
> can put the phone down."
> Then a compact live map card showing the route and the bus.
> Then a horizontal progress strip of route stops as small numbered circles with
> a connecting line, completed ones filled green, the current one highlighted
> blue, upcoming ones grey.
> At the bottom of the scroll, a very large red "End trip" button.
> A persistent floating circular red SOS button in the bottom right corner above
> the tab bar. Four-tab bottom navigation with Trip active.

## D7 — Driver: student roster

> An attendance screen for marking children on and off a bus, built for
> one-handed use on a moving vehicle.
> At the top, four compact stat tiles in a row: 28 On board (blue), 0 Dropped
> (green), 2 Absent (grey), 12 Waiting (amber).
> Below, a row of filter chips: All 42, Waiting 12, On board 28, with the active
> chip filled blue. Then a search field with a magnifier icon.
> Then a list of large child rows: circular photo, name in bold, "Class 3-B ·
> Roll 002" in grey, the pickup stop name in smaller grey text, and on the right
> a large green check button for boarding. Rows for children already boarded have
> a very light green background and a green "Boarded" pill instead of the button.
> A sticky bottom bar above the tab bar with a wide button "Mark all at this
> stop". Four-tab bottom navigation with Students active.

## D8 — Driver: live map full screen

> A full-screen live map view with no bottom navigation. A pale light-grey map
> fills the entire screen. A thick blue route line follows the roads, a green
> trail shows where the bus has been, numbered green pins mark the stops, and a
> large circular blue bus marker with a pulsing halo shows the current position.
> A floating rounded card at the bottom, partly translucent: "Nearest stop ·
> Mayur Colony" in bold, "320 m away · fix 6 seconds ago" beneath, and a small
> chevron suggesting it can be dragged up to reveal the full stop list.
> A circular close button top left and a recentre button on the right.

## D9 — Emergency sheet

> A bottom sheet modal for raising an emergency from a bus, over a dimmed
> background. A grab handle at the top, then the heading "Raise an emergency".
> Four large selectable option cards in a two-by-two grid, each with an icon and
> a label: Breakdown (wrench), Medical (cross), Accident (warning triangle),
> Other (dots). The selected card has a red border and a light red fill.
> Below, a multi-line note field with placeholder "Front tyre punctured near
> Anand Nagar". A small grey warning line: "This alerts the school office and the
> parents of every child on this bus." Two buttons at the bottom: a grey
> "Cancel" and a large red "Send alert".

## D10 — School admin: live fleet

> A school office overview screen on mobile. Top hero gradient card showing a
> large "3" with "buses out now" beside it and "12 trips today" underneath.
> Below, a grid of small stat tiles: Students picked up, Dropped, Absent, Open
> alerts (the last in amber with a small warning icon).
> Then a list of bus cards, each with a bus icon in a tinted square, the bus
> number in bold, the driver name and route in grey, a status pill on the right
> (green "Live", amber "Delayed" or grey "GPS stale"), and a small pulsing live
> dot. One card is expanded to reveal a map thumbnail inside it.
> Four-tab bottom navigation: Today, Live, Alerts, Profile.

## D11 — Profile

> An account screen. Top card: a large circular photo, the person's name in bold,
> their role "Driver" as a coloured pill, and their mobile number in grey.
> Below, a card showing the school's logo, school name and "School code 4UHYYE".
> Then a grouped settings list with rounded corners and dividers, each row an
> icon, a label and a chevron: Change password, How the app works, Language,
> Emergency helpline 112, Battery settings.
> At the bottom, a full-width outlined red "Sign out" button, and small centred
> grey text "BalVahini · Safe Journeys, Brighter Futures · v1.0.0".
> Four-tab bottom navigation with Profile active.

---

## Follow-up prompts for iterating in Stitch

Use these after a screen is generated, one at a time:

- "Make the primary number twice as large and reduce everything else."
- "Increase the spacing between cards and give the screen more breathing room."
- "Make the bottom navigation labels always visible and the icons lighter weight."
- "Make all touch targets larger — this is used by a driver in a moving bus."
- "Reduce this to a single focal element and move the rest into a secondary card."
- "Show the empty state for this screen when there is no data."
- "Show the error state when the connection has been lost."
- "Apply the same header treatment as the previous screen."
