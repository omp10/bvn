import Constants from "expo-constants";

/**
 * The same palette the web app uses, lifted straight out of `index.css`. Two
 * copies of a colour scale is a real cost, but the alternative — shipping a CSS
 * parser to a phone — is a much sillier one. If a shade changes there, change it
 * here.
 */
export const colors = {
  brand50: "#eef5fd",
  brand100: "#d6e6f9",
  brand200: "#aecdf2",
  brand400: "#3d86d4",
  brand500: "#1e6cc4",
  brand600: "#1155a5",
  brand700: "#0d4381",
  brand900: "#082a52",

  leaf50: "#eff9ec",
  leaf100: "#dcf2d5",
  leaf400: "#63bf4f",
  leaf500: "#45ab35",
  leaf600: "#368a29",
  leaf700: "#2a6d20",

  sun100: "#fff2cc",
  sun400: "#fdc010",
  sun500: "#f0ac00",

  amber50: "#fffbeb",
  amber400: "#fbbf24",
  amber600: "#d97706",
  amber800: "#92400e",

  red50: "#fef2f2",
  red500: "#ef4444",
  red600: "#dc2626",

  white: "#ffffff",
  slate50: "#f8fafc",
  slate100: "#f1f5f9",
  slate200: "#e2e8f0",
  slate300: "#cbd5e1",
  slate400: "#94a3b8",
  slate500: "#64748b",
  slate600: "#475569",
  slate800: "#1e293b",
  slate900: "#0f172a",
};

/**
 * Semantic aliases. Components reference these, never a raw shade, so the one
 * place to retune a surface or a border is here. `brand` is deliberately absent:
 * it is per-school and comes from `useBrand()`, and a static token would be a
 * second source of truth that quietly ignores the school's colour.
 */
export const tone = {
  surface: colors.slate50,
  surfaceRaised: colors.white,
  surfaceSunken: colors.slate100,
  textPrimary: colors.slate900,
  textSecondary: colors.slate600,
  textMuted: colors.slate500,
  textOnDark: colors.white,
  /** On a gradient, where slate greys have no contrast to give. */
  textOnDarkMuted: "rgba(255,255,255,0.74)",
  border: colors.slate200,
  borderStrong: colors.slate300,
  success: colors.leaf600,
  successTint: colors.leaf50,
  warning: colors.amber600,
  warningTint: colors.amber50,
  danger: colors.red600,
  dangerTint: colors.red50,
};

/** The shield gradient from the logo — headers, hero cards, the auth screen. */
export const shieldGradient = [colors.brand600, colors.brand700, colors.leaf600] as const;

/** Three values. A fourth radius is a fourth thing to get subtly wrong. */
export const radius = { sm: 8, md: 12, card: 14, lg: 18, pill: 999 };

/** 4pt base. Every gap in the app is `space(n)`, never a bare number. */
export const space = (n: number) => n * 4;

/** Screen gutter — 16px, matching the design's margins. */
export const GUTTER = space(4);

/**
 * Named type roles with explicit line heights, so a 130% system font scale
 * grows the text without collapsing the leading. Sizes are unscaled points;
 * `T` caps the OS multiplier at 1.3 rather than letting a 200% setting shear
 * a driver's stat tiles in half.
 */
export const type = {
  display: { fontSize: 48, lineHeight: 52, fontWeight: "800" },
  title: { fontSize: 24, lineHeight: 30, fontWeight: "800" },
  heading: { fontSize: 17, lineHeight: 23, fontWeight: "700" },
  body: { fontSize: 15, lineHeight: 21, fontWeight: "400" },
  label: { fontSize: 13, lineHeight: 18, fontWeight: "600" },
  caption: { fontSize: 11, lineHeight: 15, fontWeight: "500" },
} as const;

export type TypeRole = keyof typeof type;

/** Font scaling ceiling — 130% is the brief's floor, and layouts are built for it. */
export const MAX_FONT_SCALE = 1.3;

/**
 * Three elevation levels, and mostly we prefer the border. A phone screen full
 * of drop shadows reads as noise, and Android renders them expensively.
 */
export const elevation = {
  flat: {},
  raised: {
    shadowColor: colors.slate900,
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  floating: {
    shadowColor: colors.slate900,
    shadowOpacity: 0.16,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
} as const;

/** Kept for the screens that still import it; `elevation.raised` is the token. */
export const shadow = elevation.raised;

/** Motion. Durations in ms; nothing bounces, nothing decorates. */
export const motion = {
  fast: 120,
  base: 200,
  slow: 320,
  /** How long a pulsing "this is live" loop takes. */
  pulse: 2000,
} as const;

export type Variant = "parent" | "staff";

const extra = (Constants.expoConfig?.extra ?? {}) as { variant?: Variant; apiUrl?: string };

export const VARIANT: Variant = extra.variant === "staff" ? "staff" : "parent";

/** No trailing slash — every call site appends `/api/...`. */
export const API_URL = (extra.apiUrl ?? "http://10.0.2.2:4000").replace(/\/+$/, "");
