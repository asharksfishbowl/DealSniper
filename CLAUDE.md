# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

DealSniper is a mobile deal watchlist with a stock-ticker/retro-arcade UI. It pulls live Amazon/Costco/Walmart/Home Depot product data via the OpenWebNinja API, scores matches against user preferences, and can push Expo notifications for strong deals.

Three deployables, one FastAPI backend serving both:
- `backend/` — FastAPI + SQLite. Deployed as a container to Azure App Service (`dealsniper-api.azurewebsites.net`), built/pushed via `.github/workflows/deploy-backend.yml` to `ghcr.io/asharksfishbowl/dealsniper-backend`.
- `mobile/` — Expo React Native (TypeScript). The primary UI (stock-ticker Watchlist screen). Built via EAS (`mobile/eas.json` profiles: development/preview/production; `mobile/.eas/workflows/` has the corresponding EAS Workflows).
- `web/` — Vite + React "kiosk" board (fullscreen market-board display, same data as mobile but read-oriented, no filters editing beyond a panel). nginx-fronted container image.

## Commands

No test suite exists in this repo (backend, web, and mobile) — do not invent test commands.

**Backend** (from `backend/`, requires a Python venv — see README for setup):
```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```
No linter/formatter is configured for the backend.

**Web** (from `web/`):
```bash
npm run dev      # vite dev server
npm run build    # tsc -b && vite build — treat tsc errors as real, this is the only type check
npm run lint     # oxlint
```

**Mobile** (from `mobile/` — read `mobile/AGENTS.md` first, it flags that the Expo SDK version has changed and to check versioned docs before writing mobile code):
```bash
npm start                    # expo start
npm run start:docker-api     # expo start against a local Docker API on :8000
npx tsc --noEmit             # type check — no separate lint script configured
```
EAS builds (consumes real build minutes — see Architecture notes below before running):
```bash
npx eas build --platform android --profile development   # or preview / production
npx eas workflow:validate .eas/workflows/<file>.yml       # validate EAS Workflow YAML against the real schema before trusting hand-edits
```

**Docker (local, API + web kiosk)**, from repo root:
```bash
docker compose up --build -d
```
Requires `backend/.env` (`OPENWEBNINJA_API_KEY`) and root `.env` (`EXPO_PUBLIC_API_URL`, `REACT_NATIVE_PACKAGER_HOSTNAME`) — see `.env.example` files. Without an API key the backend still runs, serving only a small bootstrap cache.

## Architecture

### Backend: API-call minimization is the core design constraint

The OpenWebNinja API has a monthly quota per retailer product, so nearly everything in `backend/app/services/refresh.py` exists to avoid unnecessary live calls:

- **`search_cache.py`** — per-retailer/query/country TTL cache (`search_cache_ttl_seconds`, default 8h) backed by the `search_fetches` table. `should_fetch_search()` is the gate every retailer call goes through; a cache hit skips the network call entirely.
- **`quota.py`** — tracks per-API-product monthly exhaustion (`quota_state.json`, persisted outside the DB) and per-call-count/latency instrumentation (`call_counts`, `backend/benchmark_log.jsonl`) for `backend/scripts/benchmark_report.py` (standalone, not wired into CI — run manually with `python -m scripts.benchmark_report` from `backend/`).
- **`rate_limit.py`** — a short global throttle across *all* retailers (`refresh_min_interval_seconds`) independent of the per-query cache, plus a longer cooldown after an HTTP 429.
- **`matcher.py`** — keyword→search-term aliasing (`search_term_for_keyword`, e.g. `"tv"` → `"tv deals"`) so one API call's results cover a whole keyword's title-matching aliases (`KEYWORD_ALIASES`) rather than issuing one call per alias. Also holds `score_deal()`, the 0–100 match-score logic used both for the board's MATCH column and the push-alert threshold.
- **`refresh_deals()`** (in `refresh.py`) orchestrates all of the above across the retailer adapters in `backend/adapters/` (`STORE_ADAPTERS` registry in `adapters/__init__.py`), and returns a structured `refresh_state` (`"live" | "cached" | "rate_limited" | "quota_exhausted"`, precedence in that order) plus per-state detail fields (`cache_age_seconds`, `cooldown_seconds`, `quota_reset_date`). This is the contract the frontends' status-ticker lines are built against — if you change `refresh_deals()`'s return shape, both `mobile/src/screens/WatchlistScreen.tsx` and `web/src/App.tsx` need to stay in sync.
- Each adapter (`backend/adapters/*_openwebninja.py`) subclasses `OpenWebNinjaAdapter` (`adapters/openwebninja.py`), sharing one HTTP/quota/rate-limit pipeline (`_get()`). A failed/errored call (`had_error`) deliberately does *not* stamp the search cache — only a genuinely successful (even if empty) response resets the TTL clock, otherwise a transient network failure would suppress retries for the full TTL window.

### Frontend visual language: retro arcade over a stock-ticker skeleton

Both `mobile/src/screens/WatchlistScreen.tsx` and `web/src/App.tsx` render the same conceptual board (ticker tape, hero/top deal, ranked list) with a shared rule: **numeric data (price, %, match score, rating) always renders in mono font — pixel font is chrome/labels only**, and a static (non-animated except the `LIVE FEED` status line) CRT-scanline overlay sits above content with solid backing chips behind numeric cells so it never reduces their contrast. Color tokens live in `mobile/src/theme.ts` and `web/src/types.ts` and are kept identical between the two — check both when adding a token.

### Deploy topology

- Backend and web are each a standalone Docker image pushed to GHCR by GitHub Actions (`.github/workflows/`), pulled by an Azure Web App for Containers (F1 free tier — has a hard 60 CPU-min/day quota per plan; backend and web deliberately sit on *separate* App Service Plans so one doesn't starve the other's quota).
- The web container is nginx-fronted; its API proxy target is a *runtime* config (nginx env-var template), not baked in at build time, so the same image works against `docker-compose`'s internal network and Azure's public backend URL via an `API_UPSTREAM` app setting.
- Mobile ships via EAS, not GitHub Actions' own runners (no Docker/mobile toolchain needed there) — CI can *trigger* an EAS build via `eas build --non-interactive --no-wait` using an Expo **robot-user** token (`EXPO_TOKEN` secret; robot tokens are the CI-appropriate credential, not a personal account token), but the actual build runs on EAS's infrastructure.
- `mobile/.eas/workflows/` (EAS's own "Workflows" product) and `.github/workflows/` (GitHub Actions) are two unrelated systems that happen to coexist in this repo — don't mix their YAML syntax or assume one validates the other.
