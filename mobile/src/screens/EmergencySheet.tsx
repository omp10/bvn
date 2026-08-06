import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { api, useAction } from "../api";
import { titleCase } from "../format";
import { colors, radius } from "../theme";
import { Alert, Button, Field, Modal, Muted, T } from "../ui";
import { IconAlert } from "../icons";

const TYPES = ["breakdown", "medical", "accident", "other"] as const;

/**
 * The panic button, for drivers and attendants alike.
 *
 * A fresh idempotency key per press: a retried request collapses onto the alert
 * already raised, but a genuine second breakdown on the same trip still gets
 * through. Keying on trip state instead would silently swallow the second one.
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
      title="Raise an emergency"
      footer={
        sent ? (
          <Button onPress={close}>Close</Button>
        ) : (
          <>
            <Button variant="secondary" onPress={close}>Cancel</Button>
            <Button variant="danger" loading={busy} onPress={raise}>Send alert</Button>
          </>
        )
      }
    >
      {sent ? (
        <View style={{ alignItems: "center", gap: 8, paddingVertical: 16 }}>
          <View style={s.sentIcon}>
            <IconAlert size={22} color={colors.leaf600} />
          </View>
          <T size={15} weight="700">Alert sent</T>
          <Muted style={{ textAlign: "center", lineHeight: 18 }}>
            The school office and every parent on this bus have been notified.
          </Muted>
        </View>
      ) : (
        <View style={{ gap: 14 }}>
          <Alert>{error}</Alert>

          <View>
            <T size={13} weight="600" color={colors.slate600} style={{ marginBottom: 8 }}>
              What has happened?
            </T>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {TYPES.map((t) => {
                const on = t === type;
                return (
                  <Pressable
                    key={t}
                    onPress={() => setType(t)}
                    style={[s.type, on && { borderColor: colors.red600, backgroundColor: colors.red50 }]}
                  >
                    <T size={13} weight={on ? "700" : "500"} color={on ? colors.red600 : colors.slate600}>
                      {titleCase(t)}
                    </T>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <Field
            label="Anything to add?"
            value={note}
            onChangeText={setNote}
            placeholder="Front tyre punctured near Anand Nagar."
            multiline
            inputStyle={{ height: 84, paddingTop: 12, textAlignVertical: "top" }}
          />

          <Muted style={{ lineHeight: 17 }}>
            This immediately alerts the school office, the platform, and the parents of every child on this bus.
          </Muted>
        </View>
      )}
    </Modal>
  );
}

const s = StyleSheet.create({
  sentIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.leaf50,
    alignItems: "center",
    justifyContent: "center",
  },
  type: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.slate200,
    backgroundColor: colors.white,
  },
});
