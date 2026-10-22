/**
 * lib/api.ts
 * Shared helpers for Next.js API routes.
 * Enforces a consistent response envelope across the entire app.
 */

import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { logEvent } from "@/lib/observability";

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

/** Only use for public GET endpoints. Never caches errors or overrides no-store. */
export function publicJson(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  if (!headers.has('Cache-Control')) headers.set('Cache-Control', (init?.status ?? 200) >= 400
    ? 'no-store' : 'public, s-maxage=30, stale-while-revalidate=60');
  return NextResponse.json(body, { ...init, headers });
}

export function err(
  message: string,
  status = 500,
  code?: string
): NextResponse<ApiError> {
  if (status >= 500) logEvent("error", "api_error", { status, code: code ?? "INTERNAL_ERROR" });
  return NextResponse.json({ ok: false, error: status >= 500 ? "Service temporarily unavailable. Please try again." : message, ...(code ? { code } : {}) }, { status, headers: { "Cache-Control": "no-store" } });
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
  const n = value !== null && /^-?\d+$/.test(value) ? Number(value) : NaN;
  return Number.isSafeInteger(n) ? n : fallback;
}

export function toString(value: string | null, fallback = ""): string {
  return (value ?? fallback).trim().slice(0, 256);
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

  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return false;
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(auth.slice(7)), digest(key));
}
