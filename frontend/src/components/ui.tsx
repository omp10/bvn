import { useEffect, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";

export const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");

/* ── Page furniture ─────────────────────────────────────────────────── */

export function PageHeader({
  title, subtitle, actions,
}: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Card({
  title, subtitle, actions, children, className, padded = true,
}: {
  title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode;
  children: ReactNode; className?: string; padded?: boolean;
}) {
  return (
    <section className={cx("rounded-card border border-slate-200/80 bg-white shadow-sm shadow-slate-200/50", className)}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <div>
            {title && <h2 className="font-semibold text-slate-900">{title}</h2>}
            {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
          </div>
          {actions}
        </div>
      )}
      <div className={padded ? "p-4" : undefined}>{children}</div>
    </section>
  );
}

/* ── Numbers ────────────────────────────────────────────────────────── */

const TONES = {
  brand: "from-brand-500 to-brand-600",
  leaf: "from-leaf-400 to-leaf-600",
  sun: "from-sun-400 to-sun-500",
  slate: "from-slate-400 to-slate-600",
} as const;

export function Stat({
  label, value, hint, icon, tone = "brand",
}: {
  label: string; value: ReactNode; hint?: ReactNode; icon?: ReactNode;
  tone?: keyof typeof TONES;
}) {
  return (
    <div className="rounded-card border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-200/50">
      <div className="flex items-start gap-3">
        {icon && (
          <span className={cx("grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-gradient-to-br text-white", TONES[tone])}>
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <div className="text-2xl font-bold leading-tight text-slate-900">{value ?? "—"}</div>
          <div className="truncate text-sm text-slate-500">{label}</div>
          {hint && <div className="mt-0.5 text-xs text-slate-400">{hint}</div>}
        </div>
      </div>
    </div>
  );
}

export const StatGrid = ({ children }: { children: ReactNode }) => (
  <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{children}</div>
);

/* ── Controls ───────────────────────────────────────────────────────── */

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "success";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  block?: boolean;
};

const VARIANTS = {
  primary: "bg-brand-600 text-white hover:bg-brand-700 shadow-sm",
  success: "bg-leaf-500 text-white hover:bg-leaf-600 shadow-sm",
  secondary: "bg-white text-slate-700 border border-slate-300 hover:bg-slate-50",
  ghost: "text-slate-600 hover:bg-slate-100",
  danger: "bg-red-600 text-white hover:bg-red-700 shadow-sm",
};

const SIZES = { sm: "h-8 px-3 text-xs", md: "h-10 px-4 text-sm", lg: "h-12 px-5 text-base" };

export function Button({
  variant = "primary", size = "md", loading, block, className, children, disabled, ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition",
        "disabled:cursor-not-allowed disabled:opacity-55",
        VARIANTS[variant], SIZES[size], block && "w-full", className
      )}
    >
      {loading && <Spinner className="h-4 w-4" />}
      {children}
    </button>
  );
}

export function Field({
  label, hint, error, className, ...rest
}: { label: string; hint?: string; error?: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className={cx("block", className)}>
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      <input
        {...rest}
        className={cx(
          "h-10 w-full rounded-lg border bg-white px-3 text-sm outline-none transition",
          "focus:border-brand-500 focus:ring-2 focus:ring-brand-100",
          error ? "border-red-400" : "border-slate-300"
        )}
      />
      {(error || hint) && (
        <span className={cx("mt-1 block text-xs", error ? "text-red-600" : "text-slate-500")}>{error ?? hint}</span>
      )}
    </label>
  );
}

export function Select({
  label, children, className, ...rest
}: { label?: string } & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <label className={cx("block", className)}>
      {label && <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>}
      <select
        {...rest}
        className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
      >
        {children}
      </select>
    </label>
  );
}

/* ── Feedback ───────────────────────────────────────────────────────── */

export const Spinner = ({ className = "h-5 w-5" }: { className?: string }) => (
  <svg className={cx("animate-spin", className)} viewBox="0 0 24 24" fill="none" aria-hidden>
    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
    <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
  </svg>
);

export const Loading = ({ label = "Loading…" }: { label?: string }) => (
  <div className="flex items-center justify-center gap-2 py-10 text-slate-400">
    <Spinner /> <span className="text-sm">{label}</span>
  </div>
);

export function Alert({ tone = "error", children }: { tone?: "error" | "info" | "success"; children: ReactNode }) {
  if (!children) return null;
  const tones = {
    error: "bg-red-50 text-red-800 border-red-200",
    info: "bg-brand-50 text-brand-700 border-brand-200",
    success: "bg-leaf-50 text-leaf-700 border-leaf-100",
  };
  return <div className={cx("mb-3 rounded-lg border px-3 py-2 text-sm", tones[tone])}>{children}</div>;
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-full bg-slate-100 text-slate-400">
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M4 7h16M4 12h10M4 17h7" strokeLinecap="round" />
        </svg>
      </div>
      <p className="font-medium text-slate-700">{title}</p>
      {hint && <p className="max-w-sm text-sm text-slate-500">{hint}</p>}
      {action}
    </div>
  );
}

const BADGE_TONES: Record<string, string> = {
  active: "bg-leaf-50 text-leaf-700 ring-leaf-600/20",
  assigned: "bg-leaf-50 text-leaf-700 ring-leaf-600/20",
  approved: "bg-leaf-50 text-leaf-700 ring-leaf-600/20",
  completed: "bg-leaf-50 text-leaf-700 ring-leaf-600/20",
  paid: "bg-leaf-50 text-leaf-700 ring-leaf-600/20",
  dropped: "bg-leaf-50 text-leaf-700 ring-leaf-600/20",
  boarded: "bg-brand-50 text-brand-700 ring-brand-600/20",
  running: "bg-brand-50 text-brand-700 ring-brand-600/20",
  available: "bg-brand-50 text-brand-700 ring-brand-600/20",
  trial: "bg-sun-100 text-amber-800 ring-amber-600/20",
  pending: "bg-sun-100 text-amber-800 ring-amber-600/20",
  maintenance: "bg-sun-100 text-amber-800 ring-amber-600/20",
  on_leave: "bg-sun-100 text-amber-800 ring-amber-600/20",
  suspended: "bg-red-50 text-red-700 ring-red-600/20",
  expired: "bg-red-50 text-red-700 ring-red-600/20",
  rejected: "bg-red-50 text-red-700 ring-red-600/20",
  open: "bg-red-50 text-red-700 ring-red-600/20",
  absent: "bg-slate-100 text-slate-600 ring-slate-500/20",
};

export const Badge = ({ value, children }: { value?: string | null; children?: ReactNode }) => (
  <span
    className={cx(
      "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold capitalize ring-1 ring-inset",
      BADGE_TONES[value ?? ""] ?? "bg-slate-100 text-slate-600 ring-slate-500/20"
    )}
  >
    {children ?? (value ? value.replace(/_/g, " ") : "—")}
  </span>
);

/** Green pulse for a bus that is actually reporting, grey when the fix is stale. */
export const LiveDot = ({ live = true }: { live?: boolean }) => (
  <span
    className={cx("inline-block h-2 w-2 shrink-0 rounded-full", live ? "bg-leaf-500 live-dot" : "bg-slate-300")}
    aria-label={live ? "live" : "stale"}
  />
);

/* ── Table ──────────────────────────────────────────────────────────── */

export type Column<T> = {
  header: string;
  cell: (row: T) => ReactNode;
  /** Hidden below `md` — use for the columns that matter least on a phone. */
  secondary?: boolean;
  align?: "right";
};

export function Table<T>({
  rows, columns, loading, empty, onRowClick, rowKey,
}: {
  rows: T[] | null | undefined;
  columns: Column<T>[];
  loading?: boolean;
  empty?: ReactNode;
  onRowClick?: (row: T) => void;
  rowKey?: (row: T, index: number) => string;
}) {
  if (loading && !rows) return <Loading />;
  if (!rows?.length) return <>{empty ?? <EmptyState title="Nothing here yet." />}</>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left">
            {columns.map((c) => (
              <th
                key={c.header}
                className={cx(
                  "px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500",
                  c.secondary && "hidden md:table-cell",
                  c.align === "right" && "text-right"
                )}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={rowKey?.(row, i) ?? i}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={cx(
                "border-b border-slate-100 last:border-0",
                onRowClick && "cursor-pointer transition hover:bg-brand-50/40"
              )}
            >
              {columns.map((c) => (
                <td
                  key={c.header}
                  className={cx(
                    "px-3 py-3 align-middle text-slate-700",
                    c.secondary && "hidden md:table-cell",
                    c.align === "right" && "text-right"
                  )}
                >
                  {c.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── Modal ──────────────────────────────────────────────────────────── */

export function Modal({
  open, onClose, title, children, footer,
}: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    // Stop the page behind the sheet from scrolling with it.
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white shadow-xl sm:rounded-2xl"
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h2 className="font-semibold">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="rounded p-1 text-slate-400 hover:bg-slate-100">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="p-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-slate-100 px-4 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export const Avatar = ({ name, className = "h-9 w-9" }: { name: string; className?: string }) => (
  <span className={cx("grid shrink-0 place-items-center rounded-full bg-brand-100 text-xs font-bold text-brand-700", className)}>
    {name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("")}
  </span>
);
