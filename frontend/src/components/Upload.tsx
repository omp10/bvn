import { useRef, useState, type ReactNode } from "react";
import { uploadFile } from "../lib/api";
import { Alert, Button } from "./ui";

/**
 * One file, one endpoint, one button.
 *
 * Every upload in the app is the same three steps — pick, post as multipart,
 * refresh — so they share this rather than repeating a hidden input and a busy
 * flag on five screens.
 */
export function UploadButton({
  path,
  label = "Upload",
  accept = "image/*",
  size = "sm",
  variant = "secondary",
  onDone,
  disabled,
  children,
}: {
  /** Endpoint path, query string included — the vehicle document API wants one. */
  path: string;
  label?: string;
  accept?: string;
  size?: "sm" | "md";
  variant?: "primary" | "secondary";
  onDone?: (result: any) => void;
  disabled?: boolean;
  children?: ReactNode;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      onDone?.(await uploadFile(path, file));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
      // Reset, so choosing the same file again still fires onChange.
      if (input.current) input.current.value = "";
    }
  };

  return (
    <>
      <input
        ref={input}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => void pick(e.target.files?.[0])}
      />
      <Button
        type="button"
        size={size}
        variant={variant}
        loading={busy}
        disabled={disabled}
        onClick={() => input.current?.click()}
      >
        {children ?? label}
      </Button>
      <Alert>{error}</Alert>
    </>
  );
}

/** A round avatar that can be replaced in place — drivers, attendants, students. */
export function PhotoCell({
  url,
  name,
  path,
  onDone,
}: {
  url?: string | null;
  name: string;
  path: string;
  onDone: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      {url ? (
        <img src={url} alt={name} className="h-9 w-9 rounded-full object-cover ring-1 ring-slate-200" />
      ) : (
        <span className="grid h-9 w-9 place-items-center rounded-full bg-slate-100 text-xs font-semibold text-slate-500">
          {name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("")}
        </span>
      )}
      <UploadButton path={path} label={url ? "Change" : "Add photo"} onDone={onDone} />
    </div>
  );
}
