import { useRef, useState } from "react";
import { Modal as RNModal, Pressable, StyleSheet, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { schoolCodeFrom } from "../schoolCode";
import { colors, radius } from "../theme";
import { useBrand } from "../brand";
import { str } from "../strings";
import { Button, Muted, T } from "../ui";

/**
 * Scans a school's QR code — FRD §16.2.
 *
 * The printed code encodes an invite URL; `schoolCodeFrom` also accepts the JSON
 * payload and a bare code, because the same six characters reach parents by SMS
 * and on paper too.
 */
export default function QrScanner({
  open,
  onClose,
  onCode,
}: {
  open: boolean;
  onClose: () => void;
  onCode: (code: string) => void;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const [problem, setProblem] = useState<string | null>(null);
  const { appName } = useBrand();

  /* A camera fires the same barcode many times a second. Without this the
     parent's screen would fire onCode dozens of times and race the navigation
     that follows it. */
  const done = useRef(false);

  const handle = (value: string) => {
    if (done.current) return;
    const code = schoolCodeFrom(value);
    if (!code) {
      setProblem("That does not look like a BalVahini school code. Try the printed code instead.");
      return;
    }
    done.current = true;
    onCode(code);
    close();
  };

  const close = () => {
    // Reset for the next open, not on unmount — the modal is kept mounted.
    setTimeout(() => (done.current = false), 300);
    setProblem(null);
    onClose();
  };

  return (
    <RNModal visible={open} animationType="slide" onRequestClose={close}>
      <View style={s.fill}>
        <StatusBar style="light" />
        {permission?.granted ? (
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            onBarcodeScanned={({ data }) => handle(data)}
          />
        ) : null}

        <SafeAreaView style={s.overlay}>
          <View style={{ alignItems: "flex-end" }}>
            <Pressable onPress={close} hitSlop={12} style={s.close}>
              <T size={16} weight="700" color={colors.white}>✕</T>
            </Pressable>
          </View>

          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 20 }}>
            {permission?.granted ? (
              <>
                <View style={s.reticle} />
                <T size={14} weight="600" color={colors.white} style={{ textAlign: "center" }}>
                  {str.map.scanHint}
                </T>
              </>
            ) : (
              <View style={{ paddingHorizontal: 32, gap: 12, alignItems: "center" }}>
                <T size={17} weight="700" color={colors.white} style={{ textAlign: "center" }}>
                  {str.map.cameraTitle}
                </T>
                <Muted size={13} style={{ color: "rgba(255,255,255,0.75)", textAlign: "center", lineHeight: 19 }}>
                  {str.map.cameraBody(appName)}
                </Muted>
                <Button onPress={() => void requestPermission()}>{str.map.cameraAllow}</Button>
              </View>
            )}

            {!!problem && (
              <View style={s.problem}>
                <T size={13} color={colors.white} style={{ textAlign: "center", lineHeight: 18 }}>
                  {problem}
                </T>
              </View>
            )}
          </View>

          <Button variant="secondary" block onPress={close}>
            {str.map.typeInstead}
          </Button>
        </SafeAreaView>
      </View>
    </RNModal>
  );
}

const s = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.slate900 },
  overlay: { flex: 1, padding: 20, justifyContent: "space-between" },
  close: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  reticle: {
    width: 230,
    height: 230,
    borderRadius: radius.lg,
    borderWidth: 3,
    borderColor: colors.white,
    backgroundColor: "transparent",
  },
  problem: {
    marginHorizontal: 16,
    backgroundColor: "rgba(220,38,38,0.9)",
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
});
