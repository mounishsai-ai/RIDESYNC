'use client';

// Live Tracker Page — /track/[driverCode]
//
// Student flow:
//   1. Look up driver by their short_code (e.g. "DRV001")
//   2. Find their active trip → get the route + stops
//   3. Subscribe to Supabase Realtime for live location broadcast
//   4. Show map + stop list with ETAs

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { supabase, Driver, Route, Stop, Trip, LiveLocation } from '@/lib/supabase';
import { clearPreferences } from '@/lib/storage';
import BusStatusBar from '@/components/BusStatusBar';
import StopList from '@/components/StopList';
import LanguageToggle from '@/components/LanguageToggle';
import { etaMinutes } from '@/lib/eta';

const LiveMap = dynamic(() => import('@/components/LiveMap'), { ssr: false });

export default function TrackPage() {
  const { driverCode } = useParams<{ driverCode: string }>();
  const router = useRouter();

  const [driver, setDriver] = useState<Driver | null>(null);
  const [route, setRoute] = useState<Route | null>(null);
  const [stops, setStops] = useState<Stop[]>([]);
  const [activeTrip, setActiveTrip] = useState<Trip | null>(null);
  const [busLocation, setBusLocation] = useState<LiveLocation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ─── 1. Look up driver by short_code ─────────────────────────────────────
  useEffect(() => {
    if (!driverCode) return;

    async function fetchData() {
      // Find driver
      const { data: driverData, error: driverErr } = await supabase
        .from('drivers')
        .select('id, name, short_code')
        .eq('short_code', driverCode.toUpperCase())
        .single();

      if (driverErr || !driverData) {
        setError(`No driver found with code "${driverCode}". Double-check the ID and try again.`);
        setLoading(false);
        return;
      }
      setDriver(driverData);

      // Find their active trip
      const { data: tripData } = await supabase
        .from('trips')
        .select('id, route_id, driver_id, status, started_at')
        .eq('driver_id', driverData.id)
        .eq('status', 'active')
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (tripData) {
        setActiveTrip(tripData);

        // Get route
        const { data: routeData } = await supabase
          .from('routes')
          .select('id, name, color, driver_id')
          .eq('id', tripData.route_id)
          .single();
        setRoute(routeData || null);

        // Get stops
        const { data: stopsData } = await supabase
          .from('stops')
          .select('id, name, lat, lng, order_index, route_id')
          .eq('route_id', tripData.route_id)
          .order('order_index');
        setStops(stopsData || []);
      }

      setLoading(false);
    }

    fetchData();
  }, [driverCode]);

  // ─── 2. Subscribe to live location via Supabase Realtime ─────────────────
  useEffect(() => {
    if (!activeTrip) return;

    const channel = supabase.channel(`trip:${activeTrip.id}`)
      .on('broadcast', { event: 'location_update' }, (payload) => {
        const loc = payload.payload as LiveLocation;
        setBusLocation({ ...loc, timestamp: loc.timestamp || Date.now() });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [activeTrip]);

  // ─── 3. Poll every 30s for trip to become active ──────────────────────────
  useEffect(() => {
    if (activeTrip || loading || !driver) return;

    const interval = setInterval(async () => {
      const { data: tripData } = await supabase
        .from('trips')
        .select('id, route_id, driver_id, status, started_at')
        .eq('driver_id', driver.id)
        .eq('status', 'active')
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!tripData) return;
      setActiveTrip(tripData);

      const { data: routeData } = await supabase
        .from('routes')
        .select('id, name, color, driver_id')
        .eq('id', tripData.route_id)
        .single();
      setRoute(routeData || null);

      const { data: stopsData } = await supabase
        .from('stops')
        .select('id, name, lat, lng, order_index, route_id')
        .eq('route_id', tripData.route_id)
        .order('order_index');
      setStops(stopsData || []);
    }, 30000);

    return () => clearInterval(interval);
  }, [activeTrip, loading, driver]);

  const closestStopEta = useCallback((): number | null => {
    if (!busLocation || stops.length === 0) return null;
    return etaMinutes(
      { lat: busLocation.lat, lng: busLocation.lng },
      { lat: stops[0].lat, lng: stops[0].lng },
      busLocation.speed != null ? busLocation.speed * 3.6 : null
    );
  }, [busLocation, stops]);

  function handleChangeDriver() {
    clearPreferences();
    router.push('/');
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-base)' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '40px', marginBottom: '12px' }}>🚌</div>
          <p style={{ color: 'var(--text-muted)', fontSize: '15px' }}>Looking up driver <strong style={{ color: 'var(--text-secondary)' }}>{driverCode}</strong>…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-base)', padding: '24px' }}>
        <div style={{ textAlign: 'center', maxWidth: '400px' }}>
          <div style={{ fontSize: '40px', marginBottom: '16px' }}>🔍</div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '16px', marginBottom: '24px', lineHeight: 1.6 }}>{error}</p>
          <button
            onClick={handleChangeDriver}
            style={{ padding: '12px 28px', background: '#10B981', color: '#fff', border: 'none', borderRadius: '10px', fontSize: '15px', fontWeight: '600', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  const routeColor = route?.color || '#10B981';

  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg-base)', display: 'flex', flexDirection: 'column' }}>
      {/* Nav */}
      <nav style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 24px',
        background: 'var(--bg-card)',
        borderBottom: '1px solid var(--border)',
        position: 'sticky', top: 0, zIndex: 100,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '20px' }}>🚌</span>
          <div>
            <span style={{ fontSize: '17px', fontWeight: '800', color: 'var(--text-primary)' }}>RideSync</span>
            {driver && (
              <span style={{ marginLeft: '10px', fontSize: '13px', color: 'var(--text-muted)', fontWeight: '500' }}>
                · {driver.name}
              </span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <LanguageToggle />
          <button
            onClick={handleChangeDriver}
            style={{
              padding: '8px 16px',
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              color: 'var(--text-secondary)',
              fontSize: '13px',
              fontWeight: '500',
              cursor: 'pointer',
              fontFamily: 'Inter, sans-serif',
            }}
          >
            Change Driver
          </button>
        </div>
      </nav>

      {/* Main grid */}
      <div
        className="track-layout"
        style={{ flex: 1, display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 360px', height: 'calc(100vh - 57px)' }}
      >
        {/* Map panel */}
        <div style={{ padding: '20px 12px 20px 20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <BusStatusBar busLocation={busLocation} closestStopEta={closestStopEta()} routeName={route?.name || ''} />
          <div style={{ flex: 1, minHeight: '300px' }}>
            <LiveMap stops={stops} busLocation={busLocation} routeColor={routeColor} />
          </div>
        </div>

        {/* Sidebar */}
        <div style={{
          borderLeft: '1px solid var(--border)',
          padding: '20px',
          overflowY: 'auto',
          background: 'var(--bg-card)',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}>
          {/* Driver & route header */}
          <div>
            <div style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text-muted)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '6px' }}>
              Tracking Driver
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
              <div style={{
                width: '36px', height: '36px', borderRadius: '50%',
                background: 'var(--bg-elevated)', border: '2px solid var(--border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '16px',
              }}>
                👤
              </div>
              <div>
                <div style={{ fontWeight: '600', fontSize: '15px', color: 'var(--text-primary)' }}>{driver?.name}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'monospace', letterSpacing: '1px' }}>{driverCode}</div>
              </div>
            </div>

            {route && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                padding: '10px 14px', borderRadius: '10px',
                background: `${routeColor}15`, border: `1px solid ${routeColor}30`,
              }}>
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: routeColor, flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Route</div>
                  <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)' }}>{route.name}</div>
                </div>
              </div>
            )}
          </div>

          {/* Stops */}
          {stops.length > 0 && (
            <div>
              <h2 style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '12px' }}>
                Stops &amp; ETAs
              </h2>
              <StopList stops={stops} busLocation={busLocation} routeColor={routeColor} />
            </div>
          )}

          {/* No active trip notice */}
          {!activeTrip && (
            <div style={{
              padding: '16px', borderRadius: '12px',
              background: 'rgba(245,158,11,0.08)',
              border: '1px solid rgba(245,158,11,0.25)',
              fontSize: '13px', color: '#F59E0B', lineHeight: 1.6,
            }}>
              🕐 <strong>{driver?.name}</strong> hasn&apos;t started a trip yet. This page auto-updates when they begin transmitting.
            </div>
          )}
        </div>
      </div>

      <style>{`
        @media (max-width: 768px) {
          .track-layout {
            grid-template-columns: 1fr !important;
            grid-template-rows: 55vh auto;
            height: auto !important;
          }
        }
      `}</style>
    </main>
  );
}
