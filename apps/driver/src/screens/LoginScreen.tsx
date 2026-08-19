// RideSync Driver App - Login Screen
// Simple login screen for drivers. Uses Supabase Auth.

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { supabase } from '../lib/supabase';
import { saveDriverProfile } from '../lib/storage';

interface Props {
  onLoginSuccess: (driverId: string, shortCode: string) => void;
  onGoToSignUp: () => void;
}

export default function LoginScreen({ onLoginSuccess, onGoToSignUp }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLogin() {
    if (!email.trim() || !password.trim()) {
      setError('Please enter both email and password.');
      return;
    }

    setLoading(true);
    setError(null);

    // 1. Sign in with Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password: password.trim(),
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    // 2. Fetch the driver profile linked to this auth user
    const { data: driver, error: driverError } = await supabase
      .from('drivers')
      .select('id, name, short_code')
      .eq('auth_id', authData.user.id)
      .single();

    if (driverError || !driver) {
      setError('No driver profile found for this account. Contact your admin.');
      setLoading(false);
      return;
    }

    // 3. Save the driver profile locally
    await saveDriverProfile({ id: driver.id, name: driver.name, short_code: driver.short_code });

    setLoading(false);
    onLoginSuccess(driver.id, driver.short_code);
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.inner}>
        {/* Branding */}
        <View style={styles.branding}>
          <Text style={styles.logo}>🚌</Text>
          <Text style={styles.appName}>RideSync</Text>
          <Text style={styles.tagline}>Driver</Text>
        </View>

        {/* Form */}
        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor="#475569"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor="#475569"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          {error && <Text style={styles.errorText}>{error}</Text>}

          <TouchableOpacity
            style={[styles.loginButton, loading && styles.loginButtonDisabled]}
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.loginButtonText}>Log In</Text>
            )}
          </TouchableOpacity>
        </View>

        <TouchableOpacity onPress={onGoToSignUp} style={{ alignItems: 'center' }}>
          <Text style={styles.footer}>
            New driver?{' '}
            <Text style={{ color: '#38BDF8', fontWeight: '600' }}>Create an account</Text>
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  inner: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  branding: {
    alignItems: 'center',
    marginBottom: 48,
  },
  logo: {
    fontSize: 56,
    marginBottom: 12,
  },
  appName: {
    fontSize: 32,
    fontWeight: '800',
    color: '#F1F5F9',
    letterSpacing: 1,
  },
  tagline: {
    fontSize: 16,
    color: '#64748B',
    fontWeight: '500',
    marginTop: 4,
    letterSpacing: 3,
    textTransform: 'uppercase',
  },
  form: {
    marginBottom: 32,
  },
  input: {
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 16,
    fontSize: 16,
    color: '#E2E8F0',
    marginBottom: 14,
  },
  errorText: {
    color: '#F87171',
    fontSize: 14,
    marginBottom: 14,
    textAlign: 'center',
  },
  loginButton: {
    backgroundColor: '#10B981',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  loginButtonDisabled: {
    opacity: 0.6,
  },
  loginButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
  footer: {
    textAlign: 'center',
    color: '#475569',
    fontSize: 13,
    lineHeight: 20,
  },
});
