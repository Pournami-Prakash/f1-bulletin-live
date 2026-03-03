"use client";

/**
 * lib/f1/useClientClock.ts
 * Returns a live clock string that updates on an interval.
 * Initialises as "" to avoid SSR/CSR hydration mismatch.
 */

import { useEffect, useState } from "react";

export function useClientClock(intervalMs = 1_000): string {
  const [clock, setClock] = useState("");

  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString());
    tick();
    const id = setInterval(tick, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return clock;
}
