// RideSync Driver App — Sign Up Screen
//
// New drivers register with Name + Username + Password only. No email required.
// Internally we build a fake email (username@ridesync.driver) for Supabase Auth.
//
// On success:
//   1. Checks username is not already taken
//   2. Creates a Supabase Auth account using the fake email
//   3. Inserts a row into the `drivers` table (name + username + auth_id)
//   4. The DB auto-generates their unique short_code (e.g. DRV007)
//   5. We show them their code and save their profile locally

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
  ScrollView,
} from 'react-native';
import { supabase } from '../lib/supabase';
import { saveDriverProfile } from '../lib/storage';

interface Props {
  onSignUpSuccess: (driverId: string) => void;
  onBackToLogin: () => void;
}

// Converts a username to the internal fake email Supabase Auth uses
function usernameToEmail(username: string): string {
  return `${username.trim().toLowerCase()}@ridesync.driver`;
}

// Validates: 3-20 chars, only letters/numbers/underscores
function isValidUsername(username: string): boolean {
  return /^[a-zA-Z0-9_]{3,20}$/.test(username);
}

export default function SignUpScreen({ onSignUpSuccess, onBackToLogin }: Props) {
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // After signup, show the driver their auto-generated short code
  const [driverCode, setDriverCode] = useState<string | null>(null);
  const [driverId, setDriverId] = useState<string | null>(null);

  async function handleSignUp() {
    // --- Validation ---
    if (!name.trim()) { setError('Please enter your name.'); return; }
    if (!username.trim()) { setError('Please choose a username.'); return; }
    if (!isValidUsername(username)) {
      setError('Username must be 3-20 characters and only contain letters, numbers, or underscores (no spaces).');
      return;
    }
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    if (password !== confirmPassword) { setError('Passwords do not match.'); return; }

    setLoading(true);
    setError(null);

    // --- Step 1: Check if username is already taken ---
    const { data: existingDriver } = await supabase
      .from('drivers')
      .select('id')
      .eq('username', username.trim().toLowerCase())
      .maybeSingle();

    if (existingDriver) {
      setError('That username is already taken. Please choose a different one.');
      setLoading(false);
      return;
    }

    // --- Step 2: Create Supabase Auth account using the fake email ---
    const { data: authData, error: authErr } = await supabase.auth.signUp({
      email: usernameToEmail(username),
      password,
    });

    if (authErr || !authData.user) {
      setError(authErr?.message || 'Sign up failed. Please try again.');
      setLoading(false);
      return;
    }

    // --- Step 3: Insert driver profile ---
    const { data: driverData, error: driverErr } = await supabase
      .from('drivers')
      .insert({
        name: name.trim(),
        username: username.trim().toLowerCase(),
        auth_id: authData.user.id,
      })
      .select('id, name, short_code')
      .single();

    if (driverErr || !driverData) {
      setError('Account created but profile setup failed. Please contact support.');
      setLoading(false);
      return;
    }

    // --- Step 4: Save locally and show code ---
    await saveDriverProfile({ id: driverData.id, name: driverData.name });

    setDriverCode(driverData.short_code);
    setDriverId(driverData.id);
    setLoading(false);
  }

  // ─── Success Screen ──────────────────────────────────────────────────────────

  if (driverCode && driverId) {
    return (
      <View style={styles.container}>
        <View style={styles.successCard}>
          <Text style={styles.successEmoji}>🎉</Text>
          <Text style={styles.successTitle}>You're all set!</Text>
          <Text style={styles.successSubtitle}>Your unique Driver ID is:</Text>

          <View style={styles.codeBox}>
            <Text style={styles.codeText}>{driverCode}</Text>
          </View>

          <Text style={styles.codeHint}>
            Share this code with your students so they can track your bus. You can find it again in your profile settings.
          </Text>

          <TouchableOpacity
            style={styles.continueButton}
            onPress={() => onSignUpSuccess(driverId)}
            activeOpacity={0.8}
          >
            <Text style={styles.continueButtonText}>Continue to App →</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ─── Sign Up Form ────────────────────────────────────────────────────────────

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView style={styles.container} contentContainerStyle={styles.inner}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.logo}>🚌</Text>
          <Text style={styles.appName}>RideSync</Text>
          <Text style={styles.tagline}>DRIVER SIGN UP</Text>
        </View>

        {/* Form */}
        <View style={styles.form}>
          <Text style={styles.label}>Your Name</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Ravi Kumar"
            placeholderTextColor="#475569"
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
          />

          <Text style={styles.label}>Username</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. ravi_driver (no spaces)"
            placeholderTextColor="#475569"
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Text style={styles.fieldHint}>3-20 characters. Letters, numbers, underscores only.</Text>

          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            placeholder="At least 6 characters"
            placeholderTextColor="#475569"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          <Text style={styles.label}>Confirm Password</Text>
          <TextInput
            style={styles.input}
            placeholder="Repeat password"
            placeholderTextColor="#475569"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
          />

          {error && <Text style={styles.errorText}>{error}</Text>}

          <TouchableOpacity
            style={[styles.signUpButton, loading && { opacity: 0.6 }]}
            onPress={handleSignUp}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.signUpButtonText}>Create Account</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Back to login */}
        <TouchableOpacity onPress={onBackToLogin} style={styles.loginLink}>
          <Text style={styles.loginLinkText}>
            Already have an account?{' '}
            <Text style={{ color: '#38BDF8' }}>Log In</Text>
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  inner: {
    paddingHorizontal: 28,
    paddingTop: 60,
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 36,
  },
  logo: { fontSize: 48, marginBottom: 10 },
  appName: {
    fontSize: 28,
    fontWeight: '800',
    color: '#F1F5F9',
    letterSpacing: 1,
  },
  tagline: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
    letterSpacing: 3,
    marginTop: 4,
  },
  form: { marginBottom: 24 },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: '#E2E8F0',
    marginBottom: 8,
  },
  fieldHint: {
    fontSize: 11,
    color: '#475569',
    marginBottom: 16,
    marginTop: 0,
  },
  errorText: {
    color: '#F87171',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 12,
  },
  signUpButton: {
    backgroundColor: '#10B981',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  signUpButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  loginLink: { alignItems: 'center' },
  loginLinkText: {
    fontSize: 14,
    color: '#64748B',
  },

  // ─── Success screen ────────────────────────────────────────────
  successCard: {
    flex: 1,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  successEmoji: { fontSize: 56, marginBottom: 16 },
  successTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#F1F5F9',
    marginBottom: 8,
  },
  successSubtitle: {
    fontSize: 15,
    color: '#94A3B8',
    marginBottom: 20,
  },
  codeBox: {
    backgroundColor: '#1E293B',
    borderWidth: 2,
    borderColor: '#10B981',
    borderRadius: 16,
    paddingHorizontal: 32,
    paddingVertical: 20,
    marginBottom: 16,
  },
  codeText: {
    fontSize: 36,
    fontWeight: '800',
    color: '#10B981',
    letterSpacing: 6,
  },
  codeHint: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 32,
    paddingHorizontal: 8,
  },
  continueButton: {
    backgroundColor: '#10B981',
    borderRadius: 12,
    paddingHorizontal: 32,
    paddingVertical: 16,
    width: '100%',
    alignItems: 'center',
  },
  continueButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
