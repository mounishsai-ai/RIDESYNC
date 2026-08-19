'use client';

import { useEffect, useState } from 'react';

export default function LanguageToggle() {
  const [lang, setLang] = useState<'en' | 'ar'>('en');

  useEffect(() => {
    const saved = localStorage.getItem('ridesync_lang') as 'en' | 'ar';
    if (saved) {
      setLang(saved);
      document.documentElement.dir = saved === 'ar' ? 'rtl' : 'ltr';
      document.documentElement.lang = saved;
    }
  }, []);

  const toggle = () => {
    const next = lang === 'en' ? 'ar' : 'en';
    setLang(next);
    localStorage.setItem('ridesync_lang', next);
    document.documentElement.dir = next === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = next;
  };

  return (
    <button
      onClick={toggle}
      style={{
        padding: '6px 12px',
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
        borderRadius: '8px',
        color: 'var(--text-primary)',
        fontSize: '13px',
        fontWeight: '600',
        cursor: 'pointer',
        fontFamily: 'Inter, sans-serif',
      }}
    >
      {lang === 'en' ? 'عربي' : 'English'}
    </button>
  );
}
