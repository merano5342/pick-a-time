import { Hono } from "hono";
import type {
  AvailabilityStatus,
  EventData,
  EventComment,
  ParticipantResponse,
  TimeSlot,
  AiSelectedRestaurant,
} from "../src/types";
import { isVotingOpen, isLinkExpired, canComment, isOlderThanDays } from "../src/lib/eventStatus";
import { requireHost } from "./auth";
import {
  AppEnv,
  AppContext,
  HttpError,
  randomId,
  nowIso,
  hashPassword,
  verifyPassword,
  rateLimit,
  passwordAttempts,
  clientIp,
  str,
  isoDate,
  optionalUrl,
  readJson,
} from "./util";

const MAX_SLOTS = 20;
const MAX_PARTICIPANTS = 50;
const AVAILABILITY_VALUES: AvailabilityStatus[] = ["available", "if_needed", "unavailable"];

interface EventRow {
  id: string;
  host_account_id: string;
  title: string;
  description: string;
  location_text: string | null;
  location_url: string | null;
  host_name: string;
  host_email: string;
  mode: "date_only" | "time_slots";
  response_deadline: string;
  status: EventData["status"];
  final_slot_id: string | null;
  final_note: string | null;
  cancelled_at: string | null;
  ai_restaurant: string | null;
  created_at: string;
  updated_at: string;
}

interface ResponseRow {
  id: string;
  nickname: string;
  email: string;
  password_hash: string | null;
  comment: string;
  updated_at: string;
}

interface LoadedEvent {
  row: EventRow;
  event: EventData;
  responseRows: ResponseRow[];
}

async function loadEvent(db: D1Database, id: string): Promise<LoadedEvent> {
  const [eventRes, slotsRes, responsesRes, availRes, commentsRes] = await db.batch([
    db.prepare(`SELECT * FROM events WHERE id = ?1`).bind(id),
    db.prepare(`SELECT id, date, time, label FROM time_slots WHERE event_id = ?1 ORDER BY position`).bind(id),
    db
      .prepare(`SELECT id, nickname, email, password_hash, comment, updated_at FROM participant_responses WHERE event_id = ?1 ORDER BY created_at`)
      .bind(id),
    db
      .prepare(
        `SELECT a.response_id, a.slot_id, a.status FROM response_availability a
         JOIN participant_responses r ON r.id = a.response_id WHERE r.event_id = ?1`,
      )
      .bind(id),
    db
      .prepare(`SELECT id, nickname, message, created_at FROM event_comments WHERE event_id = ?1 AND deleted_at IS NULL ORDER BY created_at`)
      .bind(id),
  ]);
  const row = eventRes.results[0] as EventRow | undefined;
  if (!row) throw new HttpError(404, "找不到此活動，可能已被刪除或網址錯誤");

  const availability = new Map<string, Record<string, AvailabilityStatus>>();
  for (const a of availRes.results as { response_id: string; slot_id: string; status: AvailabilityStatus }[]) {
    const m = availability.get(a.response_id) || {};
    m[a.slot_id] = a.status;
    availability.set(a.response_id, m);
  }
  const responseRows = responsesRes.results as ResponseRow[];

  const event: EventData = {
    id: row.id,
    title: row.title,
    description: row.description,
    location: row.location_text ? { text: row.location_text, url: row.location_url || undefined } : undefined,
    hostName: row.host_name,
    hostEmail: row.host_email,
    mode: row.mode,
    responseDeadline: row.response_deadline,
    slots: slotsRes.results as TimeSlot[],
    responses: responseRows.map((r) => ({
      id: r.id,
      nickname: r.nickname,
      email: r.email,
      availability: availability.get(r.id) || {},
      comment: r.comment,
      updatedAt: r.updated_at,
    })),
    comments: (commentsRes.results as { id: string; nickname: string; message: string; created_at: string }[]).map((cm) => ({
      id: cm.id,
      nickname: cm.nickname,
      message: cm.message,
      createdAt: cm.created_at,
    })),
    status: row.status,
    finalSlotId: row.final_slot_id || undefined,
    finalNote: row.final_note || undefined,
    cancelledAt: row.cancelled_at || undefined,
    aiSelectedRestaurant: row.ai_restaurant ? (JSON.parse(row.ai_restaurant) as AiSelectedRestaurant) : undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  return { row, event, responseRows };
}

/**
 * What a given viewer may see. Participant emails are only for notifications
 * (NFR 資料隱私), so non-hosts just learn *whether* someone left one.
 */
function present(loaded: LoadedEvent, c: AppContext): EventData {
  const host = c.get("host");
  const isHost = Boolean(host && host.id === loaded.row.host_account_id);
  const { event } = loaded;
  return {
    ...event,
    isHost,
    hostEmail: isHost ? event.hostEmail : undefined,
    responses: event.responses.map((r: ParticipantResponse) => ({ ...r, email: isHost ? r.email : r.email ? "hidden" : "" })),
  };
}

async function loadVisible(c: AppContext, id: string): Promise<LoadedEvent> {
  const loaded = await loadEvent(c.env.DB, id);
  if (isLinkExpired(loaded.event)) throw new HttpError(410, "此活動連結已失效（活動結束超過 7 天）");
  return loaded;
}

async function loadAsHost(c: AppContext, id: string): Promise<LoadedEvent> {
  const host = requireHost(c);
  const loaded = await loadVisible(c, id);
  if (loaded.row.host_account_id !== host.id) throw new HttpError(403, "主揪驗證失敗，您沒有此活動的管理權限");
  return loaded;
}

async function respond(c: AppContext, id: string) {
  return c.json(present(await loadEvent(c.env.DB, id), c));
}

function parseLocation(value: unknown): { text: string | null; url: string | null } {
  if (value === undefined || value === null) return { text: null, url: null };
  if (typeof value !== "object") throw new HttpError(400, "地點格式錯誤");
  const v = value as { text?: unknown; url?: unknown };
  const text = str(v.text, "地點", { max: 100 });
  return text ? { text, url: optionalUrl(v.url) } : { text: null, url: null };
}

export const eventRoutes = new Hono<AppEnv>();

eventRoutes.post("/", async (c) => {
  const host = requireHost(c);
  await rateLimit(c.env.DB, `create:${host.id}`, 30, 3600, "建立活動太頻繁，請稍後再試");
  const body = await readJson(c);

  const title = str(body.title, "活動名稱", { max: 30, required: true });
  const description = str(body.description, "活動說明", { max: 500 });
  const hostName = str(body.hostName, "主揪姓名", { max: 40, required: true });
  const location = parseLocation(body.location);
  const mode = body.mode === "date_only" ? "date_only" : "time_slots";
  const responseDeadline = body.responseDeadline ? isoDate(body.responseDeadline, "回覆截止時間") : new Date(Date.now() + 7 * 86400000).toISOString();

  if (!Array.isArray(body.slots) || body.slots.length === 0) throw new HttpError(400, "請至少新增一個候選時段");
  if (body.slots.length > MAX_SLOTS) throw new HttpError(400, `候選時段最多 ${MAX_SLOTS} 個`);
  const slots = body.slots.map((s: unknown, idx: number) => {
    const slot = (s || {}) as { date?: unknown; time?: unknown; label?: unknown };
    if (typeof slot.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(slot.date)) throw new HttpError(400, `第 ${idx + 1} 個時段日期格式錯誤`);
    return {
      id: `slot_${idx + 1}_${randomId(6)}`,
      date: slot.date,
      time: mode === "date_only" ? "" : str(slot.time, "時段時間", { max: 40 }),
      label: str(slot.label, "時段標題", { max: 30 }),
    };
  });

  const id = randomId(16);
  const now = nowIso();
  const db = c.env.DB;
  await db.batch([
    db
      .prepare(
        `INSERT INTO events (id, host_account_id, title, description, location_text, location_url, host_name, host_email, mode, response_deadline, status, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 'active', ?11, ?11)`,
      )
      // host_email always comes from the signed-in Google account, never from the request body (FR-1).
      .bind(id, host.id, title, description, location.text, location.url, hostName, host.email, mode, responseDeadline, now),
    ...slots.map((s, idx) =>
      db.prepare(`INSERT INTO time_slots (id, event_id, position, date, time, label) VALUES (?1, ?2, ?3, ?4, ?5, ?6)`).bind(s.id, id, idx, s.date, s.time, s.label),
    ),
  ]);
  return c.json(present(await loadEvent(db, id), c), 201);
});

eventRoutes.get("/:id", async (c) => c.json(present(await loadVisible(c, c.req.param("id")), c)));

eventRoutes.patch("/:id", async (c) => {
  const id = c.req.param("id");
  const { event } = await loadAsHost(c, id);
  if (event.status !== "active") throw new HttpError(409, "活動已定案或已取消，無法編輯");
  const body = await readJson(c);

  const sets: string[] = [];
  const values: unknown[] = [];
  const set = (col: string, v: unknown) => {
    values.push(v);
    sets.push(`${col} = ?${values.length}`);
  };
  if (body.title !== undefined) set("title", str(body.title, "活動名稱", { max: 30, required: true }));
  if (body.description !== undefined) set("description", str(body.description, "活動說明", { max: 500 }));
  if (body.hostName !== undefined) set("host_name", str(body.hostName, "主揪姓名", { max: 40, required: true }));
  if (body.location !== undefined) {
    const loc = parseLocation(body.location);
    set("location_text", loc.text);
    set("location_url", loc.url);
  }
  if (body.responseDeadline !== undefined) set("response_deadline", isoDate(body.responseDeadline, "回覆截止時間"));
  // hostEmail is deliberately not editable: it is tied to the Google account.
  set("updated_at", nowIso());
  values.push(id);
  await c.env.DB.prepare(`UPDATE events SET ${sets.join(", ")} WHERE id = ?${values.length}`).bind(...values).run();
  return respond(c, id);
});

eventRoutes.post("/:id/finalize", async (c) => {
  const id = c.req.param("id");
  const { event } = await loadAsHost(c, id);
  if (event.status === "cancelled") throw new HttpError(409, "此活動已取消，無法拍板定案");
  const body = await readJson(c);
  const finalSlotId = body.finalSlotId;
  if (typeof finalSlotId !== "string" || !event.slots.some((s) => s.id === finalSlotId)) throw new HttpError(400, "選擇的最終時段無效");
  const finalNote = str(body.finalNote, "備註", { max: 300 });
  await c.env.DB.prepare(`UPDATE events SET status = 'finalized', final_slot_id = ?1, final_note = ?2, updated_at = ?3 WHERE id = ?4`)
    .bind(finalSlotId, finalNote, nowIso(), id)
    .run();
  return respond(c, id);
});

// Reopening clears only the final slot (and possibly the deadline) — never anyone's responses (FR-7).
eventRoutes.post("/:id/reopen", async (c) => {
  const id = c.req.param("id");
  const { event } = await loadAsHost(c, id);
  const body = await readJson(c).catch(() => ({}) as Record<string, unknown>);
  let deadline = event.responseDeadline;
  if (body.responseDeadline) deadline = isoDate(body.responseDeadline, "回覆截止時間");
  else if (!isVotingOpen({ status: "active", responseDeadline: deadline })) deadline = new Date(Date.now() + 7 * 86400000).toISOString();
  await c.env.DB.prepare(`UPDATE events SET status = 'active', final_slot_id = NULL, cancelled_at = NULL, response_deadline = ?1, updated_at = ?2 WHERE id = ?3`)
    .bind(deadline, nowIso(), id)
    .run();
  return respond(c, id);
});

eventRoutes.post("/:id/cancel", async (c) => {
  const id = c.req.param("id");
  const { event } = await loadAsHost(c, id);
  if (event.status === "cancelled") throw new HttpError(409, "此活動已經取消");
  const now = nowIso();
  await c.env.DB.prepare(`UPDATE events SET status = 'cancelled', cancelled_at = ?1, updated_at = ?1 WHERE id = ?2`).bind(now, id).run();
  return respond(c, id);
});

/** Checks nickname + 手機末三碼 for "更新投票" without exposing the stored hash to the browser. */
eventRoutes.post("/:id/responses/verify", async (c) => {
  const id = c.req.param("id");
  const { responseRows } = await loadVisible(c, id);
  const body = await readJson(c);
  const nickname = str(body.nickname, "暱稱", { max: 40, required: true });
  const password = str(body.password, "手機末三碼", { max: 20, required: true });
  const attempts = passwordAttempts(c.env.DB, id, nickname);
  await attempts.guard();
  const match = responseRows.find((r) => r.nickname.toLowerCase() === nickname.toLowerCase());
  if (!match || !(await verifyPassword(password, match.password_hash))) return attempts.fail();
  return c.json({ participantId: match.id, email: match.email });
});

eventRoutes.post("/:id/responses", async (c) => {
  const id = c.req.param("id");
  const db = c.env.DB;
  await rateLimit(db, `vote:${clientIp(c)}`, 30, 60);
  const { row, event, responseRows } = await loadVisible(c, id);
  if (event.status === "cancelled") throw new HttpError(409, "此活動已由主揪取消，暫停接受新投票");
  if (event.status === "finalized") throw new HttpError(409, "此活動時間已由主揪拍板定案，暫停接受新投票");
  if (!isVotingOpen(event)) throw new HttpError(409, "投票已截止，請聯繫主揪重新開放投票");

  const body = await readJson(c);
  const nickname = str(body.nickname, "您的暱稱", { max: 40, required: true });
  const password = str(body.password, "手機末三碼", { max: 20, required: true });
  const email = str(body.email, "Email", { max: 254 });
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, "Email 格式錯誤");
  const comment = str(body.comment, "備註", { max: 300 });

  const slotIds = new Set(event.slots.map((s) => s.id));
  const availability: [string, AvailabilityStatus][] = [];
  if (body.availability && typeof body.availability === "object") {
    for (const [slotId, status] of Object.entries(body.availability as Record<string, unknown>)) {
      if (slotIds.has(slotId) && AVAILABILITY_VALUES.includes(status as AvailabilityStatus)) availability.push([slotId, status as AvailabilityStatus]);
    }
  }

  let existing: ResponseRow | undefined;
  if (body.participantId !== undefined && body.participantId !== null && body.participantId !== "") {
    existing = responseRows.find((r) => r.id === body.participantId);
    if (!existing) throw new HttpError(404, "找不到原有的投票紀錄，請重新驗證身份");
  }

  // Nickname must be unique within the event (case-insensitive), and must not
  // collide with the host's display name unless the signed-in host is the one voting (FR-3).
  const lower = nickname.toLowerCase();
  const clash = responseRows.find((r) => r.nickname.toLowerCase() === lower);
  if (clash && clash.id !== existing?.id) throw new HttpError(409, "此暱稱已被使用，請更換暱稱，或改用「更新投票」修改原有回覆");
  const viewerIsHost = c.get("host")?.id === row.host_account_id;
  if (!viewerIsHost && row.host_name && row.host_name.toLowerCase() === lower && !existing) {
    throw new HttpError(409, "此暱稱與主揪名稱相同，請更換暱稱");
  }

  const now = nowIso();
  if (existing) {
    const attempts = passwordAttempts(db, id, existing.nickname);
    await attempts.guard();
    if (!(await verifyPassword(password, existing.password_hash))) await attempts.fail();
    await db.batch([
      // The password is fixed once set — updates keep the original hash.
      db.prepare(`UPDATE participant_responses SET nickname = ?1, nickname_lower = ?2, email = ?3, comment = ?4, updated_at = ?5 WHERE id = ?6`)
        .bind(nickname, lower, email, comment, now, existing.id),
      db.prepare(`DELETE FROM response_availability WHERE response_id = ?1`).bind(existing.id),
      ...availability.map(([slotId, status]) =>
        db.prepare(`INSERT INTO response_availability (response_id, slot_id, status) VALUES (?1, ?2, ?3)`).bind(existing!.id, slotId, status),
      ),
      db.prepare(`UPDATE events SET updated_at = ?1 WHERE id = ?2`).bind(now, id),
    ]);
  } else {
    if (responseRows.length >= MAX_PARTICIPANTS) throw new HttpError(409, "已達活動人數上限");
    const rid = `p_${randomId(12)}`;
    const passwordHash = await hashPassword(password);
    try {
      await db.batch([
        db.prepare(
          `INSERT INTO participant_responses (id, event_id, nickname, nickname_lower, email, password_hash, comment, created_at, updated_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)`,
        ).bind(rid, id, nickname, lower, email, passwordHash, comment, now),
        ...availability.map(([slotId, status]) =>
          db.prepare(`INSERT INTO response_availability (response_id, slot_id, status) VALUES (?1, ?2, ?3)`).bind(rid, slotId, status),
        ),
        db.prepare(`UPDATE events SET updated_at = ?1 WHERE id = ?2`).bind(now, id),
      ]);
    } catch (err) {
      if (String(err).includes("UNIQUE")) throw new HttpError(409, "此暱稱已被使用，請更換暱稱");
      throw err;
    }
  }
  return respond(c, id);
});

eventRoutes.get("/:id/comments", async (c) => {
  const id = c.req.param("id");
  await loadVisible(c, id);
  const page = Math.max(1, Number(c.req.query("page")) || 1);
  const { results } = await c.env.DB.prepare(
    `SELECT id, nickname, message, created_at FROM event_comments WHERE event_id = ?1 AND deleted_at IS NULL
     ORDER BY created_at DESC LIMIT 11 OFFSET ?2`,
  )
    .bind(id, (page - 1) * 10)
    .all<{ id: string; nickname: string; message: string; created_at: string }>();
  const comments: EventComment[] = results.slice(0, 10).map((r) => ({ id: r.id, nickname: r.nickname, message: r.message, createdAt: r.created_at }));
  return c.json({ comments, page, hasMore: results.length > 10 });
});

eventRoutes.post("/:id/comments", async (c) => {
  const id = c.req.param("id");
  const db = c.env.DB;
  await rateLimit(db, `comment:${clientIp(c)}:${id}`, 5, 60, "留言太頻繁，請稍後再試");
  const { event } = await loadVisible(c, id);
  if (!canComment(event)) throw new HttpError(409, "此活動目前無法留言");
  const body = await readJson(c);
  const nickname = str(body.nickname, "您的暱稱", { max: 40, required: true });
  const message = str(body.message, "留言內容", { max: 300, required: true });
  const now = nowIso();
  await db.batch([
    db.prepare(`INSERT INTO event_comments (id, event_id, nickname, message, created_at) VALUES (?1, ?2, ?3, ?4, ?5)`).bind(`cmt_${randomId(12)}`, id, nickname, message, now),
    db.prepare(`UPDATE events SET updated_at = ?1 WHERE id = ?2`).bind(now, id),
  ]);
  return respond(c, id);
});

eventRoutes.delete("/:id/comments/:commentId", async (c) => {
  const id = c.req.param("id");
  await loadAsHost(c, id);
  await c.env.DB.prepare(`UPDATE event_comments SET deleted_at = ?1 WHERE id = ?2 AND event_id = ?3`).bind(nowIso(), c.req.param("commentId"), id).run();
  return respond(c, id);
});

eventRoutes.put("/:id/ai-restaurant", async (c) => {
  const id = c.req.param("id");
  const { event } = await loadAsHost(c, id);
  if (event.status !== "finalized") throw new HttpError(409, "活動定案後才能選擇餐廳");
  const body = await readJson(c);
  const restaurant: AiSelectedRestaurant = {
    emoji: str(body.emoji, "emoji", { max: 8 }),
    name: str(body.name, "餐廳名稱", { max: 100, required: true }),
    rating: typeof body.rating === "number" ? body.rating : 0,
    priceLevel: str(body.priceLevel, "價位", { max: 20 }),
    address: str(body.address, "地址", { max: 200 }),
    mapsUrl: optionalUrl(body.mapsUrl) || "",
    reason: str(body.reason, "推薦理由", { max: 500 }),
    selectedAt: nowIso(),
  };
  await c.env.DB.prepare(`UPDATE events SET ai_restaurant = ?1, updated_at = ?2 WHERE id = ?3`).bind(JSON.stringify(restaurant), nowIso(), id).run();
  return respond(c, id);
});

/** 「我揪的團」: the signed-in host's events, cancelled ones excluded (FR-12). */
export async function listHostEvents(c: AppContext) {
  const host = requireHost(c);
  const { results } = await c.env.DB.prepare(
    `SELECT e.id, e.title, e.mode, e.status, e.response_deadline, e.created_at, e.updated_at, s.date AS final_slot_date
     FROM events e LEFT JOIN time_slots s ON s.id = e.final_slot_id
     WHERE e.host_account_id = ?1 AND e.status != 'cancelled'
     ORDER BY e.created_at DESC LIMIT 100`,
  )
    .bind(host.id)
    .all<{ id: string; title: string; mode: EventData["mode"]; status: EventData["status"]; response_deadline: string; created_at: string; updated_at: string; final_slot_date: string | null }>();
  return c.json({
    events: results
      .filter((r) => !isOlderThanDays(r.created_at, 7))
      .map((r) => ({
        id: r.id,
        title: r.title,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        isHost: true,
        mode: r.mode,
        status: r.status,
        responseDeadline: r.response_deadline,
        finalSlotDate: r.final_slot_date || undefined,
      })),
  });
}
