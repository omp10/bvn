/**
 * One codebase, two apps.
 *
 * APP_VARIANT decides which app this build is. Everything role-specific in the
 * source keys off `extra.variant`, so the parent APK and the staff APK are the
 * same JavaScript with a different identity, icon and permission set — a second
 * project would have meant maintaining two copies of the API client forever.
 *
 *   APP_VARIANT=parent npx eas build -p android --profile parent
 *   APP_VARIANT=staff  npx eas build -p android --profile staff
 */
const VARIANT = process.env.APP_VARIANT === "staff" ? "staff" : "parent";

/**
 * The slug is deliberately the same for both. EAS keys a project off the slug,
 * so varying it would mean two Expo projects, two project ids and two sets of
 * FCM credentials to keep in step. One project, two Android packages, two APKs.
 */
const SLUG = "balvahini";

const APPS = {
  parent: {
    name: "BalVahini Parent",
    package: "com.balvahini.parent",
    // The blue half of the shield.
    tint: "#1155a5",
  },
  staff: {
    name: "BalVahini Staff",
    package: "com.balvahini.staff",
    // The green half — a driver must never open the wrong icon in a hurry.
    tint: "#368a29",
  },
};

const app = APPS[VARIANT];

/* Only the driver app asks for background location. Requesting it in the parent
   app would be an unexplained permission on a parent's phone and a Play Store
   review question we would have no answer to. */
const staffPlugins = [
  [
    "expo-location",
    {
      locationAlwaysAndWhenInUsePermission:
        "BalVahini shares the bus position with the school and with parents while a trip is running.",
      isAndroidBackgroundLocationEnabled: true,
      isAndroidForegroundServiceEnabled: true,
    },
  ],
  [
    "expo-image-picker",
    { cameraPermissionsAppMessage: "BalVahini needs the camera for your check-in photo." },
  ],
];

module.exports = {
  expo: {
    name: app.name,
    slug: SLUG,
    owner: "ecovigyan",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/icon.png",
    scheme: app.package,
    userInterfaceStyle: "light",
    newArchEnabled: true,
    splash: {
      image: "./assets/splash-icon.png",
      resizeMode: "contain",
      backgroundColor: app.tint,
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: app.package,
    },
    android: {
      package: app.package,
      adaptiveIcon: {
        foregroundImage: "./assets/android-icon-foreground.png",
        backgroundColor: app.tint,
      },
      edgeToEdgeEnabled: true,
      /* Left at Android's default of refusing cleartext. The API is HTTPS with a
         real certificate, so anything trying to talk plain HTTP is a mistake and
         should fail loudly rather than quietly sending a session token in the
         clear. */
      permissions:
        VARIANT === "staff"
          ? [
              "ACCESS_COARSE_LOCATION",
              "ACCESS_FINE_LOCATION",
              "ACCESS_BACKGROUND_LOCATION",
              "FOREGROUND_SERVICE",
              "FOREGROUND_SERVICE_LOCATION",
              "CAMERA",
            ]
          : ["INTERNET"],
    },
    plugins: [
      [
        "expo-notifications",
        { icon: "./assets/android-icon-monochrome.png", color: app.tint },
      ],
      ...(VARIANT === "staff" ? staffPlugins : []),
    ],
    extra: {
      variant: VARIANT,
      /* Where the API lives. Baked in at build time — a phone has no dev proxy,
         so unlike the web app this cannot be a relative path. */
      apiUrl: process.env.EXPO_PUBLIC_API_URL ?? "http://10.0.2.2:4000",
      /* The EAS project both variants build under. Also what expo-notifications
         needs to mint a push token — without it `registerPushToken` gives up. */
      eas: { projectId: process.env.EAS_PROJECT_ID ?? "dd60e638-16b3-4531-a102-8e2b392a5ee2" },
    },
  },
};
