// RideSync Driver App - Storage Helpers
// Manages locally persisted preferences (last selected route, driver ID, etc.)
// so the driver doesn't have to re-select things every day.

import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = {
  LAST_ROUTE_ID: 'ridesync_last_route_id',
  LAST_ROUTE_NAME: 'ridesync_last_route_name',
  DRIVER_ID: 'ridesync_driver_id',
  DRIVER_NAME: 'ridesync_driver_name',
  DRIVER_SHORT_CODE: 'ridesync_driver_short_code',
} as const;

export interface DriverProfile {
  id: string;
  name: string;
  short_code?: string;
}

export interface SavedRoute {
  id: string;
  name: string;
}

// ─── Driver Profile ──────────────────────────────────────────────────────────

export async function saveDriverProfile(profile: DriverProfile): Promise<void> {
  await AsyncStorage.setItem(KEYS.DRIVER_ID, profile.id);
  await AsyncStorage.setItem(KEYS.DRIVER_NAME, profile.name);
  if (profile.short_code) await AsyncStorage.setItem(KEYS.DRIVER_SHORT_CODE, profile.short_code);
}

export async function getDriverProfile(): Promise<DriverProfile | null> {
  const id = await AsyncStorage.getItem(KEYS.DRIVER_ID);
  const name = await AsyncStorage.getItem(KEYS.DRIVER_NAME);
  const short_code = await AsyncStorage.getItem(KEYS.DRIVER_SHORT_CODE);
  if (id && name) return { id, name, short_code: short_code ?? undefined };
  return null;
}

export async function clearDriverProfile(): Promise<void> {
  await AsyncStorage.multiRemove([KEYS.DRIVER_ID, KEYS.DRIVER_NAME, KEYS.DRIVER_SHORT_CODE]);
}

// ─── Last Selected Route ────────────────────────────────────────────────────

export async function saveLastRoute(route: SavedRoute): Promise<void> {
  await AsyncStorage.setItem(KEYS.LAST_ROUTE_ID, route.id);
  await AsyncStorage.setItem(KEYS.LAST_ROUTE_NAME, route.name);
}

export async function getLastRoute(): Promise<SavedRoute | null> {
  const id = await AsyncStorage.getItem(KEYS.LAST_ROUTE_ID);
  const name = await AsyncStorage.getItem(KEYS.LAST_ROUTE_NAME);
  if (id && name) return { id, name };
  return null;
}
