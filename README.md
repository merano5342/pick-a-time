<div align="center">
<img width="1200" height="630" alt="揪甘心" src="./public/og-image.png" />
</div>

# 揪甘心

**聚會時間協調神器** — 免登入的聚會時間協調工具，支援日期時間挑選、熱點圖統計、LINE 一鍵分享與主揪拍板定案。

## 專案定位（重要）

本版本是**可實際運行的版本**：前端 SPA 與後端 API 一起部署在單一 Cloudflare Worker，資料存在 Cloudflare D1。完整計劃與上線步驟見 [docs/cloudflare-migration-plan.md](docs/cloudflare-migration-plan.md)。

- **主揪登入是真的 Google OAuth**：伺服器端完成授權並以 HttpOnly session cookie 辨識主揪；參與者仍免登入。
- **尚未串接**：Email 通知、AI 選餐廳（Perplexity）、台灣假日同步——AI 推薦目前仍是 demo 資料。
- **Demo 情境**（`demo-*` 活動）只存在瀏覽器 localStorage，不會寫入資料庫。

### 本機開發

```bash
npm install
cp .dev.vars.example .dev.vars   # 不填 Google 金鑰時，登入按鈕會用本機測試帳號
npm run db:migrate:local
npm run dev
```

## 功能特色

- 📅 日期時間挑選 — 快速建立候選時段
- 🔥 熱點圖統計 — 即時彙整大家的可行時間
- 💬 LINE 一鍵分享 — 邀請朋友快速填寫
- 👑 主揪拍板定案 — 一鍵確定最終聚會時間
- 🙅 免登入 — 不需註冊帳號即可使用

## 本機執行

**前置需求：** Node.js

1. 安裝套件：
   `npm install`
2. 複製 [.env.example](.env.example) 為 `.env.local`，並設定 `GEMINI_API_KEY`
3. 啟動開發伺服器：
   `npm run dev`

## 部署

專案透過 GitHub Actions 自動建置並部署至 GitHub Pages（見 [.github/workflows](.github/workflows)）。
