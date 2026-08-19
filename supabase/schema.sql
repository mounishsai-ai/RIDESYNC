-- RideSync Database Schema (v2 — Simplified)
-- Supabase / PostgreSQL
--
-- Design principle: No admin needed.
-- Drivers self-register and create their own routes.
-- Students just enter a Driver Short Code to track their bus.

-- ─── Short Code Generator ─────────────────────────────────────────────────────
-- Automatically generates codes like DRV001, DRV002, etc. for new drivers.

CREATE SEQUENCE IF NOT EXISTS driver_short_code_seq START 1;

CREATE OR REPLACE FUNCTION generate_driver_short_code()
RETURNS TEXT AS $$
BEGIN
  RETURN 'DRV' || LPAD(nextval('driver_short_code_seq')::TEXT, 3, '0');
END;
$$ LANGUAGE plpgsql;

-- ─── Tables ───────────────────────────────────────────────────────────────────

-- 1. Drivers
CREATE TABLE IF NOT EXISTS drivers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  short_code TEXT UNIQUE NOT NULL DEFAULT generate_driver_short_code(),
  auth_id UUID UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL
);

-- 2. Routes (owned by a driver, no org/admin needed)
CREATE TABLE IF NOT EXISTS routes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  driver_id UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#10B981',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL
);

-- 3. Stops (pinned by driver at their physical location)
CREATE TABLE IF NOT EXISTS stops (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  route_id UUID NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  order_index INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL
);

-- 4. Trips
CREATE TABLE IF NOT EXISTS trips (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  driver_id UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  route_id UUID NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
  last_heartbeat TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),
  started_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL,
  ended_at TIMESTAMP WITH TIME ZONE
);

-- 5. Trip Locations (historical GPS log — live data streams over Realtime, not written every ping)
CREATE TABLE IF NOT EXISTS trip_locations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  heading DOUBLE PRECISION,
  speed DOUBLE PRECISION,
  recorded_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL
);

-- ─── Stale Trip Auto-Complete ─────────────────────────────────────────────────
-- If a driver closes the app without tapping STOP, their trip stays "active".
-- This function marks trips as completed if no heartbeat in 30 minutes.
-- Call it from a pg_cron job or a Supabase Edge Function on a schedule.

CREATE OR REPLACE FUNCTION complete_stale_trips()
RETURNS void AS $$
BEGIN
  UPDATE trips
  SET status = 'completed', ended_at = now()
  WHERE status = 'active'
    AND last_heartbeat < now() - INTERVAL '30 minutes';
END;
$$ LANGUAGE plpgsql;

-- To automatically run this every 10 minutes, you can use pg_cron (if enabled in your Supabase project):
-- 1. Enable the extension:
--    CREATE EXTENSION IF NOT EXISTS pg_cron;
-- 2. Schedule the job:
--    SELECT cron.schedule('complete_stale_trips_job', '*/10 * * * *', 'SELECT complete_stale_trips();');

-- ─── Row Level Security ───────────────────────────────────────────────────────

ALTER TABLE drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE stops ENABLE ROW LEVEL SECURITY;
ALTER TABLE trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE trip_locations ENABLE ROW LEVEL SECURITY;

-- Public reads (students look up drivers, routes, stops, and active trips without login)
CREATE POLICY "drivers_public_read" ON drivers FOR SELECT USING (true);
CREATE POLICY "routes_public_read" ON routes FOR SELECT USING (true);
CREATE POLICY "stops_public_read" ON stops FOR SELECT USING (true);
CREATE POLICY "trips_public_read" ON trips FOR SELECT USING (true);

-- Drivers can insert their own profile row after registering via Supabase Auth
CREATE POLICY "drivers_insert_own" ON drivers
  FOR INSERT WITH CHECK (auth.uid() = auth_id);

CREATE POLICY "drivers_update_own" ON drivers
  FOR UPDATE USING (auth.uid() = auth_id);

-- Drivers can manage their own routes
CREATE POLICY "routes_insert_own" ON routes
  FOR INSERT WITH CHECK (
    auth.uid() = (SELECT auth_id FROM drivers WHERE id = driver_id)
  );

CREATE POLICY "routes_update_own" ON routes
  FOR UPDATE USING (
    auth.uid() = (SELECT auth_id FROM drivers WHERE id = driver_id)
  );

CREATE POLICY "routes_delete_own" ON routes
  FOR DELETE USING (
    auth.uid() = (SELECT auth_id FROM drivers WHERE id = driver_id)
  );

-- Drivers can manage stops on their own routes
CREATE POLICY "stops_insert_own" ON stops
  FOR INSERT WITH CHECK (
    auth.uid() = (
      SELECT d.auth_id FROM drivers d
      JOIN routes r ON r.driver_id = d.id
      WHERE r.id = route_id
    )
  );

CREATE POLICY "stops_delete_own" ON stops
  FOR DELETE USING (
    auth.uid() = (
      SELECT d.auth_id FROM drivers d
      JOIN routes r ON r.driver_id = d.id
      WHERE r.id = route_id
    )
  );

-- Drivers can manage their own trips
CREATE POLICY "trips_manage_own" ON trips
  FOR ALL USING (
    auth.uid() = (SELECT auth_id FROM drivers WHERE id = driver_id)
  );
