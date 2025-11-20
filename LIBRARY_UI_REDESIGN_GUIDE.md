# Library List UI Redesign - Spotify-Inspired Layout

## 🎯 Objective

Redesign the library/track list UI to match Spotify's visual style and improve information hierarchy. Current design has all text at the same weight with heavy card styling. Need to make it cleaner, more compact, and easier to scan.

**Key Changes:**
- Improve typography hierarchy (bold title, lighter metadata)
- Add track duration display
- Reduce padding/spacing (fit more tracks on screen)
- Add visual placeholders instead of album art
- Make tracks tappable with feedback
- Add three-dot menu per track

---

## 📸 Reference Design (Spotify's "Liked Music")

**What we want to achieve:**
```
[A] Bryson Tiller - Ciao! (Visualizer)    ⋮
    Unknown Artist · 3:05
    106 BPM · Cm

[D] Drake - Red Button                    ⋮
    Unknown Artist · 4:39
    84 BPM · Em
```

**Visual characteristics:**
- Compact rows with subtle separators
- Clear hierarchy: Title > Artist/Duration > DJ metadata
- Letter badges for visual anchors (A, B, C, D...)
- Tappable rows with active state
- Three-dot menu aligned right

---

## 🎨 Design Specifications

### **Typography Hierarchy:**

```javascript
Track Title:
- Font size: 16px
- Font weight: 600 (semi-bold)
- Color: #FFFFFF
- Line height: 20px
- Max lines: 1 (ellipsize)

Artist · Duration:
- Font size: 13px
- Font weight: 400 (regular)
- Color: #999999
- Format: "{artist} · {duration}"

BPM · Key:
- Font size: 12px
- Font weight: 400 (regular)
- Color: #667eea (brand purple)
- Format: "{bpm} BPM · {key}"
```

### **Layout Specifications:**

```javascript
Row Structure:
- Padding: 12px horizontal, 8px vertical
- Gap between elements: 12px
- Background: transparent
- Active state: rgba(255,255,255,0.05)

Letter Badge:
- Size: 40x40px
- Border radius: 20px (circle)
- Background: gradient based on first letter
- Text: First letter of track title (uppercase)
- Font size: 18px
- Font weight: 600
- Centered

Separator:
- Height: 1px
- Color: rgba(255,255,255,0.05)
- Margin left: 64px (aligns with text, not badge)
```

---

## 📋 Implementation Tasks

### **Task 1: Create Letter Badge Component**

**File: `packages/mobile/src/components/LetterBadge.jsx`**

Create a circular badge that shows the first letter of the track title with a color gradient.

**Requirements:**
- Extract first letter from track title (uppercase)
- Assign gradient color based on letter (A-Z)
- Use 5-6 different gradient combinations
- Circular shape (40x40px)
- Centered text

**Color Gradients to Use:**
```javascript
const gradients = {
  'A-E': ['#667eea', '#764ba2'],   // Purple
  'F-J': ['#f093fb', '#f5576c'],   // Pink
  'K-O': ['#4facfe', '#00f2fe'],   // Blue
  'P-T': ['#43e97b', '#38f9d7'],   // Green
  'U-Z': ['#fa709a', '#fee140'],   // Orange
};
```

**Implementation:**
```javascript
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient'; // or react-native-linear-gradient

const LetterBadge = ({ title }) => {
  const letter = title?.[0]?.toUpperCase() || '?';
  
  // Determine gradient based on letter
  const getGradient = (letter) => {
    const code = letter.charCodeAt(0);
    if (code >= 65 && code <= 69) return ['#667eea', '#764ba2'];
    if (code >= 70 && code <= 74) return ['#f093fb', '#f5576c'];
    if (code >= 75 && code <= 79) return ['#4facfe', '#00f2fe'];
    if (code >= 80 && code <= 84) return ['#43e97b', '#38f9d7'];
    return ['#fa709a', '#fee140'];
  };
  
  const colors = getGradient(letter);
  
  return (
    <LinearGradient
      colors={colors}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.badge}
    >
      <Text style={styles.letter}>{letter}</Text>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  badge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  letter: {
    fontSize: 18,
    fontWeight: '600',
    color: '#ffffff',
  },
});

export default LetterBadge;
```

---

### **Task 2: Create Track Row Component**

**File: `packages/mobile/src/components/TrackRow.jsx`**

Create the redesigned track row component with improved hierarchy.

**Requirements:**
- Letter badge on left (40x40px)
- Track info in middle (flex: 1)
- Three-dot menu on right
- Tappable with active state
- Show duration in metadata line
- Format BPM and Key in brand color

**Props:**
```typescript
interface TrackRowProps {
  track: {
    id: string;
    title: string;
    artist: string;
    bpm: number;
    key: string;
    duration: number; // in seconds
  };
  onPress: (track) => void;
  onMenuPress: (track) => void;
}
```

**Implementation:**
```javascript
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import LetterBadge from './LetterBadge';

const TrackRow = ({ track, onPress, onMenuPress }) => {
  // Format duration from seconds to MM:SS
  const formatDuration = (seconds) => {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };
  
  return (
    <TouchableOpacity 
      style={styles.row}
      onPress={() => onPress(track)}
      activeOpacity={0.6}
    >
      {/* Letter Badge */}
      <LetterBadge title={track.title} />
      
      {/* Track Info */}
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={1}>
          {track.title}
        </Text>
        <Text style={styles.subtitle} numberOfLines={1}>
          {track.artist || 'Unknown Artist'} · {formatDuration(track.duration)}
        </Text>
        <Text style={styles.metadata}>
          {track.bpm ? `${Math.round(track.bpm)} BPM` : 'No BPM'} · {track.key || 'No Key'}
        </Text>
      </View>
      
      {/* Menu Button */}
      <TouchableOpacity
        onPress={() => onMenuPress(track)}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        style={styles.menuButton}
      >
        <Text style={styles.menuIcon}>⋮</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: 'transparent',
  },
  info: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'center',
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    fontWeight: '400',
    color: '#999999',
    marginBottom: 2,
  },
  metadata: {
    fontSize: 12,
    fontWeight: '400',
    color: '#667eea',
  },
  menuButton: {
    paddingLeft: 12,
  },
  menuIcon: {
    fontSize: 20,
    color: '#999999',
  },
});

export default TrackRow;
```

---

### **Task 3: Update Library Screen**

**File: `packages/mobile/src/screens/LibraryScreen.jsx` (or wherever library list is)**

Replace the current track card implementation with the new TrackRow component.

**Requirements:**
- Use FlatList for performance
- Add separator between rows
- Handle track press (navigate to player or play)
- Handle menu press (show action sheet)
- Add empty state
- Add pull-to-refresh

**Key Changes:**
```javascript
import TrackRow from '../components/TrackRow';

// In your component:
<FlatList
  data={tracks}
  keyExtractor={(item) => item.id}
  renderItem={({ item }) => (
    <TrackRow
      track={item}
      onPress={handleTrackPress}
      onMenuPress={handleTrackMenu}
    />
  )}
  ItemSeparatorComponent={() => (
    <View style={styles.separator} />
  )}
  ListEmptyComponent={() => (
    <View style={styles.empty}>
      <Text style={styles.emptyText}>No tracks found</Text>
    </View>
  )}
  refreshControl={
    <RefreshControl
      refreshing={refreshing}
      onRefresh={handleRefresh}
      tintColor="#667eea"
    />
  }
/>

const styles = StyleSheet.create({
  separator: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
    marginLeft: 68, // 16px padding + 40px badge + 12px gap
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
  },
});
```

---

### **Task 4: Update Crate Screen**

**File: `packages/mobile/src/screens/CrateScreen.jsx` (or wherever crate detail is)**

Apply the same TrackRow component to the crate view.

**Same implementation as library screen, but:**
- Menu should include "Remove from Crate" option
- Maybe add drag handles in edit mode (future enhancement)

---

### **Task 5: Implement Track Menu**

**File: `packages/mobile/src/components/TrackMenu.jsx` (or add to existing)**

Create action sheet menu for track options.

**Requirements:**
- Show when three-dot menu tapped
- Different options based on context (library vs crate)
- Use ActionSheet or Modal

**Menu Options:**

**In Library View:**
```
- ▶️  Play Now
- ➕  Add to Queue
- 📁  Add to Crate
- ℹ️  Track Info
- ✕   Cancel
```

**In Crate View:**
```
- ▶️  Play Now
- ➕  Add to Queue
- 🗑️  Remove from Crate
- ℹ️  Track Info
- ✕   Cancel
```

**Implementation (using React Native ActionSheet):**
```javascript
import { ActionSheetIOS, Platform, Alert } from 'react-native';

const showTrackMenu = (track, context = 'library') => {
  const options = context === 'library'
    ? ['Play Now', 'Add to Queue', 'Add to Crate', 'Track Info', 'Cancel']
    : ['Play Now', 'Add to Queue', 'Remove from Crate', 'Track Info', 'Cancel'];
  
  const cancelButtonIndex = options.length - 1;
  const destructiveButtonIndex = context === 'crate' ? 2 : undefined;
  
  if (Platform.OS === 'ios') {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        options,
        cancelButtonIndex,
        destructiveButtonIndex,
        title: track.title,
        message: track.artist,
      },
      (buttonIndex) => {
        handleMenuAction(buttonIndex, track, context);
      }
    );
  } else {
    // Android: use Modal or ActionSheet library
    // TODO: Implement Android action sheet
  }
};

const handleMenuAction = (index, track, context) => {
  switch (index) {
    case 0: // Play Now
      playTrack(track);
      break;
    case 1: // Add to Queue
      addToQueue(track);
      break;
    case 2:
      if (context === 'library') {
        // Add to Crate
        showCrateSelector(track);
      } else {
        // Remove from Crate
        removeFromCrate(track);
      }
      break;
    case 3: // Track Info
      showTrackInfo(track);
      break;
  }
};
```

---

### **Task 6: Add Duration to Track Data**

**File: `packages/mobile/src/store/useStore.js` (or wherever tracks are stored)**

Ensure track objects include duration field.

**If duration is not already in your track data:**

1. Check if backend is sending duration
2. If not, calculate it when track is loaded:

```javascript
// Backend should include duration in API response
{
  id: 'track-123',
  title: 'Track Name',
  artist: 'Artist Name',
  bpm: 120,
  key: 'Am',
  duration: 245, // in seconds
  filePath: '/path/to/file.mp3'
}
```

3. If backend doesn't have it, mobile can calculate when loading track:

```javascript
import { Audio } from 'expo-av';

const getTrackDuration = async (trackUrl) => {
  try {
    const { sound, status } = await Audio.Sound.createAsync(
      { uri: trackUrl },
      { shouldPlay: false }
    );
    const duration = status.durationMillis / 1000;
    await sound.unloadAsync();
    return duration;
  } catch (error) {
    return 0;
  }
};
```

**Note:** It's better if backend provides duration to avoid loading tracks just to get duration.

---

## 🧪 Testing Checklist

After implementation, verify:

### **Visual Tests:**
- [ ] Letter badges show correct first letter
- [ ] Letter badges have different colors for different letters
- [ ] Track title is bold and prominent
- [ ] Artist and duration are gray and smaller
- [ ] BPM and Key are purple/brand color
- [ ] Rows are compact (not too much padding)
- [ ] Separators align with text (not badge)
- [ ] Three-dot menu is visible and aligned right

### **Interaction Tests:**
- [ ] Tapping row plays track or navigates to player
- [ ] Row shows active state when pressed
- [ ] Three-dot menu opens action sheet
- [ ] All menu actions work correctly
- [ ] Pull-to-refresh works
- [ ] Scrolling is smooth with 100+ tracks
- [ ] Empty state shows when no tracks

### **Edge Cases:**
- [ ] Very long track titles ellipsize
- [ ] Missing artist shows "Unknown Artist"
- [ ] Missing BPM/Key shows "No BPM" / "No Key"
- [ ] Duration shows "0:00" if missing
- [ ] Special characters in titles don't break layout
- [ ] Numbers/symbols as first character work in badge

---

## 📐 Layout Measurements

**Final row structure:**
```
|<-16px->| [40px] |<-12px->| [flexible] |<-12px->| [20px] |<-16px->|
          badge              track info             menu
```

**Minimum row height:** 56px (badge height + padding)

**Separator positioning:**
```
|<-68px (skip badge area)->| ────────────────────────────
```

---

## 🎨 Color Palette Reference

```javascript
const colors = {
  // Text
  titleText: '#FFFFFF',
  subtitleText: '#999999',
  metadataText: '#667eea', // Brand purple
  
  // UI Elements
  separator: 'rgba(255,255,255,0.05)',
  activeRow: 'rgba(255,255,255,0.05)',
  
  // Badge Gradients
  gradientPurple: ['#667eea', '#764ba2'],
  gradientPink: ['#f093fb', '#f5576c'],
  gradientBlue: ['#4facfe', '#00f2fe'],
  gradientGreen: ['#43e97b', '#38f9d7'],
  gradientOrange: ['#fa709a', '#fee140'],
};
```

---

## ⚠️ Important Notes

1. **No Album Art:** We're intentionally NOT extracting/showing album art. Letter badges provide visual anchors without the complexity.

2. **Duration Required:** Track objects MUST have duration field. Backend should provide this in API responses.

3. **Linear Gradient:** Need to install gradient library:
   ```bash
   # Expo:
   npx expo install expo-linear-gradient
   
   # React Native CLI:
   npm install react-native-linear-gradient
   ```

4. **Keep Existing Functionality:** This is a visual redesign only. All existing features (play, add to crate, etc.) should continue working.

5. **Performance:** Use FlatList (not ScrollView) for good performance with large libraries.

---

## 🎯 Success Criteria

Implementation is complete when:

1. ✅ Library view uses new TrackRow component
2. ✅ Crate view uses new TrackRow component
3. ✅ Letter badges show with color gradients
4. ✅ Typography hierarchy matches spec
5. ✅ Duration displays correctly (MM:SS format)
6. ✅ Three-dot menu works on both screens
7. ✅ Rows are tappable and show active state
8. ✅ Separators appear between rows
9. ✅ Layout is compact and fits more tracks on screen
10. ✅ No regressions in existing functionality

---

## 📊 Time Estimate

- Task 1 (Letter Badge): 30 minutes
- Task 2 (Track Row): 1 hour
- Task 3 (Library Screen): 1 hour
- Task 4 (Crate Screen): 30 minutes
- Task 5 (Track Menu): 1 hour
- Task 6 (Duration field): 30 minutes
- Testing & Polish: 1 hour

**Total: ~5.5 hours**

---

## 🔄 Migration Notes

**Before starting:**
1. Identify all files that render track lists
2. Note any custom styling that needs to be preserved
3. Backup current implementation (create git branch)

**After completion:**
1. Test on both iOS and Android
2. Test with empty library
3. Test with 1000+ tracks (performance)
4. Verify all existing features still work

---

Good luck! This redesign will make the library much more scannable and professional-looking. 🎨
