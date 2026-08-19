// Local storage helpers for the student web app.
// Students don't need accounts — we just remember their last entered Driver Code.

const KEY = 'ridesync_driver_code';

export interface SavedPreferences {
  driverCode: string;
}

export function savePreferences(prefs: SavedPreferences): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(KEY, prefs.driverCode);
}

export function getPreferences(): SavedPreferences | null {
  if (typeof window === 'undefined') return null;
  const code = localStorage.getItem(KEY);
  return code ? { driverCode: code } : null;
}

export function clearPreferences(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(KEY);
}
