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

/** The shield gradient from the logo — headers, hero cards, the auth screen. */
export const shieldGradient = [colors.brand600, colors.brand700, colors.leaf600] as const;

export const radius = { sm: 8, md: 12, card: 14, lg: 18, pill: 999 };

export const space = (n: number) => n * 4;

export const shadow = {
  shadowColor: "#0f172a",
  shadowOpacity: 0.08,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 4 },
  elevation: 2,
};

export type Variant = "parent" | "staff";

const extra = (Constants.expoConfig?.extra ?? {}) as { variant?: Variant; apiUrl?: string };

export const VARIANT: Variant = extra.variant === "staff" ? "staff" : "parent";

/** No trailing slash — every call site appends `/api/...`. */
export const API_URL = (extra.apiUrl ?? "http://10.0.2.2:4000").replace(/\/+$/, "");
