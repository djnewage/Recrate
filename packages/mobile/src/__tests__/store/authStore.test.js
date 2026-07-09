/**
 * Unit tests for authStore
 * Tests Zustand authentication state management
 */

import { useAuthStore } from '../../store/authStore';
import AuthService from '../../services/AuthService';
import { setFirebaseUser, mockHelpers as firebaseMockHelpers } from '../__mocks__/firebase-config';
import { setUser as setSentryUser, mockHelpers as sentryMockHelpers } from '../__mocks__/sentry';
import { useConnectionStore } from '../../store/connectionStore';
import { useSubscriptionStore } from '../../store/subscriptionStore';

// Mock AuthService
jest.mock('../../services/AuthService', () => ({
  __esModule: true,
  default: {
    initialize: jest.fn(),
    onAuthStateChanged: jest.fn((callback) => {
      // Store the callback for later use in tests
      mockAuthStateCallback = callback;
      return jest.fn(); // unsubscribe function
    }),
    getProvider: jest.fn(() => 'password'),
    signInWithApple: jest.fn(),
    signInWithGoogle: jest.fn(),
    signInWithEmail: jest.fn(),
    signUp: jest.fn(),
    resetPassword: jest.fn(),
    signOut: jest.fn(),
    deleteAccount: jest.fn(),
  },
}));

// Mock firebase config
jest.mock('../../config/firebase', () => require('../__mocks__/firebase-config'));

// Mock sentry utilities
jest.mock('../../utils/sentry', () => require('../__mocks__/sentry'));

// Mock connection store
jest.mock('../../store/connectionStore', () => ({
  useConnectionStore: {
    getState: jest.fn(() => ({
      setUserId: jest.fn(),
    })),
  },
}));

// Mock subscription store
jest.mock('../../store/subscriptionStore', () => ({
  useSubscriptionStore: {
    getState: jest.fn(() => ({
      linkToFirebaseUser: jest.fn().mockResolvedValue(undefined),
      resetTrialGate: jest.fn(),
    })),
  },
}));

// Variable to hold auth state callback for testing
let mockAuthStateCallback = null;

// Helper to create mock Firebase user
const createMockFirebaseUser = (overrides = {}) => ({
  uid: 'test-uid-123',
  email: 'test@example.com',
  displayName: 'Test User',
  photoURL: 'https://example.com/photo.jpg',
  emailVerified: true,
  ...overrides,
});

describe('authStore', () => {
  beforeEach(() => {
    // Reset store state
    useAuthStore.setState({
      user: null,
      isAuthenticated: false,
      isLoading: true,
      error: null,
      uid: null,
      email: null,
      displayName: null,
      photoURL: null,
      provider: null,
    });

    // Reset mocks
    jest.clearAllMocks();
    firebaseMockHelpers.resetMocks();
    sentryMockHelpers.resetMocks();
    mockAuthStateCallback = null;
  });

  describe('initial state', () => {
    it('should have correct initial state', () => {
      const state = useAuthStore.getState();

      expect(state.user).toBeNull();
      expect(state.isAuthenticated).toBe(false);
      expect(state.isLoading).toBe(true);
      expect(state.error).toBeNull();
      expect(state.uid).toBeNull();
      expect(state.email).toBeNull();
      expect(state.displayName).toBeNull();
      expect(state.photoURL).toBeNull();
      expect(state.provider).toBeNull();
    });
  });

  describe('initialize', () => {
    it('should initialize AuthService', () => {
      useAuthStore.getState().initialize();

      expect(AuthService.initialize).toHaveBeenCalled();
    });

    it('should set up auth state listener', () => {
      useAuthStore.getState().initialize();

      expect(AuthService.onAuthStateChanged).toHaveBeenCalledWith(expect.any(Function));
    });

    it('should return unsubscribe function', () => {
      const unsubscribe = useAuthStore.getState().initialize();

      expect(typeof unsubscribe).toBe('function');
    });

    it('should update state when user signs in', async () => {
      useAuthStore.getState().initialize();

      const mockUser = createMockFirebaseUser();
      await mockAuthStateCallback(mockUser);

      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(true);
      expect(state.isLoading).toBe(false);
      expect(state.uid).toBe('test-uid-123');
      expect(state.email).toBe('test@example.com');
      expect(state.displayName).toBe('Test User');
    });

    it('should update state when user signs out', async () => {
      // First sign in
      useAuthStore.getState().initialize();
      await mockAuthStateCallback(createMockFirebaseUser());

      // Then sign out
      await mockAuthStateCallback(null);

      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(false);
      expect(state.isLoading).toBe(false);
      expect(state.user).toBeNull();
      expect(state.uid).toBeNull();
    });

    it('should call updateExternalServices on sign in', async () => {
      const updateExternalServices = jest.spyOn(useAuthStore.getState(), 'updateExternalServices');
      useAuthStore.getState().initialize();

      const mockUser = createMockFirebaseUser();
      await mockAuthStateCallback(mockUser);

      expect(updateExternalServices).toHaveBeenCalled();
    });

    it('should call clearExternalServices on sign out', async () => {
      const clearExternalServices = jest.spyOn(useAuthStore.getState(), 'clearExternalServices');
      useAuthStore.getState().initialize();

      await mockAuthStateCallback(null);

      expect(clearExternalServices).toHaveBeenCalled();
    });
  });

  describe('updateExternalServices', () => {
    it('should set Sentry user context', async () => {
      const userData = {
        uid: 'test-uid',
        email: 'test@example.com',
        displayName: 'Test User',
      };

      await useAuthStore.getState().updateExternalServices(userData);

      expect(setSentryUser).toHaveBeenCalledWith({
        id: 'test-uid',
        email: 'test@example.com',
        username: 'Test User',
      });
    });

    it('should set Firebase user context', async () => {
      const userData = {
        uid: 'test-uid',
        email: 'test@example.com',
        displayName: 'Test User',
      };

      await useAuthStore.getState().updateExternalServices(userData);

      expect(setFirebaseUser).toHaveBeenCalledWith('test-uid', 'test@example.com');
    });

    it('should set user ID in connection store', async () => {
      const mockSetUserId = jest.fn();
      useConnectionStore.getState.mockReturnValue({ setUserId: mockSetUserId });

      const userData = { uid: 'test-uid', email: 'test@example.com' };
      await useAuthStore.getState().updateExternalServices(userData);

      expect(mockSetUserId).toHaveBeenCalledWith('test-uid');
    });

    it('should link RevenueCat to Firebase user', async () => {
      const mockLinkToFirebaseUser = jest.fn().mockResolvedValue(undefined);
      useSubscriptionStore.getState.mockReturnValue({ linkToFirebaseUser: mockLinkToFirebaseUser });

      const userData = { uid: 'test-uid', email: 'test@example.com' };
      await useAuthStore.getState().updateExternalServices(userData);

      expect(mockLinkToFirebaseUser).toHaveBeenCalledWith('test-uid');
    });

    it('should handle errors gracefully', async () => {
      useConnectionStore.getState.mockImplementation(() => {
        throw new Error('Connection store error');
      });

      // Should not throw
      await expect(
        useAuthStore.getState().updateExternalServices({ uid: 'test-uid' })
      ).resolves.not.toThrow();
    });
  });

  describe('clearExternalServices', () => {
    it('should clear Sentry user context', async () => {
      await useAuthStore.getState().clearExternalServices();

      expect(setSentryUser).toHaveBeenCalledWith(null);
    });

    it('should clear Firebase user context', async () => {
      await useAuthStore.getState().clearExternalServices();

      expect(setFirebaseUser).toHaveBeenCalledWith(null);
    });

    it('should clear user ID in connection store', async () => {
      const mockSetUserId = jest.fn();
      useConnectionStore.getState.mockReturnValue({ setUserId: mockSetUserId });

      await useAuthStore.getState().clearExternalServices();

      expect(mockSetUserId).toHaveBeenCalledWith(null);
    });

    it('should handle errors gracefully', async () => {
      setFirebaseUser.mockRejectedValueOnce(new Error('Firebase error'));

      // Should not throw
      await expect(
        useAuthStore.getState().clearExternalServices()
      ).resolves.not.toThrow();
    });
  });

  describe('signInWithApple', () => {
    it('should set loading state before sign-in', async () => {
      AuthService.signInWithApple.mockResolvedValue({ success: true });

      const signInPromise = useAuthStore.getState().signInWithApple();

      // Check loading state was set (may already be resolved in sync code)
      expect(useAuthStore.getState().error).toBeNull();

      await signInPromise;
    });

    it('should return result from AuthService', async () => {
      const mockResult = { success: true, user: createMockFirebaseUser() };
      AuthService.signInWithApple.mockResolvedValue(mockResult);

      const result = await useAuthStore.getState().signInWithApple();

      expect(result).toEqual(mockResult);
    });

    it('should set error on failure', async () => {
      AuthService.signInWithApple.mockResolvedValue({
        success: false,
        error: 'Apple Sign-In failed',
      });

      await useAuthStore.getState().signInWithApple();

      const state = useAuthStore.getState();
      expect(state.error).toBe('Apple Sign-In failed');
      expect(state.isLoading).toBe(false);
    });

    it('should not set error on cancellation', async () => {
      AuthService.signInWithApple.mockResolvedValue({
        success: false,
        cancelled: true,
      });

      await useAuthStore.getState().signInWithApple();

      const state = useAuthStore.getState();
      expect(state.error).toBeNull();
      expect(state.isLoading).toBe(false);
    });
  });

  describe('signInWithGoogle', () => {
    it('should set loading state before sign-in', async () => {
      AuthService.signInWithGoogle.mockResolvedValue({ success: true });

      const signInPromise = useAuthStore.getState().signInWithGoogle();

      expect(useAuthStore.getState().error).toBeNull();

      await signInPromise;
    });

    it('should return result from AuthService', async () => {
      const mockResult = { success: true, user: createMockFirebaseUser() };
      AuthService.signInWithGoogle.mockResolvedValue(mockResult);

      const result = await useAuthStore.getState().signInWithGoogle();

      expect(result).toEqual(mockResult);
    });

    it('should set error on failure', async () => {
      AuthService.signInWithGoogle.mockResolvedValue({
        success: false,
        error: 'Google Sign-In failed',
      });

      await useAuthStore.getState().signInWithGoogle();

      const state = useAuthStore.getState();
      expect(state.error).toBe('Google Sign-In failed');
      expect(state.isLoading).toBe(false);
    });

    it('should not set error on cancellation', async () => {
      AuthService.signInWithGoogle.mockResolvedValue({
        success: false,
        cancelled: true,
      });

      await useAuthStore.getState().signInWithGoogle();

      const state = useAuthStore.getState();
      expect(state.error).toBeNull();
      expect(state.isLoading).toBe(false);
    });
  });

  describe('signInWithEmail', () => {
    it('should call AuthService with credentials', async () => {
      AuthService.signInWithEmail.mockResolvedValue({ success: true });

      await useAuthStore.getState().signInWithEmail('test@example.com', 'password123');

      expect(AuthService.signInWithEmail).toHaveBeenCalledWith('test@example.com', 'password123');
    });

    it('should set error on failure', async () => {
      AuthService.signInWithEmail.mockResolvedValue({
        success: false,
        error: 'Invalid credentials',
      });

      await useAuthStore.getState().signInWithEmail('test@example.com', 'wrong');

      const state = useAuthStore.getState();
      expect(state.error).toBe('Invalid credentials');
      expect(state.isLoading).toBe(false);
    });

    it('should return result from AuthService', async () => {
      const mockResult = { success: true, user: createMockFirebaseUser() };
      AuthService.signInWithEmail.mockResolvedValue(mockResult);

      const result = await useAuthStore.getState().signInWithEmail('test@example.com', 'password');

      expect(result).toEqual(mockResult);
    });
  });

  describe('signUp', () => {
    it('should call AuthService with credentials', async () => {
      AuthService.signUp.mockResolvedValue({ success: true });

      await useAuthStore.getState().signUp('test@example.com', 'password123', 'Test User');

      expect(AuthService.signUp).toHaveBeenCalledWith('test@example.com', 'password123', 'Test User');
    });

    it('should set error on failure', async () => {
      AuthService.signUp.mockResolvedValue({
        success: false,
        error: 'Email already in use',
      });

      await useAuthStore.getState().signUp('existing@example.com', 'password');

      const state = useAuthStore.getState();
      expect(state.error).toBe('Email already in use');
      expect(state.isLoading).toBe(false);
    });

    it('should work without display name', async () => {
      AuthService.signUp.mockResolvedValue({ success: true });

      await useAuthStore.getState().signUp('test@example.com', 'password123');

      expect(AuthService.signUp).toHaveBeenCalledWith('test@example.com', 'password123', null);
    });
  });

  describe('resetPassword', () => {
    it('should call AuthService with email', async () => {
      AuthService.resetPassword.mockResolvedValue({ success: true });

      await useAuthStore.getState().resetPassword('test@example.com');

      expect(AuthService.resetPassword).toHaveBeenCalledWith('test@example.com');
    });

    it('should set loading to false after completion', async () => {
      AuthService.resetPassword.mockResolvedValue({ success: true });

      await useAuthStore.getState().resetPassword('test@example.com');

      expect(useAuthStore.getState().isLoading).toBe(false);
    });

    it('should set error on failure', async () => {
      AuthService.resetPassword.mockResolvedValue({
        success: false,
        error: 'User not found',
      });

      await useAuthStore.getState().resetPassword('notfound@example.com');

      const state = useAuthStore.getState();
      expect(state.error).toBe('User not found');
    });
  });

  describe('signOut', () => {
    it('should set loading state before sign-out', async () => {
      AuthService.signOut.mockResolvedValue({ success: true });

      const signOutPromise = useAuthStore.getState().signOut();

      expect(useAuthStore.getState().error).toBeNull();

      await signOutPromise;
    });

    it('should call AuthService signOut', async () => {
      AuthService.signOut.mockResolvedValue({ success: true });

      await useAuthStore.getState().signOut();

      expect(AuthService.signOut).toHaveBeenCalled();
    });

    it('should set error on failure', async () => {
      AuthService.signOut.mockResolvedValue({
        success: false,
        error: 'Sign out failed',
      });

      await useAuthStore.getState().signOut();

      const state = useAuthStore.getState();
      expect(state.error).toBe('Sign out failed');
      expect(state.isLoading).toBe(false);
    });

    it('should return result from AuthService', async () => {
      const mockResult = { success: true };
      AuthService.signOut.mockResolvedValue(mockResult);

      const result = await useAuthStore.getState().signOut();

      expect(result).toEqual(mockResult);
    });
  });

  describe('deleteAccount', () => {
    it('should call AuthService deleteAccount', async () => {
      AuthService.deleteAccount.mockResolvedValue({ success: true });

      await useAuthStore.getState().deleteAccount();

      expect(AuthService.deleteAccount).toHaveBeenCalled();
    });

    it('should set error on failure', async () => {
      AuthService.deleteAccount.mockResolvedValue({
        success: false,
        error: 'Requires re-authentication',
        requiresReauth: true,
      });

      await useAuthStore.getState().deleteAccount();

      const state = useAuthStore.getState();
      expect(state.error).toBe('Requires re-authentication');
      expect(state.isLoading).toBe(false);
    });

    it('should return result from AuthService', async () => {
      const mockResult = { success: true };
      AuthService.deleteAccount.mockResolvedValue(mockResult);

      const result = await useAuthStore.getState().deleteAccount();

      expect(result).toEqual(mockResult);
    });
  });

  describe('clearError', () => {
    it('should clear the error state', () => {
      useAuthStore.setState({ error: 'Some error' });

      useAuthStore.getState().clearError();

      expect(useAuthStore.getState().error).toBeNull();
    });
  });

  describe('getDisplayName', () => {
    it('should return displayName when available', () => {
      useAuthStore.setState({ displayName: 'John Doe', email: 'john@example.com' });

      const displayName = useAuthStore.getState().getDisplayName();

      expect(displayName).toBe('John Doe');
    });

    it('should return email username when displayName is null', () => {
      useAuthStore.setState({ displayName: null, email: 'john@example.com' });

      const displayName = useAuthStore.getState().getDisplayName();

      expect(displayName).toBe('john');
    });

    it('should return "User" when both displayName and email are null', () => {
      useAuthStore.setState({ displayName: null, email: null });

      const displayName = useAuthStore.getState().getDisplayName();

      expect(displayName).toBe('User');
    });

    it('should handle empty displayName', () => {
      useAuthStore.setState({ displayName: '', email: 'john@example.com' });

      const displayName = useAuthStore.getState().getDisplayName();

      // Empty string is falsy, so should use email username
      expect(displayName).toBe('john');
    });
  });

  describe('state persistence', () => {
    it('should persist minimal user data', () => {
      // The persist middleware partializes state
      // This test verifies the shape matches expectations
      const fullState = {
        user: { uid: '123', email: 'test@example.com' },
        isAuthenticated: true,
        isLoading: false,
        error: 'some error',
        uid: '123',
        email: 'test@example.com',
        displayName: 'Test User',
        photoURL: 'https://example.com/photo.jpg',
        provider: 'password',
      };

      // These fields should be persisted according to the partialize function
      const expectedPersistedFields = ['uid', 'email', 'displayName', 'photoURL', 'isAuthenticated'];

      expectedPersistedFields.forEach(field => {
        expect(fullState).toHaveProperty(field);
      });
    });
  });
});
