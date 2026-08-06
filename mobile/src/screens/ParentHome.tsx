import { useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { api, useAction, usePolling, useQuery } from "../api";
import { useSocket, useTripRoom } from "../socket";
import { useAuth } from "../auth";
import { ago, classOf, time } from "../format";
import { metresBetween, prettyDistance } from "../geo";
import { colors, radius, shadow } from "../theme";
import {
  Alert, Avatar, Button, Card, EmptyState, Field, LiveDot, Loading, Modal, Muted, Screen, SchoolLogo,
  Shield, T,
} from "../ui";
import { IconBus, IconPhone, IconPin } from "../icons";
import BusMap from "../BusMap";

type Stop = { _id: string; name: string; sequence: number; lat: number; lng: number };
type Child = {
  _id: string;
  name: string;
  class?: string;
  section?: string;
  pickupStopId?: string;
  dropStopId?: string;
  vehicleId?: { busNumber: string; vehicleNumber: string } | null;
  routeId?: { name: string; stops?: Stop[] } | null;
};

export default function ParentHome() {
  const { school } = useAuth();
  const children = useQuery<Child[]>("/parent/children");
  const [selectedId, setSelected] = useState<string | null>(null);
  const childId = selectedId ?? children.data?.[0]?._id ?? null;

  // The socket delivers a position the instant the bus reports it; the slow poll
  // is only a safety net for a dropped connection.
  const live = usePolling<any>(childId ? `/parent/children/${childId}/live` : null, 30_000);
  const [changing, setChanging] = useState(false);

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

  if (children.loading && !children.data) return <Loading label="Loading your children…" />;

  if (children.error) {
    return (
      <Screen>
        <Card><EmptyState title="Could not load" hint={children.error} /></Card>
        <Button variant="secondary" block onPress={children.reload}>Try again</Button>
      </Screen>
    );
  }

  if (!children.data?.length) {
    return (
      <Screen>
        <Card>
          <EmptyState
            title="No children linked yet"
            hint="Ask the school office to add your mobile number to your child's record."
          />
        </Card>
      </Screen>
    );
  }

  const child = children.data.find((c) => c._id === childId) ?? children.data[0];
  const status = live.data?.status;
  const running = status === "running";

  // The live endpoint only names the stop while a trip runs. Before the bus sets
  // off, fall back to the child's own assignment — "not set" when a stop exists
  // is worse than saying nothing.
  const stopNamed = (id?: string) =>
    child.routeId?.stops?.find((s) => String(s._id) === String(id))?.name ?? "Not set";

  const pickupStop = live.data?.myStop?.name ?? stopNamed(child.pickupStopId);
  const dropStop = stopNamed(child.dropStopId);

  /* FRD §19.4 — how far the bus still is, not just how long. Minutes are an
     estimate the parent has to trust; metres are something they can see out of
     the window. */
  const myStop = live.data?.myStop;
  const fix = live.data?.position;
  const metresAway =
    running && myStop?.lat != null && fix?.lat != null
      ? metresBetween({ lat: fix.lat, lng: fix.lng }, { lat: myStop.lat, lng: myStop.lng })
      : null;

  return (
    <Screen refreshing={live.loading} onRefresh={() => { children.reload(); live.reload(); }}>
      {/* The school's own identity on the dashboard — FRD §17.3. */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <SchoolLogo size={36} />
        <T size={14} weight="700" style={{ flex: 1 }} numberOfLines={1}>
          {school?.name ?? "BalVahini"}
        </T>
      </View>

      {children.data.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {children.data.map((c) => {
            const on = c._id === child._id;
            return (
              <Pressable
                key={c._id}
                onPress={() => setSelected(c._id)}
                style={[s.chip, on && { backgroundColor: colors.brand600, borderColor: colors.brand600 }]}
              >
                <Avatar name={c.name} size={22} onDark={on} />
                <T size={13} weight="600" color={on ? colors.white : colors.slate600}>
                  {c.name.split(" ")[0]}
                </T>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      {/* The one card a parent actually opens the app for. */}
      <Shield style={s.hero}>
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
          <Avatar name={child.name} size={48} onDark />
          <View style={{ flex: 1, minWidth: 0 }}>
            <T size={18} weight="800" color={colors.white} numberOfLines={1}>{child.name}</T>
            <T size={13} color="rgba(255,255,255,0.72)" numberOfLines={1}>
              {classOf(child)} · {child.vehicleId?.busNumber ?? "No bus assigned"}
            </T>
          </View>
          {running && (
            <View style={s.livePill}>
              <LiveDot color={colors.white} />
              <T size={11} weight="700" color={colors.white}>Live</T>
            </View>
          )}
        </View>

        <View style={{ marginTop: 20 }}>
          {running ? (
            <>
              <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8 }}>
                <T size={44} weight="800" color={colors.white}>{live.data.etaMinutes ?? "—"}</T>
                <T size={14} color="rgba(255,255,255,0.8)" style={{ marginBottom: 8 }}>
                  min to your stop
                </T>
              </View>
              <T size={13} color="rgba(255,255,255,0.72)" style={{ marginTop: 2 }}>
                {live.data.nextStop ? `Next stop: ${live.data.nextStop.name}` : "On the way"}
                {" · "}
                {live.data.stopsRemaining} stop{live.data.stopsRemaining === 1 ? "" : "s"} left
                {metresAway != null ? ` · ${prettyDistance(metresAway)} away` : ""}
              </T>
              {live.data.gpsStale && (
                // Silence is not the same as "the bus is here" — say when the
                // fix is old rather than letting a stale dot imply it is fresh.
                <View style={s.staleNote}>
                  <T size={12} color={colors.white}>
                    GPS last updated {ago(live.data.position?.at)} — the bus may be in a low-signal area.
                  </T>
                </View>
              )}
            </>
          ) : (
            <T size={14} color="rgba(255,255,255,0.85)" style={{ lineHeight: 20 }}>
              {status === "no_bus_assigned"
                ? "No bus is assigned yet. Please contact the school office."
                : "The bus has not started its trip yet."}
            </T>
          )}
        </View>

        {!!live.data?.childStatus && (
          <View style={s.heroFoot}>
            <IconBus size={16} color={colors.white} />
            <T size={13} color={colors.white}>
              {child.name.split(" ")[0]} is marked{" "}
              <T size={13} weight="700" color={colors.white}>{live.data.childStatus}</T>
            </T>
          </View>
        )}
      </Shield>

      {running && live.data?.position?.lat != null && (
        <Card title="On the map" padded={false}>
          <BusMap
            bus={{ lat: live.data.position.lat, lng: live.data.position.lng }}
            stops={child.routeId?.stops ?? []}
            highlightStopId={child.pickupStopId}
            height={280}
          />
        </Card>
      )}

      <Card title="Bus details">
        <View style={{ gap: 10 }}>
          <Row label="Bus" value={child.vehicleId?.busNumber ?? "—"} />
          <Row label="Vehicle" value={child.vehicleId?.vehicleNumber ?? "—"} />
          <Row label="Route" value={child.routeId?.name ?? "—"} />
          <Row label="Driver" value={live.data?.driver?.name ?? "—"} />
          {/* FRD §17.4 names the attendant too — the person who actually marks
              the child on and off the bus. */}
          <Row label="Bus attendant" value={live.data?.vehicle?.attendantId?.name ?? "Not assigned"} />
          <Row label="Pickup stop" value={pickupStop} />
          <Row label="Drop stop" value={dropStop} />
        </View>
        <Button variant="secondary" size="sm" block style={{ marginTop: 14 }} onPress={() => setChanging(true)}>
          Request a route change
        </Button>
      </Card>

      <Card title="Emergency contacts">
        <Contacts driver={live.data?.driver} />
      </Card>

      {live.data?.trip?.timeline?.length > 0 && (
        <Card title="Today's journey">
          <View style={{ gap: 12 }}>
            {live.data.trip.timeline.map((entry: any, i: number) => (
              <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <View style={s.dot} />
                <T size={13} weight="500" style={{ flex: 1 }}>
                  {entry.event.replace(/_/g, " ")}
                  {entry.stopName ? ` · ${entry.stopName}` : ""}
                </T>
                <Muted size={11}>{time(entry.at)}</Muted>
              </View>
            ))}
          </View>
        </Card>
      )}

      <RouteChangeModal childId={child._id} open={changing} onClose={() => setChanging(false)} />
    </Screen>
  );
}

const Row = ({ label, value }: { label: string; value: string }) => (
  <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
    <Muted size={13}>{label}</Muted>
    <T size={13} weight="600" style={{ flex: 1, textAlign: "right" }} numberOfLines={1}>{value}</T>
  </View>
);

function Contacts({ driver }: { driver?: { name: string; phone: string } | null }) {
  const { data } = useQuery<any>("/parent/emergency-contacts");

  const entries = [
    driver && { label: "Driver", name: driver.name, phone: driver.phone },
    data?.transportOffice && {
      label: "School office",
      name: data.transportOffice.name,
      phone: data.transportOffice.phone,
    },
    { label: "Emergency helpline", name: "Police / Ambulance", phone: data?.helpline ?? "112" },
  ].filter(Boolean) as { label: string; name: string; phone: string }[];

  return (
    <View style={{ gap: 8 }}>
      {entries.map((entry) => (
        <Pressable
          key={entry.label}
          onPress={() => Linking.openURL(`tel:${entry.phone}`)}
          style={({ pressed }) => [s.contact, pressed && { backgroundColor: colors.slate50 }]}
        >
          <View style={s.contactIcon}>
            <IconPhone size={16} color={colors.leaf600} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <T size={13} weight="600" numberOfLines={1}>{entry.name}</T>
            <Muted size={11}>{entry.label}</Muted>
          </View>
          <T size={13} weight="700" color={colors.brand600}>{entry.phone}</T>
        </Pressable>
      ))}
    </View>
  );
}

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
      title="Request a route change"
      footer={
        <>
          <Button variant="secondary" onPress={onClose}>Cancel</Button>
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
            Send request
          </Button>
        </>
      }
    >
      <View style={{ gap: 14 }}>
        <Alert>{error}</Alert>

        <View>
          <T size={13} weight="600" color={colors.slate600} style={{ marginBottom: 8 }}>New route</T>
          <Choices
            options={(routes.data ?? []).map((r) => ({ id: r._id, label: r.name }))}
            value={routeId}
            onChange={(id) => { setRouteId(id); setPickup(""); }}
            empty="No routes available."
          />
        </View>

        {stops.length > 0 && (
          <View>
            <T size={13} weight="600" color={colors.slate600} style={{ marginBottom: 8 }}>
              Preferred pickup stop
            </T>
            <Choices
              options={stops.map((st: any) => ({ id: st._id, label: `${st.sequence}. ${st.name}` }))}
              value={pickupStopId}
              onChange={setPickup}
            />
          </View>
        )}

        <Field
          label="Reason"
          value={reason}
          onChangeText={setReason}
          placeholder="We have moved to a new address."
          multiline
          inputStyle={{ height: 90, paddingTop: 12, textAlignVertical: "top" }}
        />

        <Muted style={{ lineHeight: 17 }}>
          The school office reviews every request. You will be notified once it is decided.
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
  if (!options.length) return <Muted>{empty ?? "Nothing to choose from."}</Muted>;

  return (
    <View style={{ gap: 6 }}>
      {options.map((o) => {
        const on = o.id === value;
        return (
          <Pressable
            key={o.id}
            onPress={() => onChange(o.id)}
            style={[s.choice, on && { borderColor: colors.brand600, backgroundColor: colors.brand50 }]}
          >
            <View style={[s.radio, on && { borderColor: colors.brand600 }]}>
              {on && <View style={s.radioDot} />}
            </View>
            <T size={13} weight={on ? "600" : "400"} style={{ flex: 1 }}>{o.label}</T>
          </Pressable>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.slate300,
    backgroundColor: colors.white,
  },
  hero: { borderRadius: radius.card, padding: 18, overflow: "hidden", ...shadow },
  livePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.18)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  staleNote: {
    marginTop: 10,
    backgroundColor: "rgba(255,255,255,0.16)",
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  heroFoot: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 16,
    marginHorizontal: -18,
    marginBottom: -18,
    paddingHorizontal: 18,
    paddingVertical: 12,
    backgroundColor: "rgba(0,0,0,0.15)",
  },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.leaf500 },
  contact: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: colors.slate200,
    borderRadius: radius.md,
    padding: 10,
  },
  contactIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.leaf50,
    alignItems: "center",
    justifyContent: "center",
  },
  choice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: colors.slate200,
    borderRadius: radius.md,
    padding: 12,
  },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: colors.slate300,
    alignItems: "center",
    justifyContent: "center",
  },
  radioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.brand600 },
});
