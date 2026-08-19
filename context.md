# RideSync — Agent Context

> **Purpose:** This file is the handoff document for any agent (human or AI) continuing work on this project. Read this before touching any code. Update it when you make significant changes.

---

## What This Project Is

RideSync is a real-time bus tracking system for college students. The core problem: students wait at bus stops in the rain with no idea when the bus is coming.

**The two-sided solution:**

| Actor | What they do | Platform |
|---|---|---|
| Driver | Logs in → builds route by pinning stops at their physical GPS location → taps START → drives | React Native app (Expo) |
| Student | Opens a website → types driver's short code (e.g. `DRV001`) → sees live bus on map + ETAs | Next.js web app (browser) |

**Critical design constraint:** Drivers are non-technical. The entire driver UX must be usable by someone who barely uses a smartphone. One button. That's it.

---

## Current State (as of 2026-08-18)

### What's Built & Working
- ✅ Driver app: Login, Signup, Route Builder (GPS stop pinning), Transmitting screen (START/STOP)
- ✅ Background GPS tracking via `expo-location` + `expo-task-manager` (works with screen locked)
- ✅ Supabase Realtime broadcast — location pushed to students sub-100ms, zero DB writes per ping
- ✅ Offline queue — GPS coords saved to `AsyncStorage` during dead zones, bulk-flushed on reconnect
- ✅ Heartbeat system — trips auto-close after 30 min silence (driver forgot to tap STOP)
- ✅ Student web app: enter Driver ID → live map (Leaflet/OSM) + stop list + ETA per stop
- ✅ Auto-redirect — saved Driver ID in localStorage, instant reload next visit
- ✅ 30s polling fallback — if no active trip, web app polls until driver starts
- ✅ Database schema with RLS — public reads, auth-gated writes per driver
- ✅ **ETA Accuracy:** OSRM routing API integrated for real road ETAs, with strict sequential fetching, 15s caching, and seamless fallback to Haversine if rate limits are hit.
- ✅ **Stop Reordering:** Drivers can now move stops ↑ and ↓ in the Route Builder.
- ✅ **RTL Support:** Dynamic RTL language toggling implemented in the web app.
- ✅ **Driver UX:** `short_code` (e.g. DRV001) is now prominently displayed in a green banner on the Transmitting screen so drivers know what to share.
- ✅ **Local Testing Tunnel:** `@expo/ngrok` installed locally to fix Windows tunneling issues.
- ✅ **Map-Based Stop Picking:** Route Builder replaced with a full-screen MapView. Driver taps on the map to place stops (no physical GPS presence needed). Road geometry polyline previews the route in real-time.
- ✅ **Road-Following Polyline:** Both the driver route builder and the student LiveMap now show the actual road path between stops (OSRM GeoJSON geometry), not straight dashed lines.

### What's NOT Built Yet (Known Gaps)
- ❌ No push notifications (student gets no alert when bus is approaching their stop)
- ❌ No dark mode verification on iOS Safari
- ❌ No offline map tile caching for students in poor-coverage areas
- ❌ No admin dashboard — currently no org/institution layer. Each driver is self-contained
- ❌ No multi-route support per trip (driver always follows one route at a time)
- ❌ No student account system — completely anonymous by design

---

## Architecture in One Paragraph

Driver app (React Native/Expo) uses `expo-task-manager` to run a background task that fires every 5 seconds (or every 10 meters of movement). Each location event is broadcast over a **Supabase Realtime channel** named `trip:{trip_id}`. Student web apps subscribe to that channel via WebSocket and receive coordinates in real-time. The bus position is drawn on a Leaflet/OpenStreetMap map. ETAs are calculated client-side using the Haversine formula (straight-line distance ÷ current speed). No server-side code runs during a live trip — everything is Supabase Realtime fan-out.

For the full diagram, see [`system_design.md`](./system_design.md).

---

## Repo Structure

```
RIDESYNC/
├── apps/
│   ├── driver/          # React Native (Expo) — driver-facing native app
│   └── web/             # Next.js — student-facing web app
├── supabase/
│   └── schema.sql       # PostgreSQL schema + RLS policies + helper functions
├── system_design.md     # Complete system design with Mermaid diagrams
└── context.md           # THIS FILE — agent handoff context
```

---

## Key Files to Know

### Driver App (`apps/driver/`)

| File | What it does |
|---|---|
| `App.tsx` | Root navigator — switches between Login, RouteBuilder, Transmitting screens based on auth state |
| `src/screens/LoginScreen.tsx` | Email/password login via Supabase Auth |
| `src/screens/SignUpScreen.tsx` | Registration — creates auth user + driver profile row + displays auto-generated short_code |
| `src/screens/RouteBuilderScreen.tsx` | **Main setup screen.** Full-screen MapView. Driver taps the map to pin stops (no physical presence needed). Shows OSRM road polyline preview between stops. Saves route + stops to Supabase. |
| `src/screens/TransmittingScreen.tsx` | **Daily use screen.** Big START/STOP button. Creates trip row, starts background tracking, shows elapsed time + LIVE indicator. |
| `src/lib/locationService.ts` | **Core service.** Background GPS task definition, broadcast logic, offline queue (AsyncStorage), heartbeat, permission requests. Read this before touching location logic. |
| `src/lib/supabase.ts` | Supabase client for driver app (uses `EXPO_PUBLIC_SUPABASE_*` env vars) |
| `src/lib/storage.ts` | AsyncStorage helpers: save/load driver profile, last selected route |

### Student Web App (`apps/web/`)

| File | What it does |
|---|---|
| `src/app/page.tsx` | Landing page. Input field for Driver ID. Saves to localStorage. Redirects to `/track/[code]`. |
| `src/app/track/[driverCode]/page.tsx` | **Main tracking page.** Looks up driver → active trip → route → stops → subscribes to Realtime channel → renders map + sidebar. |
| `src/components/LiveMap.tsx` | Leaflet map (dynamically imported, SSR disabled). Renders bus marker + numbered stop pins. |
| `src/components/StopList.tsx` | Ordered list of stops with live ETA countdown per stop. |
| `src/components/BusStatusBar.tsx` | Top status strip: LIVE/OFFLINE badge, route name, current speed, last-seen timestamp. |
| `src/lib/supabase.ts` | Supabase client + TypeScript type definitions for Driver, Route, Stop, Trip, LiveLocation. |
| `src/lib/eta.ts` | Pure functions: `haversineKm`, `etaMinutes`, `formatEta`, `formatSpeed`, `formatLastSeen`. |
| `src/lib/storage.ts` | localStorage helpers: `getPreferences`, `savePreferences`, `clearPreferences`. |

### Backend (`supabase/`)

| File | What it does |
|---|---|
| `schema.sql` | Full DB schema. Run this once in Supabase SQL Editor. Includes: tables, short_code auto-generator, RLS policies, `complete_stale_trips()` function. |

---

## Database Tables (Quick Reference)

| Table | Purpose |
|---|---|
| `drivers` | One row per driver. Has `short_code` (e.g. DRV001), `auth_id` linking to Supabase Auth |
| `routes` | Named routes owned by a driver. Has `color` (hex) for map display |
| `stops` | GPS coordinates (lat/lng) with `order_index`. Driver pins these physically at each bus stop |
| `trips` | Active/completed instances of a driver running a route. `status` = active/completed/cancelled |
| `trip_locations` | Historical GPS breadcrumbs. Written only on reconnect-flush, NOT every live ping |

---

## How Live Location Works (Important — Don't Get Confused)

There are **two separate mechanisms** for location data:

1. **Live broadcast** (`Supabase Realtime`): Driver app sends to channel `trip:{trip_id}`. Students receive instantly. **Nothing is written to the database.** This is how the map updates in real-time.

2. **Historical log** (`trip_locations` table): Only written when the offline queue is flushed (driver reconnects after dead zone) or possibly at trip end. Used for future analytics/replay, not for live tracking.

Do NOT try to poll `trip_locations` for live location — it won't have real-time data.

---

## Environment Variables

### Driver App (`apps/driver/.env`)
```
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJ...
EAS_PROJECT_ID=your-eas-project-id
```

### Web App (`apps/web/.env.local`)
```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

---

## Running Locally

```bash
# Web app (student-facing)
cd apps/web
npm install
npm run dev
# → http://localhost:3000

# Driver app (need Android/iOS device or Expo Go)
cd apps/driver
npm install
npx expo start
# Scan QR with Expo Go app
```

---

## Supabase Setup & Local Testing Workarounds

1. Create project at supabase.com
2. SQL Editor → paste contents of `supabase/schema.sql` → Run
3. Copy Project URL + Anon Key into `.env` files above
4. Enable Realtime for tables: `drivers`, `routes`, `stops`, `trips` (Settings → Replication)
5. Optional: Set up pg_cron to call `complete_stale_trips()` every 10 minutes

**⚠️ IMPORTANT LOCAL TESTING WORKAROUND (Auth Rate Limits):**
Supabase free tier now permanently enforces email confirmations and limits emails to 3 per hour per IP. To test locally without getting blocked:
1. Do not use the app's "Sign Up" screen.
2. In Supabase Dashboard → **Authentication** → **Users**, click **Add User** and create an account with **Auto Confirm User** checked.
3. In the SQL Editor, manually create their driver profile: `INSERT INTO public.drivers (auth_id, name) SELECT id, 'Driver Name' FROM auth.users;`
4. Use the app's **Login** screen to log in with that email. Logins do not count toward the rate limit.

---

## Short Code System

Drivers get codes like `DRV001`, `DRV002`, etc. — auto-generated by a Postgres sequence + function:

```sql
CREATE SEQUENCE driver_short_code_seq START 1;

CREATE FUNCTION generate_driver_short_code()
RETURNS TEXT AS $$
  RETURN 'DRV' || LPAD(nextval('driver_short_code_seq')::TEXT, 3, '0');
$$ LANGUAGE plpgsql;
```

Students enter this code in the web app. It's the only "token" needed — no QR code, no link, just a 6-character string the driver can read aloud or write on a whiteboard.

---

## RLS Policy Summary

- **Public read** on `drivers`, `routes`, `stops`, `trips` — students need no auth at all
- **Auth-gated write** — drivers can only insert/update/delete their own rows
- `trip_locations` has no public read policy — it's backend-only

---

## What to Work On Next (Suggested Priorities)

1. **Push notifications** — notify student when bus is within X minutes of their stop. Needs Expo Push Notifications on driver app + a notification trigger (Edge Function or pg_cron).
2. **Offline map tile caching** — for students in poor-coverage areas.
3. **Admin dashboard** — for schools/institutions to manage multiple drivers and routes centrally.

---

## Conventions & Code Style

- TypeScript everywhere — no `any`
- Functional components + hooks only
- One component per file
- Comments explain *why*, not *what*
- Colors: primary green `#10B981`, dark bg `#0F172A`, card bg `#1E293B`, border `#334155`
- Driver app text palette: primary `#F1F5F9`, secondary `#94A3B8`, muted `#64748B`

---

## Last Agent Action (2026-08-18)

- Implemented OSRM ETAs with rate-limit mitigation (sequential fetching, caching, Haversine fallback)
- Implemented Stop reordering in the Driver App
- Added dynamic RTL language support to the Web App
- Added `pg_cron` commands for stale trips to `schema.sql`
- Fixed `@expo/ngrok` Windows tunneling by installing it as a local dev dependency
- Updated `App.tsx`, `storage.ts`, and `TransmittingScreen.tsx` to prominently display the auto-generated `short_code` (e.g. DRV001) to the driver after login.
- Documented Supabase free-tier Auth rate limit workarounds.
- **Rewrote `RouteBuilderScreen.tsx`:** Replaced GPS-based stop pinning with a full-screen `react-native-maps` MapView. Driver taps anywhere on the map to place stops. A bottom sheet prompts for the stop name. An OSRM road polyline previews the route live as stops are added.
- **Added `fetchOsrmRoadGeometry()` to `apps/web/src/lib/eta.ts`:** Fetches GeoJSON road geometry from OSRM for a sequence of stops. Falls back to straight lines on error.
- **Updated `LiveMap.tsx`:** Student tracking map now shows the actual road path between stops (solid polyline, OSRM geometry). A straight dashed placeholder renders immediately on load, then gets swapped for the road geometry once the OSRM response arrives.
- **Installed `react-native-maps`** in `apps/driver` as an Expo SDK 57-compatible dependency.
