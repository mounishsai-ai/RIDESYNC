'use client';

// Bus Status Bar
// Shows a compact info strip: live/offline status, bus speed, last seen, and the closest stop ETA.

import { LiveLocation } from '@/lib/supabase';
import { formatSpeed, formatLastSeen } from '@/lib/eta';

interface Props {
  busLocation: LiveLocation | null;
  closestStopEta: number | null;
  routeName: string;
}

export default function BusStatusBar({ busLocation, closestStopEta, routeName }: Props) {
  const isLive = busLocation !== null;
  const lastSeen = busLocation ? formatLastSeen(busLocation.timestamp) : null;
  const speed = busLocation ? formatSpeed(busLocation.speed) : null;

  return (
    <div
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: '16px',
        padding: '16px 20px',
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        flexWrap: 'wrap',
      }}
    >
      {/* Live badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
        <div
          className={isLive ? 'live-dot' : ''}
          style={{
            width: '10px',
            height: '10px',
            borderRadius: '50%',
            background: isLive ? '#10B981' : '#475569',
          }}
        />
        <span
          style={{
            fontSize: '13px',
            fontWeight: '700',
            color: isLive ? '#10B981' : 'var(--text-muted)',
            letterSpacing: '1px',
          }}
        >
          {isLive ? 'LIVE' : 'OFFLINE'}
        </span>
      </div>

      <div style={{ width: '1px', height: '24px', background: 'var(--border)', flexShrink: 0 }} />

      {/* Route name */}
      <div style={{ flex: 1, minWidth: '100px' }}>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '2px', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Route</div>
        <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {routeName}
        </div>
      </div>

      {isLive && (
        <>
          <div style={{ width: '1px', height: '24px', background: 'var(--border)', flexShrink: 0 }} />
          {/* Speed */}
          <div style={{ textAlign: 'center', flexShrink: 0 }}>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '2px', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Speed</div>
            <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)' }}>{speed}</div>
          </div>

          <div style={{ width: '1px', height: '24px', background: 'var(--border)', flexShrink: 0 }} />

          {/* Last seen */}
          <div style={{ textAlign: 'center', flexShrink: 0 }}>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '2px', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Updated</div>
            <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)' }}>{lastSeen}</div>
          </div>
        </>
      )}

      {!isLive && (
        <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
          No active trip — the bus may not have started yet.
        </div>
      )}
    </div>
  );
}
