# DealSniper

Mobile deal watchlist with a stock-ticker UI. Pulls live Amazon and Costco product data via [OpenWebNinja](https://www.openwebninja.com/), scores matches against your preferences, and can push Expo notifications when strong deals appear.

## Stack

- **Backend:** FastAPI + SQLite + OpenWebNinja adapters
- **Mobile:** Expo React Native (TypeScript)
- **Web kiosk:** Vite + React (fullscreen market board)

## Setup

### 1. OpenWebNinja API key

1. Create an account at [OpenWebNinja](https://app.openwebninja.com/)
2. Subscribe to:
   - [Real-Time Amazon Data](https://app.openwebninja.com/api/realtime-amazon-data)
   - [Real-Time Costco Data](https://app.openwebninja.com/api/realtime-costco-data)
3. Copy your API key

### 2. Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# edit .env and set OPENWEBNINJA_API_KEY=your_key
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Health check: [http://127.0.0.1:8000/health](http://127.0.0.1:8000/health)

Without an API key the API still runs and serves a small bootstrap cache so the app UI works.

### Docker (API + kiosk web)

From the repo root (requires `backend/.env` with your OpenWebNinja key):

```bash
cp backend/.env.example backend/.env
# edit backend/.env — set OPENWEBNINJA_API_KEY

docker compose up --build -d
curl http://127.0.0.1:8000/health
# Kiosk board:
open http://127.0.0.1:8080
```

- API: `http://127.0.0.1:8000`
- Kiosk web: `http://127.0.0.1:8080`
- Mobile Metro (Expo): `exp://YOUR_LAN_IP:8081`

Create a root `.env` (see [`.env.example`](.env.example)) so the phone can reach Metro/API:

```bash
cp .env.example .env
# set EXPO_PUBLIC_API_URL + REACT_NATIVE_PACKAGER_HOSTNAME to your Mac Wi‑Fi IP
docker compose up --build -d
```

SQLite is stored in the `dealsniper_data` volume. Stop with `docker compose down` (add `-v` to wipe the DB).

### 3. Web kiosk (local dev)

With the API running on `:8000`:

```bash
cd web
npm install
npm run dev
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173). Press **F** for fullscreen, **R** to refresh. Auto-refresh every 90s. Cursor hides after idle for display use.

### 4. Mobile

With the Docker API on `:8000` (recommended on your Mac — Expo Go / Simulator):

```bash
cd mobile
npm install
npm run start:docker-api
```

Then press `i` for iOS Simulator, `a` for Android emulator, or scan the QR with Expo Go.

Physical device on the same Wi‑Fi:

```bash
EXPO_PUBLIC_API_URL=http://YOUR_LAN_IP:8000 npx expo start --lan
```

Optional Docker Metro (profile):

```bash
EXPO_PUBLIC_API_URL=http://YOUR_LAN_IP:8000 docker compose --profile mobile up --build -d
```

API base URL defaults (without env):

- iOS simulator → `http://127.0.0.1:8000`
- Android emulator → `http://10.0.2.2:8000`
## App flow

1. Launch creates a local `device_id` and registers with the backend (optional Expo push token)
2. **Watchlist** shows deals like a tape/board (ticker, last price, % off, match score)
3. Pull to refresh → `POST /refresh` (Amazon `/deals-v2` + keyword search, Costco `/search`)
4. **Filters** save keywords, min discount, max price, retailers, country, alerts
5. Strong matches (score ≥ `MATCH_ALERT_THRESHOLD`, default 70) can trigger Expo push

## API overview

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/deals?device_id=` | Watchlist with match scores |
| GET | `/deals/{id}` | Deal detail |
| GET/PUT | `/preferences/{device_id}` | Preference filters |
| POST | `/devices/register` | Store Expo push token |
| POST | `/refresh` | Fetch live retailer data + alert |

## Project layout

```
backend/
  adapters/          # amazon_openwebninja.py, costco_openwebninja.py
  app/               # FastAPI models, matcher, routers, push
mobile/
  src/               # Expo screens, api client, theme
web/
  src/               # Kiosk market board
docker-compose.yml   # api (:8000) + web (:8080)
```
