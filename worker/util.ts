import type { Context } from "hono";

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  /** "true" only in local .dev.vars — lets the login button sign in as a test host when Google isn't configured. */
  ALLOW_DEV_LOGIN?: string;
}

export interface HostRow {
  id: string;
  google_sub: string;
  email: string;
  name: string;
}

export type AppEnv = { Bindings: Env; Variables: { host: HostRow | null } };
export type AppContext = Context<AppEnv>;

/** Thrown from route code; turned into `{ error }` JSON by the app's onError handler. */
export class HttpError extends Error {
  constructor(public status: 400 | 401 | 403 | 404 | 409 | 410 | 413 | 429 | 500 | 503, message: string) {
    super(message);
  }
}

const ID_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";

/** Unpredictable id from crypto randomness (rejection sampling avoids modulo bias). */
export function randomId(length: number): string {
  let out = "";
  while (out.length < length) {
    const bytes = crypto.getRandomValues(new Uint8Array(length * 2));
    for (const b of bytes) {
      if (b < 252 && out.length < length) out += ID_CHARS[b % 36];
    }
  }
  return out;
}

export function nowIso(): string {
  return new Date().toISOString();
}

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function pbkdf2(secret: string, salt: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: new TextEncoder().encode(salt), iterations: 100000 },
    key,
    256,
  );
  return toHex(bits);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomId(16);
  return `pbkdf2$${salt}$${await pbkdf2(password, salt)}`;
}

export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  if (!stored) return true; // no password was ever set on this response
  const [, salt, hash] = stored.split("$");
  if (!salt || !hash) return false;
  return (await pbkdf2(password, salt)) === hash;
}

/**
 * Fixed-window rate limit backed by D1. Throws 429 once `limit` hits in the
 * current `windowSec` window for `key`.
 */
export async function rateLimit(db: D1Database, key: string, limit: number, windowSec: number, message = "操作太頻繁，請稍後再試") {
  const windowStart = Math.floor(Date.now() / 1000 / windowSec);
  const row = await db
    .prepare(
      `INSERT INTO rate_limits (key, window_start, count) VALUES (?1, ?2, 1)
       ON CONFLICT(key) DO UPDATE SET
         count = CASE WHEN rate_limits.window_start = excluded.window_start THEN rate_limits.count + 1 ELSE 1 END,
         window_start = excluded.window_start
       RETURNING count`,
    )
    .bind(key, windowStart)
    .first<{ count: number }>();
  if (row && row.count > limit) throw new HttpError(429, message);
}

/**
 * Lockout for wrong 手機末三碼: only failed attempts count. Call `guard()`
 * before checking, and `fail()` after a mismatch.
 */
export function passwordAttempts(db: D1Database, eventId: string, nickname: string) {
  const windowSec = 900;
  const limit = 5;
  const key = `pw:${eventId}:${nickname.toLowerCase()}`;
  const windowStart = () => Math.floor(Date.now() / 1000 / windowSec);
  const message = "嘗試次數過多，請 15 分鐘後再試";
  return {
    async guard() {
      const row = await db.prepare(`SELECT window_start, count FROM rate_limits WHERE key = ?1`).bind(key).first<{ window_start: number; count: number }>();
      if (row && row.window_start === windowStart() && row.count >= limit) throw new HttpError(429, message);
    },
    async fail(): Promise<never> {
      await rateLimit(db, key, Number.MAX_SAFE_INTEGER, windowSec);
      throw new HttpError(403, "暱稱或手機末三碼不正確");
    },
  };
}

export function clientIp(c: AppContext): string {
  return c.req.header("CF-Connecting-IP") || "local";
}

// --- input validation helpers --- //

export function str(value: unknown, field: string, { max, required = false }: { max: number; required?: boolean }): string {
  if (value === undefined || value === null) {
    if (required) throw new HttpError(400, `${field}為必填`);
    return "";
  }
  if (typeof value !== "string") throw new HttpError(400, `${field}格式錯誤`);
  const v = value.trim();
  if (required && !v) throw new HttpError(400, `請輸入${field}`);
  if ([...v].length > max) throw new HttpError(400, `${field}不可超過 ${max} 字`);
  return v;
}

export function isoDate(value: unknown, field: string): string {
  if (typeof value !== "string" || Number.isNaN(new Date(value).getTime())) {
    throw new HttpError(400, `${field}格式錯誤`);
  }
  return new Date(value).toISOString();
}

export function optionalUrl(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || value.length > 500) throw new HttpError(400, "地點連結格式錯誤");
  try {
    const u = new URL(value);
    if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error();
    return u.toString();
  } catch {
    throw new HttpError(400, "地點連結格式錯誤");
  }
}

export async function readJson(c: AppContext): Promise<Record<string, unknown>> {
  try {
    const body = await c.req.json();
    if (body && typeof body === "object" && !Array.isArray(body)) return body as Record<string, unknown>;
  } catch {}
  throw new HttpError(400, "請求格式錯誤");
}
