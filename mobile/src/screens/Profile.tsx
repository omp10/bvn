import { useState } from "react";
import { Linking, Pressable, StyleSheet, View } from "react-native";
import Constants from "expo-constants";
import { api, useAction } from "../api";
import { ROLE_LABEL, useAuth } from "../auth";
import { colors, radius, VARIANT } from "../theme";
import {
  Alert, Avatar, Button, Card, Divider, Field, Modal, Muted, Screen, T,
} from "../ui";
import { IconPhone, IconSchool, IconShield } from "../icons";

/**
 * Account screen.
 *
 * Signing out lives here rather than in the header: on a moving bus the header
 * is exactly where a thumb lands, and a driver mid-trip logging out by accident
 * stops the school seeing the bus.
 */
export default function Profile() {
  const { user, school, signOut } = useAuth();
  const [changing, setChanging] = useState(false);
  const [confirmOut, setConfirmOut] = useState(false);

  if (!user) return null;

  return (
    <Screen>
      <Card>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
          <Avatar name={user.name} size={64} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <T size={18} weight="800" numberOfLines={1}>{user.name}</T>
            <Muted size={13}>{ROLE_LABEL[user.role]}</Muted>
            <Muted size={13}>{user.phone}</Muted>
          </View>
        </View>
      </Card>

      {!!school && (
        <Card>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View style={s.icon}>
              <IconSchool size={20} color={colors.brand600} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <T size={15} weight="700" numberOfLines={1}>{school.name}</T>
              <Muted size={11}>School code {school.code}</Muted>
            </View>
          </View>
        </Card>
      )}

      <Card padded={false}>
        {/* Parents have no password — they sign in with an OTP every time. */}
        {VARIANT === "staff" && (
          <>
            <Pressable onPress={() => setChanging(true)} style={s.row}>
              <IconShield size={20} color={colors.slate400} />
              <T size={14} weight="500" style={{ flex: 1 }}>Change password</T>
              <T size={16} color={colors.slate300}>›</T>
            </Pressable>
            <Divider />
          </>
        )}
        <Pressable onPress={() => Linking.openURL("tel:112")} style={s.row}>
          <IconPhone size={20} color={colors.slate400} />
          <T size={14} weight="500" style={{ flex: 1 }}>Emergency helpline</T>
          <T size={14} weight="700" color={colors.brand600}>112</T>
        </Pressable>
      </Card>

      <Button variant="secondary" block onPress={() => setConfirmOut(true)}>
        Sign out
      </Button>

      <View style={{ alignItems: "center", gap: 2, paddingTop: 4 }}>
        <Muted size={11}>BalVahini · Safe Journeys, Brighter Futures</Muted>
        <Muted size={11}>Version {Constants.expoConfig?.version ?? "1.0.0"}</Muted>
      </View>

      <ChangePassword open={changing} onClose={() => setChanging(false)} />

      <Modal
        open={confirmOut}
        onClose={() => setConfirmOut(false)}
        title="Sign out?"
        footer={
          <>
            <Button variant="secondary" onPress={() => setConfirmOut(false)}>Stay signed in</Button>
            <Button variant="danger" onPress={signOut}>Sign out</Button>
          </>
        }
      >
        <T size={14} color={colors.slate600} style={{ lineHeight: 20 }}>
          {user.role === "driver"
            ? "If a trip is running, the school will stop seeing your bus until you sign in and start it again."
            : user.role === "parent"
              ? "You'll need your school code and a fresh OTP to sign back in."
              : "You'll need your password to sign back in."}
        </T>
      </Modal>
    </Screen>
  );
}

function ChangePassword({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { busy, error, run } = useAction();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [done, setDone] = useState(false);

  const close = () => {
    setDone(false);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="Change password"
      footer={
        done ? (
          <Button onPress={close}>Close</Button>
        ) : (
          <>
            <Button variant="secondary" onPress={onClose}>Cancel</Button>
            <Button
              loading={busy}
              disabled={!current || next.length < 6}
              onPress={() =>
                void run(
                  () => api("/auth/change-password", { body: { currentPassword: current, newPassword: next } }),
                  () => {
                    setCurrent("");
                    setNext("");
                    setDone(true);
                  }
                )
              }
            >
              Change
            </Button>
          </>
        )
      }
    >
      {done ? (
        <T size={14} color={colors.slate600} style={{ lineHeight: 20, paddingVertical: 4 }}>
          Password changed. Every other device has been signed out — this one stays.
        </T>
      ) : (
        <View style={{ gap: 14 }}>
          <Alert>{error}</Alert>
          <Field label="Current password" value={current} onChangeText={setCurrent} secureTextEntry />
          <Field
            label="New password"
            hint="At least 6 characters"
            value={next}
            onChangeText={setNext}
            secureTextEntry
          />
        </View>
      )}
    </Modal>
  );
}

const s = StyleSheet.create({
  icon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.brand50,
    alignItems: "center",
    justifyContent: "center",
  },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 14 },
});
