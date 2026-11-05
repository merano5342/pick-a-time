// Google OAuth (server-side authorization-code flow) + D1-backed sessions.
// Host identity for every host-only endpoint comes only from this session
// (規格書 §5.6) — never from names, emails, or a hostToken.
import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import type { MiddlewareHandler } from "hono";
import { AppEnv, AppContext, HostRow, HttpError, randomId, nowIso } from "./util";

const SESSION_COOKIE = "jgx_sid";
const STATE_COOKIE = "jgx_oauth";
const SESSION_DAYS = 30;

function isSecure(c: AppContext) {
  return new URL(c.req.url).protocol === "https:";
}

/** Only same-site relative paths, so the login redirect can't be turned into an open redirect. */
function safeReturnPath(value: string | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return "/";
  return value;
}

/** Populates c.var.host from the session cookie (null when signed out). */
export const loadSession: MiddlewareHandler<AppEnv> = async (c, next) => {
  const sid = getCookie(c, SESSION_COOKIE);
  let host: HostRow | null = null;
  if (sid) {
    host = await c.env.DB.prepare(
      `SELECT h.id, h.google_sub, h.email, h.name FROM sessions s JOIN hosts h ON h.id = s.host_id
       WHERE s.id = ?1 AND s.expires_at > ?2`,
    )
      .bind(sid, nowIso())
      .first<HostRow>();
  }
  c.set("host", host);
  await next();
};

export function requireHost(c: AppContext): HostRow {
  const host = c.get("host");
  if (!host) throw new HttpError(401, "請先以 Google 帳號登入");
  return host;
}

async function signIn(c: AppContext, profile: { sub: string; email: string; name: string }) {
  const db = c.env.DB;
  const now = nowIso();
  const host = await db
    .prepare(
      `INSERT INTO hosts (id, google_sub, email, name, created_at, last_login_at) VALUES (?1, ?2, ?3, ?4, ?5, ?5)
       ON CONFLICT(google_sub) DO UPDATE SET email = excluded.email, name = excluded.name, last_login_at = excluded.last_login_at
       RETURNING id`,
    )
    .bind(randomId(16), profile.sub, profile.email, profile.name, now)
    .first<{ id: string }>();
  const sid = randomId(40);
  const expires = new Date(Date.now() + SESSION_DAYS * 86400000);
  await db
    .prepare(`INSERT INTO sessions (id, host_id, created_at, expires_at) VALUES (?1, ?2, ?3, ?4)`)
    .bind(sid, host!.id, now, expires.toISOString())
    .run();
  setCookie(c, SESSION_COOKIE, sid, {
    httpOnly: true,
    secure: isSecure(c),
    sameSite: "Lax",
    path: "/",
    expires,
  });
}

function decodeJwtPayload(jwt: string): Record<string, unknown> {
  const part = jwt.split(".")[1];
  if (!part) throw new HttpError(400, "Google 登入回應格式錯誤");
  const b64 = part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "=");
  const bytes = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

export const authRoutes = new Hono<AppEnv>();

authRoutes.get("/config", (c) =>
  c.json({ googleConfigured: Boolean(c.env.GOOGLE_CLIENT_ID && c.env.GOOGLE_CLIENT_SECRET), devLogin: c.env.ALLOW_DEV_LOGIN === "true" }),
);

authRoutes.get("/me", (c) => {
  const host = c.get("host");
  return c.json({ user: host ? { name: host.name, email: host.email } : null });
});

authRoutes.get("/google/start", async (c) => {
  const returnTo = safeReturnPath(c.req.query("return"));
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, ALLOW_DEV_LOGIN } = c.env;

  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    if (ALLOW_DEV_LOGIN === "true") {
      // Local-only stand-in for Google so the app can be exercised before OAuth credentials exist.
      await signIn(c, { sub: "dev-local-host", email: "dev.host@localhost", name: "本機測試主揪" });
      return c.redirect(returnTo);
    }
    throw new HttpError(503, "Google 登入尚未設定（缺少 GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET）");
  }

  const state = randomId(32);
  setCookie(c, STATE_COOKIE, `${state}|${returnTo}`, {
    httpOnly: true,
    secure: isSecure(c),
    sameSite: "Lax",
    path: "/api/auth",
    maxAge: 600,
  });
  const origin = new URL(c.req.url).origin;
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: `${origin}/api/auth/google/callback`,
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
  });
  return c.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

authRoutes.get("/google/callback", async (c) => {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } = c.env;
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) throw new HttpError(503, "Google 登入尚未設定");

  const stored = getCookie(c, STATE_COOKIE) || "";
  deleteCookie(c, STATE_COOKIE, { path: "/api/auth" });
  const [expectedState, returnTo] = stored.split("|");
  const state = c.req.query("state");
  const code = c.req.query("code");
  if (c.req.query("error")) return c.redirect("/");
  if (!expectedState || state !== expectedState || !code) throw new HttpError(400, "登入驗證失敗，請重新登入");

  const origin = new URL(c.req.url).origin;
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: `${origin}/api/auth/google/callback`,
      grant_type: "authorization_code",
    }),
  });
  if (!tokenRes.ok) throw new HttpError(400, "Google 登入失敗，請重新登入");
  const { id_token } = (await tokenRes.json()) as { id_token?: string };
  if (!id_token) throw new HttpError(400, "Google 登入失敗，請重新登入");

  // The id_token came straight from Google's token endpoint over TLS, so per
  // OpenID Connect Core §3.1.3.7 the claims checks below suffice without
  // re-verifying the signature.
  const claims = decodeJwtPayload(id_token);
  const iss = claims.iss;
  if (
    claims.aud !== GOOGLE_CLIENT_ID ||
    (iss !== "https://accounts.google.com" && iss !== "accounts.google.com") ||
    typeof claims.exp !== "number" ||
    claims.exp * 1000 < Date.now() ||
    typeof claims.sub !== "string" ||
    typeof claims.email !== "string" ||
    claims.email_verified !== true
  ) {
    throw new HttpError(400, "Google 帳號驗證失敗");
  }

  await signIn(c, {
    sub: claims.sub,
    email: claims.email,
    name: typeof claims.name === "string" ? claims.name : claims.email.split("@")[0],
  });
  return c.redirect(safeReturnPath(returnTo));
});

authRoutes.post("/logout", async (c) => {
  const sid = getCookie(c, SESSION_COOKIE);
  if (sid) await c.env.DB.prepare(`DELETE FROM sessions WHERE id = ?1`).bind(sid).run();
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.json({ ok: true });
});
