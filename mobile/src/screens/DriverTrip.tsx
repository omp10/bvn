import { useState } from "react";
import { Image, Linking, Pressable, StyleSheet, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useNavigation } from "@react-navigation/native";
import { api, uploadPhoto, useAction, useQuery } from "../api";
import { clearBuffer, useTripTracker } from "../tracker";
import { ago, time } from "../format";
import { colors, radius } from "../theme";
import {
  Alert, Badge, Button, Card, EmptyState, Loading, Muted, Screen, T,
} from "../ui";
import { IconAlert, IconBus, IconCamera, IconCheck, IconClock, IconPin, IconUsers } from "../icons";
import EmergencySheet from "./EmergencySheet";

/**
 * The driver's screen. One decision at a time, big targets, readable at arm's
 * length in a parked bus.
 */
export default function DriverTrip() {
  const navigation = useNavigation<any>();
  // Every hook runs before any early return — React matches hooks by call order,
  // and a `return` above one of them is React error #310, not a subtle bug.
  const { data, loading, error, reload } = useQuery<any>("/driver/my-bus");
  const action = useAction();
  const [sos, setSos] = useState(false);
  const [selfieUrl, setSelfieUrl] = useState<string | null>(null);
  const [selfiePreview, setSelfiePreview] = useState<string | null>(null);

  const trip = data?.activeTrip;
  const route = data?.vehicle?.routeId;
  const requireSelfie = data?.requireSelfie !== false;

  // Streams the position while a trip runs, and stops the moment it ends.
  const gps = useTripTracker(trip?._id ?? null);

  if (loading && !data) return <Loading label="Finding your bus…" />;
  if (error) {
    return (
      <Screen>
        <Card><EmptyState title="Nothing assigned yet" hint={error} /></Card>
        <Button variant="secondary" block onPress={reload}>Try again</Button>
      </Screen>
    );
  }

  const startTrip = (type: "morning" | "evening") =>
    // Safe to press twice: the server returns the same trip on a retry.
    void action.run(
      () => api("/driver/trips/start", { body: { type, selfieUrl: selfieUrl ?? undefined } }),
      () => {
        setSelfieUrl(null);
        setSelfiePreview(null);
        reload();
      }
    );

  const endTrip = () =>
    void action.run(async () => {
      await api(`/driver/trips/${trip._id}/end`, { method: "POST" });
      await clearBuffer();
      reload();
    });

  return (
    <Screen refreshing={loading} onRefresh={reload}>
      <Alert>{action.error}</Alert>

      <Card>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View style={s.busIcon}>
            <IconBus size={24} color={colors.brand600} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <T size={18} weight="800">{data?.vehicle?.busNumber ?? "—"}</T>
            <Muted size={13}>{data?.vehicle?.vehicleNumber}</Muted>
          </View>
          <Badge value={trip ? "running" : data?.vehicle?.status} />
        </View>

        <View style={s.metrics}>
          {/* Tapping the count is the obvious gesture, and it used to do
              nothing. It now opens the roster with each child's status. */}
          <Metric
            icon={<IconUsers size={16} color={colors.slate400} />}
            label="Students"
            value={data?.studentCount ?? 0}
            onPress={() => navigation.navigate("Students")}
          />
          <Metric icon={<IconPin size={16} color={colors.slate400} />} label="Stops" value={route?.stops?.length ?? 0} />
          <Metric icon={<IconClock size={16} color={colors.slate400} />} label="Started" value={trip ? time(trip.startedAt) : "—"} />
        </View>
      </Card>

      {trip ? (
        <>
          <GpsPanel gps={gps} />

          <Card>
            <T size={14} color={colors.slate600} style={{ lineHeight: 20 }}>
              Your <T size={14} weight="700">{trip.type}</T> trip is running. The bus keeps reporting even
              with the screen off — you can put the phone down.
            </T>
            <Button variant="danger" size="lg" block style={{ marginTop: 16 }} loading={action.busy} onPress={endTrip}>
              End trip
            </Button>
          </Card>
        </>
      ) : (
        <Card title="Start today's trip">
          {requireSelfie && (
            <SelfieCheckIn
              preview={selfiePreview}
              onCaptured={(url, preview) => {
                setSelfieUrl(url);
                setSelfiePreview(preview);
              }}
              onClear={() => {
                setSelfieUrl(null);
                setSelfiePreview(null);
              }}
            />
          )}

          <View style={{ gap: 10 }}>
            <Button
              size="lg"
              block
              loading={action.busy}
              disabled={requireSelfie && !selfieUrl}
              onPress={() => startTrip("morning")}
            >
              Morning trip
            </Button>
            <Button
              size="lg"
              block
              variant="success"
              loading={action.busy}
              disabled={requireSelfie && !selfieUrl}
              onPress={() => startTrip("evening")}
            >
              Evening trip
            </Button>
          </View>

          {requireSelfie && !selfieUrl && (
            <Muted style={{ textAlign: "center", marginTop: 12 }}>
              Take your photo above to enable the trip buttons.
            </Muted>
          )}
          {!route && (
            <T size={13} color={colors.amber600} style={{ marginTop: 12, lineHeight: 18 }}>
              No route is set for this bus — parents will not see stop-by-stop progress.
            </T>
          )}
        </Card>
      )}

      {route?.stops?.length > 0 && (
        <Card title={route.name} subtitle="Today's stops">
          <View style={{ gap: 12 }}>
            {route.stops.map((stop: any, i: number) => (
              <View key={stop._id ?? i} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <View style={s.stopNumber}>
                  <T size={12} weight="700" color={colors.slate600}>{i + 1}</T>
                </View>
                <T size={13} weight="500" style={{ flex: 1 }} numberOfLines={1}>{stop.name}</T>
                <Muted size={11}>{stop.pickupTime ?? ""}</Muted>
              </View>
            ))}
          </View>
        </Card>
      )}

      {/* Xiaomi, Oppo, Vivo and Realme kill background services regardless of a
          correctly declared foreground service. No amount of correct code avoids
          this — the driver has to grant the exemption once, so say so where they
          will actually read it. */}
      {trip && !gps.needsPermission && (
        <Card>
          <T size={13} weight="700">Tracking stops when the phone sleeps?</T>
          <Muted style={{ marginTop: 4, lineHeight: 18 }}>
            Some phones (Xiaomi, Oppo, Vivo, Realme) shut BalVahini down in the
            background. Open Settings and allow it to run without restriction —
            once is enough.
          </Muted>
          <Button
            variant="secondary"
            size="sm"
            block
            style={{ marginTop: 12 }}
            onPress={() => Linking.openSettings()}
          >
            Open app settings
          </Button>
        </Card>
      )}

      <Button variant="danger" size="lg" block onPress={() => setSos(true)}>
        Emergency
      </Button>

      <EmergencySheet open={sos} onClose={() => setSos(false)} tripId={trip?._id} />
    </Screen>
  );
}

/**
 * Driver check-in photo — the front camera, straight to the uploads endpoint.
 * The office needs to know who is actually behind the wheel today.
 */
function SelfieCheckIn({
  preview,
  onCaptured,
  onClear,
}: {
  preview: string | null;
  onCaptured: (url: string, preview: string) => void;
  onClear: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const capture = async () => {
    setError(null);

    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setError("Camera permission is needed for the check-in photo.");
      return;
    }

    const shot = await ImagePicker.launchCameraAsync({
      cameraType: ImagePicker.CameraType.front,
      // A check-in photo is a face, not a document — full resolution would just
      // be a slower upload on a phone tethered to a bus.
      quality: 0.6,
      allowsEditing: false,
    });
    if (shot.canceled || !shot.assets?.[0]) return;

    setBusy(true);
    try {
      const { url } = await uploadPhoto(shot.assets[0].uri);
      onCaptured(url, shot.assets[0].uri);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ marginBottom: 16, gap: 10 }}>
      <Alert>{error}</Alert>

      {preview ? (
        <View style={s.selfieDone}>
          <Image source={{ uri: preview }} style={s.selfieImage} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <IconCheck size={16} color={colors.leaf700} />
              <T size={14} weight="700" color={colors.leaf700}>Photo taken</T>
            </View>
            <Muted style={{ marginTop: 2, lineHeight: 16 }}>
              Sent with your trip so the office knows who is driving.
            </Muted>
          </View>
          <Button size="sm" variant="secondary" onPress={() => { onClear(); void capture(); }}>
            Retake
          </Button>
        </View>
      ) : (
        <Pressable onPress={busy ? undefined : capture} style={[s.selfiePrompt, busy && { opacity: 0.6 }]}>
          <View style={s.busIcon}>
            <IconCamera size={24} color={colors.brand600} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <T size={14} weight="700">{busy ? "Uploading…" : "Take your check-in photo"}</T>
            <Muted style={{ marginTop: 2 }}>Required before you can start the trip</Muted>
          </View>
        </Pressable>
      )}
    </View>
  );
}

export function GpsPanel({ gps }: { gps: ReturnType<typeof useTripTracker> }) {
  const healthy = gps.tracking && gps.lastFix && !gps.error;

  return (
    <Card style={{ borderColor: healthy ? colors.leaf400 : gps.error ? colors.amber400 : colors.slate200 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <View style={[s.gpsIcon, { backgroundColor: healthy ? colors.leaf50 : colors.amber50 }]}>
          {healthy ? (
            <IconCheck size={20} color={colors.leaf600} />
          ) : (
            <IconPin size={20} color={colors.amber600} />
          )}
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <T size={14} weight="700">
            {healthy ? "Sharing location" : gps.tracking ? "Getting a GPS fix…" : "Not sharing"}
          </T>
          <Muted size={11}>
            {gps.lastFix
              ? `Last fix ${ago(gps.lastFix.at)}${gps.lastFix.accuracy ? ` · ±${gps.lastFix.accuracy} m` : ""}`
              : "Waiting for the first position"}
          </Muted>
        </View>
      </View>

      {!!gps.error && <Alert tone="warn">{gps.error}</Alert>}

      {gps.buffered > 0 && (
        // Nothing is lost in a dead zone — say so, or the driver will worry.
        <View style={s.queued}>
          <T size={12} color={colors.slate600} style={{ lineHeight: 17 }}>
            {gps.buffered} point{gps.buffered === 1 ? "" : "s"} saved on this phone, waiting for signal. They
            upload automatically.
          </T>
        </View>
      )}
    </Card>
  );
}

const Metric = ({
  icon, label, value, onPress,
}: {
  icon: React.ReactNode; label: string; value: React.ReactNode; onPress?: () => void;
}) => (
  <Pressable
    onPress={onPress}
    disabled={!onPress}
    style={({ pressed }) => [{ flex: 1, alignItems: "center" }, pressed && onPress && { opacity: 0.6 }]}
  >
    {icon}
    <T size={16} weight="700" style={{ marginTop: 4 }} color={onPress ? colors.brand600 : colors.slate900}>
      {value}
    </T>
    <Muted size={11}>{onPress ? `${label} ›` : label}</Muted>
  </Pressable>
);

const s = StyleSheet.create({
  busIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.brand50,
    alignItems: "center",
    justifyContent: "center",
  },
  gpsIcon: { width: 40, height: 40, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  metrics: {
    flexDirection: "row",
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: colors.slate100,
  },
  stopNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.slate100,
    alignItems: "center",
    justifyContent: "center",
  },
  selfieDone: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: colors.leaf400,
    backgroundColor: colors.leaf50,
    borderRadius: radius.md,
    padding: 12,
  },
  selfieImage: { width: 60, height: 60, borderRadius: radius.sm, backgroundColor: colors.slate200 },
  selfiePrompt: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: colors.slate300,
    borderRadius: radius.md,
    padding: 14,
  },
  queued: {
    marginTop: 12,
    backgroundColor: colors.slate50,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
});
