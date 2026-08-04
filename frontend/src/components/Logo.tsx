import { useState } from "react";

/**
 * The supplied artwork at `public/logo.png` is the full lockup: shield, wordmark,
 * tagline and feature badges. Two different things are needed from it.
 *
 * `LogoMark` crops the shield out of that lockup with CSS, so a header or a
 * sidebar shows the emblem alone rather than a squashed illegible square beside
 * a second copy of the wordmark. The crop window below is measured from the
 * artwork: the shield occupies roughly x 120–400, y 20–300 of a 500×500 canvas.
 *
 * `LogoFull` shows the artwork whole, for light backgrounds with room for it —
 * its navy tagline has no contrast on the brand gradient, so it is never used on
 * a dark surface.
 *
 * Both fall back to a hand-drawn SVG if the file is missing, so the app never
 * renders a broken image.
 */

const CROP = { width: "179%", left: "-43%", top: "-7%" };

export function LogoMark({ className = "h-10 w-10" }: { className?: string }) {
  const [broken, setBroken] = useState(false);

  if (broken) return <FallbackMark className={className} />;

  return (
    <span className={`relative inline-block shrink-0 overflow-hidden ${className}`}>
      <img
        src="/logo.png"
        alt=""
        aria-hidden
        className="absolute max-w-none"
        style={{ width: CROP.width, left: CROP.left, top: CROP.top }}
        onError={() => setBroken(true)}
      />
    </span>
  );
}

/** The complete artwork. Light backgrounds only. */
export function LogoFull({ className = "w-64" }: { className?: string }) {
  const [broken, setBroken] = useState(false);
  if (broken) return <Logo size="lg" />;
  return <img src="/logo.png" alt="BalVahini" className={className} onError={() => setBroken(true)} />;
}

function FallbackMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} role="img" aria-label="BalVahini">
      <path d="M32 3 5 12.5V35c0 15.6 11.4 23.8 27 26 15.6-2.2 27-10.4 27-26V12.5z" fill="var(--color-brand-600)" />
      <path d="M32 3v58c15.6-2.2 27-10.4 27-26V12.5z" fill="var(--color-leaf-500)" />
      <path d="M32 9.5 11 17v18c0 12.4 8.9 19.2 21 21.2 12.1-2 21-8.8 21-21.2V17z" fill="#fff" />
      <circle cx="32" cy="26" r="10.5" fill="var(--color-sun-400)" />
      <rect x="22" y="23.5" width="20" height="14.5" rx="3.2" fill="var(--color-sun-400)" stroke="#0f172a" strokeWidth="1.1" />
      <rect x="24.6" y="26.6" width="14.8" height="5.6" rx="1.6" fill="var(--color-brand-600)" />
      <circle cx="26.4" cy="39.4" r="2.3" fill="#0f172a" />
      <circle cx="37.6" cy="39.4" r="2.3" fill="#0f172a" />
    </svg>
  );
}

/** Shield plus wordmark, in the artwork's two-tone treatment. */
export function Logo({
  className = "",
  size = "md",
  onDark = false,
}: {
  className?: string;
  size?: "sm" | "md" | "lg";
  onDark?: boolean;
}) {
  const mark = { sm: "h-9 w-9", md: "h-11 w-11", lg: "h-16 w-16" }[size];
  const text = { sm: "text-lg", md: "text-2xl", lg: "text-4xl" }[size];

  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <LogoMark className={mark} />
      <span className={`${text} font-extrabold leading-none tracking-tight`}>
        <span className={onDark ? "text-white" : "text-brand-600"}>Bal</span>
        <span className={onDark ? "text-leaf-100" : "text-leaf-500"}>Vahini</span>
      </span>
    </span>
  );
}

export const Tagline = ({ className = "" }: { className?: string }) => (
  <span className={`text-xs font-semibold uppercase tracking-[0.18em] ${className}`}>
    Safe Journeys, Brighter Futures
  </span>
);
