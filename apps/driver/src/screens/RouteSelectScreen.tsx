// RideSync Driver App - Route Selection Screen
// Shown when the driver has no previously selected route (or wants to change it).
// Fetches available routes from Supabase and lets the driver pick one.

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { supabase } from '../lib/supabase';
import { saveLastRoute } from '../lib/storage';

interface Route {
  id: string;
  name: string;
  color: string | null;
}

interface Props {
  driverId: string;
  onRouteSelected: (route: Route) => void;
}

export default function RouteSelectScreen({ driverId, onRouteSelected }: Props) {
  const [routes, setRoutes] = useState<Route[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchRoutes();
  }, []);

  async function fetchRoutes() {
    setLoading(true);
    setError(null);

    // Fetch routes for the driver's organization
    // First get the driver's org_id, then fetch routes for that org
    const { data: driver, error: driverErr } = await supabase
      .from('drivers')
      .select('org_id')
      .eq('id', driverId)
      .single();

    if (driverErr || !driver) {
      setError('Could not load your profile. Please try again.');
      setLoading(false);
      return;
    }

    const { data: routeData, error: routeErr } = await supabase
      .from('routes')
      .select('id, name, color')
      .eq('org_id', driver.org_id)
      .order('name');

    if (routeErr) {
      setError('Could not load routes. Please try again.');
    } else {
      setRoutes(routeData || []);
    }

    setLoading(false);
  }

  async function handleSelect(route: Route) {
    await saveLastRoute({ id: route.id, name: route.name });
    onRouteSelected(route);
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#10B981" />
        <Text style={styles.loadingText}>Loading routes...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={fetchRoutes}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Select Your Route</Text>
      <Text style={styles.subtitle}>
        Pick the route you are driving today. This will be remembered for next time.
      </Text>

      <FlatList
        data={routes}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.routeCard}
            onPress={() => handleSelect(item)}
            activeOpacity={0.7}
          >
            <View
              style={[
                styles.routeColorDot,
                { backgroundColor: item.color || '#6B7280' },
              ]}
            />
            <Text style={styles.routeName}>{item.name}</Text>
            <Text style={styles.arrow}>›</Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={styles.centered}>
            <Text style={styles.emptyText}>
              No routes found. Ask your admin to create routes first.
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
    paddingTop: 60,
    paddingHorizontal: 20,
  },
  centered: {
    flex: 1,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#F1F5F9',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: '#94A3B8',
    marginBottom: 24,
    lineHeight: 22,
  },
  list: {
    paddingBottom: 40,
  },
  routeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 18,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  routeColorDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    marginRight: 14,
  },
  routeName: {
    flex: 1,
    fontSize: 17,
    fontWeight: '600',
    color: '#E2E8F0',
  },
  arrow: {
    fontSize: 24,
    color: '#64748B',
    fontWeight: '300',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 15,
    color: '#94A3B8',
  },
  errorText: {
    fontSize: 16,
    color: '#F87171',
    textAlign: 'center',
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: '#10B981',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 15,
  },
  emptyText: {
    fontSize: 15,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 22,
  },
});
