const pad = (n: number) => String(n).padStart(2, "0");

export const time = (value?: string | Date | null) =>
  value ? new Date(value).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true }) : "—";

export const date = (value?: string | Date | null) =>
  value ? new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";

export const dateTime = (value?: string | Date | null) =>
  value ? `${date(value)}, ${time(value)}` : "—";

/** "3 min ago" — how long since the bus last reported. */
export function ago(value?: string | Date | null): string {
  if (!value) return "never";
  const seconds = Math.floor((Date.now() - new Date(value).getTime()) / 1000);
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `${hours} hr ago` : date(value);
}

/** Paise to rupees, the way an Indian invoice reads. */
export const rupees = (paise = 0) =>
  "₹" + (paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 });

export const daysLeft = (value?: string | Date | null): number | null =>
  value ? Math.ceil((new Date(value).getTime() - Date.now()) / 86_400_000) : null;

export const classOf = (s: { class?: string | null; section?: string | null }) =>
  [s.class, s.section].filter(Boolean).join(" ") || "—";

export const initials = (name = "") =>
  name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");

export const clockToday = () => {
  const now = new Date();
  return `${pad(now.getHours())}:${pad(now.getMinutes())}`;
};

export const titleCase = (value = "") => value.replace(/[_-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
