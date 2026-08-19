// RideSync Driver App - Login Screen
// Drivers log in with username + password only. No email required.
// Internally we build a fake email (username@ridesync.driver) for Supabase Auth.

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

// Converts a username to the internal fake email Supabase Auth uses
function usernameToEmail(username: string): string {
  return `${username.trim().toLowerCase()}@ridesync.driver`;
}

export default function LoginScreen({ onLoginSuccess, onGoToSignUp }: Props) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLogin() {
    if (!username.trim() || !password.trim()) {
      setError('Please enter both username and password.');
      return;
    }

    setLoading(true);
    setError(null);

    // 1. Sign in with Supabase Auth using the fake email
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: usernameToEmail(username),
      password: password.trim(),
    });

    if (authError) {
      // Give a friendly message instead of Supabase's technical one
      setError('Incorrect username or password. Please try again.');
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
      setError('No driver profile found. Contact your school administrator.');
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
            placeholder="Username"
            placeholderTextColor="#475569"
            value={username}
            onChangeText={setUsername}
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

          <Text style={styles.forgotNote}>
            Forgot password? Contact your school administrator.
          </Text>
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
  forgotNote: {
    color: '#475569',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 14,
  },
  footer: {
    textAlign: 'center',
    color: '#475569',
    fontSize: 13,
    lineHeight: 20,
  },
});
