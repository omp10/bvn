import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Image, Linking, ScrollView, StyleSheet, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Device from "expo-device";
import * as Location from "expo-location";
import { registerPushToken } from "../push";
import { useAuth } from "../auth";
import { useBrand } from "../brand";
import { colors, radius, space, tone, VARIANT } from "../theme";
import { str } from "../strings";
import { Alert, Button, CheckLine, Dots, Enter, IconChip, T } from "../ui";
import {
  IconBell, IconBus, IconCamera, IconCheck, IconMap, IconSchool, IconShield, IconUsers,
} from "../icons";

/* ── Persistence ───────────────────────────────────────────────────────
 *
 * AsyncStorage rather than SecureStore: "this person has seen the welcome
 * screens" is not a secret, and the keystore is for the refresh token.
 *
 * The keys carry a version. When the flow changes materially enough that
 * existing users should see it again, bump the suffix rather than inventing a
 * migration for a boolean.
 */
const KEY = { intro: "bv_onboarded_v1", role: "bv_onboarded_role_v1" };

export function useOnboarded(key: string) {
  const [seen, setSeen] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(key)
      .then((v) => alive && setSeen(v === "1"))
      // A storage failure must not lock someone out of their app. Treating it
      // as "already seen" gets them to the sign-in form.
      .catch(() => alive && setSeen(true));
    return () => {
      alive = false;
    };
  }, [key]);

  const complete = useCallback(() => {
    setSeen(true);
    void AsyncStorage.setItem(key, "1").catch(() => {});
  }, [key]);

  return { seen, complete };
}

export const INTRO_KEY = KEY.intro;
export const ROLE_KEY = KEY.role;

/* ── Step model ────────────────────────────────────────────────────── */

type Step = {
  key: string;
  art: ReactNode;
  title: string;
  body?: string;
  /** Rows with a check icon — never colour alone as the carrier of meaning. */
  bullets?: string[];
  extra?: ReactNode;
  primaryLabel: string;
  /** Return a string to show a problem and stay on this step. */
  onPrimary?: () => Promise<string | null | void> | string | null | void;
  secondaryLabel?: string;
  onSecondary?: () => void;
};

/* ── Artwork ───────────────────────────────────────────────────────────
 *
 * The illustrations are the ones generated alongside the designs, bundled from
 * `assets/onboarding`. Four screens have one; the other three (how it works,
 * notifications, battery) were designed as icon rows and stay that way, using
 * the app's own stroke set at display size in a tinted well.
 *
 * Bundled, not fetched: onboarding is the first thing a new install shows, and
 * a parent on a bad connection should not be looking at four grey rectangles
 * while deciding whether this app works. All four together are under 300 KB.
 */
const ART = {
  parentWelcome: require("../../assets/onboarding/parent-welcome.jpg"),
  schoolCode: require("../../assets/onboarding/school-code.jpg"),
  staffWelcome: require("../../assets/onboarding/staff-welcome.jpg"),
  location: require("../../assets/onboarding/location.jpg"),
  notifications: require("../../assets/onboarding/notifications.jpg"),
  battery: require("../../assets/onboarding/battery.jpg"),
  attendant: require("../../assets/onboarding/attendant.jpg"),
  desk: require("../../assets/onboarding/desk.jpg"),
};

/**
 * Every onboarding image is normalised to 1200 × 656 on disk, so the ratio is a
 * constant rather than something read at runtime.
 *
 * It used to come from `Image.resolveAssetSource(source)`, which reads clean in
 * development and returned no usable dimensions in the release build. That made
 * `aspectRatio` NaN — which React Native silently ignores rather than warning
 * about — so the Image fell back to its intrinsic size and laid itself out 656
 * *points* tall. On a phone that is a portrait box roughly twice the height it
 * should be, and `contain` inside it cropped a wide illustration down to a
 * sliver of bus running off the edge of the screen.
 *
 * A constant cannot be NaN. If an image is ever recropped, match this shape.
 */
const ART_RATIO = 1200 / 656;

/*
 * The ratio goes on a wrapping View, not on the Image.
 *
 * An Image carries an intrinsic size, and React Native kept laying these out at
 * that intrinsic height — 656 *points* — rather than honouring `aspectRatio`
 * beside a percentage width. The result was a portrait box twice the height it
 * should be, with `contain` fitting a wide illustration into it and leaving the
 * subject a cropped sliver. A plain View has no intrinsic size, so its
 * aspectRatio is unambiguous; the Image then just fills it.
 */
const Illustration = ({ source, label }: { source: number; label: string }) => (
  <View style={{ width: "100%", aspectRatio: ART_RATIO, borderRadius: radius.lg, overflow: "hidden" }}>
    <Image
      source={source}
      accessibilityRole="image"
      accessibilityLabel={label}
      resizeMode="contain"
      style={{ width: "100%", height: "100%" }}
    />
  </View>
);

/* ── Step lists ────────────────────────────────────────────────────── */

/** Shown before sign-in, per app. Skippable, and never more than four screens. */
function introSteps(onSkipToSignIn: () => void, appName: string): Step[] {
  if (VARIANT === "staff") {
    return [
      {
        key: "staff-welcome",
        art: <Illustration source={ART.staffWelcome} label={str.onboarding.artStaffWelcome} />,
        title: str.onboarding.staffWelcomeTitle(appName),
        body: str.onboarding.staffWelcomeBody,
        primaryLabel: str.onboarding.staffWelcomeNext,
      },
    ];
  }

  return [
    {
      key: "welcome",
      art: <Illustration source={ART.parentWelcome} label={str.onboarding.artParentWelcome} />,
      title: str.onboarding.parentWelcomeTitle,
      body: str.onboarding.parentWelcomeBody,
      primaryLabel: str.onboarding.getStarted,
      secondaryLabel: str.onboarding.haveAccount,
      onSecondary: onSkipToSignIn,
    },
    {
      key: "how",
      art: (
        <View style={{ gap: space(4), paddingVertical: space(2) }}>
          <HowRow icon={<IconBus size={22} color={colors.brand600} />} bg={colors.brand50} text={str.onboarding.howBus} />
          <HowRow icon={<IconMap size={22} color={colors.leaf600} />} bg={colors.leaf50} text={str.onboarding.howWatch} />
          <HowRow icon={<IconBell size={22} color={colors.amber600} />} bg={colors.sun100} text={str.onboarding.howTold} />
        </View>
      ),
      title: str.onboarding.howTitle,
      primaryLabel: str.common.next,
    },
    {
      key: "code",
      art: <Illustration source={ART.schoolCode} label={str.onboarding.artSchoolCode} />,
      title: str.onboarding.codeTitle,
      body: str.onboarding.codeBody,
      primaryLabel: str.onboarding.codeNext,
    },
    {
      key: "notify",
      art: <Illustration source={ART.notifications} label={str.onboarding.artNotifications} />,
      title: str.onboarding.notifyTitle,
      body: str.onboarding.notifyBody,
      bullets: [str.onboarding.notifyNear, str.onboarding.notifyBoards, str.onboarding.notifyDropped],
      primaryLabel: str.onboarding.notifyAllow,
      // Explain, then ask. A cold system dialog on Android is how you earn a
      // permanent denial, and there is no second chance at it.
      onPrimary: () => void registerPushToken(),
      secondaryLabel: str.onboarding.maybeLater,
    },
  ];
}

/** Shown after sign-in, branched by role. A driver and an office need nothing alike. */
function roleSteps(role: string): Step[] {
  if (role === "driver") {
    const brand = Device.manufacturer ?? Device.brand;
    const fussy = /xiaomi|redmi|poco|oppo|vivo|realme|oneplus|honor|huawei/i.test(brand ?? "");

    return [
      {
        key: "location",
        art: <Illustration source={ART.location} label={str.onboarding.artLocation} />,
        title: str.onboarding.locationTitle,
        body: str.onboarding.locationBody,
        bullets: [
          str.onboarding.locationOffScreen,
          str.onboarding.locationStops,
          str.onboarding.locationNeverElse,
        ],
        primaryLabel: str.onboarding.locationAllow,
        /* Requests only — starting the stream is `tracker.ts`'s job and its
           alone. Asking here means the driver has already granted it by the
           time they press Start, instead of meeting the dialog mid-trip. */
        onPrimary: async () => {
          const fg = await Location.requestForegroundPermissionsAsync();
          if (!fg.granted) return str.onboarding.locationDenied;
          const bg = await Location.requestBackgroundPermissionsAsync();
          return bg.granted ? null : str.onboarding.locationDenied;
        },
        secondaryLabel: str.common.skip,
      },
      {
        key: "battery",
        art: <Illustration source={ART.battery} label={str.onboarding.artBattery} />,
        title: str.onboarding.batteryTitle,
        body: str.onboarding.batteryBody,
        extra: (
          <View style={{ gap: space(3) }}>
            <View style={s.warnCard}>
              <T role="label" color={colors.amber800}>
                {fussy && brand ? str.onboarding.batteryYours(brand) : str.onboarding.batteryBrands}
              </T>
            </View>
            <NumberedStep n={1} text={str.onboarding.batteryStep1} />
            <NumberedStep n={2} text={str.onboarding.batteryStep2} />
            <NumberedStep n={3} text={str.onboarding.batteryStep3} />
          </View>
        ),
        primaryLabel: str.onboarding.batteryOpen,
        // Deliberately does not advance: the driver leaves for Settings and
        // comes back, and "I've done this" is the honest way forward.
        onPrimary: () => {
          void Linking.openSettings();
          return "stay";
        },
        secondaryLabel: str.onboarding.batteryDone,
      },
      {
        key: "rhythm",
        art: (
          <View style={{ gap: space(4), paddingVertical: space(2) }}>
            <HowRow icon={<IconCamera size={22} color={colors.brand600} />} bg={colors.brand50} text={str.onboarding.rhythmCheckIn} />
            <HowRow icon={<IconBus size={22} color={colors.leaf600} />} bg={colors.leaf50} text={str.onboarding.rhythmStart} />
            <HowRow icon={<IconMap size={22} color={colors.brand600} />} bg={colors.brand50} text={str.onboarding.rhythmDrive} />
            <HowRow icon={<IconCheck size={22} color={colors.leaf600} />} bg={colors.leaf50} text={str.onboarding.rhythmEnd} />
          </View>
        ),
        title: str.onboarding.rhythmTitle,
        primaryLabel: str.onboarding.rhythmDone,
      },
    ];
  }

  if (role === "staff") {
    return [
      {
        key: "attendant",
        art: <Illustration source={ART.attendant} label={str.onboarding.artAttendant} />,
        title: str.onboarding.attendantTitle,
        body: str.onboarding.attendantBody,
        bullets: [str.onboarding.attendantBulk, str.onboarding.attendantParents],
        primaryLabel: str.onboarding.attendantDone,
      },
    ];
  }

  return [
    {
      key: "desk",
      art: <Illustration source={ART.desk} label={str.onboarding.artDesk} />,
      title: str.onboarding.deskTitle,
      body: str.onboarding.deskBody,
      primaryLabel: str.onboarding.deskDone,
    },
  ];
}

const HowRow = ({ icon, bg, text }: { icon: ReactNode; bg: string; text: string }) => (
  <View style={{ flexDirection: "row", alignItems: "center", gap: space(3.5) }}>
    <IconChip bg={bg} size={48}>
      {icon}
    </IconChip>
    <T role="body" weight="500" style={{ flex: 1 }}>
      {text}
    </T>
  </View>
);

const NumberedStep = ({ n, text }: { n: number; text: string }) => (
  <View style={{ flexDirection: "row", alignItems: "center", gap: space(3) }}>
    <IconChip bg={colors.slate100} size={28}>
      <T role="label" weight="800" color={tone.textSecondary}>
        {n}
      </T>
    </IconChip>
    <T role="body" style={{ flex: 1 }}>
      {text}
    </T>
  </View>
);

/* ── The flow ──────────────────────────────────────────────────────── */

function Flow({ steps, onDone, onSkip }: { steps: Step[]; onDone: () => void; onSkip?: () => void }) {
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const step = steps[index];

  const advance = () => {
    setProblem(null);
    if (index + 1 < steps.length) setIndex(index + 1);
    else onDone();
  };

  const press = async () => {
    setBusy(true);
    try {
      const result = await step.onPrimary?.();
      // "stay" means the step sent them somewhere and wants them back here.
      if (result === "stay") return;
      if (typeof result === "string") {
        setProblem(result);
        return;
      }
      advance();
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={s.screen} edges={["top", "bottom"]}>
      {/* Skippable, but not hidden. A parent who already knows what a school
          code is should not have to tap through three screens to say so. */}
      {!!onSkip && (
        <View style={{ alignItems: "flex-end", paddingHorizontal: space(4) }}>
          <Button variant="ghost" size="sm" onPress={onSkip}>
            {str.common.skip}
          </Button>
        </View>
      )}

      <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
        <Enter key={step.key} style={{ gap: space(6) }}>
          {step.art}

          <View style={{ gap: space(3) }}>
            <T role="title" style={{ textAlign: "center" }}>
              {step.title}
            </T>
            {!!step.body && (
              <T role="body" color={tone.textSecondary} style={{ textAlign: "center" }}>
                {step.body}
              </T>
            )}
          </View>

          {!!step.bullets?.length && (
            <View style={{ gap: space(3) }}>
              {step.bullets.map((line) => (
                <CheckLine key={line}>{line}</CheckLine>
              ))}
            </View>
          )}

          {step.extra}
        </Enter>
      </ScrollView>

      <View style={s.foot}>
        <Alert tone="warn">{problem}</Alert>
        {steps.length > 1 && <Dots count={steps.length} index={index} />}
        <Button block size="lg" loading={busy} onPress={() => void press()}>
          {step.primaryLabel}
        </Button>
        {!!step.secondaryLabel && (
          <Button
            variant="ghost"
            block
            onPress={() => {
              step.onSecondary?.();
              if (!step.onSecondary) advance();
            }}
          >
            {step.secondaryLabel}
          </Button>
        )}
      </View>
    </SafeAreaView>
  );
}

/** Pre-sign-in introduction, per app variant. */
export function IntroOnboarding({ onDone }: { onDone: () => void }) {
  const { appName } = useBrand();
  return <Flow steps={introSteps(onDone, appName)} onDone={onDone} onSkip={onDone} />;
}

/** Post-sign-in, branched by role — mainly the driver's two permission screens. */
export function RoleOnboarding({ role, onDone }: { role: string; onDone: () => void }) {
  const steps = roleSteps(role);
  return <Flow steps={steps} onDone={onDone} onSkip={role === "driver" ? undefined : onDone} />;
}

/**
 * The replay, reached from Profile. Shows the role walkthrough again for
 * whoever is signed in, and pops back rather than marking anything.
 */
export default function OnboardingReplay({ navigation }: any) {
  const { user } = useAuth();
  return <Flow steps={roleSteps(user?.role ?? "")} onDone={() => navigation.goBack()} />;
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.white },
  /* `flexGrow` so a short step still fills the screen, but deliberately no
     `justifyContent: "center"`. Centring a ScrollView's content container
     overflows it equally in both directions once the content is taller than the
     viewport, and the overflow is unreachable — which clipped the school-code
     body text and the location primer's title behind the footer. Top-aligned
     always scrolls to everything, including at a 130% font scale. */
  body: { padding: space(6), paddingTop: space(4), flexGrow: 1, gap: space(6) },
  foot: {
    padding: space(6),
    paddingTop: space(4),
    gap: space(4),
    borderTopWidth: 1,
    borderTopColor: colors.slate100,
  },

  warnCard: {
    backgroundColor: colors.amber50,
    borderWidth: 1,
    borderColor: colors.amber400,
    borderRadius: radius.md,
    padding: space(3),
  },
});
