# RideSync — System Design

## 1. What is RideSync?

RideSync is a real-time bus tracking system built for college students who are tired of waiting at a bus stop not knowing when the bus will arrive. It solves two distinct problems at once:

- **For students**: Know exactly where the bus is and how many minutes away each stop is — from a browser, no download needed.
- **For drivers**: A dead-simple native app where they build their route once and then just tap START every morning. No complex navigation, no config.

The architecture was deliberately designed around one constraint: **drivers are non-technical**. The entire UX must survive a first-time smartphone user.

---

## 2. System Architecture Overview

```mermaid
graph TB
    subgraph Driver["🚗 Driver App (React Native / Expo)"]
        DA_Login[Login / Signup Screen]
        DA_RouteBuilder[Route Builder Screen]
        DA_Transmit[Transmitting Screen]
        DA_LocationSvc[Background Location Service]
        DA_OfflineQ[Offline Queue — AsyncStorage]
    end

    subgraph Student["🌐 Student Web App (Next.js)"]
        SW_Home[Home Page — Enter Driver ID]
        SW_Track[Track Page — /track/DRV001]
        SW_Map[LiveMap Component — Leaflet/OSM]
        SW_Stops[StopList + ETA Component]
        SW_StatusBar[BusStatusBar Component]
    end

    subgraph Supabase["☁️ Supabase (Backend)"]
        SB_Auth[Auth — Driver Login/Register]
        SB_DB[(PostgreSQL Database)]
        SB_RT[Realtime Broadcast Channels]
        SB_RLS[Row Level Security Policies]
    end

    DA_Login -->|Supabase Auth| SB_Auth
    DA_RouteBuilder -->|Insert routes + stops| SB_DB
    DA_Transmit -->|Create trip row| SB_DB
    DA_LocationSvc -->|Broadcast location_update event| SB_RT
    DA_LocationSvc -->|Queue if offline| DA_OfflineQ
    DA_OfflineQ -->|Bulk flush on reconnect| SB_DB
    DA_LocationSvc -->|Heartbeat every 5 min| SB_DB

    SW_Home -->|Navigate with driver code| SW_Track
    SW_Track -->|Lookup driver by short_code| SB_DB
    SW_Track -->|Lookup active trip + route + stops| SB_DB
    SW_Track -->|Subscribe to trip channel| SB_RT
    SB_RT -->|Push location_update| SW_Track
    SW_Track --> SW_Map
    SW_Track --> SW_Stops
    SW_Track --> SW_StatusBar
```

---

## 3. Data Model

```mermaid
erDiagram
    DRIVERS {
        uuid id PK
        text name
        text short_code UK "e.g. DRV001 auto-generated"
        uuid auth_id FK "links to Supabase Auth"
        timestamptz created_at
    }

    ROUTES {
        uuid id PK
        uuid driver_id FK
        text name
        text color "hex color for map display"
        timestamptz created_at
    }

    STOPS {
        uuid id PK
        uuid route_id FK
        text name
        float8 lat
        float8 lng
        int order_index "sequence of stops along the route"
        timestamptz created_at
    }

    TRIPS {
        uuid id PK
        uuid driver_id FK
        uuid route_id FK
        text status "active or completed or cancelled"
        timestamptz last_heartbeat "stale-trip detection"
        timestamptz started_at
        timestamptz ended_at
    }

    TRIP_LOCATIONS {
        uuid id PK
        uuid trip_id FK
        float8 lat
        float8 lng
        float8 heading
        float8 speed "m/s from device GPS"
        timestamptz recorded_at
    }

    DRIVERS ||--o{ ROUTES : "owns"
    ROUTES ||--o{ STOPS : "has"
    DRIVERS ||--o{ TRIPS : "drives"
    ROUTES ||--o{ TRIPS : "followed in"
    TRIPS ||--o{ TRIP_LOCATIONS : "logs"
```

**Key design decisions:**
- Routes are **driver-owned** — no admin/org layer needed. Drivers self-register.
- Stops are stored as **ordered GPS coordinates** (lat/lng + order_index), not street addresses. The driver physically stands at each stop and taps "Add Here".
- `TRIP_LOCATIONS` stores historical GPS log, but **live location is NOT written to DB every ping** — it is broadcast via Supabase Realtime channels, keeping database costs near zero.
- `last_heartbeat` enables a scheduled Postgres function (`complete_stale_trips()`) to auto-close trips where the driver closed the app without tapping STOP.

---

## 4. Driver App Flow

```mermaid
sequenceDiagram
    participant D as Driver
    participant App as Driver App
    participant Auth as Supabase Auth
    participant DB as Supabase DB
    participant RT as Supabase Realtime

    D->>App: Opens app for the first time
    App->>Auth: Register (name, email, password)
    Auth-->>DB: Creates auth user
    DB-->>App: Returns driver profile with short_code (DRV001)
    App-->>D: Shows short_code — "Share this with students"

    D->>App: Tap "Create New Route"
    loop For each bus stop
        D->>App: Types stop name
        D->>App: Stands at stop, taps "Add Here"
        App->>App: GPS.getCurrentPosition()
        App-->>D: Stop pinned with lat/lng
    end
    D->>App: Tap "Save Route and Continue"
    App->>DB: INSERT route + stops (ordered by index)

    D->>App: Next morning: tap START
    App->>DB: INSERT trip (status = active)
    App->>App: startLocationUpdatesAsync (background task)
    loop Every 5 seconds while driving
        App->>RT: broadcast location_update with lat, lng, heading, speed
        alt No network
            App->>App: addToOfflineQueue (AsyncStorage)
        end
        alt Network restored
            App->>DB: bulk INSERT trip_locations (flush queue)
        end
    end
    loop Every 5 minutes
        App->>DB: UPDATE trips SET last_heartbeat = now()
    end
    D->>App: Tap STOP
    App->>DB: UPDATE trip SET status = completed, ended_at = now()
    App->>App: stopLocationUpdatesAsync
```

---

## 5. Student Web App Flow

```mermaid
sequenceDiagram
    participant S as Student
    participant Web as Student Web App
    participant DB as Supabase DB
    participant RT as Supabase Realtime

    S->>Web: Opens URL in browser
    Web->>Web: Check localStorage for saved driver code
    alt Saved code found
        Web->>Web: Navigate directly to /track/DRV001
    else No saved code
        Web-->>S: Show home page — Enter Driver ID
        S->>Web: Types DRV001, taps Track My Bus
        Web->>Web: Save DRV001 to localStorage
        Web->>Web: Navigate to /track/DRV001
    end

    Web->>DB: SELECT driver WHERE short_code = DRV001
    DB-->>Web: id, name, short_code

    Web->>DB: SELECT trip WHERE driver_id = id AND status = active
    DB-->>Web: trip_id, route_id, started_at

    Web->>DB: SELECT route WHERE id = route_id
    Web->>DB: SELECT stops WHERE route_id = route_id ORDER BY order_index

    Web->>RT: subscribe to channel trip:{trip_id}
    loop On every location_update broadcast
        RT-->>Web: lat, lng, heading, speed, timestamp
        Web->>Web: Update bus marker on map
        Web->>Web: Recalculate ETA to each stop (Haversine)
        Web-->>S: Render live map + updated ETAs
    end

    alt No active trip
        Web->>Web: Poll DB every 30s for trip to start
        Web-->>S: "Driver hasn't started yet. Auto-updates when they begin."
    end
```

---

## 6. Real-Time Location Pipeline

```mermaid
flowchart LR
    subgraph Phone["Driver's Phone"]
        GPS[OS GPS Sensor]
        BG[Expo TaskManager Background Task]
        AStorage[AsyncStorage Offline Queue]
    end

    subgraph Supabase["Supabase Cloud"]
        RT_Channel["Realtime Channel trip:{trip_id}"]
        DB_Log["trip_locations table historical GPS log"]
    end

    subgraph Students["Student Browsers"]
        S1[Student 1]
        S2[Student 2]
        S3[Student N]
    end

    GPS -->|location event every 5s / 10m| BG
    BG -->|broadcast location_update| RT_Channel
    BG -->|if offline: push| AStorage
    AStorage -->|on reconnect: bulk INSERT| DB_Log
    BG -->|heartbeat every 5min| DB_Log
    RT_Channel -->|WebSocket push| S1
    RT_Channel -->|WebSocket push| S2
    RT_Channel -->|WebSocket push| S3
```

**Key behaviour:**
- Location is **broadcast-only** (not persisted) during live trips → sub-100ms latency, $0 database write cost per ping.
- The offline queue (`AsyncStorage`) absorbs location events during cellular dead zones. Events are bulk-flushed to `trip_locations` when connectivity returns.
- Heartbeat writes to the DB every 5 minutes so the scheduled `complete_stale_trips()` function can auto-close abandoned trips.

---

## 7. ETA Calculation

```mermaid
flowchart TD
    A[Receive location_update with lat, lng, speed] --> B{Speed available and speed > 2 km/h?}
    B -->|Yes| C[Use GPS speed]
    B -->|No| D[Default: 30 km/h]
    C --> E[For each stop: Haversine distance km]
    D --> E
    E --> F[ETA minutes = distance divided by speed multiplied by 60]
    F --> G[Format: Arriving now or N mins away or Nh Nm away]
    G --> H[Render in StopList + BusStatusBar]
```

**Note:** The bus does NOT follow the shortest path — it follows the actual road including complex intersections and multi-turn routes. ETAs recalculate from the bus's **live GPS position** to each stop. We use the public **OSRM routing API** for accurate driving times. Because the public OSRM server has rate limits, the web app restricts network ETA requests (e.g. max once per 15 seconds) and falls back to Haversine straight-line distance if the API fails or limits are exceeded. No turn-by-turn routing engine dependency needed on the device.

---

## 8. Security Model (Row Level Security)

| Table | Public SELECT | Driver INSERT/UPDATE/DELETE |
|---|---|---|
| `drivers` | Anyone can look up a driver by short_code | Own row only (auth.uid = auth_id) |
| `routes` | Anyone can read routes | Own routes only |
| `stops` | Anyone can read stops | Own stops only (via route ownership) |
| `trips` | Anyone can see active trips | Own trips only |
| `trip_locations` | Not exposed (historical only) | Own trips only |

Students access driver data **without any authentication** — they just enter a Driver ID. No signup, no session, no token. This is intentional to minimize friction.

---

## 9. Tech Stack Summary

| Layer | Technology | Rationale |
|---|---|---|
| Driver App | React Native (Expo) | Cross-platform iOS + Android, background GPS via expo-location + expo-task-manager |
| Student Web App | Next.js (App Router) | No download, works in any browser, PWA-ready |
| Maps | Leaflet + OpenStreetMap | Free, no API key, excellent mobile performance |
| Backend / DB | Supabase (PostgreSQL) | Realtime WebSockets, Auth, RLS — all managed, free tier |
| Live Broadcast | Supabase Realtime Broadcast | Sub-100ms, no DB writes per ping |
| Hosting | Vercel | One-click deploy for web app, free tier |
| Offline Cache | AsyncStorage (React Native) | Native key-value store for GPS queue during dead zones |
| ETA Engine | Custom Haversine (TypeScript) | Zero dependency, fast, works offline in browser |

---

## 10. File Structure

```
RIDESYNC/
├── apps/
│   ├── driver/                             # React Native (Expo) — Driver app
│   │   ├── App.tsx                         # Root navigator (Login → RouteBuilder → Transmitting)
│   │   ├── src/
│   │   │   ├── screens/
│   │   │   │   ├── LoginScreen.tsx         # Auth — email/password login
│   │   │   │   ├── SignUpScreen.tsx        # Auth — registration + short_code display
│   │   │   │   ├── RouteBuilderScreen.tsx  # Create/select routes + pin stops at GPS location
│   │   │   │   ├── RouteSelectScreen.tsx   # Alternate route picker (legacy)
│   │   │   │   └── TransmittingScreen.tsx  # START/STOP button + trip status
│   │   │   └── lib/
│   │   │       ├── locationService.ts      # Core: background GPS, broadcast, offline queue, heartbeat
│   │   │       ├── supabase.ts             # Supabase client (driver app)
│   │   │       └── storage.ts              # AsyncStorage helpers (driver profile, last route)
│   │   └── eas.json                        # Expo Application Services build config
│   │
│   └── web/                                # Next.js — Student web app
│       └── src/
│           ├── app/
│           │   ├── page.tsx                # Home: enter Driver ID
│           │   └── track/[driverCode]/
│           │       └── page.tsx            # Live tracker: map + stops + ETAs
│           ├── components/
│           │   ├── LiveMap.tsx             # Leaflet map with bus marker + stop pins
│           │   ├── StopList.tsx            # Ordered stop list with live ETAs
│           │   └── BusStatusBar.tsx        # Live/Offline badge + speed + last-seen
│           └── lib/
│               ├── supabase.ts             # Supabase client + TypeScript types
│               ├── eta.ts                  # Haversine, ETA calculation, speed/time formatters
│               └── storage.ts              # localStorage helpers (saved driver code)
│
└── supabase/
    └── schema.sql                          # Full DB schema: tables, RLS policies, helper functions
```

---

## 11. Known Challenges & Mitigations

| Challenge | Mitigation |
|---|---|
| Battery drain on driver's phone | distanceInterval: 10m — only fires when bus moves. Expo TaskManager handles OS-level battery optimisation. |
| Cellular dead zones | AsyncStorage offline queue — coordinates saved locally, bulk-flushed on reconnect. |
| Driver closes app without tapping STOP | last_heartbeat + complete_stale_trips() Postgres function — auto-closes trip after 30 min of silence. Run via pg_cron or Supabase Edge Function. |
| Bus takes detours (not shortest path) | Routes are stop-sequences, not turn-by-turn paths. ETA recalculates from live GPS position always. Students visually see the detour on the map. |
| OSRM Rate Limits | The public free OSRM API is used for accurate ETAs, but can rate limit if spammed. The web app fetches ETAs sequentially and caches them for 15s. If rate limits are hit, it gracefully falls back to the local Haversine (straight-line) calculation. |
| Driver unfamiliar with phones | One-screen UX: just a big START/STOP button. Route is remembered from last session. |
| Multiple students subscribing at once | Supabase Realtime fan-out handles N subscribers on one broadcast channel — no per-student cost. |
