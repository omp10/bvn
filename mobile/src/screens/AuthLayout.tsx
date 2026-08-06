import type { ReactNode } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import Svg, { Circle, Path, Rect } from "react-native-svg";
import { colors, radius, VARIANT } from "../theme";
import { Shield, T } from "../ui";

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
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView
            contentContainerStyle={s.body}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={s.brand}>
              <Mark />
              <T size={26} weight="800" color={colors.white} style={{ marginTop: 12 }}>
                BalVahini
              </T>
              <T size={13} color="rgba(255,255,255,0.75)" style={{ marginTop: 2 }}>
                {VARIANT === "parent" ? "Safe Journeys, Brighter Futures" : "For school staff and fleet owners"}
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
  body: { flexGrow: 1, justifyContent: "center", padding: 20, gap: 8 },
  brand: { alignItems: "center", marginBottom: 24 },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: 22,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
});
