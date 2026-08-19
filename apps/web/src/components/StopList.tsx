'use client';

// Stop List Panel
// Shows the ordered list of stops and the ETA to each one from the bus's current position.

import { useEffect, useState, useRef } from 'react';
import { Stop, LiveLocation } from '@/lib/supabase';
import { etaMinutes, formatEta, haversineKm, fetchOsrmEta } from '@/lib/eta';

interface Props {
  stops: Stop[];
  busLocation: LiveLocation | null;
  routeColor: string;
}

export default function StopList({ stops, busLocation, routeColor }: Props) {
  const [etas, setEtas] = useState<Record<string, number>>({});
  const lastFetchRef = useRef<number>(0);

  // Fetch OSRM ETAs periodically when bus location updates
  useEffect(() => {
    if (!busLocation || stops.length === 0) return;

    const now = Date.now();
    // Only fetch OSRM every 15 seconds to avoid rate limits
    if (now - lastFetchRef.current < 15000 && Object.keys(etas).length > 0) {
      return;
    }

    let isMounted = true;
    lastFetchRef.current = now;

    const updateEtas = async () => {
      const newEtas: Record<string, number> = {};
      
      // Calculate ETA for each stop. We can do them in parallel or sequentially.
      // OSRM can take multiple coordinates, but our helper does point-to-point.
      // Doing them in parallel might hit rate limits if there are many stops.
      // We will do them sequentially to be safe, or just fall back to Haversine
      // immediately if one fails. Actually, Haversine is a good fallback for all
      // to render immediately, then overwrite with OSRM.
      
      // First, set fast Haversine ETAs for immediate feedback
      const fastEtas: Record<string, number> = {};
      stops.forEach(stop => {
        fastEtas[stop.id] = etaMinutes(
          { lat: busLocation.lat, lng: busLocation.lng },
          { lat: stop.lat, lng: stop.lng },
          busLocation.speed != null ? busLocation.speed * 3.6 : null
        );
      });
      
      if (isMounted) setEtas(fastEtas);

      // Then fetch accurate OSRM ETAs sequentially
      for (const stop of stops) {
        if (!isMounted) break;
        const eta = await fetchOsrmEta(
          { lat: busLocation.lat, lng: busLocation.lng },
          { lat: stop.lat, lng: stop.lng },
          busLocation.speed != null ? busLocation.speed * 3.6 : null
        );
        newEtas[stop.id] = eta;
      }

      if (isMounted) {
        setEtas(newEtas);
      }
    };

    updateEtas();

    return () => {
      isMounted = false;
    };
  }, [busLocation, stops]);

  if (stops.length === 0) {
    return (
      <div className="text-center py-8" style={{ color: 'var(--text-muted)' }}>
        No stops defined for this route.
      </div>
    );
  }

  // Find the "next" stop — the one closest to the bus (that the bus hasn't passed yet)
  let nextStopIndex = -1;
  if (busLocation) {
    let minDist = Infinity;
    stops.forEach((stop, i) => {
      const dist = haversineKm(
        { lat: busLocation.lat, lng: busLocation.lng },
        { lat: stop.lat, lng: stop.lng }
      );
      if (dist < minDist) {
        minDist = dist;
        nextStopIndex = i;
      }
    });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {stops.map((stop, index) => {
        const isNext = index === nextStopIndex;
        const eta = etas[stop.id] ?? null;

        return (
          <div
            key={stop.id}
            className="card-hover"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '12px 16px',
              borderRadius: '12px',
              background: isNext ? `${routeColor}15` : 'var(--bg-elevated)',
              border: `1px solid ${isNext ? routeColor : 'var(--border)'}`,
              transition: 'all 0.2s ease',
            }}
          >
            {/* Stop number badge */}
            <div
              style={{
                width: '28px',
                height: '28px',
                borderRadius: '50%',
                background: isNext ? routeColor : 'var(--bg-card)',
                border: `2px solid ${routeColor}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '11px',
                fontWeight: '700',
                color: isNext ? '#fff' : 'var(--text-secondary)',
                flexShrink: 0,
              }}
            >
              {index + 1}
            </div>

            {/* Stop info */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: '14px',
                  fontWeight: isNext ? '600' : '500',
                  color: isNext ? 'var(--text-primary)' : 'var(--text-secondary)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {stop.name}
              </div>
              {isNext && (
                <div style={{ fontSize: '11px', color: routeColor, marginTop: '2px', fontWeight: '500' }}>
                  Next stop
                </div>
              )}
            </div>

            {/* ETA */}
            {eta !== null && (
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div
                  style={{
                    fontSize: '13px',
                    fontWeight: '600',
                    color: isNext ? routeColor : 'var(--text-muted)',
                  }}
                >
                  {formatEta(eta)}
                </div>
              </div>
            )}

            {!busLocation && (
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                No bus
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
