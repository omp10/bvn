import { useMemo, useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { api, useAction, useQuery } from "../api";
import { useSocket } from "../socket";
import { classOf } from "../format";
import { colors, radius } from "../theme";
import {
  Alert, Avatar, Badge, Button, Card, EmptyState, Loading, Muted, Screen, T,
} from "../ui";

type Student = {
  _id: string;
  name: string;
  class?: string;
  section?: string;
  rollNo?: string;
  pickupStop?: string | null;
  dropStop?: string | null;
  events: string[];
};

const EVENTS = ["boarded", "dropped", "absent"] as const;

/** What a driver most needs to know at a glance: who is still not on the bus. */
const statusOf = (s: Student) =>
  s.events.includes("absent")
    ? "absent"
    : s.events.includes("dropped")
      ? "dropped"
      : s.events.includes("boarded")
        ? "boarded"
        : "waiting";

/**
 * The driver's roster.
 *
 * The attendance API has always accepted the trip's driver as well as its
 * attendant — plenty of buses run without an attendant — but there was no screen
 * for it, so a driver could see a student *count* and nothing behind it.
 */
export default function DriverStudents() {
  const { data, loading, error, reload } = useQuery<{ trip: any; students: Student[] }>(
    "/driver/students"
  );
  const { busy, error: markError, run } = useAction();
  const [pending, setPending] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "waiting" | "onboard">("all");

  useSocket({ "attendance:marked": () => reload(), "trip:ended": () => reload() }, []);

  const students = data?.students ?? [];

  const counts = useMemo(() => {
    const by = { boarded: 0, dropped: 0, absent: 0, waiting: 0 };
    for (const s of students) by[statusOf(s) as keyof typeof by]++;
    return by;
  }, [students]);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return students.filter((s) => {
      const status = statusOf(s);
      if (filter === "waiting" && status !== "waiting") return false;
      if (filter === "onboard" && status !== "boarded") return false;
      if (!needle) return true;
      return (
        s.name.toLowerCase().includes(needle) ||
        String(s.rollNo ?? "").toLowerCase().includes(needle)
      );
    });
  }, [students, search, filter]);

  if (loading && !data) return <Loading label="Loading your students…" />;
  if (error) {
    return (
      <Screen>
        <Card><EmptyState title="Nothing to show" hint={error} /></Card>
        <Button variant="secondary" block onPress={reload}>Try again</Button>
      </Screen>
    );
  }

  const trip = data?.trip;

  const mark = (studentId: string, event: string) => {
    setPending(studentId + event);
    void run(
      () => api("/staff/attendance", { body: { tripId: trip._id, studentId, event } }),
      reload
    ).finally(() => setPending(null));
  };

  return (
    <Screen refreshing={loading} onRefresh={reload}>
      <Alert>{markError}</Alert>

      <Card>
        <View style={{ flexDirection: "row" }}>
          <Tally label="On board" value={counts.boarded} tone={colors.brand600} />
          <Tally label="Dropped" value={counts.dropped} tone={colors.leaf600} />
          <Tally label="Absent" value={counts.absent} tone={colors.slate500} />
          <Tally label="Waiting" value={counts.waiting} tone={counts.waiting ? colors.amber600 : colors.slate400} />
        </View>
      </Card>

      <View style={{ flexDirection: "row", gap: 8 }}>
        {([
          ["all", `All ${students.length}`],
          ["waiting", `Waiting ${counts.waiting}`],
          ["onboard", `On board ${counts.boarded}`],
        ] as const).map(([key, label]) => {
          const on = filter === key;
          return (
            <Pressable
              key={key}
              onPress={() => setFilter(key)}
              style={[s.chip, on && { backgroundColor: colors.brand600, borderColor: colors.brand600 }]}
            >
              <T size={12} weight="600" color={on ? colors.white : colors.slate600}>{label}</T>
            </Pressable>
          );
        })}
      </View>

      {students.length > 8 && (
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search name or roll number…"
          placeholderTextColor={colors.slate400}
          style={s.search}
        />
      )}

      {!trip && (
        <Card>
          <EmptyState
            title="No trip running"
            hint="Start today's trip to mark students on and off the bus."
          />
        </Card>
      )}

      {visible.map((student) => {
        const status = statusOf(student);
        return (
          <Card
            key={student._id}
            style={status === "waiting" ? undefined : { backgroundColor: colors.leaf50 }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <Avatar name={student.name} size={40} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <T size={15} weight="700" numberOfLines={1}>{student.name}</T>
                <Muted size={11} numberOfLines={1}>
                  {classOf(student)}
                  {student.rollNo ? ` · Roll ${student.rollNo}` : ""}
                </Muted>
                <Muted size={11} numberOfLines={1}>
                  {trip?.type === "evening"
                    ? `Drop: ${student.dropStop ?? "not set"}`
                    : `Pickup: ${student.pickupStop ?? "not set"}`}
                </Muted>
              </View>
              <Badge value={status === "waiting" ? undefined : status} />
            </View>

            {!!trip && (
              <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
                {EVENTS.map((event) => {
                  const already = student.events.includes(event);
                  return (
                    <View key={event} style={{ flex: 1 }}>
                      <Button
                        size="sm"
                        block
                        variant={
                          already || event === "absent"
                            ? "secondary"
                            : event === "boarded"
                              ? "primary"
                              : "success"
                        }
                        disabled={already || busy}
                        loading={pending === student._id + event}
                        onPress={() => mark(student._id, event)}
                      >
                        {already ? `✓ ${event}` : event}
                      </Button>
                    </View>
                  );
                })}
              </View>
            )}
          </Card>
        );
      })}

      {!visible.length && students.length > 0 && (
        <Card><EmptyState title="Nobody here" hint="No student matches that filter." /></Card>
      )}

      {!students.length && (
        <Card>
          <EmptyState title="No students on this bus" hint="The school office assigns students to buses." />
        </Card>
      )}
    </Screen>
  );
}

const Tally = ({ label, value, tone }: { label: string; value: number; tone: string }) => (
  <View style={{ flex: 1, alignItems: "center" }}>
    <T size={22} weight="800" color={tone}>{value}</T>
    <Muted size={11}>{label}</Muted>
  </View>
);

const s = StyleSheet.create({
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.slate300,
    backgroundColor: colors.white,
  },
  search: {
    borderWidth: 1,
    borderColor: colors.slate300,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    height: 46,
    fontSize: 15,
    color: colors.slate900,
    backgroundColor: colors.white,
  },
});
