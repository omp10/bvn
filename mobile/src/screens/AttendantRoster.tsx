import { useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";
import { api, useAction, useQuery } from "../api";
import { useSocket } from "../socket";
import { classOf } from "../format";
import { colors, radius } from "../theme";
import {
  Alert, Avatar, Badge, Button, Card, EmptyState, Loading, Muted, Screen, T,
} from "../ui";
import { IconBus } from "../icons";
import EmergencySheet from "./EmergencySheet";

const EVENTS = ["boarded", "dropped", "absent"] as const;

/**
 * The attendant's roster. Marking is one tap per child, and tapping twice is
 * harmless — the server collapses a repeat onto the original record.
 */
export default function AttendantRoster() {
  const { data, loading, error, reload } = useQuery<any>("/staff/attendance/roster");
  const { busy, error: markError, run } = useAction();
  const [pending, setPending] = useState<string | null>(null);
  const [sos, setSos] = useState(false);
  const [search, setSearch] = useState("");

  // The driver starting the trip is what opens attendance. Without this the
  // attendant stares at "waiting for the driver" until they think to refresh.
  useSocket({ "trip:started": () => reload(), "attendance:marked": () => reload() }, []);

  if (loading && !data) return <Loading label="Loading the roster…" />;
  if (error) {
    return (
      <Screen>
        <Card><EmptyState title="No bus assigned" hint={error} /></Card>
        <Button variant="secondary" block onPress={reload}>Try again</Button>
      </Screen>
    );
  }

  const trip = data?.trip;
  const students: any[] = data?.students ?? [];
  const marked = students.filter((s) => s.events.length > 0).length;

  const needle = search.trim().toLowerCase();
  const visible = needle
    ? students.filter((s) => String(s.name).toLowerCase().includes(needle))
    : students;

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
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View style={s.busIcon}>
            <IconBus size={24} color={colors.brand600} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <T size={18} weight="800">{data?.vehicle?.busNumber}</T>
            <Muted size={13}>{trip ? `${trip.type} trip in progress` : "No trip running"}</Muted>
          </View>
          {!!trip && (
            <View style={{ alignItems: "flex-end" }}>
              <T size={22} weight="800" color={colors.brand600}>
                {marked}
                <T size={15} color={colors.slate400}>/{students.length}</T>
              </T>
              <Muted size={11}>marked</Muted>
            </View>
          )}
        </View>
      </Card>

      {!trip && (
        <Card>
          <EmptyState
            title="Waiting for the driver"
            hint="Attendance opens as soon as the driver starts the trip."
          />
        </Card>
      )}

      {students.length > 8 && (
        // A 60-child roster on a moving bus is unscrollable; typing two letters
        // beats thumbing past thirty rows at a stop.
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search a child…"
          placeholderTextColor={colors.slate400}
          style={s.search}
        />
      )}

      {visible.map((student) => {
        const done = student.events.length > 0;
        return (
          <Card key={student._id} style={done ? { backgroundColor: colors.leaf50 } : undefined}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <Avatar name={student.name} size={40} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <T size={15} weight="700" numberOfLines={1}>{student.name}</T>
                <Muted size={11}>{classOf(student)}</Muted>
              </View>
              <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: 4 }}>
                {student.events.map((e: string) => <Badge key={e} value={e} />)}
              </View>
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

      {needle && !visible.length && (
        <Card><EmptyState title="No match" hint={`Nobody on this bus matches "${search}".`} /></Card>
      )}

      <Button variant="danger" size="lg" block onPress={() => setSos(true)}>
        Emergency
      </Button>

      <EmergencySheet open={sos} onClose={() => setSos(false)} tripId={trip?._id} />
    </Screen>
  );
}

const s = StyleSheet.create({
  busIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.brand50,
    alignItems: "center",
    justifyContent: "center",
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
