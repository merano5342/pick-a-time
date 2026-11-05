import { Hono } from "hono";
import { AppEnv, HttpError } from "./util";
import { authRoutes, loadSession } from "./auth";
import { eventRoutes, listHostEvents } from "./events";

const app = new Hono<AppEnv>().basePath("/api");

app.use("*", loadSession);

// Same-origin JSON API: reject cross-site form posts (SameSite=Lax already blocks
// the session cookie on them; this is a second guard).
app.use("*", async (c, next) => {
  const method = c.req.method;
  if (method !== "GET" && method !== "HEAD" && !c.req.path.startsWith("/api/auth/logout")) {
    const type = c.req.header("Content-Type") || "";
    if (!type.includes("application/json")) throw new HttpError(400, "請求格式錯誤");
  }
  await next();
});

app.route("/auth", authRoutes);
app.route("/events", eventRoutes);
app.get("/hosts/me/events", listHostEvents);

app.notFound((c) => c.json({ error: "Not found" }, 404));

app.onError((err, c) => {
  if (err instanceof HttpError) return c.json({ error: err.message }, err.status);
  console.error(err);
  return c.json({ error: "伺服器發生錯誤，請稍後再試" }, 500);
});

export default app;
