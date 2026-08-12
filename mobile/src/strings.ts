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
    showPassword: "Show password",
    hidePassword: "Hide password",
    lastUpdated: (when: string) => `Updated ${when}`,
    signOut: "Sign out",
  },

  overview: {
    needsAttention: "Needs attention",
    everythingElse: "Everything else",
    allClear: "Nothing needs your attention",
    allClearHint: "Every bus is reporting and no requests are waiting.",
    webNote: "Students, routes, salaries and reports are managed on the web app at balvahini.com.",

    tripsPlatform: "trips running across the platform",
    busesOut: (today: number) => `buses out now · ${today} trips today`,
    vehiclesOut: "of your vehicles are on the road",

    schools: "Schools",
    active: "Active",
    onTrial: "On trial",
    expired: "Expired",
    buses: "Buses",
    parents: "Parents",
    fleetOwners: "Fleet owners",
    busRequests: "Bus requests",
    revenue: "Revenue",
    students: "Students",
    drivers: "Drivers",
    pickedUp: "Picked up",
    dropped: "Dropped",
    absent: "Absent",
    withoutBus: "Without a bus",
    routeRequests: "Route requests",
    openAlerts: "Open alerts",
    vehicles: "Vehicles",
    running: "Running",
    assigned: "Assigned",
    available: "Available",
    maintenance: "Maintenance",
    serviceDue: "Service due",
  },

  fleet: {
    noneTitle: "No vehicles yet",
    noneHint: "Vehicles you add to the platform appear here.",
    school: "School",
    unassigned: "Unassigned",
    driver: "Driver",
    noDriver: "None",
    serviceDue: "Service due",
    seats: (n: number) => `${n} seats`,
    expiring: (docs: string) => `${docs} expiring within 30 days`,
  },

  map: {
    nothingYet: "Nothing to show on the map yet.",
    tapToOpen: "Tap to open map",
    yourStop: "Your stop",
    close: "Close map",
    scanTitle: "Scan the school QR code",
    scanHint: "Point the camera at the QR code on your school's circular",
    cameraTitle: "Camera access needed",
    cameraBody: (appName: string) =>
      `${appName} uses the camera only to read your school's QR code. Nothing is recorded.`,
    cameraAllow: "Allow camera",
    typeInstead: "Enter the code instead",
    noRouteTitle: "No route to show",
    noRouteHint: "This bus has no route with stops yet. Ask your school to set one up.",
    nearest: (stop: string) => `Nearest stop · ${stop}`,
    gettingFix: "Getting a GPS fix…",
    notStarted: "Trip not started",
    awayFix: (distance: string, when: string) => `${distance} away · fix ${when}`,
    sharingNote: "Sharing in the background — the screen can be off",
    routeSummary: (n: number, route: string) => `${n} stops on ${route}`,
  },

  live: {
    noneTitle: "No buses are out",
    noneHint: "Running trips appear here the moment a driver starts one.",
    unnamedBus: "Bus",
    noDriver: "No driver",
    noRoute: "no route",
    gpsStale: (when: string) => `GPS ${when} — low signal or phone asleep`,
    behind: (mins: number, picked: number) => `${mins} min behind · ${picked} picked up`,
    reporting: (picked: number) => `Reporting · ${picked} picked up`,
    tapForMap: "Tap to show on the map",
  },

  emergency: {
    title: "Raise an emergency",
    what: "What has happened?",
    breakdown: "Breakdown",
    medical: "Medical",
    accident: "Accident",
    other: "Other",
    note: "Anything to add?",
    notePlaceholder: "Front tyre punctured near Anand Nagar.",
    warning:
      "This immediately alerts the school office, the platform, and the parents of every child on this bus.",
    send: "Send alert",
    sentTitle: "Alert sent",
    sentBody: "The school office and every parent on this bus have been notified.",
  },

  history: {
    boarded: "Boarded the bus",
    dropped: "Dropped off",
    absent: "Marked absent",
    noneTitle: "No records yet",
    noneHint: "Pickup and drop history from the last 7 days appears here.",
    noTripsTitle: "No trips yet",
    noTripsHint: "Trips you finish are listed here, newest first.",
    pickedUp: (n: number) => `${n} picked up`,
    ongoing: "Still running",
  },

  alerts: {
    markAllRead: (n: number) => `Mark all ${n} as read`,
    noneTitle: "Nothing to report",
    noneHint: "Trip updates and safety alerts appear here as they happen.",
    emergency: "Emergency",
    unread: "Unread",
  },

  roster: {
    onBoard: "On board",
    dropped: "Dropped",
    absent: "Absent",
    waiting: "Waiting",
    all: "All",
    search: "Search a name or roll number…",

    noTripTitle: "No trip running",
    noTripDriverHint: "Start today's trip to mark students on and off the bus.",
    noTripStaffHint: "Attendance opens as soon as the driver starts the trip.",
    noStudentsTitle: "No students on this bus",
    noStudentsHint: "The school office assigns students to buses.",
    noMatchTitle: "Nobody here",
    noMatchHint: (term: string) =>
      term ? `Nobody on this bus matches "${term}".` : "No student matches that filter.",

    markedOf: (done: number, total: number) => `${done} of ${total} marked`,
    pickup: (stop: string) => `Pickup ${stop}`,
    drop: (stop: string) => `Drop ${stop}`,
    roll: (n: string) => `Roll ${n}`,

    markBoarded: "Mark boarded",
    markDropped: "Mark dropped",
    markAbsent: "Mark absent",
    changeFor: (name: string) => `${name} — change status`,
    alreadyMarked: "Already marked",

    bulkBoarded: "Mark all boarded",
    bulkDropped: "Mark all dropped",
    bulkTitle: (event: string) => (event === "dropped" ? "Mark everyone dropped?" : "Mark everyone boarded?"),
    bulkBody: (n: number) =>
      `This marks the ${n === 1 ? "1 child" : `${n} children`} shown and sends each of their parents a notification. Children already marked are skipped.`,
    bulkConfirm: "Yes, mark all",
    bulkNobody: "Everyone shown is already marked.",
  },

  driver: {
    finding: "Finding your bus…",
    noBusTitle: "No bus assigned yet",
    noBusHint: "Ask your school office to assign you to a bus. Until then there is no trip to start.",

    notStarted: "Not started",
    students: "Students",
    stops: "Stops",
    departs: "Departs",
    started: "Started",

    checkInTitle: "Take your check-in photo",
    checkInHint: "Required before you can start",
    checkInDone: "Photo taken",
    checkInDoneHint: "Sent with your trip so the office knows who is driving",
    checkInRetake: "Retake",
    checkInUploading: "Uploading…",
    checkInCameraDenied: "Camera permission is needed for the check-in photo.",
    checkInFirst: "Take your photo above to enable the trip buttons.",

    startMorning: "Start morning trip",
    startEvening: "Start evening trip",
    noRouteWarning: "No route is set for this bus — parents will not see stop-by-stop progress.",

    sharing: "Sharing location",
    gettingFix: "Getting a GPS fix…",
    notSharing: "Not sharing",
    lastFix: (when: string, accuracy?: number) =>
      accuracy ? `Last fix ${when} · ±${accuracy} m` : `Last fix ${when}`,
    waitingFirstFix: "Waiting for the first position",
    queued: (n: number) => `${n} queued`,
    queuedNote: (n: number) =>
      `${n === 1 ? "1 point is" : `${n} points are`} saved on this phone waiting for signal. They upload automatically — nothing is lost.`,
    screenOff: "The bus keeps reporting with the screen off — you can put the phone down.",

    routeProgress: "Route progress",
    endTrip: "End trip",
    endTripTitle: "End this trip?",
    endTripBody:
      "The school and every parent on this bus will stop seeing its position. Only end the trip once you have finished the run.",
    endTripConfirm: "End the trip",

    batteryTitle: "Tracking stops when the phone sleeps?",
    batteryBody:
      "Some phones (Xiaomi, Oppo, Vivo, Realme) shut BalVahini down in the background. Open Settings and allow it to run without restriction — once is enough.",
    batteryOpen: "Open app settings",

    emergency: "Emergency",
  },

  parent: {
    noChildrenTitle: "No children linked yet",
    noChildrenHint: "Ask the school office to add your mobile number to your child's record.",
    noBusTitle: "No bus assigned yet",
    noBusHint:
      "Your child is not on a bus route. The school office can add them to one — until then there is nothing to track.",

    notStarted: "The bus has not started yet",
    expectedAt: (t: string) => `Expected at your stop around ${t}`,
    expectedUnknown: "You will see it here the moment it sets off",
    tripEnded: "Today's trip has finished",

    minToStop: "min to your stop",
    etaUnknown: "Working out the arrival time",
    live: "Live",
    delayed: "Delayed",
    nextStop: (name: string) => `Next stop ${name}`,
    onTheWay: "On the way",
    stopsLeft: (n: number) => (n === 1 ? "1 stop away" : `${n} stops away`),
    delayNote: (mins: number) => `Running about ${mins} minutes behind the timetable.`,
    staleNote: (when: string) =>
      `The bus last reported ${when}. It may be in an area with poor signal — this is not its current position.`,

    onBoard: (name: string) => `${name} is on board`,
    droppedOff: (name: string) => `${name} has been dropped off`,
    markedAbsent: (name: string) => `${name} is marked absent today`,
    boardedAt: (stop: string, at: string) => `Boarded at ${stop} · ${at}`,
    droppedAt: (stop: string, at: string) => `Dropped at ${stop} · ${at}`,

    yourStop: "Your stop",
    scheduled: "Scheduled",
    journey: "Today's journey",
    liveLocation: "Live location",
    routeStatus: "Route status",

    callDriver: "Driver",
    callSchool: "School",
    callHelpline: "Helpline",

    busDetails: "Bus details",
    bus: "Bus",
    vehicle: "Vehicle",
    route: "Route",
    driver: "Driver",
    attendant: "Bus attendant",
    notAssigned: "Not assigned",
    pickupStop: "Pickup stop",
    dropStop: "Drop stop",
    requestRouteChange: "Request a route change",
    newRoute: "New route",
    preferredStop: "Preferred pickup stop",
    reason: "Reason",
    reasonPlaceholder: "We have moved to a new address.",
    routeChangeNote: "The school office reviews every request. You will be notified once it is decided.",
    sendRequest: "Send request",
    noRoutes: "No routes available.",
  },

  auth: {
    parentTagline: "Safe Journeys, Brighter Futures",
    staffTagline: "For school staff and fleet owners",

    parentTitle: "Track your child's bus",
    parentHelp: "Enter the six-character code printed on the circular from your school.",
    schoolCode: "School code",
    schoolCodePlaceholder: "ABC123",
    mobile: "Mobile number",
    mobileRegistered: "The number registered with school",
    mobileHint: "10 digits",
    sendOtp: "Send OTP",
    scanQr: "Scan the school QR code",

    otpTitle: "Enter the OTP",
    otpSentTo: (phone: string) => `Sent to +91 ${phone}`,
    otpLabel: "6-digit OTP",
    verify: "Verify and continue",
    changeNumber: "Change number or school code",

    staffTitle: "Sign in",
    staffHelp: "For drivers, attendants, school staff and fleet owners. Parents sign in on the BalVahini Parent app.",
    password: "Password",
    signIn: "Sign in",
    forgotten: "Forgotten your password? Ask the school office to reset it.",
  },

  onboarding: {
    getStarted: "Get started",

    /* Alt text for the bundled illustrations. They carry meaning — the circular
       especially, since it is a picture of the thing the parent is hunting
       for — so they are described rather than marked decorative. */
    artParentWelcome: "A yellow school bus on a country road, with a child waving from a window",
    artSchoolCode:
      "A school circular with the six-character code circled in yellow marker, and a QR code printed beside it",
    artStaffWelcome: "A driver in uniform standing beside a yellow school bus",
    artLocation: "A phone in a bus cradle showing a map with a location pin",
    artNotifications: "A phone in a parent's hand displaying a notification card from the app next to a gentle radiating bell",
    artBattery: "A phone in a dashboard cradle showing a full battery icon and a small shield with looping arrows",
    artAttendant: "A bus attendant in a saree helping a child in a school uniform board a yellow bus, holding a clipboard",
    artDesk: "A school office desk with a laptop displaying a colorful dashboard, a potted plant, and a mug",

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
    codeNext: "Enter my code",

    notifyTitle: "Never miss the bus",
    notifyBody: "With notifications on, your phone tells you:",
    notifyNear: "when the bus is near your stop",
    notifyBoards: "when your child boards",
    notifyDropped: "when your child is dropped off",
    notifyAllow: "Allow notifications",

    staffWelcomeTitle: (appName: string) => `${appName} Staff`,
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
    schoolOffice: "School office",
    helpline: "Emergency helpline",
    /* India's single emergency number. A constant, not a setting — but the
       school's own contacts endpoint overrides it when it answers. */
    defaultHelpline: "112",
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

  wrongApp: {
    title: "This is the wrong app",
    body: (name: string, role: string, wanted: string) =>
      `${name}, your account is a ${role} account. Install ${wanted} and sign in there instead.`,
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
