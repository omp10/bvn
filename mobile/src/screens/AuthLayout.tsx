import type { ReactNode } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import Svg, { Circle, Path, Rect } from "react-native-svg";
import { colors, elevation, radius, space, tone, VARIANT } from "../theme";
import { str } from "../strings";
import { OfflineBanner, Shield, T } from "../ui";

/** The mark: the shield, and the little yellow bus inside it. */
export function Mark({ size = 64 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      <Path
        d="M32 4 8 13v19c0 15 10.2 25.6 24 29 13.8-3.4 24-14 24-29V13z"
        fill="rgba(255,255,255,0.16)"
        stroke="#ffffff"
        strokeWidth={2.4}
      />
      <Rect x={20} y={20} width={24} height={25} rx={4.5} fill={colors.sun400} />
      <Rect x={23} y={24} width={18} height={9} rx={2} fill={colors.brand700} />
      <Rect x={23} y={36} width={5} height={3.5} rx={1.2} fill={colors.brand700} />
      <Rect x={36} y={36} width={5} height={3.5} rx={1.2} fill={colors.brand700} />
      <Circle cx={25} cy={46} r={2.8} fill={colors.slate900} />
      <Circle cx={39} cy={46} r={2.8} fill={colors.slate900} />
    </Svg>
  );
}

/**
 * The sign-in shell for both apps: the shield fills the screen, the form sits on
 * a white card over it. Same shape as the web `/login`, so a parent who has seen
 * one recognises the other.
 */
export default function AuthLayout({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  return (
    <Shield style={{ flex: 1 }}>
      <StatusBar style="light" />
      <SafeAreaView style={{ flex: 1 }}>
        {/* Sign-in is exactly where being offline is most confusing — an OTP
            that never arrives reads as a wrong number rather than no signal. */}
        <OfflineBanner />
        {/* Android needs a behavior too. With `undefined` the keyboard simply
            covered the lower fields — the OTP box on this very screen — and
            there was no way to see what you were typing. "height" is the one
            that cooperates with edge-to-edge; "padding" fights it. */}
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <ScrollView
            contentContainerStyle={s.body}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            // Scrolling with the keyboard up must not dismiss it mid-typing.
            keyboardDismissMode="none"
          >
            <View style={s.brand}>
              <Mark />
              <T role="title" size={28} color={colors.white} style={{ marginTop: space(3) }}>
                BalVahini
              </T>
              <T role="label" weight="400" color={tone.textOnDarkMuted} style={{ marginTop: 2 }}>
                {VARIANT === "parent" ? str.auth.parentTagline : str.auth.staffTagline}
              </T>
            </View>

            <View style={s.card}>{children}</View>

            {footer}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Shield>
  );
}

const s = StyleSheet.create({
  body: { flexGrow: 1, justifyContent: "center", padding: space(5), gap: space(2) },
  brand: { alignItems: "center", marginBottom: space(6) },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: space(5.5),
    ...elevation.floating,
  },
});
