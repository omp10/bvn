import { useState, useEffect, useRef } from "react";
import { Animated, Linking, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { api, useAction, usePolling, useQuery } from "../api";
import { useSocket, useTripRoom } from "../socket";
import { ago, classOf, time } from "../format";
import { metresBetween, prettyDistance } from "../geo";
import { colors, elevation, motion, radius, space, tone } from "../theme";
import { str } from "../strings";
import {
  Alert, Avatar, Button, Card, Chip, CrossFade, EmptyState, Enter, ErrorState, Field, IconChip, LiveDot, Modal,
  Muted, Screen, SectionHeader, Shield, Skeleton, T, Timeline, useReducedMotion, HorizontalProgress,
} from "../ui";
import { IconAlert, IconCheck, IconClock, IconPhone, IconPin, IconSchool } from "../icons";
import BusMap from "../BusMap";

type Stop = { _id: string; name: string; sequence: number; lat: number; lng: number; pickupTime?: string; dropTime?: string };
type Child = {
  _id: string;
  name: string;
  class?: string;
  section?: string;
  photoUrl?: string | null;
  pickupStopId?: string;
  dropStopId?: string;
  vehicleId?: { busNumber: string; vehicleNumber: string } | null;
  routeId?: { name: string; stops?: Stop[] } | null;
};

/**
 * The most important screen in either app.
 *
 * Before, during and after a trip are three different questions, so they are
 * three different compositions rather than one scroll with everything on it and
 * the parts that do not apply left blank. Before: when will it come. During: one
 * number, and the map. After: what happened, and when.
 *
 * The bus's registration, the route name and the attendant's name are all real
 * information a parent occasionally wants and never wants first — they moved
 * into a sheet behind the hero, which is what stopped this screen being a flat
 * stack of equally loud cards.
 */
export default function ParentHome() {
  const children = useQuery<Child[]>("/parent/children");
  const [selectedId, setSelected] = useState<string | null>(null);
  const childId = selectedId ?? children.data?.[0]?._id ?? null;

  // The socket delivers a position the instant the bus reports it; the slow poll
  // is only a safety net for a dropped connection.
  const live = usePolling<any>(childId ? `/parent/children/${childId}/live` : null, 30_000);
  const [details, setDetails] = useState(false);

  const tripId = live.data?.trip?.id ?? null;
  useTripRoom(tripId);

  useSocket(
    {
      "trip:position": (p: { lat: number; lng: number; at: string }) =>
        live.data &&
        live.setData({ ...live.data, position: { ...live.data.position, ...p }, gpsStale: false }),
      "trip:stop_reached": () => live.reload(),
      "attendance:marked": () => live.reload(),
      "trip:ended": () => live.reload(),
    },
    [live.data]
  );

  if (children.error) return <Screen><ErrorState message={children.error} onRetry={children.reload} /></Screen>;

  if (!children.loading && !children.data?.length) {
    return (
      <Screen>
        <Card>
          <EmptyState art={require("../../assets/empty/no-children.png")} title={str.parent.noChildrenTitle} hint={str.parent.noChildrenHint} />
        </Card>
      </Screen>
    );
  }

  const child = children.data?.find((c) => c._id === childId) ?? children.data?.[0] ?? { _id: "", name: "", routeId: { _id: "", name: "", stops: [] } } as any;
  const status = live.data?.status;
  const running = status === "running";
  const childStatus: string | null = live.data?.childStatus ?? null;

  const stopById = (id?: string) => child.routeId?.stops?.find((s: any) => String(s._id) === String(id)) ?? null;
  /* The live endpoint only names the stop while a trip runs. Before the bus sets
     off, fall back to the child's own assignment — saying "not set" when a stop
     exists is worse than saying nothing. */
  const myStop: Stop | null = live.data?.myStop ?? stopById(child.pickupStopId);
  const scheduled = myStop?.pickupTime ?? myStop?.dropTime ?? null;

  /* FRD §19.4 — how far the bus still is, not just how long. Minutes are an
     estimate the parent has to trust; metres are something they can see out of
     the window. */
  const fix = live.data?.position;
  const metresAway =
    running && myStop?.lat != null && fix?.lat != null
      ? metresBetween({ lat: fix.lat, lng: fix.lng }, { lat: myStop.lat, lng: myStop.lng })
      : null;

  const onBoard = childStatus === "boarded";
  const settled = childStatus === "dropped" || childStatus === "absent";

  return (
    <CrossFade loading={children.loading && !children.data} skeleton={<HomeSkeleton />}>
      <Screen refreshing={live.loading} onRefresh={() => { children.reload(); live.reload(); }}>
      {children.data && children.data.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space(2) }}>
          {children.data.map((c) => (
            <Chip
              key={c._id}
              label={c.name.split(" ")[0]}
              selected={c._id === child._id}
              onPress={() => setSelected(c._id)}
              icon={<Avatar name={c.name} photoUrl={c.photoUrl} size={24} onDark={c._id === child._id} />}
            />
          ))}
        </ScrollView>
      )}

      <Enter key={`${child._id}-${childStatus ?? status}`} style={{ gap: space(3) }}>
        {status === "no_bus_assigned" ? (
          <Card>
            <EmptyState title={str.parent.noBusTitle} hint={str.parent.noBusHint} />
          </Card>
        ) : childStatus ? (
          <SettledHero child={child} live={live.data} stop={myStop} />
        ) : running ? (
          <RunningHero child={child} live={live.data} stop={myStop} metresAway={metresAway} onDetails={() => setDetails(true)} />
        ) : (
          <WaitingHero child={child} scheduled={scheduled} onDetails={() => setDetails(true)} />
        )}

        {/* Before the bus sets off there is no map worth drawing, so the stop
            itself is the content: where it is, and when it is due. */}
        {!running && !settled && (
          <Card>
            <SectionHeader>{str.parent.yourStop}</SectionHeader>
            <View style={{ flexDirection: "row", alignItems: "center", gap: space(3), marginTop: space(2.5) }}>
              <IconChip bg={colors.brand50}>
                <IconPin size={18} color={colors.brand600} />
              </IconChip>
              <View style={{ flex: 1, minWidth: 0 }}>
                <T role="body" weight="700" numberOfLines={2}>
                  {myStop?.name ?? str.common.notSet}
                </T>
                {!!scheduled && (
                  <Muted role="label" weight="400">
                    {str.parent.scheduled} {scheduled}
                  </Muted>
                )}
              </View>
            </View>
          </Card>
        )}

        {/* The map earns the space only while there is something moving on it.
            It is a preview: a drag inside a scrolling screen scrolls the screen,
            so panning happens in BusMap's own full-screen view. */}
        {running && fix?.lat != null && (
          <Card
            title={str.parent.liveLocation}
            subtitle={str.common.lastUpdated(ago(fix.at))}
            right={
              <View style={{ flexDirection: "row", alignItems: "center", gap: space(1.5) }}>
                <LiveDot color={live.data?.gpsStale ? colors.slate400 : colors.brand600} paused={live.data?.gpsStale} />
                <T role="caption" color={live.data?.gpsStale ? tone.textMuted : colors.brand600} weight="700">
                  {live.data?.gpsStale ? "STALE" : str.parent.live}
                </T>
              </View>
            }
            padded={false}
          >
            <BusMap
              bus={{ lat: fix.lat, lng: fix.lng }}
              stops={child.routeId?.stops ?? []}
              highlightStopId={myStop?._id}
              height={onBoard ? 200 : 300}
            />
          </Card>
        )}

        {live.data?.trip?.timeline?.length > 0 && (
          <Card title={str.parent.journey}>
            <Timeline
              items={[
                ...live.data.trip.timeline.map((entry: any) => ({
                  label: [entry.event.replace(/_/g, " "), entry.stopName].filter(Boolean).join(" · "),
                  at: time(entry.at),
                  state: "done" as const,
                })),
                ...(running
                  ? [{ label: str.parent.onTheWay, at: null, state: "current" as const }]
                  : []),
              ]}
            />
          </Card>
        )}

        <QuickActions driver={live.data?.driver} />
      </Enter>

      <BusDetailsSheet
        open={details}
        onClose={() => setDetails(false)}
        child={child}
        live={live.data}
        pickup={stopById(child.pickupStopId)?.name}
        drop={stopById(child.dropStopId)?.name}
      />
      </Screen>
    </CrossFade>
  );
}

/* ── Heroes ────────────────────────────────────────────────────────────
 *
 * One per state. They share a shape — avatar, name, class and bus, then the one
 * thing that matters — so switching between them reads as the same card
 * changing rather than three unrelated screens.
 */

const HeroHead = ({
  child,
  right,
  onPress,
}: {
  child: Child;
  right?: React.ReactNode;
  onPress?: () => void;
}) => (
  <Pressable
    onPress={onPress}
    disabled={!onPress}
    accessibilityRole={onPress ? "button" : undefined}
    accessibilityLabel={onPress ? str.parent.busDetails : undefined}
    style={({ pressed }) => [
      { flexDirection: "row", alignItems: "flex-start", gap: space(3) },
      pressed && onPress && { opacity: 0.8 },
    ]}
  >
    <Avatar name={child.name} photoUrl={child.photoUrl} size={48} onDark />
    <View style={{ flex: 1, minWidth: 0 }}>
      <T role="heading" size={19} color={colors.white} numberOfLines={1}>
        {child.name}
      </T>
      <T role="label" weight="400" color={tone.textOnDarkMuted} numberOfLines={1}>
        {classOf(child)} · {child.vehicleId?.busNumber ?? str.parent.notAssigned}
        {onPress ? "  ›" : ""}
      </T>
    </View>
    {right}
  </Pressable>
);

/** Before the trip: the only useful number is when it is due. */
function WaitingHero({
  child,
  scheduled,
  onDetails,
}: {
  child: Child;
  scheduled: string | null;
  onDetails: () => void;
}) {
  return (
    <Shield ambient style={s.hero}>
      <HeroHead child={child} onPress={onDetails} />
      <View style={s.waitBox}>
        <IconClock size={20} color={colors.white} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <T role="body" weight="700" color={colors.white}>
            {str.parent.notStarted}
          </T>
          <T role="label" weight="400" color={tone.textOnDarkMuted}>
            {scheduled ? str.parent.expectedAt(scheduled) : str.parent.expectedUnknown}
          </T>
        </View>
      </View>
    </Shield>
  );
}

/** During the trip: one number, as large as the card allows. */
function RunningHero({
  child,
  live,
  stop,
  metresAway,
  onDetails,
}: {
  child: Child;
  live: any;
  stop: Stop | null;
  metresAway: number | null;
  onDetails: () => void;
}) {
  const eta = live?.etaMinutes;

  // B1 Animation Setup
  const [currentEta, setCurrentEta] = useState<number | undefined>(eta);
  const [prevEta, setPrevEta] = useState<number | null>(null);
  const anim = useRef(new Animated.Value(0)).current;
  const isFirst = useRef(true);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (eta === currentEta) return;
    if (isFirst.current) {
      setCurrentEta(eta);
      isFirst.current = false;
      return;
    }

    if (reduced) {
      setCurrentEta(eta);
      setPrevEta(null);
      return;
    }

    setPrevEta(currentEta ?? null);
    setCurrentEta(eta);
    anim.setValue(0);
    Animated.timing(anim, {
      toValue: 1,
      duration: motion.base,
      useNativeDriver: true,
    }).start(() => {
      setPrevEta(null);
    });
  }, [eta, currentEta, reduced]);

  const oldOpacity = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0],
  });
  const oldTranslateY = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -12],
  });
  const newOpacity = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });
  const newTranslateY = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [12, 0],
  });

  return (
    <Shield ambient paused={live?.gpsStale} style={s.hero}>
      <HeroHead
        child={child}
        onPress={onDetails}
        right={
          <View style={[s.livePill, live?.delayed && { backgroundColor: "rgba(0,0,0,0.3)" }]}>
            <LiveDot color={live?.delayed ? colors.sun400 : colors.white} paused={live?.gpsStale} />
            <T role="caption" weight="700" color={colors.white}>
              {live?.delayed ? str.parent.delayed : str.parent.live}
            </T>
          </View>
        }
      />

      <View style={{ marginTop: space(5) }}>
        {currentEta != null ? (
          <View style={{ flexDirection: "row", alignItems: "flex-end", gap: space(2) }}>
            <View style={{ height: 52, justifyContent: "flex-end", overflow: "hidden" }}>
              {prevEta !== null && !reduced && (
                <Animated.View style={{
                  position: "absolute",
                  opacity: oldOpacity,
                  transform: [{ translateY: oldTranslateY }]
                }}>
                  <T role="display" color={colors.white}>
                    {prevEta}
                  </T>
                </Animated.View>
              )}
              <Animated.View style={!reduced && prevEta !== null ? {
                opacity: newOpacity,
                transform: [{ translateY: newTranslateY }]
              } : undefined}>
                <T role="display" color={colors.white}>
                  {currentEta}
                </T>
              </Animated.View>
            </View>
            <T role="body" color={tone.textOnDarkMuted} style={{ marginBottom: space(2.5) }}>
              {str.parent.minToStop}
            </T>
          </View>
        ) : (
          <T role="heading" color={colors.white}>
            {str.parent.etaUnknown}
          </T>
        )}

        <T role="label" weight="400" color={tone.textOnDarkMuted} style={{ marginTop: space(1) }}>
          {[
            live?.nextStop ? str.parent.nextStop(live.nextStop.name) : str.parent.onTheWay,
            str.parent.stopsLeft(live?.stopsRemaining ?? 0),
            metresAway != null ? prettyDistance(metresAway) : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </T>

        {child.routeId?.stops && child.routeId.stops.length > 0 && (
          <View style={{ marginTop: space(4), marginBottom: space(2) }}>
            <HorizontalProgress
              stops={child.routeId.stops}
              myStopId={stop?._id}
              nextStopId={live?.nextStop?._id}
            />
          </View>
        )}
      </View>

      {/* FRD §19.6 — a late bus is the thing a waiting parent most needs told,
          and it is not visible from an ETA alone. Silence is likewise not the
          same as "the bus is here". */}
      {!!live?.delayed && <HeroNote>{str.parent.delayNote(live.delayMinutes)}</HeroNote>}
      {!!live?.gpsStale && <HeroNote>{str.parent.staleNote(ago(live.position?.at))}</HeroNote>}
    </Shield>
  );
}

/** After the child is accounted for: the answer, not the estimate. */
function SettledHero({ child, live, stop }: { child: Child; live: any; stop: Stop | null }) {
  const first = child.name.split(" ")[0];
  const mark: string = live?.childStatus;
  const absent = mark === "absent";

  const [bg, icon, headline] = absent
    ? [colors.slate600, <IconAlert key="a" size={30} color={colors.white} />, str.parent.markedAbsent(first)]
    : mark === "dropped"
      ? [colors.leaf600, <IconSchool key="s" size={30} color={colors.white} />, str.parent.droppedOff(first)]
      : [colors.leaf500, <IconCheck key="c" size={30} color={colors.white} />, str.parent.onBoard(first)];

  const at = live?.trip?.timeline?.filter((e: any) => String(e.event).includes(mark)).slice(-1)[0];

  return (
    <View style={[s.hero, { backgroundColor: bg, alignItems: "center", gap: space(3) }]}>
      <View style={s.settledBadge}>{icon}</View>
      <T role="title" color={colors.white} style={{ textAlign: "center" }}>
        {headline}
      </T>
      {!absent && !!at && (
        <T role="label" weight="400" color="rgba(255,255,255,0.85)" style={{ textAlign: "center" }}>
          {mark === "dropped"
            ? str.parent.droppedAt(at.stopName ?? stop?.name ?? "", time(at.at))
            : str.parent.boardedAt(at.stopName ?? stop?.name ?? "", time(at.at))}
        </T>
      )}
    </View>
  );
}

const HeroNote = ({ children }: { children: string }) => (
  <View style={s.heroNote}>
    <T role="label" weight="400" color={colors.white}>
      {children}
    </T>
  </View>
);

/* ── Actions ───────────────────────────────────────────────────────── */

/**
 * Three targets, always in the same three places. A parent reaching for this is
 * not reading — they are hitting the position they remember.
 *
 * The third one dials, it does not report. `POST /emergencies` is
 * `requireRole("driver", "staff")`, so a parent-side SOS would be a red button
 * that returns 403 in the one moment it is pressed. What a parent actually has
 * is the phone, so that is what the tile is.
 */
function QuickActions({ driver }: { driver?: { name: string; phone: string } | null }) {
  const contacts = useQuery<any>("/parent/emergency-contacts");
  const office = contacts.data?.transportOffice?.phone;
  const helpline = contacts.data?.helpline ?? "112";

  return (
    <View style={{ flexDirection: "row", gap: space(3) }}>
      <ActionTile
        label={str.parent.callDriver}
        icon={<IconPhone size={22} color={colors.brand600} />}
        bg={colors.brand50}
        disabled={!driver?.phone}
        onPress={() => void Linking.openURL(`tel:${driver!.phone}`)}
      />
      <ActionTile
        label={str.parent.callSchool}
        icon={<IconSchool size={22} color={colors.brand600} />}
        bg={colors.brand50}
        disabled={!office}
        onPress={() => void Linking.openURL(`tel:${office}`)}
      />
      <ActionTile
        label={str.parent.callHelpline}
        icon={<IconAlert size={22} color={colors.white} />}
        bg={tone.danger}
        tint={tone.danger}
        onPress={() => void Linking.openURL(`tel:${helpline}`)}
      />
    </View>
  );
}

const ActionTile = ({
  label,
  icon,
  bg,
  tint,
  onPress,
  disabled,
}: {
  label: string;
  icon: React.ReactNode;
  bg: string;
  tint?: string;
  onPress: () => void;
  disabled?: boolean;
}) => (
  <Pressable
    onPress={disabled ? undefined : onPress}
    accessibilityRole="button"
    accessibilityLabel={label}
    accessibilityState={{ disabled }}
    style={({ pressed }) => [s.action, disabled && { opacity: 0.4 }, pressed && !disabled && { opacity: 0.7 }]}
  >
    <IconChip bg={bg} size={48}>
      {icon}
    </IconChip>
    <T role="label" color={tint ?? tone.textSecondary}>
      {label}
    </T>
  </Pressable>
);

/* ── Details ───────────────────────────────────────────────────────── */

/**
 * Everything true but rarely urgent: which vehicle, which route, who the
 * attendant is, and the route-change request. Behind one tap on the hero.
 */
function BusDetailsSheet({
  open,
  onClose,
  child,
  live,
  pickup,
  drop,
}: {
  open: boolean;
  onClose: () => void;
  child: Child;
  live: any;
  pickup?: string;
  drop?: string;
}) {
  const [changing, setChanging] = useState(false);

  return (
    <>
      <Modal
        open={open && !changing}
        onClose={onClose}
        title={str.parent.busDetails}
        footer={
          <Button variant="secondary" block onPress={() => setChanging(true)}>
            {str.parent.requestRouteChange}
          </Button>
        }
      >
        <View style={{ gap: space(2.5), paddingBottom: space(2) }}>
          <Row label={str.parent.bus} value={child.vehicleId?.busNumber} />
          <Row label={str.parent.vehicle} value={child.vehicleId?.vehicleNumber} />
          <Row label={str.parent.route} value={child.routeId?.name} />
          <Row label={str.parent.driver} value={live?.driver?.name} />
          {/* FRD §17.4 names the attendant too — the person who actually marks
              the child on and off the bus. */}
          <Row label={str.parent.attendant} value={live?.vehicle?.attendantId?.name} fallback={str.parent.notAssigned} />
          <Row label={str.parent.pickupStop} value={pickup} />
          <Row label={str.parent.dropStop} value={drop} />
        </View>
      </Modal>

      <RouteChangeModal
        childId={child._id}
        open={changing}
        onClose={() => {
          setChanging(false);
          onClose();
        }}
      />
    </>
  );
}

const Row = ({ label, value, fallback }: { label: string; value?: string | null; fallback?: string }) => (
  <View style={{ flexDirection: "row", justifyContent: "space-between", gap: space(3) }}>
    <Muted role="label" weight="400">
      {label}
    </Muted>
    <T role="label" style={{ flex: 1, textAlign: "right" }} numberOfLines={1}>
      {value || fallback || str.common.none}
    </T>
  </View>
);

function RouteChangeModal({ childId, open, onClose }: { childId: string; open: boolean; onClose: () => void }) {
  const routes = useQuery<any[]>(open ? "/parent/routes" : null, [open]);
  const { busy, error, run } = useAction();
  const [routeId, setRouteId] = useState("");
  const [pickupStopId, setPickup] = useState("");
  const [reason, setReason] = useState("");

  const stops = routes.data?.find((r) => r._id === routeId)?.stops ?? [];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={str.parent.requestRouteChange}
      footer={
        <>
          <Button variant="secondary" onPress={onClose}>
            {str.common.cancel}
          </Button>
          <Button
            loading={busy}
            disabled={!routeId}
            onPress={() =>
              void run(
                () =>
                  api(`/parent/children/${childId}/route-change`, {
                    body: {
                      requestedRouteId: routeId,
                      requestedPickupStopId: pickupStopId || undefined,
                      reason: reason || undefined,
                    },
                  }),
                onClose
              )
            }
          >
            {str.parent.sendRequest}
          </Button>
        </>
      }
    >
      <View style={{ gap: space(3.5) }}>
        <Alert>{error}</Alert>

        <View>
          <T role="label" color={tone.textSecondary} style={{ marginBottom: space(2) }}>
            {str.parent.newRoute}
          </T>
          <Choices
            options={(routes.data ?? []).map((r) => ({ id: r._id, label: r.name }))}
            value={routeId}
            onChange={(id) => {
              setRouteId(id);
              setPickup("");
            }}
            empty={str.parent.noRoutes}
          />
        </View>

        {stops.length > 0 && (
          <View>
            <T role="label" color={tone.textSecondary} style={{ marginBottom: space(2) }}>
              {str.parent.preferredStop}
            </T>
            <Choices
              options={stops.map((st: any) => ({ id: st._id, label: `${st.sequence}. ${st.name}` }))}
              value={pickupStopId}
              onChange={setPickup}
            />
          </View>
        )}

        <Field
          label={str.parent.reason}
          value={reason}
          onChangeText={setReason}
          placeholder={str.parent.reasonPlaceholder}
          multiline
          inputStyle={{ height: 90, paddingTop: space(3), textAlignVertical: "top" }}
        />

        <Muted role="label" weight="400">
          {str.parent.routeChangeNote}
        </Muted>
      </View>
    </Modal>
  );
}

/**
 * A tap list instead of a picker. There are rarely more than a handful of routes
 * and stops, and a native picker on Android is a modal inside a modal.
 */
function Choices({
  options,
  value,
  onChange,
  empty,
}: {
  options: { id: string; label: string }[];
  value: string;
  onChange: (id: string) => void;
  empty?: string;
}) {
  if (!options.length) return <Muted role="body">{empty ?? str.parent.noRoutes}</Muted>;

  return (
    <View style={{ gap: space(1.5) }}>
      {options.map((o) => {
        const on = o.id === value;
        return (
          <Pressable
            key={o.id}
            onPress={() => onChange(o.id)}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            style={[s.choice, on && { borderColor: colors.brand600, backgroundColor: colors.brand50 }]}
          >
            <View style={[s.radio, on && { borderColor: colors.brand600 }]}>
              {on && <View style={s.radioDot} />}
            </View>
            <T role="body" weight={on ? "600" : "400"} style={{ flex: 1 }}>
              {o.label}
            </T>
          </Pressable>
        );
      })}
    </View>
  );
}

/** The shape of the answer, so the screen does not jump when it arrives. */
const HomeSkeleton = () => (
  <Screen>
    <Skeleton height={168} style={{ borderRadius: radius.card }} />
    <Card>
      <Skeleton height={13} width="30%" />
      <View style={{ flexDirection: "row", alignItems: "center", gap: space(3), marginTop: space(3) }}>
        <Skeleton height={40} width={40} style={{ borderRadius: 20 }} />
        <View style={{ flex: 1, gap: space(2) }}>
          <Skeleton height={15} width="70%" />
          <Skeleton height={11} width="40%" />
        </View>
      </View>
    </Card>
    <View style={{ flexDirection: "row", gap: space(3) }}>
      <Skeleton height={92} style={{ flex: 1, borderRadius: radius.card }} />
      <Skeleton height={92} style={{ flex: 1, borderRadius: radius.card }} />
      <Skeleton height={92} style={{ flex: 1, borderRadius: radius.card }} />
    </View>
  </Screen>
);

const s = StyleSheet.create({
  hero: { borderRadius: radius.card, padding: space(4.5), overflow: "hidden", ...elevation.raised },

  livePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: space(1.5),
    backgroundColor: "rgba(255,255,255,0.2)",
    paddingHorizontal: space(2.5),
    paddingVertical: space(1.5),
    borderRadius: radius.pill,
  },

  waitBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: space(3),
    marginTop: space(5),
    backgroundColor: "rgba(0,0,0,0.18)",
    borderRadius: radius.md,
    padding: space(3.5),
  },

  heroNote: {
    marginTop: space(3),
    backgroundColor: "rgba(0,0,0,0.2)",
    borderRadius: radius.sm,
    paddingHorizontal: space(3),
    paddingVertical: space(2),
  },

  settledBadge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(255,255,255,0.25)",
    alignItems: "center",
    justifyContent: "center",
  },

  action: {
    flex: 1,
    alignItems: "center",
    gap: space(2),
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: tone.border,
    borderRadius: radius.card,
    paddingVertical: space(3.5),
    minHeight: 96,
    justifyContent: "center",
  },

  choice: {
    flexDirection: "row",
    alignItems: "center",
    gap: space(2.5),
    borderWidth: 1,
    borderColor: tone.border,
    borderRadius: radius.md,
    padding: space(3),
    minHeight: 48,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: tone.borderStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  radioDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.brand600 },
});
