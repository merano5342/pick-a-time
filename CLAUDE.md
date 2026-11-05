# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- Install deps: `npm install` (CI uses `bun install --frozen-lockfile` — `bun.lock` is the lockfile of record, keep it in sync even if you use npm locally)
- Dev server: `npm run dev` (Vite + `@cloudflare/vite-plugin`: runs the SPA and the Worker with a local D1 on one origin). First time: `cp .dev.vars.example .dev.vars && npm run db:migrate:local`
- Build: `npm run build` (outputs to `dist/`)
- Deploy: `npm run deploy` (build + `wrangler deploy`); remote schema: `npm run db:migrate:remote`
- Type check / lint: `npm run lint` (runs `tsc --noEmit` for `src/` and for `worker/`; there is no separate ESLint config)
- Clean build output: `npm run clean`

There is no test runner configured in this repo (no test script, framework, or test files present).

## Architecture

**Single Cloudflare Worker serves both the SPA and the API.** `wrangler.jsonc` points `main` at `worker/index.ts` (Hono, mounted at `/api`) and serves the built SPA as static assets (`run_worker_first: ["/api/*"]`). Data lives in D1 (`migrations/*.sql`, raw SQL, no ORM). `worker/events.ts` holds all event/vote/comment rules and re-validates everything server-side; `worker/auth.ts` does the Google OAuth authorization-code flow and D1-backed sessions (HttpOnly cookie `jgx_sid`). Host identity comes **only** from that session — `events.host_account_id` vs the signed-in host; there is no `hostToken` for real events. With no Google credentials and `ALLOW_DEV_LOGIN=true` (local `.dev.vars` only), `/api/auth/google/start` signs in a fixed local test host instead.

**Frontend data layer**: `src/lib/api.ts` calls `/api/*` for real events. Event ids starting with `demo-` are the guided demo scenarios and stay in browser localStorage via `src/lib/localEventStore.ts` (they still use a demo `hostToken` to switch perspectives). `App.tsx` resolves `isHost` (server's `event.isHost` for real events, demo token match for demo events) and passes it down. `src/lib/auth.ts` (`useAuth`) asks `/api/auth/me` who is signed in. Participant 手機末三碼 are PBKDF2-hashed server-side and checked via `POST /api/events/:id/responses/verify`; non-hosts only see a `"hidden"` placeholder for participant emails. Not yet wired: email notifications, Perplexity, holiday sync (see `docs/cloudflare-migration-plan.md`).

**Two separate UI trees, not responsive breakpoints.** `src/App.tsx` calls `useViewport()` (`src/lib/useViewport.ts`, a `max-width: 767px` media query) and renders either the desktop tree (`src/components/*`) or the entire `src/mobile/*` tree (`MobileApp` → `CreateWizard` / `EventScreen` / …). These two trees are largely independent implementations sharing only `src/types.ts` and `src/lib/*` — a change to one (e.g. `ShareModal`) does not automatically apply to the other; there's a `ShareModal.tsx` and `Toast.tsx` in both `src/components/` and `src/mobile/`.

**No router.** Single-page state is driven entirely by `window.location.hash` (`#event=<id>&hostToken=<token>&tab=<tab>`), parsed/written manually in `App.tsx` via a `hashchange` listener. `skipNextHashLoadRef` exists to prevent a redundant re-fetch immediately after local event creation.

**Data model** (`src/types.ts`) is the single source of truth for both UI trees: `EventData` holds slots, participant `availability` responses, comments, and lifecycle `status` (`active` / `finalized` / `cancelled`).

**Event lifecycle logic is centralized** in `src/lib/eventStatus.ts`: voting-open checks, link-expiry (finalized events 404 seven days after the meetup date), and the derived `LifecycleStatus` labels used across both UIs. Slot/time formatting helpers live in `src/lib/slots.ts`.

**Styling**: design tokens are CSS custom properties in `src/design-system/tokens/*.css` (colors, spacing, typography), consumed directly via inline `style={{ ... }}` with `var(--color-*)` etc. throughout both UI trees, rather than through the small `src/design-system/components/` set or Tailwind utility classes (Tailwind is imported in `src/index.css` but lightly used).

**Deploy**: `.github/workflows/deploy-cloudflare.yml` builds with `bun`, applies D1 migrations, and runs `wrangler deploy` (needs `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` repo secrets). `vite.config.ts` uses `base: '/'`. Google secrets are set with `wrangler secret put GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.

**Unused leftovers from the original AI Studio scaffold**: `.env.example` references `GEMINI_API_KEY`/`APP_URL`, but no code in `src/` calls the Gemini API — these predate the local-storage migration and can be ignored unless AI features are reintroduced.

## OpenSpec

`openspec/config.yaml` is present but the workflow is not yet in use (no `openspec/specs/` or `openspec/changes/` directories exist).
