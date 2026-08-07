import { useState } from "react";
import { api, useAction, useQuery } from "../../lib/api";
import { Alert, Button, Card, Field, PageHeader, Select } from "../../components/ui";
import { IconBell } from "../../components/icons";

type Counts = { parents: number; drivers: number; staff: number; schools: number };

const AUDIENCES = [
  { value: "parents", label: "Parents", key: "parents" },
  { value: "drivers", label: "Drivers", key: "drivers" },
  { value: "staff", label: "Attendants", key: "staff" },
  { value: "all", label: "Everyone", key: null },
] as const;

/**
 * Broadcasts — holidays, delays, anything the office needs everyone to know.
 *
 * The endpoint and its fan-out have existed since the beginning with no screen
 * to trigger them, so a school with a sudden holiday had no option but to ring
 * every parent. FRD §24.3.
 */
export default function SchoolAnnounce() {
  const counts = useQuery<Counts>("/announcements/audience-counts");
  const { busy, error, run } = useAction();

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState<string>("parents");
  const [sent, setSent] = useState<number | null>(null);

  const reach = (() => {
    if (!counts.data) return null;
    if (audience === "all") return counts.data.parents + counts.data.drivers + counts.data.staff;
    const key = AUDIENCES.find((a) => a.value === audience)?.key;
    return key ? (counts.data as any)[key] : null;
  })();

  const send = () =>
    void run(
      async () => {
        const res = await api<{ recipients: number }>("/announcements", {
          body: { title: title.trim(), body: body.trim(), audience },
        });
        setSent(res.recipients);
      },
      () => {
        setTitle("");
        setBody("");
      }
    );

  const tooShort = title.trim().length < 3 || body.trim().length < 3;

  return (
    <>
      <PageHeader
        title="Send an announcement"
        subtitle="Reaches every chosen person's app straight away, and their phone if push is set up."
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="space-y-4">
            <Alert>{error}</Alert>

            {sent !== null && (
              <div className="rounded-lg border border-leaf-400 bg-leaf-50 p-3 text-sm text-leaf-700">
                Sent to {sent} {sent === 1 ? "person" : "people"}.
              </div>
            )}

            <Select
              label="Who should get this?"
              value={audience}
              onChange={(e) => {
                setAudience(e.target.value);
                setSent(null);
              }}
            >
              {AUDIENCES.map((a) => (
                <option key={a.value} value={a.value}>{a.label}</option>
              ))}
            </Select>

            <Field
              label="Title"
              placeholder="School closed tomorrow"
              value={title}
              maxLength={120}
              onChange={(e) => { setTitle(e.target.value); setSent(null); }}
            />

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">Message</span>
              <textarea
                rows={5}
                maxLength={1000}
                value={body}
                onChange={(e) => { setBody(e.target.value); setSent(null); }}
                placeholder="Buses will not run on Friday 14th due to the public holiday. Normal service resumes Monday."
                className="w-full rounded-lg border border-slate-300 p-3 text-sm outline-none focus:border-brand-500"
              />
              <span className="mt-1 block text-xs text-slate-500">{body.length}/1000</span>
            </label>

            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-slate-500">
                {/* Said plainly, because there is no unsend. */}
                This cannot be recalled once sent.
              </p>
              <Button loading={busy} disabled={tooShort} onClick={send}>
                <IconBell className="h-4 w-4" />
                {reach !== null ? `Send to ${reach}` : "Send"}
              </Button>
            </div>
          </div>
        </Card>

        <Card title="Who is reachable">
          <dl className="space-y-2.5 text-sm">
            {[
              ["Parents", counts.data?.parents],
              ["Drivers", counts.data?.drivers],
              ["Attendants", counts.data?.staff],
            ].map(([label, value]) => (
              <div key={String(label)} className="flex justify-between">
                <dt className="text-slate-500">{label}</dt>
                <dd className="font-semibold text-slate-800">{value ?? "—"}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-xs leading-relaxed text-slate-500">
            Inactive accounts are skipped. Everyone sees it in their app's Alerts;
            a phone only buzzes once push credentials are configured.
          </p>
        </Card>
      </div>
    </>
  );
}
