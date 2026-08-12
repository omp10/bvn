/**
 * Every user-facing string, in one place.
 *
 * Hindi and Marathi are coming and only English ships today, so the point of
 * this file is that adding them is a second object and a locale switch rather
 * than a hunt through seventeen screens.
 *
 * ponytail: a plain nested object, not i18next. TypeScript then catches a typo
 * in `str.parent.busNotStarted` at build time, which a string-key `t("...")`
 * never does, and the whole runtime is zero lines. Interpolation is a function
 * on the object — swap the object for a locale when the translations land.
 *
 * Layouts must survive Hindi and Marathi running 30–40% longer than English:
 * nothing here is padded to a fixed width, and no caller sets a fixed height on
 * a box that holds one of these.
 */
export const str = {
  common: {
    appTagline: "Safe Journeys, Brighter Futures",
    cancel: "Cancel",
    close: "Close",
    back: "Back",
    next: "Next",
    skip: "Skip",
    done: "Done",
    retry: "Retry",
    tryAgain: "Try again",
    tryAgainHint: "Check your connection and try again.",
    somethingWrong: "That did not load",
    offline: "No connection — showing the last known information",
    notSet: "Not set",
    none: "—",
    stepOf: (step: number, total: number) => `Step ${step} of ${total}`,
    lastUpdated: (when: string) => `Updated ${when}`,
    signOut: "Sign out",
  },

  onboarding: {
    getStarted: "Get started",
    haveAccount: "I already have an account",
    maybeLater: "Maybe later",
    replayDone: "Done",

    parentWelcomeTitle: "Know your child is safe, every journey",
    parentWelcomeBody:
      "See the school bus on a live map, know when it is near your stop, and know the moment your child gets on and off.",

    howTitle: "How BalVahini works",
    howBus: "The bus reports its position while the trip runs",
    howWatch: "You watch it approach your stop, live",
    howTold: "You are told the moment your child boards and gets off",

    codeTitle: "Where is my school code?",
    codeBody:
      "Your school prints a six-character code on its circular. You can also scan the school's QR code instead of typing it.",
    codeSample: "ABC123",
    codeCircular: "School circular",
    codeQrNote: "Or scan this",
    codeNext: "Enter my code",

    notifyTitle: "Never miss the bus",
    notifyBody: "With notifications on, your phone tells you:",
    notifyNear: "when the bus is near your stop",
    notifyBoards: "when your child boards",
    notifyDropped: "when your child is dropped off",
    notifyAllow: "Allow notifications",

    staffWelcomeTitle: "BalVahini Staff",
    staffWelcomeBody: "For drivers, attendants and school offices.",
    staffWelcomeNext: "Sign in",

    locationTitle: "Keep the bus on the map",
    locationBody:
      "The school and parents can see this bus only while a trip is running. Your location is never shared at any other time.",
    locationOffScreen: "Works with the screen off",
    locationStops: "Stops the moment you end the trip",
    locationNeverElse: "Never used outside trip hours",
    locationAllow: "Allow all the time",
    locationDenied:
      "Location is still blocked. Open Settings and allow BalVahini to use location all the time, or the school will not see this bus.",

    batteryTitle: "One last step",
    batteryBody:
      "Some phones stop apps running in the background, which would stop the bus reporting even though everything else is set up correctly.",
    batteryBrands: "Xiaomi · Oppo · Vivo · Realme",
    batteryYours: (brand: string) => `Your phone is a ${brand}, so this step matters.`,
    batteryStep1: "Open Settings for BalVahini",
    batteryStep2: "Find Battery, or Battery saver",
    batteryStep3: "Choose Unrestricted, or Allow background activity",
    batteryOpen: "Open settings",
    batteryDone: "I've done this",

    rhythmTitle: "Your day, in four steps",
    rhythmCheckIn: "Take your check-in photo",
    rhythmStart: "Start the morning or evening trip",
    rhythmDrive: "Drive — put the phone down, it keeps reporting",
    rhythmEnd: "End the trip when you are finished",
    rhythmDone: "Start driving",

    attendantTitle: "Marking children on and off",
    attendantBody:
      "Tap a child to mark them boarded, and again at their stop to mark them dropped. Tapping twice by mistake is harmless — you can always change it back.",
    attendantBulk: "Mark all at a stop in one go when the whole queue gets on",
    attendantParents: "Every mark tells that child's parent straight away",
    attendantDone: "Open my roster",

    deskTitle: "Your school, from your pocket",
    deskBody:
      "This app is the read-only view: where the buses are, and what needs attention. Managing students, routes and staff stays on the web app.",
    deskDone: "Continue",
  },

  profile: {
    schoolCode: (code: string) => `School code ${code}`,
    account: "Account",
    changePassword: "Change password",
    myTrips: "My trips",
    myTripsHint: "Your last 30 trips",
    howItWorks: "How the app works",
    howItWorksHint: "Replay the introduction",
    batterySettings: "Battery settings",
    batteryHint: "Keep tracking alive in the background",
    helpline: "Emergency helpline",
    signOutTitle: "Sign out?",
    signOutDriver:
      "If a trip is running, the school will stop seeing your bus until you sign in and start it again.",
    signOutParent: "You'll need your school code and a fresh OTP to sign back in.",
    signOutStaff: "You'll need your password to sign back in.",
    staySignedIn: "Stay signed in",
    version: (v: string) => `Version ${v}`,
    currentPassword: "Current password",
    newPassword: "New password",
    newPasswordHint: "At least 6 characters",
    change: "Change",
    passwordChanged: "Password changed. Every other device has been signed out — this one stays.",
  },

  nav: {
    home: "Home",
    history: "History",
    alerts: "Alerts",
    profile: "Profile",
    trip: "Trip",
    students: "Students",
    map: "Map",
    roster: "Roster",
    today: "Today",
    live: "Live",
    overview: "Overview",
    vehicles: "Vehicles",
    platform: "Platform",
    unreadAlerts: (n: number) => (n === 1 ? "1 unread alert" : `${n} unread alerts`),
    openAlerts: "Open alerts",
  },
} as const;
