import { useState, useEffect, useRef } from "react";
import { Animated, Image, Linking, Pressable, ScrollView, StyleSheet, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useNavigation } from "@react-navigation/native";
import { api, uploadPhoto, useAction, useQuery } from "../api";
import { clearBuffer, useTripTracker } from "../tracker";
import { ago, time } from "../format";
import { colors, elevation, motion, radius, space, tone } from "../theme";
import { str } from "../strings";
import {
  Alert, Badge, Button, Card, Confirm, EmptyState, IconChip, LiveDot, Loading, Muted,
  Screen, SectionHeader, Shield, StatTile, T, useReducedMotion,
} from "../ui";
import { IconAlert, IconBus, IconCamera, IconCheck, IconClock, IconPin, IconUsers } from "../icons";
import BusMap from "../BusMap";
import EmergencySheet from "./EmergencySheet";

/**
 * The driver's screen. One decision at a time, big targets, readable at arm's
 * length in a parked bus with the sun on it.
 *
 * Before the trip it asks exactly one thing — photo, then which run. During the
 * trip it answers exactly one — is the bus still being seen. Everything else is
 * secondary and looks it.
 */
export default function DriverTrip() {
  const navigation = useNavigation<any>();
  // Every hook runs before any early return — React matches hooks by call order,
  // and a `return` above one of them is React error #310, not a subtle bug.
  const { data, loading, error, reload } = useQuery<any>("/driver/my-bus");
  const action = useAction();
  const [sos, setSos] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [selfieUrl, setSelfieUrl] = useState<string | null>(null);
  const [selfiePreview, setSelfiePreview] = useState<string | null>(null);

  const trip = data?.activeTrip;
  const route = data?.vehicle?.routeId;
  const stops = route?.stops ?? [];
  const requireSelfie = data?.requireSelfie !== false;

  // Streams the position while a trip runs, and stops the moment it ends.
  const gps = useTripTracker(trip?._id ?? null);

  /* The GPS panel's open/close animation. These four live up here with every
     other hook for the reason stated above: they were added below the early
     returns, which meant the first render (loading, no data) called four fewer
     hooks than the second. That is React error #310 — "rendered more hooks
     than during the previous render" — and it crashed the driver's Trip tab on
     every single launch, which is the primary screen of the staff app. */
  const [panelHeight] = useState(() => new Animated.Value(trip ? 1 : 0));
  const [prevTrip, setPrevTrip] = useState(trip);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (trip && !prevTrip) {
      setPrevTrip(trip);
      if (reduced) {
        panelHeight.setValue(1);
      } else {
        Animated.timing(panelHeight, {
          toValue: 1,
          duration: motion.base,
          useNativeDriver: false,
        }).start();
      }
    } else if (!trip && prevTrip) {
      if (reduced) {
        setPrevTrip(null);
        panelHeight.setValue(0);
      } else {
        Animated.timing(panelHeight, {
          toValue: 0,
          duration: motion.base,
          useNativeDriver: false,
        }).start(() => {
          setPrevTrip(null);
        });
      }
    }
  }, [trip, prevTrip, reduced]);

  if (loading && !data) return <Loading label={str.driver.finding} />;

  if (error) {
    return (
      <Screen>
        <Card>
          <EmptyState
            title={str.driver.noBusTitle}
            hint={error.includes("no bus") ? str.driver.noBusHint : error}
            action={
              <Button variant="secondary" block onPress={reload}>
                {str.common.tryAgain}
              </Button>
            }
          />
        </Card>
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
      setConfirmEnd(false);
      reload();
    });

  return (
    <View style={{ flex: 1 }}>
      <Screen refreshing={loading} onRefresh={reload}>
        <Alert>{action.error}</Alert>

        {trip ? (
          <Shield ambient={Boolean(gps.tracking && gps.lastFix && !gps.error)} paused={!Boolean(gps.tracking && gps.lastFix && !gps.error)} style={s.hero}>
            <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <T role="label" color={tone.textOnDarkMuted}>
                  {data?.vehicle?.busNumber ?? str.common.none} · {data?.vehicle?.vehicleNumber}
                </T>
                <View style={{ flexDirection: "row", alignItems: "center", gap: space(2), marginTop: space(1.5) }}>
                  {gps.tracking && gps.lastFix && !gps.error ? (
                    <LiveDot color={colors.white} />
                  ) : (
                    <IconAlert size={20} color={colors.sun400} />
                  )}
                  <T role="title" size={24} color={colors.white} weight="800" numberOfLines={1}>
                    {gps.tracking && gps.lastFix && !gps.error ? "SHARING LOCATION" : gps.tracking ? "GETTING GPS FIX..." : "LOCATION NOT SHARING"}
                  </T>
                </View>
                <T role="body" color={tone.textOnDarkMuted} style={{ marginTop: space(1.5) }}>
                  {gps.lastFix
                    ? str.driver.lastFix(ago(gps.lastFix.at), gps.lastFix.accuracy)
                    : str.driver.waitingFirstFix}
                </T>
              </View>
              {gps.buffered > 0 && (
                <View style={s.heroQueued}>
                  <T role="caption" weight="800" color={colors.brand600}>
                    {str.driver.queued(gps.buffered)}
                  </T>
                </View>
              )}
            </View>
          </Shield>
        ) : (
          <Shield ambient style={s.hero}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: space(3) }}>
              <View style={s.heroIcon}>
                <IconBus size={24} color={colors.brand600} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <T role="title" size={22} color={colors.white} numberOfLines={1}>
                  {data?.vehicle?.busNumber ?? str.common.none}
                </T>
                <T role="label" color={tone.textOnDarkMuted}>
                  {data?.vehicle?.vehicleNumber}
                </T>
              </View>
              <Badge value={data?.vehicle?.status ?? "not_started"} />
            </View>
          </Shield>
        )}

        <View style={{ flexDirection: "row", gap: space(2.5), marginTop: space(3) }}>
          <StatTile
            value={data?.studentCount ?? 0}
            label={str.driver.students}
            icon={<IconUsers size={18} color={colors.slate400} />}
            color={colors.brand600}
            onPress={() => navigation.navigate("Students")}
          />
          <StatTile
            value={stops.length}
            label={str.driver.stops}
            icon={<IconPin size={18} color={colors.slate400} />}
          />
          <StatTile
            value={trip ? time(trip.startedAt) : (stops[0]?.pickupTime ?? str.common.none)}
            label={trip ? str.driver.started : str.driver.departs}
            icon={<IconClock size={18} color={colors.slate400} />}
          />
        </View>

        {prevTrip ? (
          <>
            {/* A driver who does not know the phone can be put down keeps it in
                their hand all morning. Say it where they are looking. */}
            <Card style={{ marginTop: space(1) }}>
              <T role="body" color={tone.textSecondary}>
                {str.driver.screenOff}
              </T>
            </Card>

            {gps.lastFix && stops.length > 0 && (
              <Card padded={false}>
                <BusMap bus={gps.lastFix} stops={stops} highlightStopId={stops[trip.currentStopIndex ?? 0]?._id} height={200} />
              </Card>
            )}

            {stops.length > 0 && <StopProgress stops={stops} index={trip.currentStopIndex ?? 0} />}

            <Button variant="dangerOutline" size="lg" block haptic="heavy" onPress={() => setConfirmEnd(true)}>
              {str.driver.endTrip}
            </Button>

            {/* Xiaomi, Oppo, Vivo and Realme kill background services regardless
                of a correctly declared foreground service. No amount of correct
                code avoids this — the driver has to grant the exemption once, so
                say so where they will actually read it. */}
            {!gps.needsPermission && (
              <Card>
                <T role="body" weight="700">
                  {str.driver.batteryTitle}
                </T>
                <Muted role="label" weight="400" style={{ marginTop: space(1) }}>
                  {str.driver.batteryBody}
                </Muted>
                <Button
                  variant="secondary"
                  size="sm"
                  block
                  style={{ marginTop: space(3) }}
                  onPress={() => void Linking.openSettings()}
                >
                  {str.driver.batteryOpen}
                </Button>
              </Card>
            )}
          </>
        ) : (
          <>
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

            <View style={{ gap: space(2.5) }}>
              <Button
                size="lg"
                block
                haptic="heavy"
                loading={action.busy}
                disabled={requireSelfie && !selfieUrl}
                onPress={() => startTrip("morning")}
              >
                {str.driver.startMorning}
              </Button>
              <Button
                size="lg"
                block
                variant="success"
                haptic="heavy"
                loading={action.busy}
                disabled={requireSelfie && !selfieUrl}
                onPress={() => startTrip("evening")}
              >
                {str.driver.startEvening}
              </Button>
            </View>

            {requireSelfie && !selfieUrl && (
              <Muted role="label" weight="400" style={{ textAlign: "center" }}>
                {str.driver.checkInFirst}
              </Muted>
            )}
            {!route && <Alert tone="warn">{str.driver.noRouteWarning}</Alert>}

            {stops.length > 0 && (
              <Card title={route.name}>
                <View style={{ gap: space(3) }}>
                  {stops.map((stop: any, i: number) => (
                    <View key={stop._id ?? i} style={{ flexDirection: "row", alignItems: "center", gap: space(3) }}>
                      <IconChip bg={colors.slate100} size={28}>
                        <T role="caption" weight="700" color={tone.textSecondary}>
                          {i + 1}
                        </T>
                      </IconChip>
                      <T role="body" weight="500" style={{ flex: 1 }} numberOfLines={1}>
                        {stop.name}
                      </T>
                      <Muted>{stop.pickupTime ?? ""}</Muted>
                    </View>
                  ))}
                </View>
              </Card>
            )}
          </>
        )}
      </Screen>

      {/*
        Always reachable, never in the way.
        Two things had to be true at once: impossible to miss in a crisis, and
        impossible to fire by accident. It floats above the scroll in the same
        corner all day, which handles the first — and it only *opens* the sheet.
        Sending still needs a type chosen and a red button pressed inside it, so
        a knee against the phone costs a dismissed sheet, not a false alarm to
        sixty parents.
      */}
      {!!trip && (
        <Pressable
          onPress={() => setSos(true)}
          accessibilityRole="button"
          accessibilityLabel={str.driver.emergency}
          style={({ pressed }) => [s.sos, pressed && { opacity: 0.85 }]}
        >
          <IconAlert size={26} color={colors.white} />
          <T role="caption" weight="800" color={colors.white}>
            SOS
          </T>
        </Pressable>
      )}

      <Confirm
        open={confirmEnd}
        onClose={() => setConfirmEnd(false)}
        onConfirm={endTrip}
        busy={action.busy}
        title={str.driver.endTripTitle}
        body={str.driver.endTripBody}
        confirmLabel={str.driver.endTripConfirm}
      />
      <EmergencySheet open={sos} onClose={() => setSos(false)} tripId={trip?._id} />
    </View>
  );
}

/** Where the bus is along the run, at a glance rather than as a list. */
function StopProgress({ stops, index }: { stops: any[]; index: number }) {
  return (
    <Card>
      <SectionHeader>{str.driver.routeProgress}</SectionHeader>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: space(3.5), paddingRight: space(2) }}
      >
        {stops.map((stop: any, i: number) => {
          const done = i < index;
          const current = i === index;
          return (
            <View key={stop._id ?? i} style={{ width: 92, alignItems: "center" }}>
              <View style={{ flexDirection: "row", alignItems: "center", alignSelf: "stretch" }}>
                <View style={[s.leg, { backgroundColor: i === 0 ? "transparent" : done || current ? tone.success : colors.slate200 }]} />
                <View
                  style={[
                    s.pip,
                    done && { backgroundColor: tone.success, borderColor: tone.success },
                    current && { backgroundColor: colors.brand600, borderColor: colors.brand600 },
                  ]}
                >
                  {done ? (
                    <IconCheck size={13} color={colors.white} />
                  ) : (
                    <T role="caption" weight="700" color={current ? colors.white : tone.textMuted}>
                      {i + 1}
                    </T>
                  )}
                </View>
                <View style={[s.leg, { backgroundColor: i === stops.length - 1 ? "transparent" : done ? tone.success : colors.slate200 }]} />
              </View>
              <T
                role="caption"
                weight={current ? "700" : "500"}
                color={current ? colors.brand600 : tone.textMuted}
                numberOfLines={2}
                style={{ textAlign: "center", marginTop: space(1.5) }}
              >
                {stop.name}
              </T>
            </View>
          );
        })}
      </ScrollView>
    </Card>
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
      setError(str.driver.checkInCameraDenied);
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
    <View style={{ gap: space(2.5) }}>
      <Alert>{error}</Alert>

      {preview ? (
        <View style={s.selfieDone}>
          <Image source={{ uri: preview }} style={s.selfieImage} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: space(1.5) }}>
              <IconCheck size={16} color={colors.leaf700} />
              <T role="body" weight="700" color={colors.leaf700}>
                {str.driver.checkInDone}
              </T>
            </View>
            <Muted role="label" weight="400" style={{ marginTop: 2 }}>
              {str.driver.checkInDoneHint}
            </Muted>
          </View>
          <Button
            size="sm"
            variant="secondary"
            onPress={() => {
              onClear();
              void capture();
            }}
          >
            {str.driver.checkInRetake}
          </Button>
        </View>
      ) : (
        <Pressable
          onPress={busy ? undefined : capture}
          accessibilityRole="button"
          accessibilityLabel={str.driver.checkInTitle}
          style={[s.selfiePrompt, busy && { opacity: 0.6 }]}
        >
          <IconChip bg={colors.brand50} size={56} square>
            <IconCamera size={28} color={colors.brand600} />
          </IconChip>
          <View style={{ flex: 1, minWidth: 0 }}>
            <T role="heading">{busy ? str.driver.checkInUploading : str.driver.checkInTitle}</T>
            <Muted role="label" weight="400" style={{ marginTop: 2 }}>
              {str.driver.checkInHint}
            </Muted>
          </View>
        </Pressable>
      )}
    </View>
  );
}

/** The one question a running trip has to answer: is the bus still being seen. */
export function GpsPanel({ gps }: { gps: ReturnType<typeof useTripTracker> }) {
  const healthy = gps.tracking && gps.lastFix && !gps.error;

  const reduced = useReducedMotion();
  const healthyAnim = useRef(new Animated.Value(healthy ? 1 : 0)).current;
  const scaleAnim = useRef(new Animated.Value(healthy ? 1 : 0.8)).current;
  const prevHealthy = useRef(healthy);

  useEffect(() => {
    if (healthy !== prevHealthy.current) {
      if (reduced) {
        healthyAnim.setValue(healthy ? 1 : 0);
        scaleAnim.setValue(healthy ? 1 : 0.8);
      } else {
        Animated.parallel([
          Animated.timing(healthyAnim, {
            toValue: healthy ? 1 : 0,
            duration: motion.base,
            useNativeDriver: false,
          }),
          Animated.sequence([
            Animated.timing(scaleAnim, {
              toValue: healthy ? 1.2 : 0.8,
              duration: motion.fast,
              useNativeDriver: true,
            }),
            Animated.timing(scaleAnim, {
              toValue: healthy ? 1.0 : 0.8,
              duration: motion.fast,
              useNativeDriver: true,
            }),
          ]),
        ]).start();
      }
      prevHealthy.current = healthy;
    }
  }, [healthy, reduced]);

  const backgroundColor = healthyAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [colors.amber50, colors.leaf50],
  });

  const borderColor = healthyAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [colors.amber400, colors.leaf400],
  });

  return (
    <Animated.View
      style={[
        s.gps,
        { backgroundColor, borderColor },
      ]}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: space(3) }}>
        <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
          {healthy ? <LiveDot color={colors.leaf600} size={12} /> : <IconPin size={20} color={colors.amber600} />}
        </Animated.View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <T role="heading" color={healthy ? colors.leaf700 : colors.amber800}>
            {healthy ? str.driver.sharing : gps.tracking ? str.driver.gettingFix : str.driver.notSharing}
          </T>
          <T role="label" weight="400" color={healthy ? colors.leaf700 : colors.amber800}>
            {gps.lastFix
              ? str.driver.lastFix(ago(gps.lastFix.at), gps.lastFix.accuracy)
              : str.driver.waitingFirstFix}
          </T>
        </View>
        {gps.buffered > 0 && (
          <View style={s.queuedPill}>
            <T role="caption" weight="700" color={tone.textSecondary}>
              {str.driver.queued(gps.buffered)}
            </T>
          </View>
        )}
      </View>

      {!!gps.error && <Alert tone="warn">{gps.error}</Alert>}

      {gps.buffered > 0 && (
        // Nothing is lost in a dead zone — say so, or the driver will worry.
        <T role="label" weight="400" color={tone.textSecondary}>
          {str.driver.queuedNote(gps.buffered)}
        </T>
      )}
    </Animated.View>
  );
}

const s = StyleSheet.create({
  gps: {
    borderWidth: 1,
    borderRadius: radius.card,
    padding: space(4),
    gap: space(3),
  },
  queuedPill: {
    backgroundColor: colors.white,
    paddingHorizontal: space(2.5),
    paddingVertical: space(1),
    borderRadius: radius.pill,
  },

  hero: {
    borderRadius: radius.card,
    padding: space(4.5),
    overflow: "hidden",
    ...elevation.raised,
  },
  heroIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
  },
  heroQueued: {
    backgroundColor: colors.white,
    paddingHorizontal: space(2.5),
    paddingVertical: space(1),
    borderRadius: radius.pill,
  },

  leg: { flex: 1, height: 2 },
  pip: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: colors.slate200,
    backgroundColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
  },

  selfieDone: {
    flexDirection: "row",
    alignItems: "center",
    gap: space(3),
    borderWidth: 1,
    borderColor: colors.leaf400,
    backgroundColor: colors.leaf50,
    borderRadius: radius.card,
    padding: space(3),
  },
  selfieImage: { width: 60, height: 60, borderRadius: radius.sm, backgroundColor: colors.slate200 },
  selfiePrompt: {
    flexDirection: "row",
    alignItems: "center",
    gap: space(3),
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: tone.borderStrong,
    borderRadius: radius.card,
    padding: space(4),
    minHeight: 96,
  },

  sos: {
    position: "absolute",
    right: space(4),
    bottom: space(5),
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: tone.danger,
    alignItems: "center",
    justifyContent: "center",
    gap: 1,
    borderWidth: 3,
    borderColor: colors.white,
    ...elevation.floating,
  },
});
