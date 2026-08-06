import { createContext, useContext, useMemo, type ReactNode } from "react";
import { assetUrl } from "./api";
import { colors, shieldGradient } from "./theme";

/**
 * A school's own identity, across the app — FRD §8.2.
 *
 * The web app does this with CSS custom properties and `color-mix`. React Native
 * has neither, so the shades are mixed here in JS off the one colour a school
 * actually chooses. Asking an office to pick eight hex codes is how you end up
 * with eight unrelated colours.
 *
 * ponytail: only the surfaces where branding actually reads are themed — the
 * gradient, the tab tint, the login header. The neutral greys stay static, so
 * this is a context and a mix function rather than a rewrite of every
 * StyleSheet in the app. Widen it if a school ever asks for a themed roster row.
 */

/** The schema default, which means "this school never chose a colour". */
const UNSET_THEME = "#1d4ed8";

const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));

const parseHex = (hex: string): [number, number, number] | null => {
  const m = /^#?([\da-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const toHex = (rgb: number[]) => "#" + rgb.map((c) => clamp(c).toString(16).padStart(2, "0")).join("");

/** Positive mixes toward white, negative toward black — the web app's scale. */
const mix = (rgb: [number, number, number], amount: number) =>
  toHex(rgb.map((c) => (amount > 0 ? c + (255 - c) * (amount / 100) : c * (1 + amount / 100))));

export type Brand = {
  /** Mid tone — buttons, active tabs, links. */
  primary: string;
  /** Darker, for the gradient's second stop and pressed states. */
  dark: string;
  /** Very light, for tinted icon chips and selected rows. */
  tint: string;
  /** The three-stop shield gradient. */
  gradient: readonly [string, string, string];
  logoUrl: string | null;
  appName: string;
  schoolName: string | null;
};

const DEFAULT: Brand = {
  primary: colors.brand600,
  dark: colors.brand700,
  tint: colors.brand50,
  gradient: shieldGradient,
  logoUrl: null,
  appName: "BalVahini",
  schoolName: null,
};

const BrandContext = createContext<Brand>(DEFAULT);
export const useBrand = () => useContext(BrandContext);

export type BrandSource = {
  themeColor?: string | null;
  logoUrl?: string | null;
  appName?: string | null;
  name?: string | null;
} | null;

/** Derives the palette from whatever the school actually configured. */
export function brandFrom(school: BrandSource): Brand {
  const chosen =
    school?.themeColor && school.themeColor.toLowerCase() !== UNSET_THEME ? school.themeColor : null;
  const rgb = chosen ? parseHex(chosen) : null;

  const base: Brand = rgb
    ? {
        primary: toHex(rgb),
        dark: mix(rgb, -18),
        tint: mix(rgb, 92),
        // The green third stop is BalVahini's, not the school's — it is the
        // platform mark inside the shield, and dropping it makes every school
        // look like a flat colour swatch.
        gradient: [toHex(rgb), mix(rgb, -18), colors.leaf600] as const,
        logoUrl: null,
        appName: DEFAULT.appName,
        schoolName: null,
      }
    : { ...DEFAULT };

  return {
    ...base,
    logoUrl: assetUrl(school?.logoUrl) ?? null,
    appName: school?.appName || DEFAULT.appName,
    schoolName: school?.name ?? null,
  };
}

export function BrandProvider({ school, children }: { school: BrandSource; children: ReactNode }) {
  const value = useMemo(
    () => brandFrom(school),
    [school?.themeColor, school?.logoUrl, school?.appName, school?.name]
  );
  return <BrandContext.Provider value={value}>{children}</BrandContext.Provider>;
}
