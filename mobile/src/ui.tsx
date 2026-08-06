import { useEffect, useRef, type ReactNode } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Modal as RNModal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, radius, shadow, shieldGradient } from "./theme";
import { initials, titleCase } from "./format";

/* ── Text ──────────────────────────────────────────────────────────── */

export const T = ({
  children,
  size = 14,
  weight = "400",
  color = colors.slate800,
  style,
  ...rest
}: {
  children: ReactNode;
  size?: number;
  weight?: "400" | "500" | "600" | "700" | "800";
  color?: string;
  style?: StyleProp<any>;
  numberOfLines?: number;
}) => (
  <Text style={[{ fontSize: size, fontWeight: weight, color }, style]} {...rest}>
    {children}
  </Text>
);

export const Muted = ({ children, size = 12, ...rest }: any) => (
  <T size={size} color={colors.slate500} {...rest}>
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
            {!!title && <T weight="700" size={15}>{title}</T>}
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

type ButtonVariant = "primary" | "secondary" | "success" | "danger" | "ghost";

const BUTTON_FILL: Record<ButtonVariant, string> = {
  primary: colors.brand600,
  secondary: colors.white,
  success: colors.leaf600,
  danger: colors.red600,
  ghost: "transparent",
};

const BUTTON_TEXT: Record<ButtonVariant, string> = {
  primary: colors.white,
  secondary: colors.slate800,
  success: colors.white,
  danger: colors.white,
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
  style,
}: {
  children: ReactNode;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: "sm" | "md" | "lg";
  block?: boolean;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const off = disabled || loading;
  const height = size === "sm" ? 36 : size === "lg" ? 54 : 46;

  return (
    <Pressable
      onPress={off ? undefined : onPress}
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(off) }}
      style={({ pressed }) => [
        s.btn,
        {
          height,
          backgroundColor: BUTTON_FILL[variant],
          borderWidth: variant === "secondary" ? 1 : 0,
          borderColor: colors.slate300,
          opacity: off ? 0.5 : pressed ? 0.85 : 1,
          alignSelf: block ? "stretch" : "flex-start",
          paddingHorizontal: size === "sm" ? 12 : 20,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={BUTTON_TEXT[variant]} size="small" />
      ) : (
        <T
          weight="700"
          size={size === "sm" ? 13 : size === "lg" ? 16 : 15}
          color={BUTTON_TEXT[variant]}
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
  style,
  inputStyle,
  ...rest
}: TextInputProps & { label?: string; hint?: string; inputStyle?: StyleProp<any> }) {
  return (
    <View style={style}>
      {!!label && (
        <T size={13} weight="600" color={colors.slate600} style={{ marginBottom: 6 }}>
          {label}
        </T>
      )}
      <TextInput
        placeholderTextColor={colors.slate400}
        style={[s.input, inputStyle]}
        {...rest}
      />
      {!!hint && <Muted style={{ marginTop: 5 }}>{hint}</Muted>}
    </View>
  );
}

/** Nothing renders when there is no message, so call sites need no conditional. */
export const Alert = ({ children, tone = "error" }: { children?: string | null; tone?: "error" | "warn" }) =>
  !children ? null : (
    <View
      style={[
        s.alert,
        tone === "warn"
          ? { backgroundColor: colors.amber50, borderColor: colors.amber400 }
          : { backgroundColor: colors.red50, borderColor: colors.red500 },
      ]}
    >
      <T size={13} color={tone === "warn" ? colors.amber800 : colors.red600}>
        {children}
      </T>
    </View>
  );

/* ── Status ────────────────────────────────────────────────────────── */

const BADGE_TONE: Record<string, [string, string]> = {
  running: [colors.leaf50, colors.leaf700],
  active: [colors.leaf50, colors.leaf700],
  boarded: [colors.brand50, colors.brand600],
  dropped: [colors.leaf50, colors.leaf700],
  absent: [colors.slate100, colors.slate600],
  completed: [colors.slate100, colors.slate600],
  cancelled: [colors.red50, colors.red600],
  open: [colors.amber50, colors.amber800],
};

export function Badge({ value }: { value?: string | null }) {
  if (!value) return null;
  const [bg, fg] = BADGE_TONE[value] ?? [colors.slate100, colors.slate600];
  return (
    <View style={[s.badge, { backgroundColor: bg }]}>
      <T size={11} weight="700" color={fg}>
        {titleCase(value)}
      </T>
    </View>
  );
}

export const Avatar = ({ name, size = 40, onDark }: { name: string; size?: number; onDark?: boolean }) => (
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

/** The pulsing dot that means "this number is updating right now". */
export function LiveDot({ color = colors.leaf400 }: { color?: string }) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(pulse, {
        toValue: 1,
        duration: 2000,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <View style={{ width: 8, height: 8 }}>
      <Animated.View
        style={{
          position: "absolute",
          width: 8,
          height: 8,
          borderRadius: 4,
          backgroundColor: color,
          opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] }),
          transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 3] }) }],
        }}
      />
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
    </View>
  );
}

export const Loading = ({ label }: { label?: string }) => (
  <View style={{ paddingVertical: 48, alignItems: "center", gap: 10 }}>
    <ActivityIndicator color={colors.brand600} />
    {!!label && <Muted>{label}</Muted>}
  </View>
);

export const EmptyState = ({ title, hint }: { title: string; hint?: string | null }) => (
  <View style={{ paddingVertical: 32, paddingHorizontal: 20, alignItems: "center", gap: 6 }}>
    <T weight="700" size={15}>{title}</T>
    {!!hint && <Muted style={{ textAlign: "center", lineHeight: 18 }}>{hint}</Muted>}
  </View>
);

export const Divider = () => <View style={{ height: 1, backgroundColor: colors.slate100 }} />;

/* ── Screen chrome ─────────────────────────────────────────────────── */

/** The shield gradient, used for headers and hero cards. */
export const Shield = ({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) => (
  <LinearGradient
    colors={shieldGradient}
    start={{ x: 0, y: 0 }}
    end={{ x: 1, y: 1 }}
    style={style}
  >
    {children}
  </LinearGradient>
);

/** Every tab's outer wrapper: scrolls, breathes, and clears the tab bar. */
export function Screen({
  children,
  refreshing,
  onRefresh,
  scroll = true,
}: {
  children: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  scroll?: boolean;
}) {
  if (!scroll) return <View style={s.screen}>{children}</View>;

  return (
    <ScrollView
      style={s.screen}
      contentContainerStyle={s.screenBody}
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
        <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel="Close" />
        <SafeAreaView edges={["bottom"]} style={s.sheet}>
          <View style={s.grabber} />
          <T weight="700" size={17} style={{ paddingHorizontal: 20, paddingBottom: 12 }}>
            {title}
          </T>
          <ScrollView
            style={{ maxHeight: 420 }}
            contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 8 }}
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

/* ── Styles ────────────────────────────────────────────────────────── */

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.slate50 },
  screenBody: { padding: 14, gap: 12, paddingBottom: 28 },

  card: {
    backgroundColor: colors.white,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.slate200,
    overflow: "hidden",
    ...shadow,
  },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 8, padding: 14, paddingBottom: 0 },
  cardHeadBordered: { paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.slate100 },
  cardBody: { padding: 14 },

  btn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: radius.md },

  input: {
    borderWidth: 1,
    borderColor: colors.slate300,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    height: 50,
    fontSize: 16,
    color: colors.slate900,
    backgroundColor: colors.white,
  },

  alert: { borderWidth: 1, borderRadius: radius.md, padding: 12 },

  badge: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: radius.pill },

  backdrop: { flex: 1, backgroundColor: "rgba(15,23,42,0.45)", justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.white, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingTop: 10 },
  grabber: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.slate200,
    marginBottom: 12,
  },
  sheetFooter: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: colors.slate100,
  },
});
