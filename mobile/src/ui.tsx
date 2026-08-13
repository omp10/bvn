import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  Modal as RNModal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  Vibration,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  colors, elevation, GUTTER, MAX_FONT_SCALE, motion, radius, space, tone, type, type TypeRole,
} from "./theme";
import { useBrand } from "./brand";
import { assetUrl, useOnline } from "./api";
import { initials, titleCase } from "./format";
import { str } from "./strings";
import { IconBus, IconCheck, IconEye, IconEyeOff } from "./icons";

/* ── Motion ────────────────────────────────────────────────────────────
 *
 * One subscription per component is cheap, and the alternative — a provider
 * threaded through every screen — buys nothing for a value that changes once
 * in a blue moon.
 */

export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((v) => alive && setReduced(v));
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduced);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);

  return reduced;
}

/**
 * A confirming tick under the thumb, for marking a child, starting or ending a
 * trip, and raising an emergency.
 *
 * React Native's own Vibration rather than expo-haptics: the effect a driver
 * feels through a phone in a cradle is the same, and it adds no native module
 * to either app — only the VIBRATE permission, which is already declared.
 */
export const tick = (pattern: "light" | "heavy" = "light") =>
  Vibration.vibrate(pattern === "heavy" ? 40 : 12);

/** Fades and lifts children in on mount. Skipped entirely under reduce-motion. */
export function Enter({
  children,
  delay = 0,
  style,
}: {
  children: ReactNode;
  delay?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const reduced = useReducedMotion();
  const play = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduced) return;
    Animated.timing(play, {
      toValue: 1,
      duration: motion.base,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [play, delay, reduced]);

  if (reduced) return <View style={style}>{children}</View>;

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: play,
          transform: [{ translateY: play.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

export function AnimatedCount({ value }: { value: number }) {
  const [displayValue, setDisplayValue] = useState(value);
  const reduced = useReducedMotion();
  const prevValue = useRef(value);

  useEffect(() => {
    if (reduced) {
      setDisplayValue(value);
      prevValue.current = value;
      return;
    }
    if (value === prevValue.current) return;

    let start = prevValue.current;
    const end = value;
    const duration = 200; // motion.base
    const startTime = performance.now();

    let frameId: number;
    const update = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const current = Math.round(start + (end - start) * progress);
      setDisplayValue(current);

      if (progress < 1) {
        frameId = requestAnimationFrame(update);
      } else {
        prevValue.current = end;
      }
    };
    frameId = requestAnimationFrame(update);

    return () => cancelAnimationFrame(frameId);
  }, [value, reduced]);

  return <>{displayValue}</>;
}

export function CrossFade({
  loading,
  skeleton,
  children,
}: {
  loading: boolean;
  skeleton: ReactNode;
  children: ReactNode;
}) {
  const reduced = useReducedMotion();
  const anim = useRef(new Animated.Value(loading ? 0 : 1)).current;
  const [renderSkeleton, setRenderSkeleton] = useState(loading);
  const [renderContent, setRenderContent] = useState(!loading);

  useEffect(() => {
    if (reduced) {
      setRenderSkeleton(loading);
      setRenderContent(!loading);
      return;
    }

    if (loading) {
      setRenderSkeleton(true);
      Animated.timing(anim, {
        toValue: 0,
        duration: motion.base,
        useNativeDriver: true,
      }).start(() => {
        setRenderContent(false);
      });
    } else {
      setRenderContent(true);
      Animated.timing(anim, {
        toValue: 1,
        duration: motion.base,
        useNativeDriver: true,
      }).start(() => {
        setRenderSkeleton(false);
      });
    }
  }, [loading, reduced]);

  if (reduced) return <>{loading ? skeleton : children}</>;

  /* Both layers need `flex: 1`, not `width: "100%"`.
   *
   * What goes inside these is a `<Screen>`, which is `flex: 1` over a
   * ScrollView. A flex child with no height to claim collapses to nothing, so
   * a wrapper that only set a width rendered every one of these screens as a
   * header, a tab bar, and a completely empty space between them. */
  return (
    <View style={{ flex: 1 }}>
      {renderContent && (
        <Animated.View style={{ flex: 1, opacity: anim }}>{children}</Animated.View>
      )}
      {renderSkeleton && (
        <Animated.View
          // Absolute only while it is sitting on top of real content; on its
          // own it has to take the space so it can be seen at all.
          pointerEvents="none"
          style={[
            renderContent ? StyleSheet.absoluteFill : { flex: 1 },
            { opacity: anim.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }), zIndex: 1 },
          ]}
        >
          {skeleton}
        </Animated.View>
      )}
    </View>
  );
}

/* ── Text ──────────────────────────────────────────────────────────────
 *
 * `role` is the token; `size`/`weight` still override it, so the screens that
 * predate the scale keep working and can migrate a card at a time.
 */

export const T = ({
  children,
  role,
  size,
  weight,
  color = tone.textPrimary,
  style,
  ...rest
}: {
  children: ReactNode;
  role?: TypeRole;
  size?: number;
  weight?: "400" | "500" | "600" | "700" | "800";
  color?: string;
  style?: StyleProp<any>;
  numberOfLines?: number;
  accessibilityLabel?: string;
}) => {
  const base = type[role ?? "body"];
  return (
    <Text
      // The brief's floor is 130%; past that a driver's stat tiles shear apart
      // and the number they need becomes unreadable rather than merely large.
      maxFontSizeMultiplier={MAX_FONT_SCALE}
      style={[
        {
          fontSize: size ?? base.fontSize,
          lineHeight: size ? undefined : base.lineHeight,
          fontWeight: weight ?? base.fontWeight,
          color,
        },
        style,
      ]}
      {...rest}
    >
      {children}
    </Text>
  );
};

export const Muted = ({ children, size, role = "caption", ...rest }: any) => (
  <T role={role} size={size} color={tone.textMuted} {...rest}>
    {children}
  </T>
);

/** A small uppercase run-in above a group of rows. */
export const SectionHeader = ({ children }: { children: ReactNode }) => (
  <T
    role="caption"
    weight="700"
    color={tone.textMuted}
    style={{ letterSpacing: 0.8, textTransform: "uppercase", paddingHorizontal: space(1) }}
  >
    {children}
  </T>
);

/* ── Card ──────────────────────────────────────────────────────────── */

export function Card({
  title,
  subtitle,
  right,
  children,
  padded = true,
  style,
}: {
  title?: string;
  subtitle?: string;
  right?: ReactNode;
  children?: ReactNode;
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[s.card, style]}>
      {(title || right) && (
        <View style={[s.cardHead, !padded && s.cardHeadBordered]}>
          <View style={{ flex: 1 }}>
            {!!title && <T role="heading">{title}</T>}
            {!!subtitle && <Muted style={{ marginTop: 2 }}>{subtitle}</Muted>}
          </View>
          {right}
        </View>
      )}
      <View style={padded ? s.cardBody : undefined}>{children}</View>
    </View>
  );
}

/* ── Button ────────────────────────────────────────────────────────── */

type ButtonVariant = "primary" | "secondary" | "success" | "danger" | "dangerOutline" | "ghost";

const BUTTON_FILL: Record<ButtonVariant, string> = {
  primary: colors.brand600,
  secondary: colors.white,
  success: tone.success,
  danger: tone.danger,
  dangerOutline: colors.white,
  ghost: "transparent",
};

const BUTTON_TEXT: Record<ButtonVariant, string> = {
  primary: colors.white,
  secondary: tone.textPrimary,
  success: colors.white,
  danger: colors.white,
  dangerOutline: tone.danger,
  ghost: colors.brand600,
};

export function Button({
  children,
  onPress,
  variant = "primary",
  size = "md",
  block,
  loading,
  disabled,
  haptic,
  style,
  accessibilityLabel,
}: {
  children: ReactNode;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: "sm" | "md" | "lg";
  block?: boolean;
  loading?: boolean;
  disabled?: boolean;
  /** Buzz on press — for marking, trip start/end and emergency. */
  haptic?: "light" | "heavy";
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const brand = useBrand();
  const off = disabled || loading;
  // 44 is the accessibility floor; `lg` is the size a driver hits in a moving bus.
  const height = size === "sm" ? 44 : size === "lg" ? 60 : 50;

  // Only the primary action carries the school's colour. A danger button that
  // turned green because a school picked green would be a genuine hazard.
  const fill = variant === "primary" ? brand.primary : BUTTON_FILL[variant];
  const ink = variant === "ghost" ? brand.primary : BUTTON_TEXT[variant];

  return (
    <Pressable
      onPress={
        off
          ? undefined
          : () => {
              if (haptic) tick(haptic);
              onPress?.();
            }
      }
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: Boolean(off) }}
      style={({ pressed }) => [
        s.btn,
        {
          minHeight: height,
          backgroundColor: fill,
          borderWidth: variant === "secondary" || variant === "dangerOutline" ? 1 : 0,
          borderColor: variant === "dangerOutline" ? tone.danger : tone.borderStrong,
          opacity: off ? 0.45 : pressed ? 0.85 : 1,
          alignSelf: block ? "stretch" : "flex-start",
          paddingHorizontal: size === "sm" ? space(3) : space(5),
          paddingVertical: space(2),
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={ink} size="small" />
      ) : (
        <T
          weight="700"
          size={size === "sm" ? 14 : size === "lg" ? 17 : 15}
          color={ink}
          style={{ textAlign: "center" }}
        >
          {children}
        </T>
      )}
    </Pressable>
  );
}

/* ── Form ──────────────────────────────────────────────────────────── */

export function Field({
  label,
  hint,
  error,
  prefix,
  reveal,
  style,
  inputStyle,
  ...rest
}: TextInputProps & {
  label?: string;
  hint?: string;
  /** A server validation message, shown against the field it names. */
  error?: string | null;
  /** A fixed leading label inside the box — "+91" on every phone number here. */
  prefix?: string;
  /** Adds a show/hide eye. Implies a password field. */
  reveal?: boolean;
  inputStyle?: StyleProp<any>;
}) {
  const [shown, setShown] = useState(false);
  const decorated = Boolean(prefix) || reveal;

  const input = (
    <TextInput
      placeholderTextColor={colors.slate400}
      accessibilityLabel={label}
      maxFontSizeMultiplier={MAX_FONT_SCALE}
      secureTextEntry={reveal ? !shown : rest.secureTextEntry}
      style={[
        s.input,
        error ? { borderColor: tone.danger } : null,
        // The box is drawn by the wrapper when there is anything else in it.
        decorated ? { borderWidth: 0, flex: 1, paddingHorizontal: 0, backgroundColor: "transparent" } : null,
        inputStyle,
      ]}
      {...rest}
    />
  );

  return (
    <View style={style}>
      {!!label && (
        <T role="label" color={tone.textSecondary} style={{ marginBottom: space(1.5) }}>
          {label}
        </T>
      )}

      {decorated ? (
        <View style={[s.input, s.fieldBox, error ? { borderColor: tone.danger } : null]}>
          {!!prefix && (
            <>
              <T role="body" weight="600" color={tone.textSecondary}>
                {prefix}
              </T>
              <View style={{ width: 1, alignSelf: "stretch", marginVertical: space(2), backgroundColor: tone.border }} />
            </>
          )}
          {input}
          {reveal && (
            <Pressable
              onPress={() => setShown((v) => !v)}
              accessibilityRole="button"
              accessibilityLabel={shown ? str.common.hidePassword : str.common.showPassword}
              hitSlop={10}
              style={({ pressed }) => [{ padding: space(1) }, pressed && { opacity: 0.6 }]}
            >
              {shown ? (
                <IconEyeOff size={20} color={tone.textMuted} />
              ) : (
                <IconEye size={20} color={tone.textMuted} />
              )}
            </Pressable>
          )}
        </View>
      ) : (
        input
      )}

      {!!error && (
        <T role="caption" color={tone.danger} style={{ marginTop: space(1.5) }}>
          {error}
        </T>
      )}
      {!error && !!hint && <Muted style={{ marginTop: space(1.5) }}>{hint}</Muted>}
    </View>
  );
}

/** Nothing renders when there is no message, so call sites need no conditional. */
export const Alert = ({ children, tone: kind = "error" }: { children?: string | null; tone?: "error" | "warn" }) =>
  !children ? null : (
    <View
      accessibilityLiveRegion="polite"
      style={[
        s.alert,
        kind === "warn"
          ? { backgroundColor: tone.warningTint, borderColor: colors.amber400 }
          : { backgroundColor: tone.dangerTint, borderColor: colors.red500 },
      ]}
    >
      <T role="label" weight="500" color={kind === "warn" ? colors.amber800 : tone.danger}>
        {children}
      </T>
    </View>
  );

/**
 * A thin red bar while the API is unreachable, mounted once per screen tree.
 * It reports our own reachability, so it clears itself the moment any request
 * lands rather than waiting on the OS to change its mind about the radio.
 */
export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;

  return (
    <View style={s.offline} accessibilityLiveRegion="polite">
      <T role="caption" weight="700" color={colors.white}>
        {str.common.offline}
      </T>
    </View>
  );
}

/* ── Status ────────────────────────────────────────────────────────── */

const BADGE_TONE: Record<string, [string, string]> = {
  running: [colors.leaf50, colors.leaf700],
  active: [colors.leaf50, colors.leaf700],
  live: [colors.leaf50, colors.leaf700],
  boarded: [colors.brand50, colors.brand600],
  dropped: [colors.leaf50, colors.leaf700],
  absent: [colors.slate100, colors.slate600],
  waiting: [colors.sun100, colors.amber800],
  completed: [colors.slate100, colors.slate600],
  cancelled: [colors.red50, colors.red600],
  open: [colors.amber50, colors.amber800],
  delayed: [colors.sun100, colors.amber800],
};

export function Badge({ value, label }: { value?: string | null; label?: string }) {
  if (!value) return null;
  const [bg, fg] = BADGE_TONE[value] ?? [colors.slate100, colors.slate600];
  return (
    <View style={[s.badge, { backgroundColor: bg }]}>
      <T role="caption" weight="700" color={fg}>
        {label ?? titleCase(value)}
      </T>
    </View>
  );
}

/**
 * Stand-in faces for a student with no photo on file.
 *
 * Module scope on purpose: a 60-child roster renders 60 avatars, and rebuilding
 * this array inside the component was allocating it 60 times per pass.
 */
const AVATARS = [
  require("../assets/avatars/child-1.png"),
  require("../assets/avatars/child-2.png"),
  require("../assets/avatars/child-3.png"),
  require("../assets/avatars/child-4.png"),
  require("../assets/avatars/child-5.png"),
  require("../assets/avatars/child-6.png"),
  require("../assets/avatars/child-7.png"),
  require("../assets/avatars/child-8.png"),
];

/**
 * Which face a name gets. Deterministic, so a child keeps the same one across
 * renders, screens and app launches — a face that changed on every scroll would
 * read as the row belonging to a different child.
 */
const avatarFor = (name: string) => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return Math.abs(hash) % AVATARS.length;
};

export const Avatar = ({
  name,
  photoUrl,
  size = 40,
  onDark,
  illustrated = true,
}: {
  name: string;
  photoUrl?: string | null;
  size?: number;
  onDark?: boolean;
  illustrated?: boolean;
}) => {
  /* The API returns "/uploads/…", which is not something `Image` can fetch —
     it needs the origin on the front. Resolved here rather than at each call
     site so every avatar in the app is fixed by one guard; `assetUrl` leaves an
     already-absolute URL alone, so passing either kind is safe. */
  const uri = assetUrl(photoUrl);

  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.slate200 }}
        accessibilityLabel={name}
      />
    );
  }

  if (illustrated && name) {
    return (
      <Image
        source={AVATARS[avatarFor(name)]}
        style={{ width: size, height: size, borderRadius: size / 2 }}
        accessibilityLabel={name}
      />
    );
  }

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: onDark ? "rgba(255,255,255,0.22)" : colors.brand50,
      }}
    >
      <T size={size * 0.36} weight="700" color={onDark ? colors.white : colors.brand600}>
        {name ? initials(name) : ""}
      </T>
    </View>
  );
};

/** A tinted circular icon well. The app's most repeated shape. */
export const IconChip = ({
  children,
  bg = colors.brand50,
  size = 40,
  square,
}: {
  children: ReactNode;
  bg?: string;
  size?: number;
  square?: boolean;
}) => (
  <View
    style={{
      width: size,
      height: size,
      borderRadius: square ? radius.md : size / 2,
      backgroundColor: bg,
      alignItems: "center",
      justifyContent: "center",
    }}
  >
    {children}
  </View>
);

/** The pulsing dot that means "this number is updating right now". */
export function LiveDot({ color = colors.leaf400, size = 8, paused }: { color?: string; size?: number; paused?: boolean }) {
  const reduced = useReducedMotion() || paused;
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduced) return;
    const loop = Animated.loop(
      Animated.timing(pulse, {
        toValue: 1,
        duration: motion.pulse,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, reduced]);

  return (
    <View style={{ width: size, height: size }}>
      {!reduced && (
        <Animated.View
          style={{
            position: "absolute",
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: color,
            opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] }),
            transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 3] }) }],
          }}
        />
      )}
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />
    </View>
  );
}

export const Loading = ({ label }: { label?: string }) => (
  <View style={{ paddingVertical: space(12), alignItems: "center", gap: space(2.5) }}>
    <ActivityIndicator color={colors.brand600} />
    {!!label && <Muted role="label">{label}</Muted>}
  </View>
);

/**
 * A grey block where content is about to be. Used instead of a spinner wherever
 * the shape of the answer is already known, so the screen does not jump when it
 * arrives.
 */
export function Skeleton({
  height = 16,
  width,
  style,
}: {
  height?: number;
  width?: number | `${number}%`;
  style?: StyleProp<ViewStyle>;
}) {
  const reduced = useReducedMotion();
  const shimmer = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    if (reduced) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(shimmer, { toValue: 0.5, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [shimmer, reduced]);

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        { height, width: width ?? "100%", borderRadius: radius.sm, backgroundColor: colors.slate200 },
        reduced ? { opacity: 0.7 } : { opacity: shimmer },
        style,
      ]}
    />
  );
}

/** The standard "a card is loading" stack — icon well, a title line, a sub line. */
export const SkeletonRow = () => (
  <View style={{ flexDirection: "row", alignItems: "center", gap: space(3) }}>
    <Skeleton height={40} width={40} style={{ borderRadius: 20 }} />
    <View style={{ flex: 1, gap: space(2) }}>
      <Skeleton height={13} width="60%" />
      <Skeleton height={11} width="35%" />
    </View>
  </View>
);

/** Never just "no data" — an empty state says what to do about it. */
export const EmptyState = ({
  title,
  hint,
  action,
  art,
}: {
  title: string;
  hint?: string | null;
  action?: ReactNode;
  art?: number;
}) => (
  <View style={{ paddingVertical: space(8), paddingHorizontal: space(5), alignItems: "center", gap: space(1.5) }}>
    {art != null && (
      <Image
        source={art}
        style={{ width: 120, height: 120, marginBottom: space(4) }}
        resizeMode="contain"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
    )}
    <T role="heading">{title}</T>
    {!!hint && (
      <T role="body" color={tone.textMuted} style={{ textAlign: "center" }}>
        {hint}
      </T>
    )}
    {!!action && <View style={{ marginTop: space(3), alignSelf: "stretch" }}>{action}</View>}
  </View>
);

/** Failure with a way out. Errors read as instructions, not as stack traces. */
export const ErrorState = ({ message, onRetry }: { message?: string | null; onRetry?: () => void }) => {
  const isOffline = message?.includes("Cannot reach the server") || !message;
  const art = isOffline ? require("../assets/empty/offline.png") : require("../assets/empty/error.png");

  return (
    <Card>
      <EmptyState
        art={art}
        title={str.common.somethingWrong}
        hint={message ?? str.common.tryAgainHint}
        action={
          onRetry ? (
            <Button variant="secondary" block onPress={onRetry}>
              {str.common.tryAgain}
            </Button>
          ) : undefined
        }
      />
    </Card>
  );
};

export const Divider = () => <View style={{ height: 1, backgroundColor: colors.slate100 }} />;

/* ── Rows, tiles and chips ─────────────────────────────────────────── */

/** icon · title · subtitle · value/chevron. The app's workhorse list row. */
export function ListRow({
  icon,
  title,
  subtitle,
  value,
  right,
  onPress,
  danger,
  style,
}: {
  icon?: ReactNode;
  title: string;
  subtitle?: string | null;
  value?: string;
  right?: ReactNode;
  onPress?: () => void;
  danger?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const body = (
    <>
      {!!icon && icon}
      <View style={{ flex: 1, minWidth: 0 }}>
        <T role="body" weight="600" color={danger ? tone.danger : tone.textPrimary} numberOfLines={1}>
          {title}
        </T>
        {!!subtitle && (
          <Muted role="label" weight="400" numberOfLines={1} style={{ marginTop: 1 }}>
            {subtitle}
          </Muted>
        )}
      </View>
      {!!value && (
        <T role="label" weight="700" color={tone.textSecondary}>
          {value}
        </T>
      )}
      {right}
      {!!onPress && !right && (
        <T size={18} color={tone.borderStrong}>
          ›
        </T>
      )}
    </>
  );

  if (!onPress) return <View style={[s.row, style]}>{body}</View>;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [s.row, pressed && { backgroundColor: colors.slate50 }, style]}
    >
      {body}
    </Pressable>
  );
}

/** A number and what it counts. Tappable when there is somewhere to go. */
export function StatTile({
  value,
  label,
  icon,
  color = tone.textPrimary,
  bg = colors.white,
  onPress,
  active,
}: {
  value: ReactNode;
  label: string;
  icon?: ReactNode;
  color?: string;
  bg?: string;
  onPress?: () => void;
  active?: boolean;
}) {
  const brand = useBrand();
  const content = (
    <>
      {!!icon && <View style={{ marginBottom: space(1) }}>{icon}</View>}
      <T role="title" color={color} numberOfLines={1}>
        {value}
      </T>
      <Muted numberOfLines={1} style={{ marginTop: 2, textAlign: "center" }}>
        {label}
      </Muted>
    </>
  );

  const style: StyleProp<ViewStyle> = [
    s.tile,
    { backgroundColor: bg },
    active && { borderColor: brand.primary, borderWidth: 2 },
  ];

  if (!onPress) {
    return (
      <View style={style} accessibilityLabel={`${value} ${label}`}>
        {content}
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${value} ${label}`}
      style={({ pressed }) => [style, pressed && { opacity: 0.7 }]}
    >
      {content}
    </Pressable>
  );
}

/** A filter or selector pill. Takes the school's colour when selected. */
export function Chip({
  label,
  selected,
  onPress,
  icon,
  count,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: ReactNode;
  count?: number;
}) {
  const brand = useBrand();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: Boolean(selected) }}
      style={({ pressed }) => [
        s.chip,
        selected && { backgroundColor: brand.primary, borderColor: brand.primary },
        pressed && { opacity: 0.8 },
      ]}
    >
      {!!icon && icon}
      <T role="label" color={selected ? colors.white : tone.textSecondary}>
        {label}
        {count == null ? "" : ` ${count}`}
      </T>
    </Pressable>
  );
}

/**
 * A vertical run of events with a connector. Used for the parent's journey and
 * for anything else that is "these things happened, in this order".
 */
export function Timeline({
  items,
}: {
  items: { label: string; at?: string | null; state?: "done" | "current" | "upcoming" }[];
}) {
  return (
    <View>
      {items.map((item, i) => {
        const state = item.state ?? "done";
        const dotColour =
          state === "current" ? colors.brand600 : state === "upcoming" ? colors.slate300 : tone.success;
        const last = i === items.length - 1;

        return (
          <View key={`${item.label}-${i}`} style={{ flexDirection: "row", gap: space(3) }}>
            <View style={{ alignItems: "center", width: 20 }}>
              <View
                style={[
                  s.timelineDot,
                  { backgroundColor: dotColour },
                  state === "current" && { width: 14, height: 14, borderRadius: 7 },
                ]}
              />
              {!last && <View style={s.timelineLine} />}
            </View>
            <View style={{ flex: 1, paddingBottom: last ? 0 : space(4) }}>
              <T
                role="body"
                weight={state === "current" ? "700" : "500"}
                color={state === "upcoming" ? tone.textMuted : tone.textPrimary}
              >
                {item.label}
              </T>
              {!!item.at && <Muted style={{ marginTop: 1 }}>{item.at}</Muted>}
            </View>
          </View>
        );
      })}
    </View>
  );
}

/**
 * A horizontal track of stops, with the bus moving between them, and the
 * child's stop marked distinctly. Styled for a dark gradient background.
 */
export function HorizontalProgress({
  stops,
  myStopId,
  nextStopId,
}: {
  stops: { _id?: string; name: string }[];
  myStopId?: string | null;
  nextStopId?: string | null;
}) {
  const brand = useBrand();
  const N = stops.length;
  if (N < 2) return null;

  const myStopIndex = stops.findIndex((s) => s._id === myStopId);
  const nextStopIndex = stops.findIndex((s) => s._id === nextStopId);

  // Position of the bus on the track
  const busIndex = nextStopIndex <= 0 ? 0 : nextStopIndex - 0.5;
  const busPercent = (busIndex / (N - 1)) * 100;

  return (
    <View style={{ height: 40, justifyContent: "center", position: "relative", marginHorizontal: space(2) }}>
      {/* Background line */}
      <View style={{ height: 4, backgroundColor: "rgba(255,255,255,0.3)", borderRadius: 2 }} />
      
      {/* Completed progress line */}
      <View
        style={{
          position: "absolute",
          left: 0,
          right: `${100 - busPercent}%`,
          height: 4,
          backgroundColor: colors.white,
          borderRadius: 2,
        }}
      />

      {/* Render stop dots */}
      {stops.map((stop, i) => {
        const isMyStop = stop._id === myStopId;
        const isPassed = i < nextStopIndex;
        const dotPercent = (i / (N - 1)) * 100;
        
        return (
          <View
            key={stop._id ?? i}
            style={{
              position: "absolute",
              left: `${dotPercent}%`,
              transform: [{ translateX: isMyStop ? -8 : -5 }],
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {isMyStop ? (
              // Child's stop: distinct, larger ring
              <View
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: 8,
                  backgroundColor: colors.white,
                  borderWidth: 3,
                  borderColor: colors.brand600,
                  shadowColor: "#000",
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: 0.2,
                  shadowRadius: 1.5,
                  elevation: 2,
                }}
              />
            ) : (
              // Regular stop dot
              <View
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 5,
                  backgroundColor: isPassed ? colors.white : "rgba(255,255,255,0.5)",
                }}
              />
            )}
          </View>
        );
      })}

      {/* Bus marker */}
      <View
        style={{
          position: "absolute",
          left: `${busPercent}%`,
          transform: [{ translateX: -12 }, { translateY: -2 }],
          width: 24,
          height: 24,
          borderRadius: 12,
          backgroundColor: colors.white,
          alignItems: "center",
          justifyContent: "center",
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.25,
          shadowRadius: 3.84,
          elevation: 5,
        }}
      >
        <IconBus size={14} color={brand.primary} />
      </View>
    </View>
  );
}

/** Onboarding progress. Three dots beat "Step 2 of 3" for something this small. */
export const Dots = ({ count, index }: { count: number; index: number }) => {
  const brand = useBrand();
  return (
    <View
      style={{ flexDirection: "row", gap: space(1.5), justifyContent: "center" }}
      accessibilityLabel={str.common.stepOf(index + 1, count)}
    >
      {Array.from({ length: count }, (_, i) => (
        <View
          key={i}
          style={{
            width: i === index ? 20 : 7,
            height: 7,
            borderRadius: 4,
            backgroundColor: i === index ? brand.primary : colors.slate300,
          }}
        />
      ))}
    </View>
  );
};

/** A checked line in a permission primer. Icon plus text, never colour alone. */
export const CheckLine = ({ children }: { children: ReactNode }) => (
  <View style={{ flexDirection: "row", alignItems: "flex-start", gap: space(2.5) }}>
    <IconChip bg={tone.successTint} size={24}>
      <IconCheck size={14} color={tone.success} />
    </IconChip>
    <T role="body" color={tone.textSecondary} style={{ flex: 1 }}>
      {children}
    </T>
  </View>
);

/* ── Screen chrome ─────────────────────────────────────────────────── */

/**
 * The shield gradient, used for headers and hero cards. Takes the school's own
 * colour when one is configured — this is the surface where branding reads.
 */
/**
 * Slow-drifting translucent discs behind a hero's content.
 *
 * The gradient alone is a flat wall of colour. These give it depth and a sense
 * that the screen is alive without anything actually demanding attention —
 * a parent glancing at an ETA should register motion in their peripheral
 * vision, not be pulled to it.
 *
 * Everything here is white at low alpha, never a colour of its own, so it works
 * on top of whatever hue a school picked. Only `transform` and `opacity` are
 * animated, so the whole thing runs on the native driver and never touches the
 * JS thread.
 *
 * ponytail: three plain Views, not a blur or a particle system. RN has no
 * cheap backdrop blur on Android, and a driver's phone holds this screen for
 * hours — three interpolated transforms is a cost worth paying, a shader is
 * not.
 */
const BLOBS = [
  { size: 200, top: -70, left: -50, drift: 26, delay: 0, duration: 22000, alpha: 0.1 },
  { size: 150, top: 40, right: -50, drift: -22, delay: 2600, duration: 27000, alpha: 0.075 },
  { size: 110, bottom: -46, left: "38%" as const, drift: 18, delay: 5200, duration: 19000, alpha: 0.06 },
];

function Ambient({ paused }: { paused?: boolean }) {
  const reduced = useReducedMotion() || paused;
  // One shared 0→1→0 driver for all three; they differ by delay and distance,
  // which is cheaper than three independent loops and stays in step.
  const play = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduced) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(play, { toValue: 1, duration: 24000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(play, { toValue: 0, duration: 24000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [play, reduced]);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} accessibilityElementsHidden>
      {BLOBS.map((b, i) => {
        const { size, drift, alpha, ...pos } = b;
        return (
          <Animated.View
            key={i}
            style={{
              position: "absolute",
              ...pos,
              width: size,
              height: size,
              borderRadius: size / 2,
              backgroundColor: `rgba(255,255,255,${alpha})`,
              // Static under reduce-motion: the depth stays, the movement goes.
              transform: reduced
                ? []
                : [
                    { translateX: play.interpolate({ inputRange: [0, 1], outputRange: [0, drift] }) },
                    { translateY: play.interpolate({ inputRange: [0, 1], outputRange: [0, -drift * 0.6] }) },
                  ],
            }}
          />
        );
      })}
    </View>
  );
}

export const Shield = ({
  children,
  style,
  ambient,
  paused,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Adds the drifting background. For hero cards, not for headers. */
  ambient?: boolean;
  paused?: boolean;
}) => {
  const { gradient } = useBrand();
  return (
    <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={style}>
      {ambient && <Ambient paused={paused} />}
      {children}
    </LinearGradient>
  );
};

/** A school's logo, falling back to the BalVahini mark when none is set. */
export function SchoolLogo({ size = 44, onDark }: { size?: number; onDark?: boolean }) {
  const { logoUrl, schoolName, appName } = useBrand();

  if (logoUrl) {
    return (
      <Image
        source={{ uri: logoUrl }}
        style={{ width: size, height: size, borderRadius: radius.sm }}
        resizeMode="contain"
        accessibilityLabel={`${schoolName ?? appName} logo`}
      />
    );
  }

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: radius.sm,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: onDark ? "rgba(255,255,255,0.2)" : colors.brand50,
      }}
    >
      <T size={size * 0.4} weight="800" color={onDark ? colors.white : colors.brand600}>
        {(schoolName ?? appName).slice(0, 1).toUpperCase()}
      </T>
    </View>
  );
}

/** Every tab's outer wrapper: scrolls, breathes, and clears the tab bar. */
export function Screen({
  children,
  refreshing,
  onRefresh,
  scroll = true,
  gap = space(3),
  padded = true,
}: {
  children: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  scroll?: boolean;
  gap?: number;
  padded?: boolean;
}) {
  if (!scroll) {
    return (
      <View style={s.screen}>
        <OfflineBanner />
        {children}
      </View>
    );
  }

  return (
    <View style={s.screen}>
      <OfflineBanner />
      <ScrollView
        contentContainerStyle={[s.screenBody, { gap, padding: padded ? GUTTER : 0 }]}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={Boolean(refreshing)}
              onRefresh={onRefresh}
              colors={[colors.brand600]}
              tintColor={colors.brand600}
            />
          ) : undefined
        }
      >
        {children}
      </ScrollView>
    </View>
  );
}

/* ── Modal ─────────────────────────────────────────────────────────── */

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const reduced = useReducedMotion();
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (open) {
      if (reduced) {
        fade.setValue(0.45);
      } else {
        fade.setValue(0);
        Animated.timing(fade, {
          toValue: 0.45,
          duration: motion.base,
          useNativeDriver: false,
        }).start();
      }
    }
  }, [open, reduced]);

  return (
    <RNModal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <Animated.View style={[s.backdrop, { backgroundColor: fade.interpolate({
        inputRange: [0, 0.45],
        outputRange: ["rgba(15,23,42,0)", "rgba(15,23,42,0.45)"]
      }) }]}>
        {/* Tapping the dimmed area closes — the expected gesture on a sheet. */}
        <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel={str.common.close} />
        <SafeAreaView edges={["bottom"]} style={s.sheet}>
          <View style={s.grabber} />
          <T role="heading" size={19} style={{ paddingHorizontal: space(5), paddingBottom: space(3) }}>
            {title}
          </T>
          <ScrollView
            style={{ maxHeight: 440 }}
            contentContainerStyle={{ paddingHorizontal: space(5), paddingBottom: space(2) }}
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>
          {!!footer && <View style={s.sheetFooter}>{footer}</View>}
        </SafeAreaView>
      </Animated.View>
    </RNModal>
  );
}

/**
 * Confirmation for anything destructive or broadcast. Marking sixty children
 * boarded tells sixty parents their child is on a bus, so it asks first.
 */
export function Confirm({
  open,
  onClose,
  onConfirm,
  title,
  body,
  confirmLabel,
  variant = "danger",
  busy,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  body: string;
  confirmLabel: string;
  variant?: "danger" | "primary" | "success";
  busy?: boolean;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="secondary" onPress={onClose}>
            {str.common.cancel}
          </Button>
          <Button variant={variant} loading={busy} haptic="heavy" onPress={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <T role="body" color={tone.textSecondary} style={{ paddingBottom: space(2) }}>
        {body}
      </T>
    </Modal>
  );
}

/* ── Styles ────────────────────────────────────────────────────────── */

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: tone.surface },
  screenBody: { paddingBottom: space(7) },

  offline: {
    backgroundColor: tone.danger,
    paddingVertical: space(1.5),
    paddingHorizontal: GUTTER,
    alignItems: "center",
  },

  card: {
    backgroundColor: tone.surfaceRaised,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: tone.border,
    overflow: "hidden",
    ...elevation.raised,
  },
  cardHead: { flexDirection: "row", alignItems: "center", gap: space(2), padding: space(4), paddingBottom: 0 },
  cardHeadBordered: { paddingBottom: space(3), borderBottomWidth: 1, borderBottomColor: colors.slate100 },
  cardBody: { padding: space(4) },

  btn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space(2),
    borderRadius: radius.md,
  },

  input: {
    borderWidth: 1,
    borderColor: tone.borderStrong,
    borderRadius: radius.md,
    paddingHorizontal: space(3.5),
    minHeight: 52,
    fontSize: 16,
    color: tone.textPrimary,
    backgroundColor: colors.white,
  },
  fieldBox: { flexDirection: "row", alignItems: "center", gap: space(2.5) },

  alert: { borderWidth: 1, borderRadius: radius.md, padding: space(3) },

  badge: { paddingHorizontal: space(2.5), paddingVertical: space(1), borderRadius: radius.pill },

  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space(3),
    paddingHorizontal: space(4),
    // 44pt minimum target, with room for a wrapped title at 130% font scale.
    minHeight: 56,
    paddingVertical: space(2.5),
  },

  tile: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: tone.border,
    paddingVertical: space(3.5),
    paddingHorizontal: space(2),
    minHeight: 84,
  },

  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: space(2),
    paddingHorizontal: space(3.5),
    minHeight: 40,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: tone.borderStrong,
    backgroundColor: colors.white,
  },

  timelineDot: { width: 10, height: 10, borderRadius: 5, marginTop: space(1.5) },
  timelineLine: { flex: 1, width: 2, backgroundColor: colors.slate200, marginTop: space(1) },

  backdrop: { flex: 1, backgroundColor: "rgba(15,23,42,0.45)", justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.white, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingTop: space(2.5) },
  grabber: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: tone.border,
    marginBottom: space(3),
  },
  sheetFooter: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: space(2.5),
    padding: space(4),
    borderTopWidth: 1,
    borderTopColor: colors.slate100,
  },
});
