'use client';

// Live Map Component
// Renders the Leaflet map with bus position, stop markers, and route polyline.
// The route polyline follows actual roads (fetched from OSRM), not straight lines.
// Must be loaded with dynamic() and ssr:false because Leaflet requires window.

import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Stop, LiveLocation } from '@/lib/supabase';
import { fetchOsrmRoadGeometry } from '@/lib/eta';

interface Props {
  stops: Stop[];
  busLocation: LiveLocation | null;
  routeColor: string;
}

export default function LiveMap({ stops, busLocation, routeColor }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const busMarkerRef = useRef<L.Marker | null>(null);
  const polylineRef = useRef<L.Polyline | null>(null);
  const hasCenteredOnBus = useRef(false);

  // Road geometry — starts as null, populated by OSRM fetch
  const [roadPolyline, setRoadPolyline] = useState<[number, number][] | null>(null);

  // ─── Fetch OSRM road geometry when stops load ───────────────────────────
  useEffect(() => {
    if (stops.length < 2) return;
    fetchOsrmRoadGeometry(stops.map((s) => ({ lat: s.lat, lng: s.lng }))).then((coords) => {
      setRoadPolyline(coords);
    });
  }, [stops]);

  // ─── Init Map ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    // Centre on first stop or India by default
    const defaultCenter: [number, number] =
      stops.length > 0 ? [stops[0].lat, stops[0].lng] : [20.5937, 78.9629];

    const map = L.map(mapRef.current, {
      center: defaultCenter,
      zoom: stops.length > 0 ? 15 : 5,
      zoomControl: true,
      attributionControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    mapInstanceRef.current = map;

    // ─── Draw Stop Markers ────────────────────────────────────────────
    stops.forEach((stop, index) => {
      const isFirst = index === 0;
      const isLast = index === stops.length - 1;

      const stopIcon = L.divIcon({
        className: '',
        html: `
          <div style="
            width: 28px; height: 28px; border-radius: 50%;
            background: ${isFirst || isLast ? routeColor : '#1E293B'};
            border: 3px solid ${routeColor};
            display: flex; align-items: center; justify-content: center;
            font-size: 11px; font-weight: 700; color: #fff;
            box-shadow: 0 2px 8px rgba(0,0,0,0.5);
          ">${index + 1}</div>
        `,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });

      L.marker([stop.lat, stop.lng], { icon: stopIcon })
        .addTo(map)
        .bindPopup(
          `<div style="color:#0F172A;font-weight:600;font-size:13px">${stop.name}</div>`,
          { closeButton: false }
        );
    });

    // ─── Draw placeholder straight-line polyline ────────────────────
    // Replaced by road geometry once OSRM responds (see update effect below)
    if (stops.length > 1) {
      const latlngs: [number, number][] = stops.map((s) => [s.lat, s.lng]);
      polylineRef.current = L.polyline(latlngs, {
        color: routeColor,
        weight: 4,
        opacity: 0.4,
        dashArray: '10, 6',
      }).addTo(map);
    }

    // Fit to stops
    if (stops.length > 1) {
      const bounds = L.latLngBounds(stops.map((s) => [s.lat, s.lng]));
      map.fitBounds(bounds, { padding: [40, 40] });
    }

    return () => {
      map.remove();
      mapInstanceRef.current = null;
      polylineRef.current = null;
      hasCenteredOnBus.current = false;
    };
  }, [stops, routeColor]);

  // ─── Upgrade polyline to road geometry when OSRM responds ──────────────
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !roadPolyline || roadPolyline.length < 2) return;

    // Remove placeholder
    if (polylineRef.current) {
      polylineRef.current.remove();
    }

    // Draw solid road-following polyline
    polylineRef.current = L.polyline(roadPolyline, {
      color: routeColor,
      weight: 5,
      opacity: 0.85,
    }).addTo(map);
  }, [roadPolyline, routeColor]);

  // ─── Update Bus Marker ──────────────────────────────────────────────────
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !busLocation) return;

    const busIcon = L.divIcon({
      className: '',
      html: `
        <div style="position:relative;width:40px;height:40px;display:flex;align-items:center;justify-content:center;">
          <div style="
            position:absolute;width:40px;height:40px;border-radius:50%;
            background:rgba(16,185,129,0.3);
            animation:bus-pulse 2s ease-out infinite;
          "></div>
          <div style="
            position:relative;width:24px;height:24px;border-radius:50%;
            background:#10B981;border:3px solid #fff;
            display:flex;align-items:center;justify-content:center;
            font-size:12px;box-shadow:0 2px 8px rgba(0,0,0,0.5);
            z-index:10;
          ">🚌</div>
        </div>
      `,
      iconSize: [40, 40],
      iconAnchor: [20, 20],
    });

    const latlng: [number, number] = [busLocation.lat, busLocation.lng];

    if (!busMarkerRef.current) {
      busMarkerRef.current = L.marker(latlng, { icon: busIcon, zIndexOffset: 1000 }).addTo(map);
    } else {
      busMarkerRef.current.setLatLng(latlng);
      busMarkerRef.current.setIcon(busIcon);
    }

    // Pan to bus on first update
    if (!hasCenteredOnBus.current) {
      map.flyTo(latlng, 15, { animate: true, duration: 1.5 });
      hasCenteredOnBus.current = true;
    }
  }, [busLocation]);

  return (
    <div
      ref={mapRef}
      style={{ width: '100%', height: '100%', borderRadius: '16px' }}
    />
  );
}
