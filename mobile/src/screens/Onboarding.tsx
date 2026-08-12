import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Linking, ScrollView, StyleSheet, View } from "react-native";
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
  IconBell, IconBus, IconCamera, IconCheck, IconMap, IconPin, IconSchool, IconShield, IconUsers,
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
 * ponytail: the app's own stroke icons at display size in a tinted well,
 * rather than illustrations. Bespoke vector art would mean either a second
 * asset pipeline or a few hundred lines of hand-written SVG per screen, and it
 * would drift from the icon set the rest of the app draws. The one exception is
 * the school-code screen, which shows a mock circular — that screen is the
 * single biggest drop-off point, and a picture of the thing they are looking
 * for does work that a bus icon cannot.
 */
const Art = ({ children, bg = colors.brand50 }: { children: ReactNode; bg?: string }) => (
  <View style={[s.art, { backgroundColor: bg }]}>{children}</View>
);

/** What a parent is actually hunting for, drawn so they recognise it on paper. */
const CircularArt = () => (
  <View style={s.circular}>
    <View style={{ gap: space(2), flex: 1 }}>
      <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.slate200, width: "70%" }} />
      <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.slate200, width: "90%" }} />
      <View style={s.codeHighlight}>
        <T size={22} weight="800" color={colors.brand700} style={{ letterSpacing: 4 }}>
          {str.onboarding.codeSample}
        </T>
      </View>
      <T role="caption" color={tone.textMuted}>
        {str.onboarding.codeCircular}
      </T>
    </View>

    <View style={{ alignItems: "center", gap: space(1.5) }}>
      {/* A recognisable QR silhouette, not a scannable code — three finder
          squares is what the eye actually matches on. */}
      <View style={s.qr}>
        <View style={[s.qrEye, { top: 6, left: 6 }]} />
        <View style={[s.qrEye, { top: 6, right: 6 }]} />
        <View style={[s.qrEye, { bottom: 6, left: 6 }]} />
        <View style={s.qrBody} />
      </View>
      <T role="caption" color={tone.textMuted}>
        {str.onboarding.codeQrNote}
      </T>
    </View>
  </View>
);

/* ── Step lists ────────────────────────────────────────────────────── */

/** Shown before sign-in, per app. Skippable, and never more than four screens. */
function introSteps(onSkipToSignIn: () => void, appName: string): Step[] {
  if (VARIANT === "staff") {
    return [
      {
        key: "staff-welcome",
        art: (
          <Art bg={colors.leaf50}>
            <IconBus size={72} color={colors.leaf600} />
          </Art>
        ),
        title: str.onboarding.staffWelcomeTitle(appName),
        body: str.onboarding.staffWelcomeBody,
        primaryLabel: str.onboarding.staffWelcomeNext,
      },
    ];
  }

  return [
    {
      key: "welcome",
      art: (
        <Art>
          <IconBus size={72} color={colors.brand600} />
        </Art>
      ),
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
      art: <CircularArt />,
      title: str.onboarding.codeTitle,
      body: str.onboarding.codeBody,
      primaryLabel: str.onboarding.codeNext,
    },
    {
      key: "notify",
      art: (
        <Art>
          <IconBell size={72} color={colors.brand600} />
        </Art>
      ),
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
        art: (
          <Art>
            <IconPin size={72} color={colors.brand600} />
          </Art>
        ),
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
        art: (
          <Art bg={colors.amber50}>
            <IconShield size={72} color={colors.amber600} />
          </Art>
        ),
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
        art: (
          <Art>
            <IconUsers size={72} color={colors.brand600} />
          </Art>
        ),
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
      art: (
        <Art>
          <IconSchool size={72} color={colors.brand600} />
        </Art>
      ),
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
  body: { padding: space(6), paddingTop: space(4), flexGrow: 1, justifyContent: "center" },
  foot: {
    padding: space(6),
    paddingTop: space(4),
    gap: space(4),
    borderTopWidth: 1,
    borderTopColor: colors.slate100,
  },

  art: {
    alignSelf: "center",
    width: 168,
    height: 168,
    borderRadius: 84,
    alignItems: "center",
    justifyContent: "center",
  },

  circular: {
    flexDirection: "row",
    gap: space(4),
    alignItems: "center",
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: tone.border,
    borderRadius: radius.card,
    padding: space(4),
    // A sheet of paper on a desk, not a UI card.
    transform: [{ rotate: "-2deg" }],
    shadowColor: colors.slate900,
    shadowOpacity: 0.1,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  codeHighlight: {
    alignSelf: "flex-start",
    backgroundColor: colors.sun100,
    borderWidth: 2,
    borderColor: colors.sun500,
    borderRadius: radius.pill,
    paddingHorizontal: space(3),
    paddingVertical: space(1.5),
  },

  qr: {
    width: 68,
    height: 68,
    borderRadius: radius.sm,
    borderWidth: 2,
    borderColor: colors.slate800,
    backgroundColor: colors.white,
  },
  qrEye: { position: "absolute", width: 18, height: 18, borderWidth: 4, borderColor: colors.slate800 },
  qrBody: {
    position: "absolute",
    right: 8,
    bottom: 8,
    width: 20,
    height: 20,
    backgroundColor: colors.slate800,
  },

  warnCard: {
    backgroundColor: colors.amber50,
    borderWidth: 1,
    borderColor: colors.amber400,
    borderRadius: radius.md,
    padding: space(3),
  },
});
