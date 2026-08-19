// RideSync Driver App – Route Builder Screen
//
// Redesigned for map-based stop picking using Leaflet in a WebView.
// No Google Maps API key required – uses CartoDB OpenStreetMap tiles.
//
// UX flow:
//   1. See saved routes – tap one to select, or tap "New Route"
//   2. New Route: type a name, pick a color, then tap on the map to add stops
//   3. An OSRM road polyline previews the route in real-time
//   4. Save route – taken to Transmitting screen

import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Dimensions,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { supabase } from '../lib/supabase';
import { getDriverProfile, saveLastRoute, SavedRoute } from '../lib/storage';

// --- Types -----------------------------------------------------------------

interface Route {
  id: string;
  name: string;
  color: string;
  stop_count?: number;
}

interface PendingStop {
  name: string;
  lat: number;
  lng: number;
}

type ScreenMode = 'list' | 'building';

// --- Constants --------------------------------------------------------------

const COLORS = ['#10B981', '#38BDF8', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];

// --- OSRM Road Geometry Helper ----------------------------------------------

async function fetchRoadPolyline(stops: PendingStop[]): Promise<{ latitude: number; longitude: number }[]> {
  if (stops.length < 2) return stops.map((s) => ({ latitude: s.lat, longitude: s.lng }));

  try {
    const coords = stops.map((s) => `${s.lng},${s.lat}`).join(';');
    const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`;

    const res = await fetch(url, {
      signal: AbortSignal.timeout(5000),
      headers: { Accept: 'application/json' },
    });

    if (!res.ok) throw new Error('OSRM error');

    const data = await res.json();
    if (data.code !== 'Ok' || !data.routes?.[0]?.geometry?.coordinates) {
      throw new Error('No geometry');
    }

    // GeoJSON is [lng, lat] – flip for display
    return (data.routes[0].geometry.coordinates as [number, number][]).map(([lng, lat]) => ({
      latitude: lat,
      longitude: lng,
    }));
  } catch {
    // Fallback: straight lines between stops
    return stops.map((s) => ({ latitude: s.lat, longitude: s.lng }));
  }
}

// --- Leaflet HTML -----------------------------------------------------------

function buildMapHtml(routeColor: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    * { box-sizing: border-box; }
    body { padding: 0; margin: 0; background: #0F172A; }
    #map { height: 100vh; width: 100vw; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    var map = L.map('map', { zoomControl: true, attributionControl: false }).setView([20.5937, 78.9629], 5);
    L.tileLayer('https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);

    var markers = [];
    var routePolyline = null;

    map.on('click', function(e) {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'mapClick',
        lat: e.latlng.lat,
        lng: e.latlng.lng
      }));
    });

    function makeIcon(num, color) {
      return L.divIcon({
        className: '',
        html: '<div style="background:' + color + ';width:28px;height:28px;border-radius:50%;border:2px solid white;display:flex;align-items:center;justify-content:center;color:white;font-weight:bold;font-family:sans-serif;font-size:13px;box-shadow:0 2px 6px rgba(0,0,0,0.4);">' + num + '</div>',
        iconSize: [28, 28],
        iconAnchor: [14, 14]
      });
    }

    function handleMessage(raw) {
      try {
        var data = JSON.parse(raw);
        if (data.type !== 'updateState') return;

        markers.forEach(function(m) { map.removeLayer(m); });
        markers = [];
        if (routePolyline) { map.removeLayer(routePolyline); routePolyline = null; }

        data.stops.forEach(function(stop, i) {
          markers.push(L.marker([stop.lat, stop.lng], { icon: makeIcon(i + 1, data.color) }).addTo(map));
        });

        if (data.polyline && data.polyline.length > 1) {
          routePolyline = L.polyline(data.polyline, { color: data.color, weight: 4, opacity: 0.85 }).addTo(map);
        }
      } catch(e) {}
    }

    document.addEventListener('message', function(e) { handleMessage(e.data); });
    window.addEventListener('message', function(e) { handleMessage(e.data); });
  </script>
</body>
</html>`;
}

// --- Component --------------------------------------------------------------

interface Props {
  onRouteSelected: (route: SavedRoute) => void;
  onLogout?: () => void;
}

export default function RouteBuilderScreen({ onRouteSelected, onLogout }: Props) {
  // ── All hooks at the top – never inside conditionals ──────────────────────
  const [mode, setMode] = useState<ScreenMode>('list');
  const [routes, setRoutes] = useState<Route[]>([]);
  const [loading, setLoading] = useState(true);

  // Route builder state
  const [routeName, setRouteName] = useState('');
  const [routeColor, setRouteColor] = useState(COLORS[0]);
  const [stops, setStops] = useState<PendingStop[]>([]);
  const [saving, setSaving] = useState(false);

  // Map tap → name sheet
  const [pendingTap, setPendingTap] = useState<{ lat: number; lng: number } | null>(null);
  const [showNameSheet, setShowNameSheet] = useState(false);
  const [tapStopName, setTapStopName] = useState('');

  // Road polyline preview
  const [roadPolyline, setRoadPolyline] = useState<{ latitude: number; longitude: number }[]>([]);

  const driverIdRef = useRef<string | null>(null);
  const webViewRef = useRef<WebView>(null);

  // ── Fetch saved routes ───────────────────────────────────────────────────

  const fetchRoutes = useCallback(async () => {
    setLoading(true);
    const profile = await getDriverProfile();
    if (!profile) return;
    driverIdRef.current = profile.id;

    const { data } = await supabase
      .from('routes')
      .select('id, name, color')
      .eq('driver_id', profile.id)
      .order('created_at', { ascending: false });

    const routesWithCounts: Route[] = await Promise.all(
      (data || []).map(async (r) => {
        const { count } = await supabase
          .from('stops')
          .select('id', { count: 'exact', head: true })
          .eq('route_id', r.id);
        return { ...r, stop_count: count || 0 };
      })
    );

    setRoutes(routesWithCounts);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchRoutes();
  }, [fetchRoutes]);

  // ── Update road polyline whenever stops change ───────────────────────────

  useEffect(() => {
    if (stops.length < 2) {
      setRoadPolyline(stops.map((s) => ({ latitude: s.lat, longitude: s.lng })));
      return;
    }
    fetchRoadPolyline(stops).then(setRoadPolyline);
  }, [stops]);

  // ── Sync state into the Leaflet WebView ──────────────────────────────────

  useEffect(() => {
    if (mode !== 'building' || !webViewRef.current) return;
    const msg = JSON.stringify({
      type: 'updateState',
      stops,
      color: routeColor,
      polyline: roadPolyline.map((p) => [p.latitude, p.longitude]),
    });
    webViewRef.current.postMessage(msg);
  }, [stops, roadPolyline, routeColor, mode]);

  // ── WebView message handler ──────────────────────────────────────────────

  const handleWebViewMessage = useCallback((event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'mapClick') {
        setPendingTap({ lat: data.lat, lng: data.lng });
        setTapStopName('');
        setShowNameSheet(true);
      }
    } catch (e) {
      console.error('WebView msg error:', e);
    }
  }, []);

  // ── Stop actions ─────────────────────────────────────────────────────────

  function confirmStop() {
    if (!tapStopName.trim()) {
      Alert.alert('Name required', 'Please enter a name for this stop.');
      return;
    }
    if (!pendingTap) return;
    setStops((prev) => [...prev, { name: tapStopName.trim(), lat: pendingTap.lat, lng: pendingTap.lng }]);
    setShowNameSheet(false);
    setPendingTap(null);
    setTapStopName('');
  }

  function cancelStop() {
    setShowNameSheet(false);
    setPendingTap(null);
    setTapStopName('');
  }

  function handleRemoveStop(index: number) {
    setStops((prev) => prev.filter((_, i) => i !== index));
  }

  function moveStop(index: number, direction: 'up' | 'down') {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === stops.length - 1) return;
    setStops((prev) => {
      const next = [...prev];
      const swap = direction === 'up' ? index - 1 : index + 1;
      [next[index], next[swap]] = [next[swap], next[index]];
      return next;
    });
  }

  // ── Save route ────────────────────────────────────────────────────────────

  async function handleSaveRoute() {
    if (!routeName.trim()) {
      Alert.alert('Name required', 'Please give this route a name.');
      return;
    }
    if (stops.length < 2) {
      Alert.alert('More stops needed', 'Add at least 2 stops to define a route.');
      return;
    }
    if (!driverIdRef.current) return;

    setSaving(true);

    const { data: routeData, error: routeErr } = await supabase
      .from('routes')
      .insert({ driver_id: driverIdRef.current, name: routeName.trim(), color: routeColor })
      .select('id, name, color')
      .single();

    if (routeErr || !routeData) {
      Alert.alert('Error', 'Could not save route. Please try again.');
      setSaving(false);
      return;
    }

    const stopRows = stops.map((s, i) => ({
      route_id: routeData.id,
      name: s.name,
      lat: s.lat,
      lng: s.lng,
      order_index: i,
    }));

    const { error: stopsErr } = await supabase.from('stops').insert(stopRows);

    if (stopsErr) {
      Alert.alert('Error', 'Route saved but stops failed. Please try again.');
      setSaving(false);
      return;
    }

    setSaving(false);
    const saved: SavedRoute = { id: routeData.id, name: routeData.name };
    await saveLastRoute(saved);
    onRouteSelected(saved);
  }

  async function handleSelectRoute(route: Route) {
    const saved: SavedRoute = { id: route.id, name: route.name };
    await saveLastRoute(saved);
    onRouteSelected(saved);
  }

  function handleDeleteRoute(route: Route) {
    Alert.alert(
      'Delete Route',
      `Delete "${route.name}" and all its stops? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase.from('routes').delete().eq('id', route.id);
            if (error) {
              Alert.alert('Error', 'Could not delete route. Please try again.');
            } else {
              setRoutes((prev) => prev.filter((r) => r.id !== route.id));
            }
          },
        },
      ]
    );
  }

  // ── Render: Route List ────────────────────────────────────────────────────

  if (mode === 'list') {
    return (
      <View style={styles.container}>
        <View style={styles.listHeaderRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Your Routes</Text>
            <Text style={styles.subtitle}>Pick a saved route or create a new one.</Text>
          </View>
          {onLogout && (
            <TouchableOpacity onPress={onLogout} style={styles.logoutButton}>
              <Text style={styles.logoutButtonText}>Log Out</Text>
            </TouchableOpacity>
          )}
        </View>

        {loading ? (
          <ActivityIndicator color="#10B981" style={{ marginTop: 32 }} />
        ) : (
          <FlatList
            data={routes}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingBottom: 20 }}
            ListEmptyComponent={
              <Text style={styles.emptyText}>No routes yet. Create your first one below!</Text>
            }
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.routeCard}
                onPress={() => handleSelectRoute(item)}
                activeOpacity={0.7}
              >
                <View style={[styles.colorDot, { backgroundColor: item.color || '#10B981' }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.routeName}>{item.name}</Text>
                  <Text style={styles.routeMeta}>{item.stop_count} stop{item.stop_count !== 1 ? 's' : ''}</Text>
                </View>
                <TouchableOpacity
                  onPress={() => handleDeleteRoute(item)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  style={styles.deleteButton}
                >
                  <Text style={styles.deleteButtonText}>🗑</Text>
                </TouchableOpacity>
                <Text style={styles.arrow}>›</Text>
              </TouchableOpacity>
            )}
          />
        )}

        <TouchableOpacity
          style={styles.newRouteButton}
          onPress={() => {
            setMode('building');
            setRouteName('');
            setStops([]);
            setRoadPolyline([]);
          }}
          activeOpacity={0.8}
        >
          <Text style={styles.newRouteButtonText}>+ Create New Route</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Render: Map-Based Route Builder ──────────────────────────────────────

  const { height } = Dimensions.get('window');
  const mapHtml = buildMapHtml(routeColor);

  return (
    <View style={{ flex: 1, backgroundColor: '#0F172A' }}>

      {/* Top config bar */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => setMode('list')} style={styles.backBtn}>
          <Text style={styles.backLink}>← Back</Text>
        </TouchableOpacity>

        <View style={{ flex: 1, marginHorizontal: 12 }}>
          <TextInput
            style={styles.routeNameInput}
            placeholder="Route name…"
            placeholderTextColor="#475569"
            value={routeName}
            onChangeText={setRouteName}
          />
        </View>

        <View style={styles.colorRow}>
          {COLORS.map((c) => (
            <TouchableOpacity
              key={c}
              onPress={() => setRouteColor(c)}
              style={[styles.colorSwatch, { backgroundColor: c }, routeColor === c && styles.colorSwatchSelected]}
            />
          ))}
        </View>
      </View>

      {/* Leaflet WebView Map */}
      <WebView
        ref={webViewRef}
        style={{ flex: 1 }}
        source={{ html: mapHtml }}
        onMessage={handleWebViewMessage}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        scrollEnabled={false}
        bounces={false}
        originWhitelist={['*']}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
      />

      {/* Tap hint overlay */}
      {stops.length === 0 && (
        <View style={styles.hintOverlay} pointerEvents="none">
          <View style={styles.hintBubble}>
            <Text style={styles.hintText}>Tap anywhere on the map to add a stop</Text>
          </View>
        </View>
      )}

      {/* Bottom drawer: stop list + save */}
      <View style={styles.bottomDrawer}>
        <View style={styles.drawerHandle} />

        <Text style={styles.drawerTitle}>
          Stops ({stops.length}){stops.length < 2 ? ' – add at least 2' : ''}
        </Text>

        <ScrollView style={{ maxHeight: height * 0.2 }} showsVerticalScrollIndicator={false}>
          {stops.map((stop, index) => (
            <View key={index} style={styles.stopRow}>
              <View style={[styles.stopBadge, { backgroundColor: routeColor }]}>
                <Text style={styles.stopBadgeText}>{index + 1}</Text>
              </View>
              <Text style={styles.stopName} numberOfLines={1}>{stop.name}</Text>

              <View style={styles.reorderButtons}>
                {index > 0 && (
                  <TouchableOpacity onPress={() => moveStop(index, 'up')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Text style={styles.reorderIcon}>↑</Text>
                  </TouchableOpacity>
                )}
                {index < stops.length - 1 && (
                  <TouchableOpacity onPress={() => moveStop(index, 'down')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Text style={styles.reorderIcon}>↓</Text>
                  </TouchableOpacity>
                )}
              </View>

              <TouchableOpacity onPress={() => handleRemoveStop(index)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={styles.removeStop}>✕</Text>
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>

        <TouchableOpacity
          style={[styles.saveButton, (saving || stops.length < 2 || !routeName.trim()) && { opacity: 0.5 }]}
          onPress={handleSaveRoute}
          disabled={saving || stops.length < 2 || !routeName.trim()}
          activeOpacity={0.8}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.saveButtonText}>Save Route & Continue →</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Stop Name Modal */}
      <Modal
        visible={showNameSheet}
        transparent
        animationType="slide"
        onRequestClose={cancelStop}
      >
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={cancelStop} />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.nameSheet}
        >
          <View style={styles.drawerHandle} />
          <Text style={styles.nameSheetTitle}>Name this stop</Text>
          <Text style={styles.nameSheetCoords}>
            {pendingTap ? `${pendingTap.lat.toFixed(5)}, ${pendingTap.lng.toFixed(5)}` : ''}
          </Text>
          <TextInput
            style={styles.nameInput}
            placeholder="e.g. Main Gate, Library, Market Square…"
            placeholderTextColor="#475569"
            value={tapStopName}
            onChangeText={setTapStopName}
            autoFocus
            onSubmitEditing={confirmStop}
            returnKeyType="done"
          />
          <View style={styles.sheetButtons}>
            <TouchableOpacity style={styles.cancelBtn} onPress={cancelStop}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.confirmBtn} onPress={confirmStop}>
              <Text style={styles.confirmBtnText}>Add Stop</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// --- Styles ------------------------------------------------------------------

const styles = StyleSheet.create({
  // Route List
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
    paddingTop: 60,
    paddingHorizontal: 20,
  },
  listHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  logoutButton: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  logoutButtonText: {
    color: '#F87171',
    fontWeight: '600',
    fontSize: 14,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: '#F1F5F9',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#94A3B8',
    marginBottom: 24,
    lineHeight: 22,
  },
  emptyText: {
    color: '#64748B',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 20,
    lineHeight: 22,
  },
  routeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  colorDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    marginRight: 14,
    flexShrink: 0,
  },
  routeName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#E2E8F0',
  },
  routeMeta: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  arrow: {
    fontSize: 22,
    color: '#64748B',
  },
  newRouteButton: {
    backgroundColor: '#10B981',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 20,
  },
  newRouteButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  deleteButton: {
    padding: 6,
    marginRight: 4,
  },
  deleteButtonText: {
    fontSize: 16,
  },

  // Builder Top Bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 56 : 36,
    paddingBottom: 10,
    paddingHorizontal: 14,
    backgroundColor: '#0F172A',
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
    gap: 8,
  },
  backBtn: {
    paddingVertical: 6,
    paddingRight: 4,
  },
  backLink: {
    color: '#38BDF8',
    fontSize: 14,
    fontWeight: '600',
  },
  routeNameInput: {
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: '#E2E8F0',
  },
  colorRow: {
    flexDirection: 'row',
    gap: 6,
  },
  colorSwatch: {
    width: 22,
    height: 22,
    borderRadius: 11,
  },
  colorSwatchSelected: {
    borderWidth: 2,
    borderColor: '#fff',
  },

  // Hint Overlay
  hintOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 80,
    marginBottom: 200,
  },
  hintBubble: {
    backgroundColor: 'rgba(15,23,42,0.85)',
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  hintText: {
    color: '#94A3B8',
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
  },

  // Bottom Drawer
  bottomDrawer: {
    backgroundColor: '#0F172A',
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
  },
  drawerHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#334155',
    alignSelf: 'center',
    marginBottom: 12,
  },
  drawerTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 10,
  },

  // Stop Rows
  stopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderRadius: 10,
    padding: 10,
    marginBottom: 6,
    gap: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  stopBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  stopBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  stopName: {
    flex: 1,
    fontSize: 13,
    color: '#E2E8F0',
    fontWeight: '500',
  },
  reorderButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  reorderIcon: {
    color: '#94A3B8',
    fontSize: 16,
    fontWeight: '600',
  },
  removeStop: {
    color: '#EF4444',
    fontSize: 13,
    fontWeight: '600',
  },

  // Save Button
  saveButton: {
    backgroundColor: '#10B981',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    marginTop: 10,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },

  // Stop Name Modal Sheet
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  nameSheet: {
    backgroundColor: '#0F172A',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
  },
  nameSheetTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#F1F5F9',
    marginBottom: 4,
  },
  nameSheetCoords: {
    fontSize: 11,
    color: '#475569',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginBottom: 16,
  },
  nameInput: {
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 13,
    fontSize: 15,
    color: '#E2E8F0',
    marginBottom: 16,
  },
  sheetButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelBtn: {
    flex: 1,
    padding: 14,
    borderRadius: 10,
    backgroundColor: '#1E293B',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  cancelBtnText: {
    color: '#94A3B8',
    fontSize: 15,
    fontWeight: '600',
  },
  confirmBtn: {
    flex: 2,
    padding: 14,
    borderRadius: 10,
    backgroundColor: '#10B981',
    alignItems: 'center',
  },
  confirmBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
});
