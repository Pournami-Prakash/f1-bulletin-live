/**
 * lib/ui.ts
 * Shared UI utilities — keeps class strings DRY across components.
 */

/** Base card style shared across all sidebar/panel components. */
export const cardClass =
  "rounded-2xl border border-zinc-800 bg-zinc-950/40 backdrop-blur hover:bg-zinc-950/70 transition";

/** Minimal className joiner (avoids adding clsx as a dependency for now). */
export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}
