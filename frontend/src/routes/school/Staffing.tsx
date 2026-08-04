import { useState } from "react";
import { api, useAction, useQuery } from "../../lib/api";
import { date } from "../../lib/format";
import {
  Alert, Badge, Button, Card, EmptyState, Field, Modal, PageHeader, Select, Table,
} from "../../components/ui";
import { IconPlus } from "../../components/icons";

/**
 * Asking the platform for buses and drivers, on one screen — the school is
 * short of transport capacity either way, and splitting it across two pages
 * only makes them hunt.
 */
export default function SchoolStaffing() {
  const drivers = useQuery<any[]>("/school/driver-requests");
  const vehicles = useQuery<any[]>("/school/vehicle-requests");
  const buses = useQuery<any[]>("/school/buses");
  const { busy, error, run } = useAction();
  const [asking, setAsking] = useState<"driver" | "vehicle" | null>(null);

  return (
    <>
      <PageHeader
        title="Requests to the platform"
        subtitle="Short of buses or drivers? Ask and we'll place them."
        actions={
          <>
            <Button variant="secondary" onClick={() => setAsking("vehicle")}>
              <IconPlus className="h-4 w-4" /> Request buses
            </Button>
            <Button onClick={() => setAsking("driver")}>
              <IconPlus className="h-4 w-4" /> Request drivers
            </Button>
          </>
        }
      />
      <Alert>{error}</Alert>

      <Card title="Driver requests" padded={false}>
        <Table
          rows={drivers.data}
          loading={drivers.loading}
          rowKey={(r) => r._id}
          empty={<EmptyState title="No driver requests" hint="Ask the platform when you are short of drivers." />}
          columns={[
            {
              header: "Needs",
              cell: (r) => (
                <div>
                  <div className="font-medium">{r.driverCount} driver{r.driverCount > 1 ? "s" : ""}</div>
                  <div className="text-xs text-slate-500">
                    {r.minExperienceYears ? `min ${r.minExperienceYears} yrs` : "any experience"}
                    {r.vehicleId?.busNumber ? ` · for ${r.vehicleId.busNumber}` : ""}
                  </div>
                </div>
              ),
            },
            { header: "Note", cell: (r) => r.note ?? "—", secondary: true },
            {
              header: "Assigned",
              cell: (r) =>
                r.assignedDriverIds?.length
                  ? r.assignedDriverIds.map((d: any) => d.name).join(", ")
                  : <span className="text-slate-400">—</span>,
            },
            { header: "Raised", cell: (r) => date(r.createdAt), secondary: true },
            { header: "Status", align: "right", cell: (r) => <Badge value={r.status} /> },
          ]}
        />
      </Card>

      <Card className="mt-4" title="Bus requests" padded={false}>
        <Table
          rows={vehicles.data}
          loading={vehicles.loading}
          rowKey={(r) => r._id}
          empty={<EmptyState title="No bus requests" hint="Ask the platform when you need extra buses." />}
          columns={[
            { header: "Needs", cell: (r) => `${r.vehicleCount} × ${r.seatingCapacity} seats` },
            { header: "Notes", cell: (r) => r.specialRequirements ?? "—", secondary: true },
            {
              header: "Assigned",
              cell: (r) =>
                r.assignedVehicleIds?.length
                  ? r.assignedVehicleIds.map((v: any) => v.vehicleNumber).join(", ")
                  : <span className="text-slate-400">—</span>,
            },
            { header: "Raised", cell: (r) => date(r.createdAt), secondary: true },
            { header: "Status", align: "right", cell: (r) => <Badge value={r.status} /> },
          ]}
        />
      </Card>

      <AskModal
        kind={asking}
        buses={buses.data ?? []}
        busy={busy}
        onClose={() => setAsking(null)}
        onSubmit={(body) =>
          void run(
            () => api(asking === "driver" ? "/school/driver-requests" : "/school/vehicle-requests", { body }),
            () => { setAsking(null); drivers.reload(); vehicles.reload(); }
          )
        }
      />
    </>
  );
}

function AskModal({
  kind, buses, busy, onClose, onSubmit,
}: {
  kind: "driver" | "vehicle" | null;
  buses: any[];
  busy: boolean;
  onClose: () => void;
  onSubmit: (body: Record<string, unknown>) => void;
}) {
  const [form, setForm] = useState<Record<string, string>>({});
  const set = (k: string) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  if (!kind) return null;
  const isDriver = kind === "driver";

  return (
    <Modal
      open
      onClose={onClose}
      title={isDriver ? "Request drivers" : "Request buses"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            loading={busy}
            onClick={() =>
              onSubmit(
                isDriver
                  ? {
                      driverCount: Number(form.driverCount || 1),
                      minExperienceYears: Number(form.minExperienceYears || 0),
                      vehicleId: form.vehicleId || undefined,
                      note: form.note || undefined,
                    }
                  : {
                      vehicleCount: Number(form.vehicleCount || 1),
                      seatingCapacity: Number(form.seatingCapacity || 40),
                      specialRequirements: form.note || undefined,
                    }
              )
            }
          >
            Send request
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {isDriver ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="How many drivers?" type="number" min={1} max={20}
                value={form.driverCount ?? "1"} onChange={set("driverCount")} />
              <Field label="Minimum experience (years)" type="number" min={0} max={40}
                value={form.minExperienceYears ?? "0"} onChange={set("minExperienceYears")} />
            </div>
            <Select label="For which bus? (optional)" value={form.vehicleId ?? ""} onChange={set("vehicleId")}>
              <option value="">Not specific</option>
              {buses.map((b) => (
                <option key={b._id} value={b._id}>{b.busNumber} · {b.vehicleNumber}</option>
              ))}
            </Select>
          </>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="How many buses?" type="number" min={1} max={20}
              value={form.vehicleCount ?? "1"} onChange={set("vehicleCount")} />
            <Field label="Seats needed" type="number" min={1} max={100}
              value={form.seatingCapacity ?? "40"} onChange={set("seatingCapacity")} />
          </div>
        )}

        <Field label="Anything else we should know?" value={form.note ?? ""} onChange={set("note")} />

        <p className="text-xs text-slate-500">
          {isDriver
            ? "We place drivers who have registered with the platform and have a valid licence."
            : "We place vehicles from registered fleet owners."}
        </p>
      </div>
    </Modal>
  );
}
