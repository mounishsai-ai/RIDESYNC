// Supabase client for the web app

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ─── Types matching schema v2 ─────────────────────────────────────────────────

export interface Driver {
  id: string;
  name: string;
  short_code: string;
}

export interface Route {
  id: string;
  name: string;
  color: string | null;
  driver_id: string;
}

export interface Stop {
  id: string;
  name: string;
  lat: number;
  lng: number;
  order_index: number;
  route_id: string;
}

export interface Trip {
  id: string;
  route_id: string;
  driver_id: string;
  status: 'active' | 'completed' | 'cancelled';
  started_at: string;
}

export interface LiveLocation {
  lat: number;
  lng: number;
  heading: number | null;
  speed: number | null;   // m/s from GPS
  timestamp: number;
  driver_id: string;
}
