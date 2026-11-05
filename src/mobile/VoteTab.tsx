import React, { useState, useEffect, useLayoutEffect } from "react";
import { Zap, RotateCw, ChevronUp, ChevronDown, List, CalendarDays, AlertTriangle, Info, X } from "lucide-react";
import { EventData, AvailabilityStatus, SubmitResponseInput } from "../types";
import { formatChineseWeekday } from "../lib/calendar";
import { isVotingOpen, formatDeadline, getLifecycleStatus } from "../lib/eventStatus";
import { formatSlotTime } from "../lib/slots";
import { Button, Input } from "../design-system/components";
import { cardStyle, MonthNavButton, countInAdjacentMonth, quickBtnStyle, STATUS_META } from "./mobileStyles";
import { EventInfoCard } from "./EventInfoCard";
import { verifyParticipant } from "../lib/api";

interface VoteTabProps {
  event: EventData;
  nickname: string;
  setNickname: (v: string) => void;
  email: string;
  setEmail: (v: string) => void;
  onSubmit: (input: SubmitResponseInput) => Promise<void>;
  isLoading: boolean;
  onSubmitted?: () => void;
  /** The desktop shell wraps this in an `overflow: hidden` card, which breaks `position: sticky`. */
  stickyFooter?: boolean;
  /** Skip the read-only landing state and jump straight into "我要投票" or "更新投票" — e.g. when arriving via a banner button that already knows the visitor's intent. */
  initialMode?: "create" | "login";
  /** Where "取消" (and the login modal's close button) should go. Defaults to this component's own read-only landing state when omitted. */
  onCancel?: () => void;
}

interface VoteRowProps {
  slot: EventData["slots"][number];
  status: AvailabilityStatus;
  onChange: (id: string, status: AvailabilityStatus) => void;
  primaryText?: string;
  disabled?: boolean;
}

const WEEK = ["日", "一", "二", "三", "四", "五", "六"];
const STATUS_LABEL: Record<AvailabilityStatus, string> = { available: "有空", if_needed: "可能", unavailable: "不行" };

interface BulkTarget {
  key: string;
  label: string;
  pred: (dow: number) => boolean;
}

const BULK_TARGETS: BulkTarget[] = [
  { key: "all", label: "全部", pred: () => true },
  { key: "weekday", label: "平日", pred: (d) => d >= 1 && d <= 5 },
  { key: "weekend", label: "週末", pred: (d) => d === 0 || d === 6 },
  ...WEEK.map((w, dow) => ({ key: `dow-${dow}`, label: w, pred: (d: number) => d === dow })),
];

const VoteRow: React.FC<VoteRowProps> = (props) => {
  const { slot, status, onChange, primaryText, disabled } = props;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0", borderBottom: "1px solid var(--color-border)", opacity: disabled ? 0.55 : 1 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: "var(--color-ink)" }}>{primaryText ?? formatSlotTime(slot.time)}</div>
        {slot.label && <div style={{ fontSize: 10, color: "var(--color-muted)" }}>{slot.label}</div>}
      </div>
      <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
        {(["available", "if_needed", "unavailable"] as AvailabilityStatus[]).map((k) => {
          const active = status === k;
          const meta = STATUS_META[k];
          return (
            <button
              key={k}
              disabled={disabled}
              onClick={() => onChange(slot.id, k)}
              style={{
                width: 30,
                height: 30,
                borderRadius: "var(--radius-md)",
                border: active ? `2px solid ${meta.color}` : "1.5px solid var(--color-border)",
                background: active ? meta.color : "#fff",
                fontSize: 14,
                cursor: disabled ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <meta.icon size={14} color={active ? "#fff" : meta.color} />
            </button>
          );
        })}
      </div>
    </div>
  );
};

type VoteMode = "readonly" | "create" | "login" | "edit";

export const VoteTab: React.FC<VoteTabProps> = ({ event, nickname, setNickname, email, setEmail, onSubmit, isLoading, onSubmitted, stickyFooter = true, initialMode, onCancel }) => {
  const [mode, setMode] = useState<VoteMode>(initialMode === "create" || initialMode === "login" ? initialMode : "readonly");
  const [comment, setComment] = useState("");
  const [password, setPassword] = useState("");
  const [availability, setAvailability] = useState<Record<string, AvailabilityStatus>>({});
  const [editingParticipantId, setEditingParticipantId] = useState<string | null>(null);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [showEmailInfo, setShowEmailInfo] = useState(false);
  const [showPasswordInfo, setShowPasswordInfo] = useState(false);
  const [bulkTargetKey, setBulkTargetKey] = useState("all");
  const [viewMode, setViewMode] = useState<"list" | "calendar">("list");
  const [calViewDate, setCalViewDate] = useState(new Date());
  const [calActiveDate, setCalActiveDate] = useState<string | null>(null);

  const [loginNickname, setLoginNickname] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");

  const trimmedNickname = nickname.trim();
  const nicknameTaken =
    mode === "create" && !!trimmedNickname && event.responses.some((r) => r.nickname.toLowerCase() === trimmedNickname.toLowerCase());

  const defaultAvailability = (): Record<string, AvailabilityStatus> => {
    const initial: Record<string, AvailabilityStatus> = {};
    event.slots.forEach((s) => (initial[s.id] = "available"));
    return initial;
  };

  const startCreate = () => {
    setEditingParticipantId(null);
    setNickname("");
    setEmail("");
    setPassword("");
    setComment("");
    setAvailability(defaultAvailability());
    setMode("create");
  };

  const startLogin = () => {
    setLoginNickname(nickname || "");
    setLoginPassword("");
    setLoginError("");
    setMode("login");
  };

  const cancelToReadonly = () => {
    if (onCancel) {
      onCancel();
      return;
    }
    setMode("readonly");
    setLoginError("");
  };

  const handleLogin = async () => {
    const cleanLoginNickname = loginNickname.trim();
    const cleanLoginPassword = loginPassword.trim();
    if (!cleanLoginNickname || !cleanLoginPassword) {
      setLoginError("請輸入暱稱與手機末三碼");
      return;
    }
    let verified: { participantId: string; email: string };
    try {
      // Checked on the server — the stored 手機末三碼 is never sent to the browser.
      verified = await verifyParticipant(event.id, cleanLoginNickname, cleanLoginPassword);
    } catch (err: any) {
      setLoginError(err?.message || "暱稱或手機末三碼不正確");
      return;
    }
    const matched = event.responses.find((r) => r.id === verified.participantId);
    if (!matched) {
      setLoginError("找不到原有的投票紀錄，請重新整理頁面");
      return;
    }
    setEditingParticipantId(matched.id);
    setNickname(matched.nickname);
    setEmail(verified.email || "");
    setPassword(cleanLoginPassword);
    setComment(matched.comment || "");
    setAvailability(matched.availability || {});
    setLoginError("");
    setMode("edit");
  };

  useLayoutEffect(() => {
    if (initialMode === "create") {
      setEditingParticipantId(null);
      setNickname("");
      setEmail("");
      setPassword("");
      setComment("");
      setAvailability(defaultAvailability());
    } else if (initialMode === "login") {
      setLoginNickname(nickname || "");
      setLoginPassword("");
      setLoginError("");
    }
    // Only meant to prime the form once, on the render that follows arriving with an initialMode.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const allDates: string[] = event.slots
    .map((s) => s.date)
    .filter((d, i, arr) => arr.indexOf(d) === i)
    .sort();

  useEffect(() => {
    if (!calActiveDate || !allDates.includes(calActiveDate)) {
      const first = allDates[0] || null;
      setCalActiveDate(first);
      if (first) {
        const [y, m] = first.split("-").map(Number);
        setCalViewDate(new Date(y, m - 1, 1));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event.id]);

  const applyBulk = (status: AvailabilityStatus) => {
    const target = BULK_TARGETS.find((t) => t.key === bulkTargetKey) || BULK_TARGETS[0];
    setAvailability((prev) => {
      const next = { ...prev };
      event.slots.forEach((s) => {
        if (target.pred(new Date(s.date).getDay())) next[s.id] = status;
      });
      return next;
    });
  };

  const grouped = event.slots.reduce((acc, s) => {
    (acc[s.date] = acc[s.date] || []).push(s);
    return acc;
  }, {} as Record<string, EventData["slots"]>);

  const isDateOnly = event.mode === "date_only";
  const votingClosed = !isVotingOpen(event);
  const lifecycle = getLifecycleStatus(event);

  const handleChange = (id: string, st: AvailabilityStatus): void => setAvailability((p) => ({ ...p, [id]: st }));
  const editable = mode === "create" || mode === "edit";

  const handleSubmit = async () => {
    if (!nickname.trim() || !password.trim() || nicknameTaken) return;
    try {
      await onSubmit({
        participantId: editingParticipantId || undefined,
        nickname: nickname.trim(),
        email: email.trim(),
        password: password.trim() || undefined,
        availability,
        comment: comment.trim(),
      });
      setMode("readonly");
      onSubmitted?.();
    } catch {
      // onSubmit already surfaces the failure (e.g. an error toast); nothing more to do here.
    }
  };

  const calYear = calViewDate.getFullYear();
  const calMonth = calViewDate.getMonth();
  const calDaysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const calStartDay = new Date(calYear, calMonth, 1).getDay();
  const calDateStr = (d: number) => `${calYear}-${String(calMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const calCells: (number | null)[] = [...Array(calStartDay).fill(null), ...Array.from({ length: calDaysInMonth }, (_, i) => i + 1)];
  const dateSet = new Set(allDates);
  const calPrevCount = countInAdjacentMonth(event.slots, calYear, calMonth, -1);
  const calNextCount = countInAdjacentMonth(event.slots, calYear, calMonth, 1);

  const bulkToolsButton = (
    <button
      onClick={() => setToolsOpen((v) => !v)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 3,
        padding: "4px 8px",
        borderRadius: "var(--radius-pill)",
        border: toolsOpen ? "1.5px solid var(--color-muted)" : "1px solid var(--color-border-strong)",
        background: toolsOpen ? "var(--color-muted)" : "#fff",
        color: toolsOpen ? "#fff" : "var(--color-muted)",
        fontSize: 10,
        fontWeight: 800,
        cursor: "pointer",
        flexShrink: 0,
        whiteSpace: "nowrap",
      }}
    >
      <Zap size={10} />
      批次勾選
      {toolsOpen ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
    </button>
  );

  const bulkToolsPanel = toolsOpen && (
    <div style={{ marginBottom: 10, padding: 10, border: "1px solid var(--color-border-strong)", borderRadius: "var(--radius-md)", background: "var(--color-cream)" }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: "var(--color-muted)", marginBottom: 6 }}>套用對象（依星期批次勾選）</div>
      <div style={{ display: "flex", gap: 4, marginBottom: 4 }}>
        {BULK_TARGETS.slice(0, 3).map((t) => {
          const active = bulkTargetKey === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setBulkTargetKey(t.key)}
              style={{
                ...quickBtnStyle,
                flex: 1,
                border: active ? "1.5px solid var(--color-primary)" : "1px solid var(--color-border)",
                background: active ? "var(--color-primary)" : "#fff",
                color: active ? "#fff" : "var(--color-ink)",
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
        {BULK_TARGETS.slice(3).map((t) => {
          const active = bulkTargetKey === t.key;
          const isWeekend = t.key === "dow-0" || t.key === "dow-6";
          return (
            <button
              key={t.key}
              onClick={() => setBulkTargetKey(t.key)}
              style={{
                ...quickBtnStyle,
                flex: 1,
                border: active ? "1.5px solid var(--color-primary)" : "1px solid var(--color-border)",
                background: active ? "var(--color-primary)" : "#fff",
                color: active ? "#fff" : isWeekend ? "var(--color-weekend)" : "var(--color-ink)",
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <div style={{ fontSize: 10, fontWeight: 700, color: "var(--color-muted)", marginBottom: 6 }}>設定為</div>
      <div style={{ display: "flex", gap: 4 }}>
        {(["available", "if_needed", "unavailable"] as AvailabilityStatus[]).map((k) => {
          const meta = STATUS_META[k];
          return (
            <button
              key={k}
              onClick={() => applyBulk(k)}
              style={{
                flex: 1,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 4,
                fontSize: 11,
                fontWeight: 800,
                padding: "7px 4px",
                borderRadius: "var(--radius-md)",
                border: `1.5px solid ${meta.color}`,
                background: "#fff",
                color: "var(--color-ink)",
                cursor: "pointer",
              }}
            >
              <meta.icon size={11} color={meta.color} />
              {STATUS_LABEL[k]}
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
      <EventInfoCard
        title={event.title}
        hostName={event.hostName}
        location={event.location}
        description={event.description}
        responseDeadlineIso={event.responseDeadline}
        statusLabel={lifecycle.label}
        statusColor={lifecycle.color}
      />
      {votingClosed && (
        <div style={{ display: "flex", alignItems: "flex-start", gap: 6, padding: 10, borderRadius: "var(--radius-md)", background: "var(--color-hot-subtle)", border: "1px solid rgba(214,48,60,0.25)" }}>
          <AlertTriangle size={14} color="var(--color-hot)" style={{ flexShrink: 0, marginTop: 1 }} />
          <span style={{ fontSize: 12, color: "var(--color-ink)", lineHeight: 1.5 }}>
            投票已於 {formatDeadline(event.responseDeadline)} 截止，如需補投請聯繫主揪重新開放投票。
          </span>
        </div>
      )}
      {!votingClosed && mode !== "readonly" && (
        <span style={{ fontSize: 15, fontWeight: 900, fontFamily: "var(--font-display)", color: "var(--color-ink)" }}>
          {mode === "edit" ? "更新我的時間" : "填寫我的時間"}
        </span>
      )}
      {mode === "login" && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
            padding: 20,
          }}
          onClick={cancelToReadonly}
        >
          <div
            style={{ ...cardStyle, width: "100%", maxWidth: 320, display: "flex", flexDirection: "column", gap: 10 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 14, fontWeight: 900, color: "var(--color-ink)" }}>驗證身份以更新投票</span>
              <button
                onClick={cancelToReadonly}
                style={{ border: "none", background: "none", cursor: "pointer", color: "var(--color-muted)", padding: 2 }}
                aria-label="關閉"
              >
                <X size={16} />
              </button>
            </div>
            <Input size="sm" label="您的暱稱" required placeholder="例如：小明" value={loginNickname} onChange={(e) => setLoginNickname(e.target.value)} />
            <Input
              size="sm"
              required
              label="手機末三碼"
              placeholder="請輸入手機末三碼（例如：123）"
              type="text"
              maxLength={3}
              value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
            />
            {loginError && (
              <span style={{ fontSize: 12, color: "var(--color-hot)", fontWeight: 700 }}>{loginError}</span>
            )}
            <Button variant="primary" fullWidth onClick={handleLogin}>
              登入並修改
            </Button>
          </div>
        </div>
      )}
      {mode !== "readonly" && (
      <div style={{ ...cardStyle, display: "flex", flexDirection: "column", gap: 10 }}>
      {!votingClosed && (mode === "create" || mode === "edit") && (
        <>
          <Input
            size="sm"
            label="您的暱稱"
            required
            disabled={mode === "edit"}
            placeholder="例如：小明"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
          />
          <Input
            size="sm"
            label={
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                聯絡 Email
                <button
                  type="button"
                  onClick={() => setShowEmailInfo((v) => !v)}
                  style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", border: "none", background: "none", color: "var(--color-muted)", cursor: "pointer", padding: 0 }}
                  aria-label="更多資訊"
                >
                  <Info size={13} />
                </button>
              </span>
            }
            placeholder="例如：name@example.com"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            hint={showEmailInfo ? "後續如果有留言、活動內容更新，或活動確定時間，會寄信通知這個 email" : undefined}
          />
          <Input
            size="sm"
            required
            disabled={mode === "edit"}
            label={
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                手機末三碼
                <button
                  type="button"
                  onClick={() => setShowPasswordInfo((v) => !v)}
                  style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", border: "none", background: "none", color: "var(--color-muted)", cursor: "pointer", padding: 0 }}
                  aria-label="更多資訊"
                >
                  <Info size={13} />
                </button>
              </span>
            }
            placeholder="請輸入手機末三碼（例如：123）"
            type="text"
            maxLength={3}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            hint={showPasswordInfo ? "設定手機末三碼後，可以在其他裝置點選「更新投票」修改您的時間。" : undefined}
          />
        </>
      )}
      {!votingClosed && mode === "create" && nicknameTaken && (
        <div style={{ display: "flex", alignItems: "flex-start", gap: 6, padding: 10, borderRadius: "var(--radius-md)", background: "var(--color-hot-subtle)", border: "1px solid rgba(214,48,60,0.25)" }}>
          <AlertTriangle size={14} color="var(--color-hot)" style={{ flexShrink: 0, marginTop: 1 }} />
          <span style={{ fontSize: 12, color: "var(--color-ink)", lineHeight: 1.5 }}>
            此暱稱已被使用，請更換暱稱，或改用「更新投票」修改原有回覆。
          </span>
        </div>
      )}

      <div style={{ borderTop: "1px solid var(--color-border)" }} />

      <div style={{ display: "flex", gap: 2, background: "var(--color-cream)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", padding: 3 }}>
        {[{ k: "list" as const, label: "清單檢視", icon: List }, { k: "calendar" as const, label: "行事曆檢視", icon: CalendarDays }].map((m) => (
          <button
            key={m.k}
            onClick={() => setViewMode(m.k)}
            style={{
              flex: 1,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 4,
              padding: "7px 4px",
              borderRadius: "var(--radius-sm)",
              fontSize: 12,
              fontWeight: 800,
              border: "none",
              cursor: "pointer",
              background: viewMode === m.k ? "var(--color-ink)" : "transparent",
              color: viewMode === m.k ? "#fff" : "var(--color-ink)",
              transition: "background 150ms ease, color 150ms ease",
            }}
          >
            <m.icon size={12} />
            {m.label}
          </button>
        ))}
      </div>

      {viewMode === "list" && (
        <div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 6 }}>
            {bulkToolsButton}
          </div>
          {bulkToolsPanel}
          {(Object.entries(grouped) as [string, EventData["slots"]][]).map(([date, list]) => (
            <div key={date} style={{ marginBottom: 3 }}>
              {!isDateOnly && (
                <div style={{ fontSize: 12, fontWeight: 900, color: "var(--color-ink)", padding: "3px 0 1px" }}>
                  {date} ({formatChineseWeekday(date)})
                </div>
              )}
              {list.map((s) => {
                const status: AvailabilityStatus = availability[s.id] || "available";
                return (
                  <VoteRow
                    key={s.id}
                    slot={s}
                    status={status}
                    onChange={handleChange}
                    primaryText={isDateOnly ? `${date} (${formatChineseWeekday(date)})` : undefined}
                    disabled={votingClosed || !editable}
                  />
                );
              })}
            </div>
          ))}
        </div>
      )}

      {viewMode === "calendar" && (
        <div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 6 }}>
            {bulkToolsButton}
          </div>
          {bulkToolsPanel}
          <div style={{ maxWidth: 260, margin: "0 auto" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, gap: 6 }}>
              <MonthNavButton direction="prev" onClick={() => setCalViewDate(new Date(calYear, calMonth - 1, 1))} badgeCount={calPrevCount} />
              <select
                value={`${calYear}-${calMonth}`}
                onChange={(e) => {
                  const [y, m] = e.target.value.split("-").map(Number);
                  setCalViewDate(new Date(y, m, 1));
                }}
                style={{
                  fontSize: 12,
                  fontWeight: 800,
                  fontFamily: "var(--font-display)",
                  border: "none",
                  background: "transparent",
                  color: "var(--color-ink)",
                  textAlign: "center",
                }}
              >
                {Array.from({ length: 14 }).map((_, i) => {
                  const d = new Date();
                  d.setDate(1);
                  d.setMonth(d.getMonth() - 1 + i);
                  return (
                    <option key={i} value={`${d.getFullYear()}-${d.getMonth()}`}>
                      {d.getFullYear()}年{d.getMonth() + 1}月
                    </option>
                  );
                })}
              </select>
              <MonthNavButton direction="next" onClick={() => setCalViewDate(new Date(calYear, calMonth + 1, 1))} badgeCount={calNextCount} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2, marginBottom: 2 }}>
              {WEEK.map((w, i) => (
                <div key={i} style={{ textAlign: "center", fontSize: 9, fontWeight: 800, color: i === 0 || i === 6 ? "var(--color-weekend)" : "var(--color-muted)" }}>
                  {w}
                </div>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2 }}>
              {calCells.map((d, i) => {
                if (d === null) return <div key={i} />;
                const ds = calDateStr(d);
                const hasSlots = dateSet.has(ds);
                const dateSlots = hasSlots ? grouped[ds] || [] : [];
                const statuses = dateSlots.map((s) => availability[s.id] || "available");
                const isActive = ds === calActiveDate;
                return (
                  <button
                    key={i}
                    disabled={!hasSlots}
                    onClick={() => setCalActiveDate(ds)}
                    style={{
                      position: "relative",
                      aspectRatio: "1",
                      border: hasSlots ? "1px solid var(--color-border)" : "1px solid transparent",
                      outline: isActive ? "2px solid var(--color-primary)" : "none",
                      outlineOffset: isActive ? 2 : 0,
                      borderRadius: "var(--radius-md)",
                      background: hasSlots ? "var(--color-cream)" : "transparent",
                      color: hasSlots ? "var(--color-ink)" : "var(--color-border)",
                      fontSize: 10,
                      fontWeight: hasSlots ? 800 : 400,
                      cursor: hasSlots ? "pointer" : "default",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 3,
                      padding: "4px 0",
                    }}
                  >
                    <span>{d}</span>
                    {hasSlots && (
                      <span style={{ display: "flex", gap: 1.5 }}>
                        {statuses.slice(0, 4).map((st, idx) => (
                          <span key={idx} style={{ width: 4, height: 4, borderRadius: "50%", background: STATUS_META[st].color }} />
                        ))}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {calActiveDate && (
            <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--color-border)" }}>
              {!isDateOnly && (
                <div style={{ fontSize: 12, fontWeight: 900, color: "var(--color-ink)", marginBottom: 6 }}>
                  {calActiveDate} ({formatChineseWeekday(calActiveDate)})
                </div>
              )}
              {(grouped[calActiveDate] || []).map((s) => {
                const status: AvailabilityStatus = availability[s.id] || "available";
                return (
                  <VoteRow
                    key={s.id}
                    slot={s}
                    status={status}
                    onChange={handleChange}
                    primaryText={isDateOnly ? `${calActiveDate} (${formatChineseWeekday(calActiveDate)})` : undefined}
                    disabled={votingClosed || !editable}
                  />
                );
              })}
            </div>
          )}
        </div>
      )}

      {editable && (
        <Input size="sm" label="對此發起此次投票的留言" placeholder="例如：19:00 才能到" value={comment} onChange={(e) => setComment(e.target.value)} disabled={!editable} />
      )}
      </div>
      )}
      <div
        style={
          stickyFooter
            ? { position: "sticky", bottom: 0, margin: "4px -14px -14px", padding: "10px 14px calc(14px + env(safe-area-inset-bottom))", background: "var(--color-cream)", borderTop: "1px solid var(--color-border)" }
            : undefined
        }
      >
        {mode === "readonly" && (
          <div style={{ display: "flex", alignItems: "stretch", gap: 8 }}>
            <div style={{ flex: 2 }}>
              <Button variant="primary" size="md" fullWidth disabled={votingClosed} onClick={startCreate}>
                <span style={{ display: "flex", flexDirection: "column", alignItems: "center", lineHeight: 1.3, whiteSpace: "normal" }}>
                  我要投票
                  <span style={{ fontSize: 10, fontWeight: 700, opacity: 0.85 }}>初次投票</span>
                </span>
              </Button>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <Button variant="secondary" size="sm" fullWidth disabled={votingClosed} onClick={startLogin}>
                <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                  <RotateCw size={12} style={{ flexShrink: 0 }} />
                  <span style={{ display: "flex", flexDirection: "column", alignItems: "center", lineHeight: 1.3, whiteSpace: "normal" }}>
                    更新投票
                    <span style={{ fontSize: 9, fontWeight: 700, opacity: 0.85 }}>已投過要改時間</span>
                  </span>
                </span>
              </Button>
            </div>
          </div>
        )}
        {(mode === "create" || mode === "edit") && (
          <div style={{ display: "flex", gap: 8 }}>
            <Button variant="secondary" onClick={cancelToReadonly}>
              取消
            </Button>
            <Button
              variant="primary"
              fullWidth
              disabled={!nickname.trim() || !password.trim() || isLoading || votingClosed || nicknameTaken}
              onClick={handleSubmit}
            >
              {mode === "edit" ? (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  更新投票
                  <RotateCw size={14} />
                </span>
              ) : (
                "送出我的時間"
              )}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};
