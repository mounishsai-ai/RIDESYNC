// RideSync Driver App - Transmitting Screen
// This is the main screen the driver sees after selecting a route.
// It has ONE big button: START / STOP TRANSMITTING.
// That's it. Transmit and forget.

import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Alert,
} from 'react-native';
import {
  requestLocationPermissions,
  startTransmitting,
  stopTransmitting,
  isTransmitting as checkIsTransmitting,
  getCurrentLocation,
  sendHeartbeat,
} from '../lib/locationService';
import { supabase } from '../lib/supabase';

interface Props {
  tripId: string | null;
  driverId: string;
  routeId: string;
  routeName: string;
  shortCode: string | null;
  onTripStarted: (tripId: string) => void;
  onTripEnded: () => void;
  onChangeRoute: () => void;
}

export default function TransmittingScreen({
  tripId,
  driverId,
  routeId,
  routeName,
  shortCode,
  onTripStarted,
  onTripEnded,
  onChangeRoute,
}: Props) {
  const [transmitting, setTransmitting] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeTripIdRef = useRef<string | null>(tripId);

  // Check if already transmitting on mount
  useEffect(() => {
    checkIsTransmitting().then((active) => {
      if (active && tripId) {
        setTransmitting(true);
      }
    });
  }, []);

  // Pulse animation when transmitting
  useEffect(() => {
    if (transmitting) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.15,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [transmitting]);

  // Elapsed time counter
  useEffect(() => {
    if (transmitting) {
      timerRef.current = setInterval(() => {
        setElapsed((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      setElapsed(0);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [transmitting]);

  function formatElapsed(seconds: number): string {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
  }

  async function handleStart() {
    // 1. Request permissions
    const hasPermissions = await requestLocationPermissions();
    if (!hasPermissions) {
      Alert.alert(
        'Location Permission Required',
        'RideSync needs background location access to transmit your position to students. Please enable it in Settings.',
        [{ text: 'OK' }]
      );
      return;
    }

    // 2. Create a new trip in the database
    const { data: trip, error } = await supabase
      .from('trips')
      .insert({
        route_id: routeId,
        driver_id: driverId,
        status: 'active',
      })
      .select('id')
      .single();

    if (error || !trip) {
      Alert.alert('Error', 'Could not start trip. Please try again.');
      return;
    }

    // 3. Start background location tracking
    const started = await startTransmitting(trip.id, driverId);
    if (started) {
      activeTripIdRef.current = trip.id;
      setTransmitting(true);
      onTripStarted(trip.id);
      // Start heartbeat every 5 minutes to keep the trip alive
      heartbeatRef.current = setInterval(() => {
        if (activeTripIdRef.current) sendHeartbeat(activeTripIdRef.current);
      }, 5 * 60 * 1000);
    } else {
      Alert.alert('Error', 'Could not start location tracking. Please try again.');
    }
  }

  async function handleStop() {
    Alert.alert(
      'End Trip',
      'Are you sure you want to stop transmitting?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Stop',
          style: 'destructive',
          onPress: async () => {
            await stopTransmitting();
            // Stop heartbeat
            if (heartbeatRef.current) clearInterval(heartbeatRef.current);
            activeTripIdRef.current = null;

            // Update the trip status in the database
            if (tripId) {
              await supabase
                .from('trips')
                .update({ status: 'completed', ended_at: new Date().toISOString() })
                .eq('id', tripId);
            }

            setTransmitting(false);
            onTripEnded();
          },
        },
      ]
    );
  }

  return (
    <View style={styles.container}>
      {/* Route Info Header */}
      <View style={styles.header}>
        <Text style={styles.routeLabel}>CURRENT ROUTE</Text>
        <Text style={styles.routeName}>{routeName}</Text>
        <TouchableOpacity onPress={onChangeRoute} disabled={transmitting}>
          <Text style={[styles.changeRoute, transmitting && styles.disabled]}>
            Change Route
          </Text>
        </TouchableOpacity>
      </View>

      {/* Driver Code Banner — the most important thing a driver needs */}
      {shortCode && (
        <View style={styles.codeBanner}>
          <Text style={styles.codeLabel}>YOUR DRIVER CODE</Text>
          <Text style={styles.codeValue}>{shortCode}</Text>
          <Text style={styles.codeHint}>Tell students to enter this code on the website</Text>
        </View>
      )}

      {/* Status Area */}
      <View style={styles.statusArea}>
        {transmitting && (
          <>
            <Text style={styles.liveLabel}>● LIVE</Text>
            <Text style={styles.elapsed}>{formatElapsed(elapsed)}</Text>
            <Text style={styles.statusSubtext}>
              Transmitting your location to students
            </Text>
          </>
        )}
        {!transmitting && (
          <Text style={styles.readyText}>Ready to transmit</Text>
        )}
      </View>

      {/* The Big Button */}
      <View style={styles.buttonArea}>
        <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
          <TouchableOpacity
            style={[
              styles.bigButton,
              transmitting ? styles.bigButtonStop : styles.bigButtonStart,
            ]}
            onPress={transmitting ? handleStop : handleStart}
            activeOpacity={0.8}
          >
            <Text style={styles.bigButtonText}>
              {transmitting ? 'STOP' : 'START\nTRANSMITTING'}
            </Text>
          </TouchableOpacity>
        </Animated.View>

        {!transmitting && (
          <Text style={styles.hint}>
            Tap to start. You can lock your phone afterwards.
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
    paddingTop: 60,
  },
  header: {
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  routeLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
    letterSpacing: 2,
    marginBottom: 6,
  },
  routeName: {
    fontSize: 22,
    fontWeight: '700',
    color: '#F1F5F9',
    marginBottom: 8,
    textAlign: 'center',
  },
  changeRoute: {
    fontSize: 14,
    color: '#38BDF8',
    fontWeight: '500',
  },
  disabled: {
    color: '#334155',
  },
  codeBanner: {
    marginHorizontal: 20,
    marginTop: 16,
    backgroundColor: '#0F2E1E',
    borderWidth: 1.5,
    borderColor: '#10B981',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  codeLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#10B981',
    letterSpacing: 2,
    marginBottom: 4,
  },
  codeValue: {
    fontSize: 36,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 6,
    marginBottom: 4,
  },
  codeHint: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
  },
  statusArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  liveLabel: {
    fontSize: 18,
    fontWeight: '700',
    color: '#10B981',
    letterSpacing: 3,
    marginBottom: 12,
  },
  elapsed: {
    fontSize: 48,
    fontWeight: '200',
    color: '#E2E8F0',
    fontVariant: ['tabular-nums'],
    marginBottom: 8,
  },
  statusSubtext: {
    fontSize: 14,
    color: '#64748B',
  },
  readyText: {
    fontSize: 18,
    color: '#64748B',
    fontWeight: '500',
  },
  buttonArea: {
    alignItems: 'center',
    paddingBottom: 60,
    paddingHorizontal: 20,
  },
  bigButton: {
    width: 180,
    height: 180,
    borderRadius: 90,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
  },
  bigButtonStart: {
    backgroundColor: '#10B981',
  },
  bigButtonStop: {
    backgroundColor: '#EF4444',
  },
  bigButtonText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
    letterSpacing: 1,
    lineHeight: 24,
  },
  hint: {
    marginTop: 20,
    fontSize: 13,
    color: '#475569',
    textAlign: 'center',
  },
});
