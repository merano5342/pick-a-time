import React from "react";
import { Loader2 } from "lucide-react";

// Shown for the moment between clicking "以 Google 登入" and the browser
// leaving for Google's sign-in page (see lib/auth.ts).
export const GoogleLoginOverlay: React.FC = () => {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(26,18,8,0.55)", zIndex: 400, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ background: "var(--color-surface)", borderRadius: "var(--radius-card)", padding: "22px 28px", boxShadow: "var(--shadow-lg)", display: "flex", alignItems: "center", gap: 12 }}>
        <Loader2 size={20} className="animate-spin" style={{ color: "var(--color-primary)" }} />
        <span style={{ fontSize: 14, fontWeight: 700, color: "var(--color-ink)" }}>正在前往 Google 登入…</span>
      </div>
    </div>
  );
};
