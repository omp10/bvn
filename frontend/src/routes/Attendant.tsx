import { useState } from "react";
import { api, useAction, useQuery } from "../lib/api";
import { classOf } from "../lib/format";
import { Alert, Avatar, Badge, Button, Card, EmptyState, Loading, cx } from "../components/ui";
import { IconBus, IconCheck } from "../components/icons";
import { EmergencyModal } from "./Driver";

/**
 * The attendant's roster. Marking is one tap per child, and tapping twice is
 * harmless — the server collapses a repeat onto the original record.
 */
export default function Attendant() {
  const { data, loading, error, reload } = useQuery<any>("/staff/attendance/roster");
  const { busy, error: markError, run } = useAction();
  const [pending, setPending] = useState<string | null>(null);
  const [sos, setSos] = useState(false);

  if (loading && !data) return <Loading />;
  if (error) return <Card><EmptyState title="No bus assigned" hint={error} /></Card>;

  const trip = data?.trip;
  const students = data?.students ?? [];
  const marked = students.filter((s: any) => s.events.length > 0).length;

  const mark = (studentId: string, event: string) => {
    setPending(studentId + event);
    void run(() => api("/staff/attendance", { body: { tripId: trip._id, studentId, event } }), reload)
      .finally(() => setPending(null));
  };

  return (
    <div className="space-y-4">
      <Alert>{markError}</Alert>

      <Card>
        <div className="flex items-center gap-3">
          <span className="grid h-12 w-12 place-items-center rounded-xl bg-brand-50 text-brand-600">
            <IconBus className="h-6 w-6" />
          </span>
          <div className="flex-1">
            <div className="text-lg font-bold">{data?.vehicle?.busNumber}</div>
            <div className="text-sm text-slate-500">
              {trip ? `${trip.type} trip in progress` : "No trip running"}
            </div>
          </div>
          {trip && (
            <div className="text-right">
              <div className="text-2xl font-bold text-brand-600">{marked}<span className="text-base text-slate-400">/{students.length}</span></div>
              <div className="text-xs text-slate-500">marked</div>
            </div>
          )}
        </div>
      </Card>

      {!trip && (
        <Card>
          <EmptyState
            title="Waiting for the driver"
            hint="Attendance opens as soon as the driver starts the trip."
          />
        </Card>
      )}

      <div className="space-y-2">
        {students.map((student: any) => {
          const done = student.events.length > 0;
          return (
            <Card key={student._id} className={cx("transition", done && "bg-leaf-50/50")}>
              <div className="flex items-center gap-3">
                <Avatar name={student.name} className="h-10 w-10" />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-slate-900">{student.name}</div>
                  <div className="text-xs text-slate-500">{classOf(student)}</div>
                </div>
                <div className="flex flex-wrap justify-end gap-1">
                  {student.events.map((e: string) => <Badge key={e} value={e} />)}
                </div>
              </div>

              {trip && (
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {(["boarded", "dropped", "absent"] as const).map((event) => {
                    const already = student.events.includes(event);
                    return (
                      <Button
                        key={event}
                        size="sm"
                        variant={already ? "secondary" : event === "absent" ? "secondary" : event === "boarded" ? "primary" : "success"}
                        disabled={already || busy}
                        loading={pending === student._id + event}
                        onClick={() => mark(student._id, event)}
                      >
                        {already && <IconCheck className="h-3.5 w-3.5" />}
                        {event}
                      </Button>
                    );
                  })}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      <Button variant="danger" size="lg" block onClick={() => setSos(true)}>
        Emergency
      </Button>

      <EmergencyModal open={sos} onClose={() => setSos(false)} tripId={trip?._id} />
    </div>
  );
}
