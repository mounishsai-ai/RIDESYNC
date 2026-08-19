// ETA calculation utilities
// Computes estimated arrival time to each stop based on the bus's live location and speed.

export interface LatLng {
  lat: number;
  lng: number;
}

/**
 * Haversine formula — calculates straight-line distance between two GPS points in kilometres.
 */
export function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;

  const x =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  return R * c;
}

/**
 * Estimates time in minutes from the bus's current location to a stop.
 * Falls back to a default speed of 30 km/h when GPS speed is unavailable.
 */
export function etaMinutes(
  busPosition: LatLng,
  stop: LatLng,
  speedKmh: number | null
): number {
  const distanceKm = haversineKm(busPosition, stop);
  const effectiveSpeed = speedKmh && speedKmh > 2 ? speedKmh : 30; // Default 30 km/h
  const hours = distanceKm / effectiveSpeed;
  return Math.round(hours * 60);
}

/**
 * Fetches ETA from OSRM public API.
 * Returns time in minutes, or falls back to Haversine if API fails or rate limits.
 */
export async function fetchOsrmEta(
  busPosition: LatLng,
  stop: LatLng,
  speedKmh: number | null
): Promise<number> {
  try {
    // OSRM expects: longitude,latitude
    const coords = `${busPosition.lng},${busPosition.lat};${stop.lng},${stop.lat}`;
    const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=false`;
    
    const response = await fetch(url, {
      // Add timeout to prevent hanging UI
      signal: AbortSignal.timeout(3000),
      headers: {
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`OSRM API error: ${response.status}`);
    }

    const data = await response.json();
    if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
      throw new Error('OSRM API returned no route');
    }

    // Duration is in seconds, convert to minutes
    const durationSeconds = data.routes[0].duration;
    return Math.round(durationSeconds / 60);
  } catch (error) {
    console.warn('Failed to fetch OSRM ETA, falling back to Haversine', error);
    return etaMinutes(busPosition, stop, speedKmh);
  }
}

/**
 * Fetches the actual road geometry from OSRM for a sequence of stops.
 * Returns an array of [lat, lng] pairs that trace the road path.
 * Falls back to straight stop-to-stop coordinates if the API fails or rate-limits.
 */
export async function fetchOsrmRoadGeometry(stops: LatLng[]): Promise<[number, number][]> {
  if (stops.length < 2) return stops.map((s) => [s.lat, s.lng]);

  try {
    // OSRM expects: longitude,latitude for each waypoint
    const coords = stops.map((s) => `${s.lng},${s.lat}`).join(';');
    const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`;

    const response = await fetch(url, {
      signal: AbortSignal.timeout(5000),
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) throw new Error(`OSRM geometry error: ${response.status}`);

    const data = await response.json();
    if (data.code !== 'Ok' || !data.routes?.[0]?.geometry?.coordinates) {
      throw new Error('OSRM returned no geometry');
    }

    // GeoJSON coordinates are [lng, lat] — flip to [lat, lng] for Leaflet
    return (data.routes[0].geometry.coordinates as [number, number][]).map(
      ([lng, lat]) => [lat, lng]
    );
  } catch (error) {
    console.warn('OSRM road geometry failed, falling back to straight lines:', error);
    // Fallback: straight lines between stops
    return stops.map((s) => [s.lat, s.lng]);
  }
}

/**
 * Formats an ETA in minutes to a human-readable string.
 */
export function formatEta(minutes: number): string {
  if (minutes <= 0) return 'Arriving now';
  if (minutes === 1) return '1 min away';
  if (minutes < 60) return `${minutes} mins away`;
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hrs}h ${mins}m away` : `${hrs}h away`;
}

/**
 * Formats speed from m/s (GPS native) to km/h.
 */
export function formatSpeed(speedMs: number | null): string {
  if (speedMs === null || speedMs < 0) return '—';
  const kmh = Math.round(speedMs * 3.6);
  return `${kmh} km/h`;
}

/**
 * Returns how many seconds ago a timestamp was.
 */
export function secondsAgo(timestamp: number): number {
  return Math.round((Date.now() - timestamp) / 1000);
}

export function formatLastSeen(timestamp: number): string {
  const secs = secondsAgo(timestamp);
  if (secs < 10) return 'Just now';
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  return `${mins}m ago`;
}
