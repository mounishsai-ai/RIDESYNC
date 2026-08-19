// RideSync Driver App - Location Service
// This is the CORE of the driver app. It handles:
// 1. Requesting location permissions (foreground + background)
// 2. Starting/stopping background location tracking via Expo TaskManager
// 3. Broadcasting location updates to Supabase Realtime channels
// 4. Offline queueing: if the network is down, coordinates are saved locally
//    and flushed in bulk when connectivity is restored.

import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

// ─── Constants ───────────────────────────────────────────────────────────────

const BACKGROUND_LOCATION_TASK = 'RIDESYNC_BACKGROUND_LOCATION';
const OFFLINE_QUEUE_KEY = 'ridesync_offline_queue';

// How often to receive location updates (in milliseconds)
// Lower = more accurate but more battery drain
const LOCATION_UPDATE_INTERVAL = 5000; // 5 seconds
const LOCATION_UPDATE_DISTANCE = 10; // minimum 10 meters between updates

// ─── Types ───────────────────────────────────────────────────────────────────

export interface LocationPayload {
  lat: number;
  lng: number;
  heading: number | null;
  speed: number | null;
  timestamp: number;
  trip_id: string;
  driver_id: string;
}

// ─── Offline Queue ───────────────────────────────────────────────────────────
// When the driver goes through a dead zone (no cellular signal), we don't want
// to lose their location data. Instead, we save it to AsyncStorage and flush
// it all at once when the connection comes back.

async function getOfflineQueue(): Promise<LocationPayload[]> {
  try {
    const raw = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function addToOfflineQueue(payload: LocationPayload): Promise<void> {
  const queue = await getOfflineQueue();
  queue.push(payload);
  await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
}

async function clearOfflineQueue(): Promise<void> {
  await AsyncStorage.removeItem(OFFLINE_QUEUE_KEY);
}

async function flushOfflineQueue(): Promise<void> {
  const queue = await getOfflineQueue();
  if (queue.length === 0) return;

  try {
    // Bulk insert all queued locations into the trip_locations table
    const { error } = await supabase.from('trip_locations').insert(
      queue.map((loc) => ({
        trip_id: loc.trip_id,
        lat: loc.lat,
        lng: loc.lng,
        heading: loc.heading,
        speed: loc.speed,
        recorded_at: new Date(loc.timestamp).toISOString(),
      }))
    );

    if (!error) {
      await clearOfflineQueue();
      console.log(`[RideSync] Flushed ${queue.length} offline locations`);
    }
  } catch (err) {
    // If flush fails, keep the queue for next attempt
    console.warn('[RideSync] Failed to flush offline queue:', err);
  }
}

// ─── Broadcasting ────────────────────────────────────────────────────────────
// This sends the driver's live location to all connected students via
// Supabase Realtime Broadcast. This does NOT write to the database every time,
// keeping costs near zero.

async function broadcastLocation(payload: LocationPayload): Promise<boolean> {
  try {
    const channel = supabase.channel(`trip:${payload.trip_id}`);
    
    await channel.send({
      type: 'broadcast',
      event: 'location_update',
      payload: {
        lat: payload.lat,
        lng: payload.lng,
        heading: payload.heading,
        speed: payload.speed,
        timestamp: payload.timestamp,
        driver_id: payload.driver_id,
      },
    });

    return true;
  } catch {
    return false;
  }
}

// ─── Background Task Definition ──────────────────────────────────────────────
// This is the function that runs IN THE BACKGROUND even when the app is closed.
// It is registered with Expo TaskManager and triggered by the OS whenever a new
// location update is available.

TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
  if (error) {
    console.error('[RideSync] Background location error:', error.message);
    return;
  }

  if (!data) return;

  const { locations } = data as { locations: Location.LocationObject[] };
  const tripData = await AsyncStorage.getItem('ridesync_active_trip');

  if (!tripData) {
    // No active trip, stop tracking
    console.warn('[RideSync] No active trip found, ignoring location update');
    return;
  }

  const { trip_id, driver_id } = JSON.parse(tripData);

  for (const location of locations) {
    const payload: LocationPayload = {
      lat: location.coords.latitude,
      lng: location.coords.longitude,
      heading: location.coords.heading,
      speed: location.coords.speed,
      timestamp: location.timestamp,
      trip_id,
      driver_id,
    };

    // Try to broadcast. If it fails (no network), queue it.
    const success = await broadcastLocation(payload);

    if (!success) {
      await addToOfflineQueue(payload);
    } else {
      // If broadcast succeeded, try to flush any previously queued items
      await flushOfflineQueue();
    }
  }
});

// ─── Public API ──────────────────────────────────────────────────────────────
// These are the functions that the UI layer calls.

/**
 * Request both foreground and background location permissions.
 * Returns true if ALL required permissions are granted.
 */
export async function requestLocationPermissions(): Promise<boolean> {
  // Step 1: Request foreground permission first (required before background)
  const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
  if (fgStatus !== 'granted') {
    console.warn('[RideSync] Foreground location permission denied');
    return false;
  }

  // Step 2: Request background permission
  const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();
  if (bgStatus !== 'granted') {
    console.warn('[RideSync] Background location permission denied');
    return false;
  }

  return true;
}

/**
 * Start transmitting location in the background.
 * This is the "big green button" action.
 */
export async function startTransmitting(tripId: string, driverId: string): Promise<boolean> {
  try {
    // Save active trip info so the background task can access it
    await AsyncStorage.setItem(
      'ridesync_active_trip',
      JSON.stringify({ trip_id: tripId, driver_id: driverId })
    );

    // Check if already tracking
    const isTracking = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
    if (isTracking) {
      console.log('[RideSync] Already transmitting');
      return true;
    }

    // Start background location updates
    await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
      accuracy: Location.Accuracy.High,
      timeInterval: LOCATION_UPDATE_INTERVAL,
      distanceInterval: LOCATION_UPDATE_DISTANCE,
      deferredUpdatesInterval: LOCATION_UPDATE_INTERVAL,
      showsBackgroundLocationIndicator: true, // iOS: shows blue bar
      foregroundService: {
        notificationTitle: 'RideSync Active',
        notificationBody: 'Transmitting your location to students',
        notificationColor: '#10B981', // Green to match our brand
      },
    });

    console.log('[RideSync] Background location tracking started');
    return true;
  } catch (err) {
    console.error('[RideSync] Failed to start transmitting:', err);
    return false;
  }
}

/**
 * Stop transmitting location.
 * Called when the driver ends their trip.
 */
export async function stopTransmitting(): Promise<void> {
  try {
    const isTracking = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
    if (isTracking) {
      await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
    }

    // Flush any remaining offline data
    await flushOfflineQueue();

    // Clear the active trip
    await AsyncStorage.removeItem('ridesync_active_trip');

    console.log('[RideSync] Stopped transmitting');
  } catch (err) {
    console.error('[RideSync] Failed to stop transmitting:', err);
  }
}

/**
 * Check if the driver is currently transmitting.
 */
export async function isTransmitting(): Promise<boolean> {
  try {
    return await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
  } catch {
    return false;
  }
}

/**
 * Get the current location once (for showing the driver their position on the map).
 */
export async function getCurrentLocation(): Promise<Location.LocationObject | null> {
  try {
    return await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    });
  } catch {
    return null;
  }
}

/**
 * Send a heartbeat to keep the active trip alive in the database.
 * Called every ~5 minutes while transmitting.
 * The DB function complete_stale_trips() will mark trips as completed
 * if no heartbeat arrives for 30 minutes (catches the case where the
 * driver closes the app without tapping STOP).
 */
export async function sendHeartbeat(tripId: string): Promise<void> {
  try {
    await supabase
      .from('trips')
      .update({ last_heartbeat: new Date().toISOString() })
      .eq('id', tripId);
  } catch (err) {
    // Non-critical — don't crash the app if heartbeat fails
    console.warn('[RideSync] Heartbeat failed:', err);
  }
}

