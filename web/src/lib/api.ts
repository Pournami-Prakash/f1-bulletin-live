/**
 * lib/api.ts
 * Shared helpers for Next.js API routes.
 * Enforces a consistent response envelope across the entire app.
 */

import { NextResponse } from "next/server";

// ---------------------------------------------------------------------------
// Response envelope
// ---------------------------------------------------------------------------

export type ApiOk<T> = { ok: true; count?: number; data: T };
export type ApiError = { ok: false; error: string; code?: string };

export function ok<T>(data: T, extra?: { count?: number; headers?: Record<string, string> }) {
  const body: ApiOk<T> = {
    ok: true,
    data,
    ...(extra?.count !== undefined ? { count: extra.count } : {}),
  };
  return NextResponse.json(body, { headers: extra?.headers });
}

export function err(
  message: string,
  status = 500,
  code?: string
): NextResponse<ApiError> {
  return NextResponse.json({ ok: false, error: message, ...(code ? { code } : {}) }, { status });
}

export function badRequest(message: string) {
  return err(message, 400, "BAD_REQUEST");
}

export function unauthorized() {
  return err("Unauthorized", 401, "UNAUTHORIZED");
}

export function methodNotAllowed(allowed: string[]) {
  return NextResponse.json(
    { ok: false, error: "Method not allowed" },
    { status: 405, headers: { Allow: allowed.join(", ") } }
  );
}

// ---------------------------------------------------------------------------
// Unknown-error normalizer
// ---------------------------------------------------------------------------

export function toErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  return "Unknown error";
}

// ---------------------------------------------------------------------------
// Request param parsing
// ---------------------------------------------------------------------------

export function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

export function toInt(value: string | null, fallback: number): number {
  const n = Number.parseInt(value ?? "", 10);
  return Number.isFinite(n) ? n : fallback;
}

export function toString(value: string | null, fallback = ""): string {
  return (value ?? fallback).trim();
}

export function toEnum<T extends string>(
  value: string | null,
  allowed: readonly T[],
  fallback: T
): T {
  const v = (value ?? "").toLowerCase() as T;
  return allowed.includes(v) ? v : fallback;
}

// ---------------------------------------------------------------------------
// Cursor pagination helpers
// ---------------------------------------------------------------------------

/**
 * Cursor format: "<ISO_TS>|<ID>"
 * e.g. "2026-02-19T21:35:16.791Z|98f47ed9-706d-43af-a399-ae4fbd982fd8"
 */
export function parseCursor(raw: string | null): { tsIso: string; id: string } | null {
  if (!raw) return null;
  const [ts, id] = raw.split("|");
  if (!ts || !id) return null;
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return null;
  return { tsIso: d.toISOString(), id: id.trim() };
}

export function buildCursor(tsRaw: unknown, id: unknown): string | null {
  const id_ = id ? String(id) : null;
  if (!id_) return null;

  let iso: string | null = null;
  if (tsRaw instanceof Date) {
    iso = tsRaw.toISOString();
  } else if (typeof tsRaw === "string") {
    const d = new Date(tsRaw.replace(" ", "T"));
    iso = Number.isNaN(d.getTime()) ? null : d.toISOString();
  }

  return iso ? `${iso}|${id_}` : null;
}

// ---------------------------------------------------------------------------
// Ingest auth
// ---------------------------------------------------------------------------

export function validateIngestAuth(req: Request): boolean {
  const key = process.env.INGEST_KEY;
  if (!key) return false; // no key configured → deny everything

  // Accept either Bearer token or legacy ?key= query param (migration path)
  const auth = req.headers.get("Authorization");
  if (auth?.startsWith("Bearer ") && auth.slice(7) === key) return true;

  const qKey = new URL(req.url).searchParams.get("key");
  return qKey === key;
}
