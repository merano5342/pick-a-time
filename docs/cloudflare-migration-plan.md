# 揪甘心：Cloudflare 可運行版遷移計劃

> 2026-11-05 定案。本專案是從 `揪團prototype` 複製出來的新版本（branch `cloudflare-backend`），原專案不受影響。

## 決定

| 項目 | 決定 |
|---|---|
| 前端 + 後端託管 | **單一 Cloudflare Worker**：同時提供靜態檔（Workers Static Assets）與 `/api/*`，同網域讓登入 cookie 最單純；網址為免費的 `*.workers.dev` |
| 後端框架 | Hono |
| 資料庫 | Cloudflare D1（SQLite），schema 依規格書 §5.3，原生 SQL（不用 ORM，少一層） |
| 主揪登入 | **真的 Google OAuth**（伺服器端 authorization-code 流程），session 存 D1、HttpOnly cookie；取代 `hostToken` |
| 本機開發登入 | `.dev.vars` 設 `ALLOW_DEV_LOGIN=true` 且未設 Google 金鑰時，登入按鈕改走測試帳號（只限本機） |
| Email 通知 | **暫不串接**（之後功能可能會改） |
| AI 選餐廳 | **暫不串接 Perplexity**，維持現有 demo 推薦與瀏覽器端次數計算；選定的餐廳改存後端（僅主揪可寫） |
| 台灣假日同步 | 暫不做，沿用 `src/mobile/holidays.ts` |
| Demo 情境 | `demo-*` 活動維持在瀏覽器端 localStorage（可切主揪／參與者視角），不進資料庫 |

## 範圍（這一輪）

1. `worker/` 後端：活動 CRUD、投票（暱稱唯一、手機末三碼雜湊）、定案、取消、重新開放、編輯（僅進行中）、留言（主揪可軟刪除）、AI 選定餐廳、我揪的團、7 天連結失效、50 人／20 時段上限、公開寫入端點的簡易流量限制。
2. `migrations/0001_init.sql`：hosts、sessions、events、time_slots、participant_responses、response_availability、event_comments、rate_limits。
3. 前端 `src/lib/api.ts` 改為呼叫 `/api`（demo 活動仍走本地）；`fakeAuth` 換成真的 `auth`；UI 以伺服器回傳的 `isHost` 判斷主揪，不再用 `hostToken`。
4. 投票彙整每 15 秒輪詢更新。

## 之後再做

Email 通知、Perplexity 串接、假日排程、留言分頁 API 接到 UI、未回覆提醒。

## 上線步驟（需要你操作的部分）

1. 註冊 Cloudflare 帳號，`npx wrangler login`
2. `npx wrangler d1 create jiuganxin-db`，把回傳的 `database_id` 填進 `wrangler.jsonc`
3. `npm run db:migrate:remote`
4. Google Cloud Console 建立 OAuth Client（Web application），授權重新導向 URI 填 `https://<你的 worker 網址>/api/auth/google/callback`（本機另加 `http://localhost:5173/api/auth/google/callback`）
5. `npx wrangler secret put GOOGLE_CLIENT_ID`、`npx wrangler secret put GOOGLE_CLIENT_SECRET`
6. `npm run deploy`
