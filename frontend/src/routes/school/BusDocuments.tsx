import { useState } from "react";
import { api, useAction } from "../../lib/api";
import { date, daysLeft, titleCase } from "../../lib/format";
import { Alert, Badge, Button, Card, EmptyState, Field, Modal, Select, cx } from "../../components/ui";
import { UploadButton } from "../../components/Upload";

/** The five the FRD names, plus the catch-all the schema allows. */
const DOCUMENT_TYPES = ["rc", "insurance", "fitness", "pollution", "permit", "other"] as const;

const LABEL: Record<string, string> = {
  rc: "Registration certificate",
  insurance: "Insurance",
  fitness: "Fitness certificate",
  pollution: "Pollution certificate",
  permit: "Permit",
  other: "Other",
};

type Doc = { _id: string; type: string; number?: string; url?: string; expiresOn?: string };

/**
 * Vehicle paperwork — FRD §10.3 and §11.2.
 *
 * The compliance job has been warning schools about expiring documents every
 * Monday since launch, against a list nothing could ever add to: the upload
 * endpoint existed and no screen called it. This is that screen.
 */
export default function BusDocuments({
  bus,
  onClose,
  onChanged,
}: {
  /* The bus comes from the list rather than a fetch: there is no
     GET /school/buses/:id, and the list already returns every document. */
  bus: { _id: string; busNumber?: string; vehicleNumber?: string; documents?: Doc[] } | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { busy, error, run } = useAction();

  const [type, setType] = useState<string>("rc");
  const [number, setNumber] = useState("");
  const [expiresOn, setExpiresOn] = useState("");

  if (!bus) return null;

  const busId = bus._id;
  const busLabel = bus.busNumber ?? bus.vehicleNumber;
  const docs = bus.documents ?? [];

  // The API takes the metadata on the query string and the file as multipart.
  const uploadPath =
    `/uploads/vehicle/${busId}/document?type=${type}` +
    (number.trim() ? `&number=${encodeURIComponent(number.trim())}` : "") +
    (expiresOn ? `&expiresOn=${expiresOn}` : "");

  const remove = (documentId: string) =>
    void run(
      () => api(`/uploads/vehicle/${busId}/document/${documentId}`, { method: "DELETE" }),
      onChanged
    );

  return (
    <Modal open onClose={onClose} title={`${busLabel ?? "Bus"} — documents`}>
      <div className="space-y-4">
        <Alert>{error}</Alert>

        <div className="rounded-lg border border-slate-200 p-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <Select label="Document" value={type} onChange={(e) => setType(e.target.value)}>
              {DOCUMENT_TYPES.map((t) => (
                <option key={t} value={t}>{LABEL[t]}</option>
              ))}
            </Select>
            <Field label="Number" hint="Optional" value={number} onChange={(e) => setNumber(e.target.value)} />
            <Field
              label="Expires on"
              type="date"
              hint="Drives the reminder"
              value={expiresOn}
              onChange={(e) => setExpiresOn(e.target.value)}
            />
          </div>
          <div className="mt-3 flex items-center gap-3">
            <UploadButton
              path={uploadPath}
              accept="image/*,application/pdf"
              variant="primary"
              label="Upload document"
              onDone={() => {
                setNumber("");
                setExpiresOn("");
                onChanged();
              }}
            />
            <span className="text-xs text-slate-500">Image or PDF, up to 5 MB.</span>
          </div>
        </div>

        {docs.length === 0 ? (
          <EmptyState
            title="Nothing on file"
            hint="Without an expiry date on record, nobody is reminded before this bus falls out of compliance."
          />
        ) : (
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {docs.map((d) => {
              const left = daysLeft(d.expiresOn);
              const expired = left !== null && left < 0;
              const soon = left !== null && left >= 0 && left < 30;
              return (
                <li key={d._id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-slate-800">
                      {LABEL[d.type] ?? titleCase(d.type)}
                    </div>
                    <div className="text-xs text-slate-500">
                      {d.number ? `${d.number} · ` : ""}
                      {d.expiresOn ? (
                        <span className={cx((expired || soon) && "font-semibold text-amber-600")}>
                          {expired ? "expired " : "expires "}
                          {date(d.expiresOn)}
                        </span>
                      ) : (
                        "no expiry recorded"
                      )}
                    </div>
                  </div>
                  {expired && <Badge value="cancelled" />}
                  {d.url && (
                    <a
                      href={d.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm font-semibold text-brand-600 hover:underline"
                    >
                      View
                    </a>
                  )}
                  <Button size="sm" variant="secondary" disabled={busy} onClick={() => remove(d._id)}>
                    Remove
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Modal>
  );
}
