import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { api, useAction, useQuery } from "../api";
import { useSocket } from "../socket";
import { classOf } from "../format";
import { colors, elevation, radius, space, tone } from "../theme";
import { str } from "../strings";
import {
  Alert, Avatar, Badge, Button, Card, Confirm, EmptyState, ErrorState, Field, IconChip, Loading,
  Modal, Muted, Screen, SkeletonRow, StatTile, T, tick,
} from "../ui";
import { IconBus, IconCheck } from "../icons";
import EmergencySheet from "./EmergencySheet";

export type RosterStudent = {
  _id: string;
  name: string;
  class?: string;
  section?: string;
  rollNo?: string;
  photoUrl?: string | null;
  pickupStop?: string | null;
  dropStop?: string | null;
  events: string[];
};

type Status = "boarded" | "dropped" | "absent" | "waiting";

const EVENTS = ["boarded", "dropped", "absent"] as const;

/** What matters at a glance is who is still not on the bus. */
const statusOf = (s: RosterStudent): Status =>
  s.events.includes("absent")
    ? "absent"
    : s.events.includes("dropped")
      ? "dropped"
      : s.events.includes("boarded")
        ? "boarded"
        : "waiting";

/** The one action a row is usually for. Anything else is behind the row itself. */
const nextEvent = (status: Status) => (status === "waiting" ? "boarded" : status === "boarded" ? "dropped" : null);

/**
 * Marking children on and off a bus.
 *
 * One screen, two callers. The driver and the attendant were two files doing
 * the same job against two endpoints that return the same shape — same student
 * record, same `/staff/attendance` write, same three events — and they had
 * drifted, so the driver had counts and filters the attendant did not and the
 * attendant had bulk marking the driver did not. Now both have both.
 *
 * The design target is a sixty-child bus, one-handed, on the move. That is why
 * the row's primary action is a single large button for the *next* mark rather
 * than three small ones — three targets side by side at 60 rows is how you mark
 * the wrong child. The other two events live behind a tap on the row.
 */
export default function Roster({
  endpoint,
  bulk,
  emergency,
  noTripHint,
}: {
  endpoint: string;
  /** Bulk marking, for the attendant working a queue at a stop. */
  bulk?: boolean;
  /** The attendant has no Trip screen, so their SOS lives here. */
  emergency?: boolean;
  noTripHint: string;
}) {
  const { data, loading, error, reload } = useQuery<{ trip: any; vehicle?: any; students: RosterStudent[] }>(
    endpoint
  );
  const { busy, error: markError, run } = useAction();
  const [pending, setPending] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | Status>("all");
  const [sheetFor, setSheetFor] = useState<RosterStudent | null>(null);
  const [confirmBulk, setConfirmBulk] = useState<null | "boarded" | "dropped">(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [sos, setSos] = useState(false);

  /* The driver starting the trip is what opens attendance. Without this the
     attendant stares at "waiting for the driver" until they think to refresh. */
  useSocket(
    { "trip:started": () => reload(), "attendance:marked": () => reload(), "trip:ended": () => reload() },
    []
  );

  /* `/driver/students` resolves the stop names for us; `/staff/attendance/roster`
     returns the raw student documents and the populated route, so the name is
     already on the wire — it just needs joining up here rather than a change to
     an endpoint the web app also uses. */
  const students = useMemo(() => {
    const rows = data?.students ?? [];
    const stops: { _id: unknown; name: string }[] = data?.vehicle?.routeId?.stops ?? [];
    if (!stops.length) return rows;

    const nameOf = (id: unknown) => stops.find((st) => String(st._id) === String(id))?.name ?? null;
    return rows.map((s) => ({
      ...s,
      pickupStop: s.pickupStop ?? nameOf((s as any).pickupStopId),
      dropStop: s.dropStop ?? nameOf((s as any).dropStopId),
    }));
  }, [data]);

  const counts = useMemo(() => {
    const by = { boarded: 0, dropped: 0, absent: 0, waiting: 0 };
    for (const s of students) by[statusOf(s)]++;
    return by;
  }, [students]);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return students.filter((s) => {
      if (filter !== "all" && statusOf(s) !== filter) return false;
      if (!needle) return true;
      return (
        s.name.toLowerCase().includes(needle) ||
        String(s.rollNo ?? "").toLowerCase().includes(needle)
      );
    });
  }, [students, search, filter]);

  if (loading && !data) {
    return (
      <Screen>
        <Card>
          <View style={{ gap: space(4) }}>
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </View>
        </Card>
      </Screen>
    );
  }

  if (error) return <Screen><ErrorState message={error} onRetry={reload} /></Screen>;

  const trip = data?.trip;

  const mark = (studentId: string, event: string) => {
    setPending(studentId + event);
    tick();
    void run(
      () => api("/staff/attendance", { body: { tripId: trip._id, studentId, event } }),
      reload
    ).finally(() => setPending(null));
  };

  /* One tap per child is fine for a handful and miserable for sixty. Marking
     the whole visible list is sequential on purpose: the endpoint is idempotent
     per (trip, student, event), so a partial failure is safe to retry, and
     firing sixty parallel writes at a phone on a moving bus is how you get a
     rate-limit instead of a register. */
  const pendingFor = (event: string) => visible.filter((s) => !s.events.includes(event));

  const markVisible = (event: string) => {
    const todo = pendingFor(event);
    setConfirmBulk(null);
    if (!todo.length) return;
    setBulkBusy(true);
    tick("heavy");
    void run(async () => {
      for (const student of todo) {
        await api("/staff/attendance", { body: { tripId: trip._id, studentId: student._id, event } });
      }
    }, reload).finally(() => setBulkBusy(false));
  };

  const marked = students.length - counts.waiting;

  return (
    <View style={{ flex: 1 }}>
      <Screen refreshing={loading} onRefresh={reload}>
        <Alert>{markError}</Alert>

        {!!data?.vehicle && (
          <Card>
            <View style={{ flexDirection: "row", alignItems: "center", gap: space(3) }}>
              <IconChip bg={colors.brand50} size={48} square>
                <IconBus size={24} color={colors.brand600} />
              </IconChip>
              <View style={{ flex: 1, minWidth: 0 }}>
                <T role="title" size={20} numberOfLines={1}>
                  {data.vehicle.busNumber}
                </T>
                <Muted role="label" weight="400">
                  {str.roster.markedOf(marked, students.length)}
                </Muted>
              </View>
            </View>
          </Card>
        )}

        {/* Counts double as filters — a driver who wants the 12 still waiting
            taps the number telling them there are 12. */}
        <View style={{ flexDirection: "row", gap: space(2.5) }}>
          <StatTile
            value={counts.boarded}
            label={str.roster.onBoard}
            color={colors.brand600}
            active={filter === "boarded"}
            onPress={() => setFilter(filter === "boarded" ? "all" : "boarded")}
          />
          <StatTile
            value={counts.dropped}
            label={str.roster.dropped}
            color={tone.success}
            active={filter === "dropped"}
            onPress={() => setFilter(filter === "dropped" ? "all" : "dropped")}
          />
          <StatTile
            value={counts.absent}
            label={str.roster.absent}
            color={tone.textMuted}
            active={filter === "absent"}
            onPress={() => setFilter(filter === "absent" ? "all" : "absent")}
          />
          <StatTile
            value={counts.waiting}
            label={str.roster.waiting}
            color={counts.waiting ? colors.amber600 : colors.slate400}
            active={filter === "waiting"}
            onPress={() => setFilter(filter === "waiting" ? "all" : "waiting")}
          />
        </View>

        {students.length > 8 && (
          // A 60-child roster on a moving bus is unscrollable; typing two letters
          // beats thumbing past thirty rows at a stop.
          <Field
            value={search}
            onChangeText={setSearch}
            placeholder={str.roster.search}
            autoCorrect={false}
          />
        )}

        {!trip && (
          <Card>
            <EmptyState title={str.roster.noTripTitle} hint={noTripHint} />
          </Card>
        )}

        {visible.map((student) => (
          <Row
            key={student._id}
            student={student}
            trip={trip}
            busy={busy || bulkBusy}
            pending={pending}
            onMark={mark}
            onOpen={() => setSheetFor(student)}
          />
        ))}

        {!visible.length && students.length > 0 && (
          <Card>
            <EmptyState title={str.roster.noMatchTitle} hint={str.roster.noMatchHint(search.trim())} />
          </Card>
        )}

        {!students.length && (
          <Card>
            <EmptyState title={str.roster.noStudentsTitle} hint={str.roster.noStudentsHint} />
          </Card>
        )}

        {emergency && (
          <Button variant="danger" size="lg" block haptic="heavy" onPress={() => setSos(true)}>
            {str.driver.emergency}
          </Button>
        )}

        {/* Room for the sticky bar, so the last child is never under it. */}
        {bulk && !!trip && <View style={{ height: space(14) }} />}
      </Screen>

      {bulk && !!trip && (
        <View style={s.stickyBar}>
          <Button
            size="sm"
            block
            style={{ flex: 1 }}
            loading={bulkBusy}
            onPress={() => setConfirmBulk("boarded")}
          >
            {str.roster.bulkBoarded}
          </Button>
          <Button
            size="sm"
            block
            variant="success"
            style={{ flex: 1 }}
            loading={bulkBusy}
            onPress={() => setConfirmBulk("dropped")}
          >
            {str.roster.bulkDropped}
          </Button>
        </View>
      )}

      {/* Confirmed, never one-tap. Marking sixty children boarded by accident
          tells sixty parents their child is on a bus they may not be on. */}
      <Confirm
        open={confirmBulk !== null}
        onClose={() => setConfirmBulk(null)}
        onConfirm={() => markVisible(confirmBulk!)}
        variant="primary"
        title={str.roster.bulkTitle(confirmBulk ?? "boarded")}
        body={
          pendingFor(confirmBulk ?? "boarded").length
            ? str.roster.bulkBody(pendingFor(confirmBulk ?? "boarded").length)
            : str.roster.bulkNobody
        }
        confirmLabel={str.roster.bulkConfirm}
      />

      <StatusSheet
        student={sheetFor}
        onClose={() => setSheetFor(null)}
        onMark={(event) => {
          const id = sheetFor!._id;
          setSheetFor(null);
          mark(id, event);
        }}
      />

      <EmergencySheet open={sos} onClose={() => setSos(false)} tripId={trip?._id} />
    </View>
  );
}

/** One child. Big name, one big action, everything else quiet. */
function Row({
  student,
  trip,
  busy,
  pending,
  onMark,
  onOpen,
}: {
  student: RosterStudent;
  trip: any;
  busy: boolean;
  pending: string | null;
  onMark: (id: string, event: string) => void;
  onOpen: () => void;
}) {
  const status = statusOf(student);
  const next = nextEvent(status);
  const stop = trip?.type === "evening" ? student.dropStop : student.pickupStop;

  return (
    <Pressable
      onPress={trip ? onOpen : undefined}
      accessibilityRole={trip ? "button" : undefined}
      accessibilityLabel={trip ? str.roster.changeFor(student.name) : undefined}
      style={({ pressed }) => [
        s.row,
        status !== "waiting" && { backgroundColor: colors.leaf50, borderColor: colors.leaf100 },
        status === "absent" && { backgroundColor: colors.slate100, borderColor: tone.border },
        pressed && { opacity: 0.85 },
      ]}
    >
      <Avatar name={student.name} photoUrl={student.photoUrl} size={44} />

      <View style={{ flex: 1, minWidth: 0 }}>
        <T role="body" weight="700" numberOfLines={1}>
          {student.name}
        </T>
        <Muted numberOfLines={1}>
          {[classOf(student), student.rollNo ? str.roster.roll(student.rollNo) : null]
            .filter(Boolean)
            .join(" · ")}
        </Muted>
        {!!stop && (
          <Muted numberOfLines={1}>
            {trip?.type === "evening" ? str.roster.drop(stop) : str.roster.pickup(stop)}
          </Muted>
        )}
      </View>

      {!trip ? null : next ? (
        <Pressable
          onPress={() => onMark(student._id, next)}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={next === "boarded" ? str.roster.markBoarded : str.roster.markDropped}
          style={({ pressed }) => [
            s.markButton,
            { backgroundColor: next === "boarded" ? colors.brand600 : tone.success },
            (pressed || pending === student._id + next) && { opacity: 0.7 },
          ]}
        >
          <IconCheck size={26} color={colors.white} />
        </Pressable>
      ) : (
        // Colour is never the only carrier — the pill says the word too.
        <Badge value={status} />
      )}
    </Pressable>
  );
}

/** The other two events, one tap deeper than the one people actually want. */
function StatusSheet({
  student,
  onClose,
  onMark,
}: {
  student: RosterStudent | null;
  onClose: () => void;
  onMark: (event: string) => void;
}) {
  return (
    <Modal
      open={Boolean(student)}
      onClose={onClose}
      title={student ? str.roster.changeFor(student.name) : ""}
    >
      <View style={{ gap: space(2.5), paddingBottom: space(2) }}>
        {EVENTS.map((event) => {
          const already = student?.events.includes(event);
          return (
            <Button
              key={event}
              block
              size="lg"
              variant={already ? "secondary" : event === "absent" ? "secondary" : event === "boarded" ? "primary" : "success"}
              disabled={already}
              onPress={() => onMark(event)}
            >
              {already
                ? `✓ ${str.roster[event === "boarded" ? "onBoard" : event === "dropped" ? "dropped" : "absent"]}`
                : event === "boarded"
                  ? str.roster.markBoarded
                  : event === "dropped"
                    ? str.roster.markDropped
                    : str.roster.markAbsent}
            </Button>
          );
        })}
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space(3),
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: tone.border,
    borderRadius: radius.card,
    padding: space(3),
    ...elevation.raised,
  },
  markButton: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  stickyBar: {
    flexDirection: "row",
    gap: space(2.5),
    padding: space(3),
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: tone.border,
  },
});
