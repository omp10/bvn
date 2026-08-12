import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { api, useAction } from "../api";
import { colors, radius, space, tone } from "../theme";
import { str } from "../strings";
import { Alert, Button, Field, IconChip, Modal, Muted, T } from "../ui";
import { IconAlert, IconBus, IconCheck, IconPhone, IconShield } from "../icons";

const TYPES = [
  { key: "breakdown", label: str.emergency.breakdown, icon: IconBus },
  { key: "medical", label: str.emergency.medical, icon: IconPhone },
  { key: "accident", label: str.emergency.accident, icon: IconAlert },
  { key: "other", label: str.emergency.other, icon: IconShield },
] as const;

/**
 * The panic button, for drivers and attendants alike.
 *
 * A fresh idempotency key per press: a retried request collapses onto the alert
 * already raised, but a genuine second breakdown on the same trip still gets
 * through. Keying on trip state instead would silently swallow the second one.
 *
 * Four large cards rather than four small pills. This gets pressed by someone
 * whose hands are shaking, and the type is the only thing they have to get
 * right — the note is optional and the alert goes out either way.
 */
export default function EmergencySheet({
  open,
  onClose,
  tripId,
}: {
  open: boolean;
  onClose: () => void;
  tripId?: string;
}) {
  const { busy, error, run } = useAction();
  const [type, setType] = useState<string>("breakdown");
  const [note, setNote] = useState("");
  const [sent, setSent] = useState(false);

  const close = () => {
    setSent(false);
    setNote("");
    onClose();
  };

  const raise = () =>
    void run(
      () =>
        api("/emergencies", {
          body: {
            type,
            note: note || undefined,
            tripId,
            idempotencyKey: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
          },
        }),
      () => setSent(true)
    );

  return (
    <Modal
      open={open}
      onClose={close}
      title={str.emergency.title}
      footer={
        sent ? (
          <Button onPress={close}>{str.common.close}</Button>
        ) : (
          <>
            <Button variant="secondary" onPress={close}>
              {str.common.cancel}
            </Button>
            <Button variant="danger" loading={busy} haptic="heavy" onPress={raise}>
              {str.emergency.send}
            </Button>
          </>
        )
      }
    >
      {sent ? (
        <View style={{ alignItems: "center", gap: space(2), paddingVertical: space(4) }}>
          <IconChip bg={colors.leaf50} size={56}>
            <IconCheck size={26} color={tone.success} />
          </IconChip>
          <T role="heading">{str.emergency.sentTitle}</T>
          <Muted role="body" style={{ textAlign: "center" }}>
            {str.emergency.sentBody}
          </Muted>
        </View>
      ) : (
        <View style={{ gap: space(3.5) }}>
          <Alert>{error}</Alert>

          <View>
            <T role="label" color={tone.textSecondary} style={{ marginBottom: space(2) }}>
              {str.emergency.what}
            </T>
            <View style={s.grid}>
              {TYPES.map((option) => {
                const on = option.key === type;
                const Icon = option.icon;
                return (
                  <Pressable
                    key={option.key}
                    onPress={() => setType(option.key)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={option.label}
                    style={({ pressed }) => [
                      s.type,
                      on && { borderColor: tone.danger, backgroundColor: tone.dangerTint },
                      pressed && { opacity: 0.8 },
                    ]}
                  >
                    <Icon size={24} color={on ? tone.danger : tone.textMuted} />
                    <T role="label" weight={on ? "700" : "500"} color={on ? tone.danger : tone.textSecondary}>
                      {option.label}
                    </T>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <Field
            label={str.emergency.note}
            value={note}
            onChangeText={setNote}
            placeholder={str.emergency.notePlaceholder}
            multiline
            inputStyle={{ height: 84, paddingTop: space(3), textAlignVertical: "top" }}
          />

          <Muted role="label" weight="400">
            {str.emergency.warning}
          </Muted>
        </View>
      )}
    </Modal>
  );
}

const s = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space(2.5) },
  type: {
    // Two across, with the gap taken off so the pair fits the sheet's width.
    width: "48%",
    alignItems: "center",
    justifyContent: "center",
    gap: space(2),
    minHeight: 88,
    paddingVertical: space(3),
    borderRadius: radius.card,
    borderWidth: 2,
    borderColor: tone.border,
    backgroundColor: colors.white,
  },
});
