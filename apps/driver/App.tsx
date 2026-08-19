// RideSync Driver App - Main Application Entry Point
// This is the root component that manages the app's navigation flow:
// 1. Login → 2. Route Selection → 3. Transmitting
//
// The flow is kept dead simple:
// - If the driver has previously logged in and selected a route, they go
//   straight to the "Start Transmitting" screen (one tap and drive).
// - If not, they log in once and pick a route once.

import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View, StyleSheet } from 'react-native';

import LoginScreen from './src/screens/LoginScreen';
import SignUpScreen from './src/screens/SignUpScreen';
import RouteBuilderScreen from './src/screens/RouteBuilderScreen';
import TransmittingScreen from './src/screens/TransmittingScreen';
import { getDriverProfile, getLastRoute, SavedRoute } from './src/lib/storage';

type AppScreen = 'loading' | 'login' | 'signup' | 'route_select' | 'transmitting';

export default function App() {
  const [screen, setScreen] = useState<AppScreen>('loading');
  const [driverId, setDriverId] = useState<string | null>(null);
  const [driverShortCode, setDriverShortCode] = useState<string | null>(null);
  const [selectedRoute, setSelectedRoute] = useState<SavedRoute | null>(null);
  const [activeTripId, setActiveTripId] = useState<string | null>(null);

  // On app launch, check if the driver is already logged in and has a saved route
  useEffect(() => {
    async function init() {
      const profile = await getDriverProfile();
      if (!profile) {
        setScreen('login');
        return;
      }

      setDriverId(profile.id);
      if (profile.short_code) setDriverShortCode(profile.short_code);

      const lastRoute = await getLastRoute();
      if (lastRoute) {
        setSelectedRoute(lastRoute);
        setScreen('transmitting');
      } else {
        setScreen('route_select');
      }
    }

    init();
  }, []);

  // ─── Screen Handlers ────────────────────────────────────────────────────

  function handleLoginSuccess(id: string, shortCode: string) {
    setDriverId(id);
    setDriverShortCode(shortCode);
    setScreen('route_select');
  }

  function handleGoToSignUp() {
    setScreen('signup');
  }

  function handleSignUpSuccess(id: string) {
    setDriverId(id);
    setScreen('route_select');
  }

  function handleBackToLogin() {
    setScreen('login');
  }

  function handleRouteSelected(route: { id: string; name: string }) {
    setSelectedRoute({ id: route.id, name: route.name });
    setScreen('transmitting');
  }

  function handleTripStarted(tripId: string) {
    setActiveTripId(tripId);
  }

  function handleTripEnded() {
    setActiveTripId(null);
  }

  function handleChangeRoute() {
    setScreen('route_select');
  }

  async function handleLogout() {
    const { clearDriverProfile } = await import('./src/lib/storage');
    await clearDriverProfile();
    setDriverId(null);
    setDriverShortCode(null);
    setSelectedRoute(null);
    setActiveTripId(null);
    setScreen('login');
  }

  // ─── Render ─────────────────────────────────────────────────────────────

  if (screen === 'loading') {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#10B981" />
        <StatusBar style="light" />
      </View>
    );
  }

  if (screen === 'login') {
    return (
      <>
        <LoginScreen onLoginSuccess={handleLoginSuccess} onGoToSignUp={handleGoToSignUp} />
        <StatusBar style="light" />
      </>
    );
  }

  if (screen === 'signup') {
    return (
      <>
        <SignUpScreen onSignUpSuccess={handleSignUpSuccess} onBackToLogin={handleBackToLogin} />
        <StatusBar style="light" />
      </>
    );
  }

  if (screen === 'route_select' && driverId) {
    return (
      <>
        <RouteBuilderScreen
          onRouteSelected={handleRouteSelected}
          onLogout={handleLogout}
        />
        <StatusBar style="light" />
      </>
    );
  }

  if (screen === 'transmitting' && driverId && selectedRoute) {
    return (
      <>
        <TransmittingScreen
          tripId={activeTripId}
          driverId={driverId}
          routeId={selectedRoute.id}
          routeName={selectedRoute.name}
          shortCode={driverShortCode}
          onTripStarted={handleTripStarted}
          onTripEnded={handleTripEnded}
          onChangeRoute={handleChangeRoute}
        />
        <StatusBar style="light" />
      </>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
