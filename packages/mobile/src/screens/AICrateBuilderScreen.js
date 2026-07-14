import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Slider from '@react-native-community/slider';
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS } from '../constants/theme';
import apiService from '../services/api';
import AICurationService from '../services/AICurationService';
import useStore from '../store/useStore';
import { useConnectionStore } from '../store/connectionStore';
import { useSubscriptionStore } from '../store/subscriptionStore';
import { SUBSCRIPTION_TIERS } from '../constants/subscription';
import TrackRow from '../components/TrackRow';
import { logEvent } from '../config/firebase';

// Available musical keys (Camelot notation - standard for DJs)
const MUSICAL_KEYS = [
  '1A', '1B', '2A', '2B', '3A', '3B', '4A', '4B',
  '5A', '5B', '6A', '6B', '7A', '7B', '8A', '8B',
  '9A', '9B', '10A', '10B', '11A', '11B', '12A', '12B',
];

const AICrateBuilderScreen = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { loadCrates, crates, createCrate, addTracksToCrate } = useStore();

  // Subscription state
  const {
    currentTier,
    canUseCrateBuilder,
    getRemainingCrateBuilds,
    incrementCrateBuildUsage,
    hasAIAccess,
  } = useSubscriptionStore();

  // State
  const [state, setState] = useState('builder'); // 'builder', 'loading', 'preview'
  const [error, setError] = useState(null);

  // Filter state
  const [bpmMin, setBpmMin] = useState(60);
  const [bpmMax, setBpmMax] = useState(180);
  const [selectedKeys, setSelectedKeys] = useState([]);
  const [selectedGenres, setSelectedGenres] = useState([]);
  const [availableGenres, setAvailableGenres] = useState([]);

  // Prompt state
  const [prompt, setPrompt] = useState('');
  const [trackLimit, setTrackLimit] = useState(25);

  // Preview state
  const [matchingCount, setMatchingCount] = useState(null);
  const [curation, setCuration] = useState(null);
  const [crateName, setCrateName] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Save mode state
  const [saveMode, setSaveMode] = useState('new'); // 'new' or 'existing'
  const [selectedCrateId, setSelectedCrateId] = useState(null);

  // Track selection state (for preview)
  const [selectedTrackIds, setSelectedTrackIds] = useState([]);

  // AI status
  const [aiConfigured, setAiConfigured] = useState(null);
  // Why the AI screen is unavailable: 'connection' (can't reach the computer)
  // or 'unconfigured' (reached it, but AI isn't available)
  const [aiErrorReason, setAiErrorReason] = useState(null);
  // 'desktop' (normal path through the computer) or 'proxy' (computer
  // unreachable but the phone has internet — curate against the cached
  // library via the cloud proxy; saves queue and sync to Serato later)
  const [aiMode, setAiMode] = useState('desktop');

  // Check AI status on mount
  useEffect(() => {
    checkAIStatus();
    loadFilterOptions();
    loadCrates(); // Load crates for "Add to existing" option
  }, []);

  const checkAIStatus = async () => {
    try {
      const status = await apiService.getAIStatus();
      setAiMode('desktop');
      setAiConfigured(status.configured);
      setAiErrorReason(status.configured ? null : 'unconfigured');
    } catch (err) {
      // A network error or a 503 "device not connected" means we couldn't reach
      // the computer; anything else means the request got through but AI is off.
      const status = err?.response?.status;
      const reachedServer = !!err?.response && status !== 503;

      // Computer unreachable but the phone has internet and a cached library:
      // fall back to curating via the cloud proxy against the cached metadata.
      const cachedTracks = useStore.getState().tracks;
      if (
        !reachedServer &&
        useConnectionStore.getState().hasNetworkConnectivity() &&
        cachedTracks.length > 0
      ) {
        setAiMode('proxy');
        setAiConfigured(true);
        setAiErrorReason(null);
        const derived = AICurationService.deriveFilterOptions(cachedTracks);
        setAvailableGenres(derived.genres);
        if (derived.bpmStats) {
          setBpmMin(derived.bpmStats.min);
          setBpmMax(derived.bpmStats.max);
        }
        return;
      }

      setAiConfigured(false);
      setAiErrorReason(reachedServer ? 'unconfigured' : 'connection');
    }
  };

  const loadFilterOptions = async () => {
    try {
      const options = await apiService.getAIFilterOptions();
      setAvailableGenres(options.genres || []);
      if (options.bpmStats) {
        setBpmMin(options.bpmStats.min || 60);
        setBpmMax(options.bpmStats.max || 180);
      }
    } catch (err) {
      // Failed to load filter options
    }
  };

  // Preview filter results
  const updatePreviewCount = useCallback(async () => {
    try {
      const filters = {
        bpmRange: { min: bpmMin, max: bpmMax },
        selectedKeys,
        selectedGenres,
      };
      if (aiMode === 'proxy') {
        // Computer unreachable — count against the cached library locally
        setMatchingCount(
          AICurationService.countMatchingTracks(useStore.getState().tracks, filters)
        );
        return;
      }
      const result = await apiService.previewAIFilter(filters);
      setMatchingCount(result.matchingTracks);
    } catch (err) {
      // Failed to preview filter
    }
  }, [bpmMin, bpmMax, selectedKeys, selectedGenres, aiMode]);

  useEffect(() => {
    const debounce = setTimeout(updatePreviewCount, 300);
    return () => clearTimeout(debounce);
  }, [updatePreviewCount]);

  // Toggle key selection
  const toggleKey = (key) => {
    setSelectedKeys(prev =>
      prev.includes(key)
        ? prev.filter(k => k !== key)
        : [...prev, key]
    );
  };

  // Toggle genre selection
  const toggleGenre = (genre) => {
    setSelectedGenres(prev =>
      prev.includes(genre)
        ? prev.filter(g => g !== genre)
        : [...prev, genre]
    );
  };

  // Generate crate
  const handleGenerate = async () => {
    if (!prompt.trim()) {
      Alert.alert('Prompt Required', 'Please describe the kind of crate you want to build.');
      return;
    }

    // Check subscription-based access
    if (!canUseCrateBuilder()) {
      if (currentTier === SUBSCRIPTION_TIERS.EXPIRED) {
        Alert.alert(
          'Trial Ended',
          'Your free trial has ended. Subscribe to continue using AI features.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Subscribe', onPress: () => navigation.navigate('Paywall') },
          ]
        );
      } else {
        // Trial or Pro but out of quota
        Alert.alert(
          'Quota Reached',
          `You've used all your AI crate builds for this period. ${currentTier === SUBSCRIPTION_TIERS.TRIAL ? 'Subscribe for more builds.' : 'Your quota resets next month.'}`,
          [
            { text: 'OK', style: 'cancel' },
            currentTier === SUBSCRIPTION_TIERS.TRIAL && { text: 'Subscribe', onPress: () => navigation.navigate('Paywall') },
          ].filter(Boolean)
        );
      }
      return;
    }

    setError(null);
    setState('loading');

    try {
      const filters = {
        bpmRange: { min: bpmMin, max: bpmMax },
        selectedKeys: selectedKeys.length > 0 ? selectedKeys : undefined,
        selectedGenres: selectedGenres.length > 0 ? selectedGenres : undefined,
      };

      const result =
        aiMode === 'proxy'
          ? await AICurationService.curateViaProxy({
              prompt: prompt.trim(),
              tracks: useStore.getState().tracks,
              filters,
              limit: trackLimit,
              options: { prioritizeMixability: true, includeVariety: true },
            })
          : await apiService.curateWithAI(prompt.trim(), filters, trackLimit, {
              prioritizeMixability: true,
              includeVariety: true,
            });

      if (!result.success) {
        setError(result.error || 'Failed to generate crate');
        setState('builder');
        return;
      }

      // Increment usage count
      incrementCrateBuildUsage();
      logEvent('ai_crate_builder_used');
      console.log('[AI] Incremented crate build usage');

      setCuration(result.curation);
      // Initialize all tracks as selected
      setSelectedTrackIds(result.curation.tracks.map(t => t.id));
      // Generate default crate name from prompt
      const defaultName = prompt.trim().slice(0, 30) + (prompt.length > 30 ? '...' : '');
      setCrateName(defaultName);
      setState('preview');
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to generate crate');
      setState('builder');
    }
  };

  // Save crate
  const handleSave = async () => {
    if (saveMode === 'new' && !crateName.trim()) {
      Alert.alert('Name Required', 'Please enter a name for your crate.');
      return;
    }

    if (saveMode === 'existing' && !selectedCrateId) {
      Alert.alert('Crate Required', 'Please select a crate to add tracks to.');
      return;
    }

    setIsSaving(true);

    try {
      // Maintain order if suggestedOrder exists, but only include selected tracks
      const trackIds = curation.suggestedOrder
        ? curation.suggestedOrder.filter(id => selectedTrackIds.includes(id))
        : selectedTrackIds;

      // Validate that at least one track is selected
      if (trackIds.length === 0) {
        Alert.alert('No Tracks Selected', 'Please select at least one track to save.');
        setIsSaving(false);
        return;
      }

      // Save through the store (not raw apiService) so the crate rides the
      // offline op queue when the computer is unreachable and syncs to Serato
      // on reconnect.
      const isConnected = useConnectionStore.getState().isConnected;
      const syncNote = isConnected
        ? ''
        : ' It will sync to your Serato library when your computer reconnects.';

      if (saveMode === 'new') {
        const newCrateId = await createCrate(crateName.trim(), '#8B5CF6');
        if (!newCrateId) {
          throw new Error('Failed to create crate');
        }
        // createCrate returns the new crate's id (temp id offline); if an older
        // server build returned only `true`, locate the crate by name.
        const targetCrateId =
          typeof newCrateId === 'string'
            ? newCrateId
            : useStore.getState().crates.find((c) => c.name === crateName.trim())?.id;
        if (!targetCrateId) {
          throw new Error('Crate created but could not be found to add tracks');
        }
        const added = await addTracksToCrate(targetCrateId, trackIds);
        if (!added) {
          throw new Error('Crate created but adding tracks failed');
        }
        Alert.alert(
          'Crate Created!',
          `"${crateName}" has been ${isConnected ? 'added to your Serato library.' : 'saved on your phone.'}${syncNote}`,
          [{ text: 'OK', onPress: () => navigation.goBack() }]
        );
      } else {
        const added = await addTracksToCrate(selectedCrateId, trackIds);
        if (!added) {
          throw new Error('Failed to add tracks to crate');
        }
        const selectedCrate = crates.find(c => c.id === selectedCrateId);
        Alert.alert(
          'Tracks Added!',
          `${trackIds.length} tracks added to "${selectedCrate?.name || 'crate'}".${syncNote}`,
          [{ text: 'OK', onPress: () => navigation.goBack() }]
        );
      }

      // Refresh crates
      await loadCrates();
    } catch (err) {
      Alert.alert('Save Failed', err.response?.data?.error || err.message || 'Failed to save crate');
    } finally {
      setIsSaving(false);
    }
  };

  // Go back to builder
  const handleBack = () => {
    setState('builder');
    setCuration(null);
    setSelectedTrackIds([]);
  };

  const handleClose = () => {
    navigation.goBack();
  };

  // Toggle individual track selection
  const toggleTrackSelection = (trackId) => {
    setSelectedTrackIds(prev =>
      prev.includes(trackId)
        ? prev.filter(id => id !== trackId)
        : [...prev, trackId]
    );
  };

  // Check if all tracks are selected
  const allTracksSelected = useMemo(() => {
    const tracks = curation?.tracks || [];
    return tracks.length > 0 && selectedTrackIds.length === tracks.length;
  }, [curation?.tracks, selectedTrackIds]);

  // Toggle all tracks
  const handleToggleSelectAll = () => {
    const tracks = curation?.tracks || [];
    if (allTracksSelected) {
      setSelectedTrackIds([]);
    } else {
      setSelectedTrackIds(tracks.map(t => t.id));
    }
  };

  const handlePlayTrack = (track) => {
    navigation.navigate('Player', { track });
  };

  // Render builder state
  const renderBuilder = () => (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.content}>
          {/* BPM Range */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>BPM RANGE</Text>
            <View style={styles.sectionCard}>
              <View style={styles.bpmRow}>
                <View style={styles.bpmInput}>
                  <Text style={styles.bpmLabel}>Min</Text>
                  <TextInput
                    style={styles.bpmValue}
                    value={String(bpmMin)}
                    onChangeText={t => setBpmMin(parseInt(t) || 60)}
                    keyboardType="numeric"
                    selectTextOnFocus
                  />
                </View>
                <View style={styles.bpmDivider} />
                <View style={styles.bpmInput}>
                  <Text style={styles.bpmLabel}>Max</Text>
                  <TextInput
                    style={styles.bpmValue}
                    value={String(bpmMax)}
                    onChangeText={t => setBpmMax(parseInt(t) || 180)}
                    keyboardType="numeric"
                    selectTextOnFocus
                  />
                </View>
              </View>
            </View>
          </View>

          {/* Keys */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>KEYS (optional)</Text>
            <View style={styles.chipsContainer}>
              {MUSICAL_KEYS.map(key => (
                <TouchableOpacity
                  key={key}
                  style={[styles.chip, selectedKeys.includes(key) && styles.chipSelected]}
                  onPress={() => toggleKey(key)}
                >
                  <Text style={[styles.chipText, selectedKeys.includes(key) && styles.chipTextSelected]}>
                    {key}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Genres */}
          {availableGenres.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>GENRES (optional)</Text>
              <View style={styles.chipsContainer}>
                {availableGenres.slice(0, 20).map(genre => (
                  <TouchableOpacity
                    key={genre}
                    style={[styles.chip, selectedGenres.includes(genre) && styles.chipSelected]}
                    onPress={() => toggleGenre(genre)}
                  >
                    <Text style={[styles.chipText, selectedGenres.includes(genre) && styles.chipTextSelected]}>
                      {genre}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* Prompt */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>DESCRIBE YOUR IDEAL SET</Text>
            <View style={styles.sectionCard}>
              <TextInput
                style={styles.promptInput}
                placeholder="e.g., Build me a high-energy techno set for peak hour with driving basslines..."
                placeholderTextColor={COLORS.textSecondary}
                multiline
                value={prompt}
                onChangeText={setPrompt}
                textAlignVertical="top"
              />
            </View>
          </View>

          {/* Track Limit */}
          <View style={styles.section}>
            <View style={styles.sliderHeader}>
              <Text style={styles.sectionTitle}>NUMBER OF TRACKS</Text>
              <Text style={styles.sliderValue}>{trackLimit}</Text>
            </View>
            <Slider
              style={styles.slider}
              minimumValue={1}
              maximumValue={50}
              step={1}
              value={trackLimit}
              onValueChange={setTrackLimit}
              minimumTrackTintColor={COLORS.primary}
              maximumTrackTintColor={COLORS.border}
              thumbTintColor={COLORS.primary}
            />
          </View>

          {/* Matching Count */}
          {matchingCount !== null && (
            <View style={styles.matchingRow}>
              <Ionicons name="musical-notes" size={18} color={COLORS.textSecondary} />
              <Text style={styles.matchingText}>
                {matchingCount} tracks match your filters
              </Text>
            </View>
          )}

          {/* Error */}
          {error && (
            <View style={styles.errorBox}>
              <Ionicons name="warning" size={18} color={COLORS.error} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {/* Usage indicator */}
          {hasAIAccess() && (
            <View style={styles.usageIndicator}>
              <Ionicons name={currentTier === SUBSCRIPTION_TIERS.TRIAL ? 'time' : 'sparkles'} size={16} color={COLORS.primary} />
              <Text style={styles.usageIndicatorText}>
                {getRemainingCrateBuilds()} {getRemainingCrateBuilds() === 1 ? 'build' : 'builds'} remaining
                {currentTier === SUBSCRIPTION_TIERS.TRIAL && ' in trial'}
              </Text>
            </View>
          )}

          {/* Generate Button */}
          <TouchableOpacity
            style={[styles.generateButton, !prompt.trim() && styles.generateButtonDisabled]}
            onPress={handleGenerate}
            disabled={!prompt.trim()}
          >
            <Ionicons name="sparkles" size={20} color="#fff" />
            <Text style={styles.generateButtonText}>Generate Crate</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );

  // Render loading state
  const renderLoading = () => (
    <View style={styles.centerContent}>
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
      <Text style={styles.mainText}>Curating your tracks...</Text>
      <Text style={styles.subText}>This may take a moment</Text>
    </View>
  );

  // Render preview state
  const renderPreview = () => {
    const metadata = curation?.metadata || {};
    const tracks = curation?.tracks || [];

    // Compute stats for selected tracks
    const selectedTracks = tracks.filter(t => selectedTrackIds.includes(t.id));
    const selectedCount = selectedTracks.length;
    const selectedTotalDuration = selectedTracks.reduce((sum, t) => sum + (t.duration || 0), 0);
    const selectedAvgBpm = selectedTracks.length > 0
      ? Math.round(selectedTracks.reduce((sum, t) => sum + (t.bpm || 0), 0) / selectedTracks.length)
      : 0;

    return (
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.content}>
          {/* Save Mode Toggle */}
          <View style={styles.saveModeContainer}>
            <TouchableOpacity
              style={[styles.saveModeOption, saveMode === 'new' && styles.saveModeSelected]}
              onPress={() => setSaveMode('new')}
            >
              <Ionicons
                name="add-circle"
                size={20}
                color={saveMode === 'new' ? '#fff' : COLORS.textSecondary}
              />
              <Text style={[styles.saveModeText, saveMode === 'new' && styles.saveModeTextSelected]}>
                Create New
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveModeOption, saveMode === 'existing' && styles.saveModeSelected]}
              onPress={() => setSaveMode('existing')}
            >
              <Ionicons
                name="folder"
                size={20}
                color={saveMode === 'existing' ? '#fff' : COLORS.textSecondary}
              />
              <Text style={[styles.saveModeText, saveMode === 'existing' && styles.saveModeTextSelected]}>
                Add to Existing
              </Text>
            </TouchableOpacity>
          </View>

          {/* Summary Card */}
          <View style={styles.summaryCard}>
            {saveMode === 'new' ? (
              <View style={styles.cratePickerSection}>
                <Text style={styles.cratePickerLabel}>CRATE NAME</Text>
                <TextInput
                  style={styles.crateNameInput}
                  value={crateName}
                  onChangeText={setCrateName}
                  placeholder="Enter crate name..."
                  placeholderTextColor={COLORS.textSecondary}
                />
              </View>
            ) : (
              <View style={styles.cratePickerSection}>
                <Text style={styles.cratePickerLabel}>SELECT CRATE</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.cratePickerScroll}
                >
                  {crates.map(crate => (
                    <TouchableOpacity
                      key={crate.id}
                      style={[
                        styles.cratePickerItem,
                        selectedCrateId === crate.id && styles.cratePickerItemSelected,
                      ]}
                      onPress={() => setSelectedCrateId(crate.id)}
                    >
                      <Ionicons
                        name="folder"
                        size={16}
                        color={selectedCrateId === crate.id ? '#fff' : COLORS.primary}
                      />
                      <Text
                        style={[
                          styles.cratePickerItemText,
                          selectedCrateId === crate.id && styles.cratePickerItemTextSelected,
                        ]}
                        numberOfLines={1}
                      >
                        {crate.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                {crates.length === 0 && (
                  <Text style={styles.noCratesText}>No crates available</Text>
                )}
              </View>
            )}
            <View style={styles.summaryStats}>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{selectedCount}/{tracks.length}</Text>
                <Text style={styles.statLabel}>selected</Text>
              </View>
              {selectedAvgBpm > 0 && (
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>{selectedAvgBpm}</Text>
                  <Text style={styles.statLabel}>avg BPM</Text>
                </View>
              )}
              {selectedTotalDuration > 0 && (
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>
                    {Math.floor(selectedTotalDuration / 60)}m
                  </Text>
                  <Text style={styles.statLabel}>duration</Text>
                </View>
              )}
            </View>
          </View>

          {/* AI Reasoning */}
          {curation?.reasoning && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>AI REASONING</Text>
              <View style={styles.reasoningCard}>
                <Ionicons name="sparkles" size={16} color={COLORS.primary} />
                <Text style={styles.reasoningText}>{curation.reasoning}</Text>
              </View>
            </View>
          )}

          {/* Track List */}
          <View style={styles.section}>
            <View style={styles.selectionHeader}>
              <Text style={styles.sectionTitle}>CURATED TRACKS</Text>
              <TouchableOpacity onPress={handleToggleSelectAll} style={styles.selectAllButton}>
                <Ionicons
                  name={allTracksSelected ? "checkbox" : "square-outline"}
                  size={20}
                  color={COLORS.primary}
                />
                <Text style={styles.selectAllText}>
                  {allTracksSelected ? 'Deselect All' : 'Select All'}
                </Text>
              </TouchableOpacity>
            </View>
            {tracks.map((track, idx) => (
              <View key={track.id} style={styles.trackItem}>
                <TouchableOpacity
                  style={styles.trackCheckbox}
                  onPress={() => toggleTrackSelection(track.id)}
                >
                  <Ionicons
                    name={selectedTrackIds.includes(track.id) ? "checkmark-circle" : "ellipse-outline"}
                    size={26}
                    color={selectedTrackIds.includes(track.id) ? COLORS.primary : COLORS.textSecondary}
                  />
                </TouchableOpacity>
                <View style={styles.trackInfo}>
                  <TrackRow
                    track={track}
                    onPress={() => toggleTrackSelection(track.id)}
                    isSelected={selectedTrackIds.includes(track.id)}
                    showIndex={false}
                  />
                  {track.reason && (
                    <Text style={styles.trackReason}>{track.reason}</Text>
                  )}
                </View>
              </View>
            ))}
          </View>

          {/* Actions */}
          <View style={styles.previewActions}>
            <TouchableOpacity style={styles.actionButton} onPress={handleBack}>
              <Ionicons name="refresh" size={20} color={COLORS.text} />
              <Text style={styles.actionButtonText}>Regenerate</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionButton, styles.actionButtonPrimary]}
              onPress={handleSave}
              disabled={isSaving}
            >
              {isSaving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name={saveMode === 'new' ? 'save' : 'add'} size={20} color="#fff" />
                  <Text style={styles.actionButtonTextPrimary}>
                    {saveMode === 'new' ? 'Save to Serato' : 'Add to Crate'}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    );
  };

  // Show upgrade prompt for expired users
  if (currentTier === SUBSCRIPTION_TIERS.EXPIRED) {
    return (
      <View style={[styles.container, { paddingTop: insets.top > 20 ? insets.top - 20 : insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={handleClose}>
            <Ionicons name="chevron-back" size={28} color={COLORS.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Recrate Builder</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.centerContent}>
          <Ionicons name="sparkles" size={64} color={COLORS.primary} />
          <Text style={styles.mainText}>Trial Ended</Text>
          <Text style={styles.subText}>
            Your free trial has ended. Subscribe to continue using the AI Crate Builder.
          </Text>
          <TouchableOpacity
            style={styles.settingsButton}
            onPress={() => navigation.navigate('Paywall')}
          >
            <Ionicons name="diamond" size={20} color="#fff" />
            <Text style={styles.settingsButtonText}>Subscribe</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Show AI unavailable state, differentiating connection vs service issues
  if (aiConfigured === false) {
    const isConnection = aiErrorReason === 'connection';
    return (
      <View style={[styles.container, { paddingTop: insets.top > 20 ? insets.top - 20 : insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={handleClose}>
            <Ionicons name="chevron-back" size={28} color={COLORS.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Recrate Builder</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.centerContent}>
          <Ionicons
            name={isConnection ? 'cloud-offline' : 'warning'}
            size={64}
            color={COLORS.warning}
          />
          <Text style={styles.mainText}>
            {isConnection ? 'Not Connected' : 'Service Unavailable'}
          </Text>
          <Text style={styles.subText}>
            {isConnection
              ? 'AI crate building needs an internet connection (your computer doesn’t have to be running). Check your connection and try again.'
              : 'The AI service is temporarily unavailable. Please try again later.'}
          </Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => {
              setAiConfigured(null);
              setAiErrorReason(null);
              checkAIStatus();
            }}
          >
            <Ionicons name="refresh" size={18} color={COLORS.text} />
            <Text style={styles.retryButtonText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top > 20 ? insets.top - 20 : insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={state === 'preview' ? handleBack : handleClose}>
          <Ionicons name="chevron-back" size={28} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {state === 'preview' ? 'Preview Crate' : 'Recrate Builder'}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Proxy-mode notice: computer unreachable, running against cached library */}
      {aiMode === 'proxy' && state !== 'loading' && (
        <View style={styles.proxyBanner}>
          <Ionicons name="cloud-outline" size={14} color={COLORS.sync} />
          <Text style={styles.proxyBannerText}>
            Computer offline — building from your synced library. Saved crates sync to Serato when it reconnects.
          </Text>
        </View>
      )}

      {state === 'builder' && renderBuilder()}
      {state === 'loading' && renderLoading()}
      {state === 'preview' && renderPreview()}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
  },
  backButton: { padding: SPACING.xs },
  headerTitle: { fontSize: FONT_SIZES.lg, fontWeight: '600', color: COLORS.text },
  headerSpacer: { width: 44 },

  // Proxy-mode (computer offline) banner
  proxyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.xs,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
  },
  proxyBannerText: {
    flex: 1,
    fontSize: FONT_SIZES.xs,
    color: COLORS.sync,
  },

  // Content
  scroll: { flex: 1 },
  content: { padding: SPACING.lg, paddingBottom: SPACING.xl * 2 },
  centerContent: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: SPACING.xl },
  mainText: { fontSize: 24, fontWeight: '700', color: COLORS.text, marginTop: SPACING.xl, textAlign: 'center' },
  subText: { fontSize: FONT_SIZES.md, color: COLORS.textSecondary, marginTop: SPACING.sm, textAlign: 'center', paddingHorizontal: SPACING.lg },
  retryButton: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, marginTop: SPACING.xl, paddingVertical: SPACING.sm, paddingHorizontal: SPACING.lg, borderRadius: 8, backgroundColor: COLORS.surface },
  retryButtonText: { fontSize: FONT_SIZES.md, fontWeight: '600', color: COLORS.text },
  loadingContainer: { width: 100, height: 100, borderRadius: 50, backgroundColor: COLORS.surface, justifyContent: 'center', alignItems: 'center' },
  settingsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xl,
    marginTop: SPACING.xl,
    gap: SPACING.sm,
  },
  settingsButtonText: { fontSize: FONT_SIZES.md, fontWeight: '600', color: '#fff' },

  // Sections
  section: { marginBottom: SPACING.lg },
  sectionTitle: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    color: COLORS.textSecondary,
    letterSpacing: 1,
    marginBottom: SPACING.sm,
    marginLeft: SPACING.xs,
  },
  sectionCard: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
  },

  // BPM
  bpmRow: { flexDirection: 'row', alignItems: 'center' },
  bpmInput: { flex: 1, alignItems: 'center' },
  bpmLabel: { fontSize: FONT_SIZES.xs, color: COLORS.textSecondary, marginBottom: SPACING.xs },
  bpmValue: { fontSize: FONT_SIZES.xl, fontWeight: '700', color: COLORS.text, textAlign: 'center' },
  bpmDivider: { width: 40, height: 2, backgroundColor: COLORS.border },

  // Chips
  chipsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.xs },
  chip: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  chipSelected: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipText: { fontSize: FONT_SIZES.sm, color: COLORS.text },
  chipTextSelected: { color: '#fff' },

  // Prompt
  promptInput: {
    fontSize: FONT_SIZES.md,
    color: COLORS.text,
    minHeight: 100,
    textAlignVertical: 'top',
  },

  // Slider
  sliderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  sliderValue: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '700',
    color: COLORS.primary,
  },
  slider: {
    width: '100%',
    height: 40,
  },

  // Matching count
  matchingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    marginBottom: SPACING.lg,
  },
  matchingText: { fontSize: FONT_SIZES.sm, color: COLORS.textSecondary },

  // Error
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.lg,
    gap: SPACING.sm,
  },
  errorText: { flex: 1, fontSize: FONT_SIZES.sm, color: COLORS.error },

  // Usage indicator
  usageIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(168, 85, 247, 0.1)',
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.sm,
    marginBottom: SPACING.md,
    gap: SPACING.xs,
  },
  usageIndicatorText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.primary,
    fontWeight: '500',
  },

  // Generate button
  generateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.md,
    gap: SPACING.sm,
  },
  generateButtonDisabled: { opacity: 0.5 },
  generateButtonText: { fontSize: FONT_SIZES.md, fontWeight: '600', color: '#fff' },

  // Save Mode Toggle
  saveModeContainer: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.xs,
    marginBottom: SPACING.md,
  },
  saveModeOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
    gap: SPACING.xs,
  },
  saveModeSelected: {
    backgroundColor: COLORS.primary,
  },
  saveModeText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  saveModeTextSelected: {
    color: '#fff',
  },

  // Crate Picker
  cratePickerSection: {
    marginBottom: SPACING.md,
  },
  cratePickerLabel: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    color: COLORS.textSecondary,
    letterSpacing: 1,
    marginBottom: SPACING.sm,
  },
  cratePickerScroll: {
    marginHorizontal: -SPACING.xs,
  },
  cratePickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.md,
    marginHorizontal: SPACING.xs,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: SPACING.xs,
    maxWidth: 150,
  },
  cratePickerItemSelected: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  cratePickerItemText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.text,
    flexShrink: 1,
  },
  cratePickerItemTextSelected: {
    color: '#fff',
  },
  noCratesText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: SPACING.md,
  },

  // Preview - Summary
  summaryCard: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
  },
  crateNameInput: {
    fontSize: FONT_SIZES.xl,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingBottom: SPACING.sm,
  },
  summaryStats: { flexDirection: 'row', justifyContent: 'space-around' },
  statItem: { alignItems: 'center' },
  statValue: { fontSize: FONT_SIZES.xl, fontWeight: '700', color: COLORS.primary },
  statLabel: { fontSize: FONT_SIZES.xs, color: COLORS.textSecondary },

  // Reasoning
  reasoningCard: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  reasoningText: { flex: 1, fontSize: FONT_SIZES.sm, color: COLORS.text, lineHeight: 20 },

  // Selection header
  selectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  selectAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
  },
  selectAllText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.primary,
    fontWeight: '500',
  },

  // Track list
  trackItem: { flexDirection: 'row', marginBottom: SPACING.xs },
  trackCheckbox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.sm,
    marginTop: SPACING.sm,
  },
  trackNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.sm,
    marginTop: SPACING.sm,
  },
  trackNumberText: { fontSize: FONT_SIZES.xs, fontWeight: '600', color: COLORS.textSecondary },
  trackInfo: { flex: 1 },
  trackReason: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    fontStyle: 'italic',
    marginTop: -SPACING.xs,
    marginBottom: SPACING.sm,
    paddingHorizontal: SPACING.sm,
  },

  // Preview actions
  previewActions: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.xl },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.md,
    gap: SPACING.xs,
  },
  actionButtonText: { fontSize: FONT_SIZES.sm, fontWeight: '600', color: COLORS.text },
  actionButtonPrimary: { backgroundColor: COLORS.primary },
  actionButtonTextPrimary: { fontSize: FONT_SIZES.sm, fontWeight: '600', color: '#fff' },
});

export default AICrateBuilderScreen;
