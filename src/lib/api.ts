import {
  EventData,
  CreateEventInput,
  SubmitResponseInput,
  FinalizeEventInput,
  SubmitCommentInput,
  UpdateEventInput,
  EventMode,
  AiSelectedRestaurant,
} from "../types.js";
import * as store from "./localEventStore.js";
import { isOlderThanDays } from "./eventStatus.js";

const LOCAL_HOST_TOKENS_KEY = "gathertime_host_tokens"; // { [eventId]: hostToken } — demo events only
const LOCAL_USER_NICKNAME_KEY = "gathertime_user_nickname";
const LOCAL_USER_EMAIL_KEY = "gathertime_user_email";
const LOCAL_MY_EVENTS_KEY = "gathertime_my_events"; // Array of event IDs visited or created
const LOCAL_RECENT_SLOT_PRESETS_KEY = "gathertime_recent_slot_presets"; // Array of { start, label } from the last created event

// Real events live on the server (worker/, Cloudflare D1) and the host is
// identified by the Google-login session cookie. The guided demo scenarios
// (ids starting with "demo-") stay in this browser's localStorage via
// ./localEventStore.ts so they can be explored from both perspectives
// without touching real data.
export function isDemoEventId(id: string): boolean {
  return id.startsWith("demo-");
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: "same-origin",
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `請求失敗（${res.status}）`);
  return data as T;
}

const enc = encodeURIComponent;

export async function fetchEvent(id: string, hostToken?: string): Promise<EventData> {
  const data = isDemoEventId(id) ? store.getEvent(id, hostToken) : await request<EventData>("GET", `/events/${enc(id)}`);
  saveVisitedEvent(data);
  return data;
}

export async function createEvent(input: CreateEventInput): Promise<EventData> {
  const event = await request<EventData>("POST", "/events", input);
  if (input.hostName) saveUserNickname(input.hostName);
  saveVisitedEvent(event);
  return event;
}

export async function submitResponse(eventId: string, input: SubmitResponseInput): Promise<EventData> {
  const event = isDemoEventId(eventId)
    ? store.submitResponse(eventId, input).event
    : await request<EventData>("POST", `/events/${enc(eventId)}/responses`, input);
  if (input.nickname) saveUserNickname(input.nickname);
  if (input.email) saveUserEmail(input.email);
  saveVisitedEvent(event);
  return event;
}

/** "更新投票" identity check — done server-side so the stored 手機末三碼 never reaches the browser. */
export async function verifyParticipant(eventId: string, nickname: string, password: string): Promise<{ participantId: string; email: string }> {
  if (isDemoEventId(eventId)) {
    const event = store.peekEvent(eventId);
    const matched = event?.responses.find((r) => r.nickname.toLowerCase() === nickname.toLowerCase());
    if (!matched || matched.password !== password) throw new Error("暱稱或手機末三碼不正確");
    return { participantId: matched.id, email: matched.email || "" };
  }
  return request("POST", `/events/${enc(eventId)}/responses/verify`, { nickname, password });
}

export async function finalizeEvent(eventId: string, input: FinalizeEventInput): Promise<EventData> {
  const event = isDemoEventId(eventId)
    ? store.finalizeEvent(eventId, { ...input, hostToken: input.hostToken || "" })
    : await request<EventData>("POST", `/events/${enc(eventId)}/finalize`, { finalSlotId: input.finalSlotId, finalNote: input.finalNote });
  saveVisitedEvent(event);
  return event;
}

export async function submitComment(eventId: string, input: SubmitCommentInput): Promise<EventData> {
  const event = isDemoEventId(eventId) ? store.submitComment(eventId, input) : await request<EventData>("POST", `/events/${enc(eventId)}/comments`, input);
  if (input.nickname) saveUserNickname(input.nickname);
  saveVisitedEvent(event);
  return event;
}

export async function cancelEvent(eventId: string, hostToken?: string): Promise<EventData> {
  const event = isDemoEventId(eventId) ? store.cancelEvent(eventId, hostToken || "") : await request<EventData>("POST", `/events/${enc(eventId)}/cancel`, {});
  saveVisitedEvent(event);
  return event;
}

export async function reopenEvent(eventId: string, hostToken?: string, responseDeadline?: string): Promise<EventData> {
  const event = isDemoEventId(eventId)
    ? store.reopenEvent(eventId, hostToken || "", responseDeadline)
    : await request<EventData>("POST", `/events/${enc(eventId)}/reopen`, { responseDeadline });
  saveVisitedEvent(event);
  return event;
}

export async function updateEvent(eventId: string, input: UpdateEventInput): Promise<EventData> {
  const { hostToken, hostEmail: _ignored, ...fields } = input;
  const event = isDemoEventId(eventId)
    ? store.updateEvent(eventId, { ...input, hostToken: hostToken || "" })
    : await request<EventData>("PATCH", `/events/${enc(eventId)}`, fields);
  saveVisitedEvent(event);
  return event;
}

export async function saveAiSelectedRestaurant(eventId: string, restaurant: AiSelectedRestaurant): Promise<EventData> {
  const event = isDemoEventId(eventId)
    ? store.setAiSelectedRestaurant(eventId, restaurant)
    : await request<EventData>("PUT", `/events/${enc(eventId)}/ai-restaurant`, restaurant);
  saveVisitedEvent(event);
  return event;
}

/**
 * 「我揪的團」 comes from the server for the signed-in host; events this
 * browser merely visited (as a participant, or demo events) come from
 * localStorage. Server entries win on conflicts.
 */
export async function fetchHistory(signedIn: boolean): Promise<VisitedEventItem[]> {
  const local = getVisitedEvents();
  if (!signedIn) return local;
  try {
    const { events } = await request<{ events: VisitedEventItem[] }>("GET", "/hosts/me/events");
    const hostedIds = new Set(events.map((e) => e.id));
    return [...events, ...local.filter((e) => !hostedIds.has(e.id))].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } catch {
    return local;
  }
}

// --- LOCAL STORAGE HELPERS --- //

export function getHostToken(eventId: string): string | null {
  try {
    const raw = localStorage.getItem(LOCAL_HOST_TOKENS_KEY);
    if (!raw) return null;
    const map = JSON.parse(raw);
    return map[eventId] || null;
  } catch {
    return null;
  }
}

export function saveHostToken(eventId: string, hostToken: string) {
  try {
    const raw = localStorage.getItem(LOCAL_HOST_TOKENS_KEY);
    const map = raw ? JSON.parse(raw) : {};
    map[eventId] = hostToken;
    localStorage.setItem(LOCAL_HOST_TOKENS_KEY, JSON.stringify(map));
  } catch (err) {
    console.error("Failed to save host token:", err);
  }
}

export function getUserNickname(): string {
  try {
    return localStorage.getItem(LOCAL_USER_NICKNAME_KEY) || "";
  } catch {
    return "";
  }
}

export function saveUserNickname(nickname: string) {
  try {
    localStorage.setItem(LOCAL_USER_NICKNAME_KEY, nickname);
  } catch {}
}

export function getUserEmail(): string {
  try {
    return localStorage.getItem(LOCAL_USER_EMAIL_KEY) || "";
  } catch {
    return "";
  }
}

export function saveUserEmail(email: string) {
  try {
    localStorage.setItem(LOCAL_USER_EMAIL_KEY, email);
  } catch {}
}

export interface VisitedEventItem {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  isHost: boolean;
  mode?: EventMode;
  status?: EventData["status"];
  responseDeadline?: string;
  finalSlotDate?: string;
}

// Accepts either a full event snapshot (preferred — lets the history list show
// an up-to-date status badge) or just an id+title for backward compatibility.
export function saveVisitedEvent(event: Pick<EventData, "id" | "title" | "mode" | "status" | "responseDeadline" | "slots" | "finalSlotId" | "createdAt" | "isHost">) {
  try {
    const { id, title, createdAt } = event;
    const isHost = isDemoEventId(id) ? Boolean(getHostToken(id)) : Boolean(event.isHost);
    const raw = localStorage.getItem(LOCAL_MY_EVENTS_KEY);
    let list: VisitedEventItem[] = raw ? JSON.parse(raw) : [];

    const finalSlotDate = event.finalSlotId ? event.slots?.find((s) => s.id === event.finalSlotId)?.date : undefined;

    // Remove if exists
    list = list.filter((item) => item.id !== id);
    // Add to top
    list.unshift({
      id,
      title,
      createdAt,
      updatedAt: new Date().toISOString(),
      isHost,
      mode: event.mode,
      status: event.status,
      responseDeadline: event.responseDeadline,
      finalSlotDate,
    });
    // Keep max 20
    list = list.slice(0, 20);
    localStorage.setItem(LOCAL_MY_EVENTS_KEY, JSON.stringify(list));
  } catch {}
}

// Hides events created more than 7 days ago from the host's "我揪的團" list
// (PRD 2.3) — items saved before this field existed have no createdAt and are
// kept rather than treated as expired.
export function getVisitedEvents(): VisitedEventItem[] {
  try {
    const raw = localStorage.getItem(LOCAL_MY_EVENTS_KEY);
    const list: VisitedEventItem[] = raw ? JSON.parse(raw) : [];
    return list.filter((item) => !item.createdAt || !isOlderThanDays(item.createdAt, 7));
  } catch {
    return [];
  }
}

export interface RecentSlotPreset {
  start: string;
  label: string;
}

export function getRecentSlotPresets(): RecentSlotPreset[] {
  try {
    const raw = localStorage.getItem(LOCAL_RECENT_SLOT_PRESETS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveRecentSlotPresets(slots: { time: string; label?: string }[]) {
  try {
    const seen = new Set<string>();
    const presets: RecentSlotPreset[] = [];
    slots.forEach((s) => {
      const key = `${s.time}__${s.label || ""}`;
      if (seen.has(key)) return;
      seen.add(key);
      presets.push({ start: s.time, label: s.label || "" });
    });
    localStorage.setItem(LOCAL_RECENT_SLOT_PRESETS_KEY, JSON.stringify(presets.slice(0, 10)));
  } catch {}
}
