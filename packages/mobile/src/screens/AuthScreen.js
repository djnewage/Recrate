/**
 * Authentication Screen
 * Handles user sign-in and sign-up with Apple, Google, and Email/Password
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Alert,
  Linking,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as AppleAuthentication from 'expo-apple-authentication';
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS } from '../constants/theme';
import { useAuthStore } from '../store/authStore';

const PRIVACY_POLICY_URL = 'https://recrate.app/privacy';
const TERMS_OF_SERVICE_URL = 'https://recrate.app/terms';

const AuthScreen = () => {
  // Auth store
  const {
    signInWithApple,
    signInWithGoogle,
    signInWithEmail,
    signUp,
    resetPassword,
    isLoading,
    error,
    clearError,
  } = useAuthStore();

  // Local state
  const [mode, setMode] = useState('signin'); // 'signin' | 'signup' | 'reset'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [appleAuthAvailable, setAppleAuthAvailable] = useState(false);

  // Check Apple authentication availability
  useEffect(() => {
    const checkAppleAuth = async () => {
      const isAvailable = await AppleAuthentication.isAvailableAsync();
      setAppleAuthAvailable(isAvailable);
    };
    checkAppleAuth();
  }, []);

  // Clear error when switching modes
  useEffect(() => {
    clearError();
  }, [mode]);

  // Handle Apple sign-in
  const handleAppleSignIn = async () => {
    const result = await signInWithApple();
    if (!result.success && !result.cancelled && result.error) {
      Alert.alert('Sign In Failed', result.error);
    }
  };

  // Handle Google sign-in
  const handleGoogleSignIn = async () => {
    const result = await signInWithGoogle();
    if (!result.success && !result.cancelled && result.error) {
      Alert.alert('Sign In Failed', result.error);
    }
  };

  // Handle email sign-in
  const handleEmailSignIn = async () => {
    if (!email.trim() || !password) {
      Alert.alert('Missing Information', 'Please enter your email and password.');
      return;
    }

    const result = await signInWithEmail(email, password);
    if (!result.success && result.error) {
      Alert.alert('Sign In Failed', result.error);
    }
  };

  // Handle sign-up
  const handleSignUp = async () => {
    if (!email.trim() || !password) {
      Alert.alert('Missing Information', 'Please enter your email and password.');
      return;
    }

    if (password.length < 6) {
      Alert.alert('Weak Password', 'Password must be at least 6 characters.');
      return;
    }

    const result = await signUp(email, password, displayName || null);
    if (!result.success && result.error) {
      Alert.alert('Sign Up Failed', result.error);
    }
  };

  // Handle password reset
  const handleResetPassword = async () => {
    if (!email.trim()) {
      Alert.alert('Missing Email', 'Please enter your email address.');
      return;
    }

    const result = await resetPassword(email);
    if (result.success) {
      Alert.alert(
        'Check Your Email',
        'If an account exists with this email, you will receive a password reset link.',
        [{ text: 'OK', onPress: () => setMode('signin') }]
      );
    } else if (result.error) {
      Alert.alert('Reset Failed', result.error);
    }
  };

  // Open links
  const openLink = (url) => {
    Linking.openURL(url).catch((err) => {
      console.error('Failed to open URL:', err);
    });
  };

  // Render mode title
  const getModeTitle = () => {
    switch (mode) {
      case 'signup':
        return 'Create Account';
      case 'reset':
        return 'Reset Password';
      default:
        return 'Welcome Back';
    }
  };

  // Render mode subtitle
  const getModeSubtitle = () => {
    switch (mode) {
      case 'signup':
        return 'Sign up to get started with Recrate';
      case 'reset':
        return 'Enter your email to receive a reset link';
      default:
        return 'Sign in to continue to Recrate';
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Logo and Title */}
          <View style={styles.header}>
            <Image
              source={require('../../assets/officialLogo.png')}
              style={styles.logo}
            />
            <Text style={styles.appName}>Recrate</Text>
            <Text style={styles.title}>{getModeTitle()}</Text>
            <Text style={styles.subtitle}>{getModeSubtitle()}</Text>
          </View>

          {/* Error Message */}
          {error && (
            <View style={styles.errorContainer}>
              <Ionicons name="alert-circle" size={20} color={COLORS.error} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {/* Social Sign-In Buttons */}
          {mode !== 'reset' && (
            <View style={styles.socialButtons}>
              {/* Apple Sign-In */}
              {appleAuthAvailable && (
                <TouchableOpacity
                  style={styles.socialButton}
                  onPress={handleAppleSignIn}
                  disabled={isLoading}
                >
                  <Ionicons name="logo-apple" size={24} color={COLORS.text} />
                  <Text style={styles.socialButtonText}>
                    Continue with Apple
                  </Text>
                </TouchableOpacity>
              )}

              {/* Google Sign-In */}
              <TouchableOpacity
                style={styles.socialButton}
                onPress={handleGoogleSignIn}
                disabled={isLoading}
              >
                <Ionicons name="logo-google" size={24} color={COLORS.text} />
                <Text style={styles.socialButtonText}>
                  Continue with Google
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Divider */}
          {mode !== 'reset' && (
            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.dividerLine} />
            </View>
          )}

          {/* Email Form */}
          <View style={styles.form}>
            {/* Display Name (Sign Up only) */}
            {mode === 'signup' && (
              <View style={styles.inputContainer}>
                <Ionicons
                  name="person-outline"
                  size={20}
                  color={COLORS.textSecondary}
                  style={styles.inputIcon}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Display Name (optional)"
                  placeholderTextColor={COLORS.textSecondary}
                  value={displayName}
                  onChangeText={setDisplayName}
                  autoCapitalize="words"
                  autoCorrect={false}
                  editable={!isLoading}
                />
              </View>
            )}

            {/* Email */}
            <View style={styles.inputContainer}>
              <Ionicons
                name="mail-outline"
                size={20}
                color={COLORS.textSecondary}
                style={styles.inputIcon}
              />
              <TextInput
                style={styles.input}
                placeholder="Email"
                placeholderTextColor={COLORS.textSecondary}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                editable={!isLoading}
              />
            </View>

            {/* Password (not for reset) */}
            {mode !== 'reset' && (
              <View style={styles.inputContainer}>
                <Ionicons
                  name="lock-closed-outline"
                  size={20}
                  color={COLORS.textSecondary}
                  style={styles.inputIcon}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Password"
                  placeholderTextColor={COLORS.textSecondary}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!isLoading}
                />
                <TouchableOpacity
                  onPress={() => setShowPassword(!showPassword)}
                  style={styles.passwordToggle}
                >
                  <Ionicons
                    name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                    size={20}
                    color={COLORS.textSecondary}
                  />
                </TouchableOpacity>
              </View>
            )}

            {/* Forgot Password Link */}
            {mode === 'signin' && (
              <TouchableOpacity
                onPress={() => setMode('reset')}
                style={styles.forgotPassword}
              >
                <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
              </TouchableOpacity>
            )}

            {/* Submit Button */}
            <TouchableOpacity
              style={[styles.submitButton, isLoading && styles.submitButtonDisabled]}
              onPress={
                mode === 'signin'
                  ? handleEmailSignIn
                  : mode === 'signup'
                    ? handleSignUp
                    : handleResetPassword
              }
              disabled={isLoading}
            >
              <LinearGradient
                colors={[COLORS.primary, COLORS.secondary]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.submitButtonGradient}
              >
                {isLoading ? (
                  <ActivityIndicator color={COLORS.text} />
                ) : (
                  <Text style={styles.submitButtonText}>
                    {mode === 'signin'
                      ? 'Sign In'
                      : mode === 'signup'
                        ? 'Create Account'
                        : 'Send Reset Link'}
                  </Text>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </View>

          {/* Mode Toggle */}
          <View style={styles.modeToggle}>
            {mode === 'reset' ? (
              <TouchableOpacity onPress={() => setMode('signin')}>
                <Text style={styles.modeToggleText}>
                  <Text style={styles.modeToggleLink}>Back to Sign In</Text>
                </Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPress={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
              >
                <Text style={styles.modeToggleText}>
                  {mode === 'signin'
                    ? "Don't have an account? "
                    : 'Already have an account? '}
                  <Text style={styles.modeToggleLink}>
                    {mode === 'signin' ? 'Sign Up' : 'Sign In'}
                  </Text>
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Legal Links */}
          <View style={styles.legalLinks}>
            <Text style={styles.legalText}>
              By continuing, you agree to our{' '}
              <Text
                style={styles.legalLink}
                onPress={() => openLink(TERMS_OF_SERVICE_URL)}
              >
                Terms of Service
              </Text>
              {' and '}
              <Text
                style={styles.legalLink}
                onPress={() => openLink(PRIVACY_POLICY_URL)}
              >
                Privacy Policy
              </Text>
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
  },
  header: {
    alignItems: 'center',
    marginTop: 0,
    marginBottom: SPACING.sm,
  },
  logo: {
    width: 80,
    height: 80,
    borderRadius: 20,
    marginBottom: SPACING.sm,
  },
  appName: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  title: {
    fontSize: FONT_SIZES.xl,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  subtitle: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: `${COLORS.error}20`,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    marginBottom: SPACING.md,
  },
  errorText: {
    color: COLORS.error,
    fontSize: FONT_SIZES.sm,
    marginLeft: SPACING.sm,
    flex: 1,
  },
  socialButtons: {
    gap: SPACING.sm,
  },
  socialButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.md,
    paddingVertical: 12,
    paddingHorizontal: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  socialButtonText: {
    color: COLORS.text,
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    marginLeft: SPACING.sm,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: SPACING.sm,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.border,
  },
  dividerText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.sm,
    marginHorizontal: SPACING.md,
  },
  form: {
    gap: SPACING.sm,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.md,
  },
  inputIcon: {
    marginRight: SPACING.sm,
  },
  input: {
    flex: 1,
    color: COLORS.text,
    fontSize: FONT_SIZES.md,
    paddingVertical: 12,
  },
  passwordToggle: {
    padding: SPACING.sm,
  },
  forgotPassword: {
    alignSelf: 'flex-end',
  },
  forgotPasswordText: {
    color: COLORS.primary,
    fontSize: FONT_SIZES.sm,
  },
  submitButton: {
    borderRadius: BORDER_RADIUS.md,
    overflow: 'hidden',
    marginTop: SPACING.sm,
  },
  submitButtonDisabled: {
    opacity: 0.7,
  },
  submitButtonGradient: {
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButtonText: {
    color: COLORS.text,
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
  },
  modeToggle: {
    marginTop: SPACING.md,
    alignItems: 'center',
  },
  modeToggleText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.sm,
  },
  modeToggleLink: {
    color: COLORS.primary,
    fontWeight: '600',
  },
  legalLinks: {
    marginTop: SPACING.md,
    paddingHorizontal: SPACING.md,
  },
  legalText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.xs,
    textAlign: 'center',
    lineHeight: 18,
  },
  legalLink: {
    color: COLORS.primary,
  },
});

export default AuthScreen;
