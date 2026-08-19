'use client';

// Student Landing Page
// Zero friction: just type the driver's short code and go.
// The code is remembered via localStorage so next visit is instant.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getPreferences, savePreferences } from '@/lib/storage';
import LanguageToggle from '@/components/LanguageToggle';

export default function HomePage() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(true);

  // On load: if we have a saved driver code, go straight to tracker
  useEffect(() => {
    const prefs = getPreferences();
    if (prefs?.driverCode) {
      router.replace(`/track/${prefs.driverCode.toUpperCase()}`);
    } else {
      setChecking(false);
    }
  }, []);

  function handleGo() {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) {
      setError('Please enter a Driver ID.');
      return;
    }
    savePreferences({ driverCode: trimmed });
    router.push(`/track/${trimmed}`);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleGo();
  }

  if (checking) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-base)' }}>
        <div style={{ fontSize: '40px' }}>🚌</div>
      </div>
    );
  }

  return (
    <main style={{
      minHeight: '100vh',
      background: 'var(--bg-base)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
    }}>
      {/* Top nav just for language toggle */}
      <div style={{ position: 'absolute', top: '24px', right: '24px' }}>
        <LanguageToggle />
      </div>

      {/* Background glow */}
      <div style={{
        position: 'fixed', top: '20%', left: '50%', transform: 'translateX(-50%)',
        width: '600px', height: '400px', borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(16,185,129,0.08) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      <div className="fade-up" style={{ width: '100%', maxWidth: '420px', textAlign: 'center' }}>
        {/* Brand */}
        <div style={{ fontSize: '60px', marginBottom: '16px' }}>🚌</div>
        <h1 style={{
          fontSize: 'clamp(2rem, 6vw, 3rem)',
          fontWeight: '800',
          color: 'var(--text-primary)',
          marginBottom: '8px',
          letterSpacing: '-0.5px',
        }}>
          RideSync
        </h1>
        <p style={{
          fontSize: '16px',
          color: 'var(--text-secondary)',
          marginBottom: '48px',
          lineHeight: 1.6,
        }}>
          Know exactly when your bus arrives.<br />
          Track it live, right from your browser.
        </p>

        {/* Input card */}
        <div style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: '20px',
          padding: '32px',
          textAlign: 'left',
        }}>
          <label
            htmlFor="driver-code-input"
            style={{
              display: 'block',
              fontSize: '12px',
              fontWeight: '600',
              color: 'var(--text-muted)',
              letterSpacing: '1.5px',
              textTransform: 'uppercase',
              marginBottom: '10px',
            }}
          >
            Driver ID
          </label>

          <input
            id="driver-code-input"
            type="text"
            value={code}
            onChange={(e) => { setCode(e.target.value.toUpperCase()); setError(''); }}
            onKeyDown={handleKeyDown}
            placeholder="e.g. DRV001"
            autoFocus
            style={{
              width: '100%',
              padding: '14px 18px',
              background: 'var(--bg-elevated)',
              border: `1px solid ${error ? '#EF4444' : 'var(--border)'}`,
              borderRadius: '12px',
              fontSize: '22px',
              fontWeight: '700',
              color: 'var(--text-primary)',
              outline: 'none',
              letterSpacing: '3px',
              fontFamily: 'Inter, monospace',
              boxSizing: 'border-box',
              transition: 'border-color 0.15s ease',
              marginBottom: '6px',
            }}
          />

          {error && (
            <p style={{ fontSize: '13px', color: '#EF4444', marginBottom: '12px' }}>{error}</p>
          )}

          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '20px', lineHeight: 1.6 }}>
            Ask your driver for their ID. It's a short code like DRV001.
          </p>

          <button
            id="track-bus-button"
            onClick={handleGo}
            className="glow-green"
            style={{
              width: '100%',
              padding: '16px',
              background: '#10B981',
              border: 'none',
              borderRadius: '12px',
              fontSize: '16px',
              fontWeight: '700',
              color: '#fff',
              cursor: 'pointer',
              fontFamily: 'Inter, sans-serif',
              letterSpacing: '0.5px',
              transition: 'opacity 0.15s ease',
            }}
          >
            Track My Bus →
          </button>
        </div>

        <p style={{ marginTop: '24px', fontSize: '12px', color: 'var(--text-muted)' }}>
          No account needed. Your Driver ID is saved automatically next visit.
        </p>
      </div>
    </main>
  );
}
