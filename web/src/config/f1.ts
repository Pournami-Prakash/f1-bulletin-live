/**
 * config/f1.ts
 * F1 entity vocabulary and app-wide constants.
 * Single source of truth — used by page.tsx, ingestion scripts, and future NLP.
 */

export const DRIVER_NAMES = [
  "hamilton", "verstappen", "leclerc", "sainz", "norris", "piastri",
  "russell", "alonso", "stroll", "perez", "gasly", "ocon", "tsunoda",
  "ricciardo", "albon", "hulkenberg", "bottas", "zhou", "doohan",
] as const;

export const TEAM_NAMES = [
  "mercedes", "ferrari", "red bull", "mclaren", "aston martin",
  "alpine", "haas", "sauber", "williams", "rb",
] as const;

export const TRACK_NAMES = [
  "bahrain", "jeddah", "saudi", "melbourne", "australia", "imola",
  "monaco", "silverstone", "spa", "hungary", "monza", "suzuka",
  "singapore", "austin", "mexico", "sao paulo", "las vegas", "abu dhabi",
] as const;

export const APP_NAME = "F1 Command Center";
export const APP_TAGLINE =
  "Race-control style timeline · analytics terminal · Snowflake-powered.";

export const DEFAULT_HOURS = 168;
export const DEFAULT_LIMIT = 250;
export const AUTO_REFRESH_MS = 60_000;

export const HOUR_PRESETS = [
  { label: "24h",  h: 24  },
  { label: "72h",  h: 72  },
  { label: "7d",   h: 168 },
  { label: "30d",  h: 720 },
] as const;
