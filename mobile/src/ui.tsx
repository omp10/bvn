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
import { useOnline } from "./api";
import { initials, titleCase } from "./format";
import { str } from "./strings";
import { IconCheck } from "./icons";

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
  style,
  inputStyle,
  ...rest
}: TextInputProps & {
  label?: string;
  hint?: string;
  /** A server validation message, shown against the field it names. */
  error?: string | null;
  inputStyle?: StyleProp<any>;
}) {
  return (
    <View style={style}>
      {!!label && (
        <T role="label" color={tone.textSecondary} style={{ marginBottom: space(1.5) }}>
          {label}
        </T>
      )}
      <TextInput
        placeholderTextColor={colors.slate400}
        accessibilityLabel={label}
        maxFontSizeMultiplier={MAX_FONT_SCALE}
        style={[s.input, error ? { borderColor: tone.danger } : null, inputStyle]}
        {...rest}
      />
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

export const Avatar = ({
  name,
  photoUrl,
  size = 40,
  onDark,
}: {
  name: string;
  photoUrl?: string | null;
  size?: number;
  onDark?: boolean;
}) => {
  if (photoUrl) {
    return (
      <Image
        source={{ uri: photoUrl }}
        style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.slate200 }}
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
        {initials(name)}
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
export function LiveDot({ color = colors.leaf400, size = 8 }: { color?: string; size?: number }) {
  const reduced = useReducedMotion();
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
}: {
  title: string;
  hint?: string | null;
  action?: ReactNode;
}) => (
  <View style={{ paddingVertical: space(8), paddingHorizontal: space(5), alignItems: "center", gap: space(1.5) }}>
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
export const ErrorState = ({ message, onRetry }: { message?: string | null; onRetry?: () => void }) => (
  <Card>
    <EmptyState
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
export const Shield = ({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) => {
  const { gradient } = useBrand();
  return (
    <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={style}>
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
  return (
    <RNModal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.backdrop}>
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
      </View>
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
