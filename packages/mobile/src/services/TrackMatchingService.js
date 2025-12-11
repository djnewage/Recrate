/**
 * TrackMatchingService - Fuzzy matching algorithm for finding tracks in library
 */

/**
 * Normalize a string for comparison
 * - Lowercase
 * - Remove punctuation
 * - Normalize whitespace
 */
const normalizeString = (str) => {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/[\/&,]/g, ' ')  // Replace separators with spaces FIRST
    .replace(/[^\w\s]/g, '')  // Then remove other punctuation
    .replace(/\s+/g, ' ')     // Normalize whitespace
    .trim();
};

/**
 * Normalize artist name with common variations
 */
const normalizeArtist = (artist) => {
  if (!artist) return '';
  return normalizeString(artist)
    .replace(/\bfeat\.?\b/gi, 'ft')
    .replace(/\bfeaturing\b/gi, 'ft')
    .replace(/\band\b/gi, '&')
    .replace(/\bthe\s/gi, '')
    .replace(/\s&\s/g, ' ')
    .replace(/\svs\.?\s/gi, ' ')
    .replace(/\sx\s/gi, ' '); // "Artist X Artist" -> "Artist Artist"
};

/**
 * Normalize title - handle remixes, edits, etc.
 */
const normalizeTitle = (title) => {
  if (!title) return '';
  let normalized = normalizeString(title);

  // Extract base title (before remix/edit indicators)
  const remixMatch = normalized.match(/^(.+?)(?:\s*[\(\[])?\s*(?:remix|edit|mix|version|bootleg|rework|flip|vip)/i);
  if (remixMatch) {
    normalized = remixMatch[1].trim();
  }

  // Remove common suffixes in parentheses
  normalized = normalized.replace(/\s*\([^)]*\)\s*$/, '');
  normalized = normalized.replace(/\s*\[[^\]]*\]\s*$/, '');

  return normalized.trim();
};

/**
 * Calculate Levenshtein distance between two strings
 */
const levenshteinDistance = (s1, s2) => {
  const m = s1.length;
  const n = s2.length;

  if (m === 0) return n;
  if (n === 0) return m;

  const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,      // deletion
        dp[i][j - 1] + 1,      // insertion
        dp[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return dp[m][n];
};

/**
 * Calculate similarity score between two strings (0-1)
 */
const calculateSimilarity = (str1, str2) => {
  const s1 = normalizeString(str1);
  const s2 = normalizeString(str2);

  // Exact match
  if (s1 === s2) return 1;

  // Empty strings
  if (s1.length === 0 || s2.length === 0) return 0;

  // Check for substring containment (high confidence)
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;
  if (longer.includes(shorter)) {
    return 0.85 + (0.15 * (shorter.length / longer.length));
  }

  // Word-based matching
  const words1 = new Set(s1.split(' '));
  const words2 = new Set(s2.split(' '));
  const intersection = [...words1].filter(w => words2.has(w));
  const union = new Set([...words1, ...words2]);

  if (union.size === 0) return 0;

  const wordSimilarity = intersection.length / union.size;

  // Levenshtein-based similarity
  const maxLen = Math.max(s1.length, s2.length);
  const distance = levenshteinDistance(s1, s2);
  const levenshteinSimilarity = 1 - (distance / maxLen);

  // Combine both metrics (weighted average)
  return (wordSimilarity * 0.6) + (levenshteinSimilarity * 0.4);
};

/**
 * Calculate title similarity with remix awareness
 */
const calculateTitleSimilarity = (title1, title2) => {
  // First check normalized titles
  const normalized1 = normalizeTitle(title1);
  const normalized2 = normalizeTitle(title2);

  const baseSimilarity = calculateSimilarity(normalized1, normalized2);

  // Also check full titles
  const fullSimilarity = calculateSimilarity(title1, title2);

  // Return the higher score
  return Math.max(baseSimilarity, fullSimilarity);
};

/**
 * Calculate artist similarity with variations
 */
const calculateArtistSimilarity = (artist1, artist2) => {
  const normalized1 = normalizeArtist(artist1);
  const normalized2 = normalizeArtist(artist2);

  // Check if any artist from one appears in the other
  const artists1 = normalized1.split(/[,&]/).map(a => a.trim()).filter(Boolean);
  const artists2 = normalized2.split(/[,&]/).map(a => a.trim()).filter(Boolean);

  // Check for any matching artist
  for (const a1 of artists1) {
    for (const a2 of artists2) {
      const sim = calculateSimilarity(a1, a2);
      if (sim > 0.8) {
        return sim;
      }
    }
  }

  // Fall back to full string comparison
  return calculateSimilarity(normalized1, normalized2);
};

/**
 * Check if the artist name is embedded in the title (common with poorly tagged files)
 * e.g., "Drake - Red Button (Audio)" should match title "Red Button" by "Drake"
 */
const checkArtistInTitle = (libraryTitle, recognizedTitle, recognizedArtist) => {
  if (!libraryTitle || !recognizedTitle || !recognizedArtist) return null;

  const normalizedLibTitle = normalizeString(libraryTitle);
  const normalizedRecTitle = normalizeString(recognizedTitle);
  const normalizedRecArtist = normalizeArtist(recognizedArtist);

  // Check for "Artist - Title" pattern
  const dashPatterns = [' - ', ' – ', ' — ', ' _ '];
  for (const dash of dashPatterns) {
    if (libraryTitle.includes(dash)) {
      const parts = libraryTitle.split(dash);
      if (parts.length >= 2) {
        const potentialArtist = normalizeArtist(parts[0]);
        const potentialTitle = normalizeTitle(parts.slice(1).join(dash));

        const artistMatch = calculateSimilarity(potentialArtist, normalizedRecArtist);
        const titleMatch = calculateSimilarity(potentialTitle, normalizedRecTitle);

        if (artistMatch > 0.7 && titleMatch > 0.6) {
          return { artistMatch, titleMatch, combined: (artistMatch + titleMatch) / 2 };
        }
      }
    }
  }

  // Check if both artist and title appear anywhere in the library title
  const hasArtist = normalizedLibTitle.includes(normalizedRecArtist.split(' ')[0]); // First word of artist
  const hasTitle = normalizedLibTitle.includes(normalizedRecTitle.split(' ')[0]); // First word of title

  if (hasArtist && hasTitle) {
    return { artistMatch: 0.7, titleMatch: 0.7, combined: 0.7 };
  }

  return null;
};

export const TrackMatchingService = {
  /**
   * Find matching tracks in library
   * @param {object} recognizedTrack - Track info from ACRCloud {title, artist}
   * @param {array} libraryTracks - Array of tracks from library
   * @returns {array} Array of matches sorted by confidence
   */
  findMatches(recognizedTrack, libraryTracks) {
    const results = [];

    if (!recognizedTrack?.title || !libraryTracks?.length) {
      return results;
    }

    for (const track of libraryTracks) {
      let titleSimilarity = calculateTitleSimilarity(track.title, recognizedTrack.title);
      let artistSimilarity = calculateArtistSimilarity(track.artist, recognizedTrack.artist);

      // Check if artist is embedded in the title field (common with poorly tagged files)
      const embeddedMatch = checkArtistInTitle(track.title, recognizedTrack.title, recognizedTrack.artist);
      if (embeddedMatch && embeddedMatch.combined > Math.max(titleSimilarity, artistSimilarity)) {
        titleSimilarity = embeddedMatch.titleMatch;
        artistSimilarity = embeddedMatch.artistMatch;
      }

      // Calculate combined score (title is more important)
      const combinedScore = (titleSimilarity * 0.6) + (artistSimilarity * 0.4);

      // Determine confidence level (more lenient thresholds)
      let confidence = null;

      // High confidence: Both title and artist match well
      if (titleSimilarity > 0.75 && artistSimilarity > 0.6) {
        confidence = 'high';
      }
      // Medium confidence: Good title match, decent artist match
      else if (titleSimilarity > 0.6 && artistSimilarity > 0.4) {
        confidence = 'medium';
      }
      // Low confidence: Partial matches
      else if (titleSimilarity > 0.5 && artistSimilarity > 0.3) {
        confidence = 'low';
      }
      // Very lenient: Title contains key words
      else if (combinedScore > 0.45) {
        confidence = 'low';
      }

      if (confidence) {
        results.push({
          track,
          confidence,
          score: combinedScore,
          titleScore: titleSimilarity,
          artistScore: artistSimilarity,
        });
      }
    }

    // Sort by score descending
    return results.sort((a, b) => b.score - a.score);
  },

  /**
   * Find which crates contain a specific track
   * @param {string} trackId - ID of the track to find
   * @param {array} crates - Array of crates (must have tracks loaded)
   * @returns {array} Array of crates containing the track
   */
  findTrackInCrates(trackId, crates) {
    const cratesContainingTrack = [];

    const searchCrate = (crate) => {
      if (crate.tracks?.some(t => t.id === trackId)) {
        cratesContainingTrack.push({
          id: crate.id,
          name: crate.name,
          fullPath: crate.fullPath || crate.name,
          depth: crate.depth || 0,
        });
      }

      // Recursively search children
      if (crate.children?.length) {
        crate.children.forEach(searchCrate);
      }
    };

    crates.forEach(searchCrate);

    return cratesContainingTrack;
  },

  /**
   * Get the best match from results
   * @param {array} matches - Results from findMatches
   * @returns {object|null} Best match or null
   */
  getBestMatch(matches) {
    if (!matches?.length) return null;

    // Return first high confidence match, or best score
    const highConfidence = matches.find(m => m.confidence === 'high');
    return highConfidence || matches[0];
  },

  /**
   * Check if we have a confident match
   * @param {array} matches - Results from findMatches
   * @returns {boolean}
   */
  hasConfidentMatch(matches) {
    return matches?.some(m => m.confidence === 'high' || m.confidence === 'medium');
  },

  /**
   * Find variations of a track (remixes, edits, VIPs, etc.)
   * @param {object} recognizedTrack - Track info from ACRCloud {title, artist}
   * @param {array} libraryTracks - Array of tracks from library
   * @param {string} excludeId - Track ID to exclude (the main match)
   * @returns {array} Array of variation tracks
   */
  findVariations(recognizedTrack, libraryTracks, excludeId = null) {
    const variations = [];

    if (!recognizedTrack?.title || !libraryTracks?.length) {
      return variations;
    }

    // Get normalized versions of the recognized track
    const baseTitle = normalizeTitle(recognizedTrack.title);
    const fullTitle = normalizeString(recognizedTrack.title);
    const baseArtist = normalizeArtist(recognizedTrack.artist);

    // Get significant words for fuzzy matching
    const baseTitleWords = baseTitle.split(' ').filter(w => w.length > 2);

    // Variation keywords (including modern ones)
    const variationKeywords = [
      'remix', 'edit', 'vip', 'flip', 'bootleg', 'rework',
      'extended', 'intro', 'outro', 'mashup', 'blend',
      'version', 'mix', 'dub', 'instrumental', 'acapella',
      'sped', 'slowed', 'pitched'
    ];

    for (const track of libraryTracks) {
      // Skip the exact match (type-safe comparison)
      if (excludeId && String(track.id) === String(excludeId)) continue;

      const trackTitle = track.title || '';
      const trackArtist = track.artist || '';
      const normalizedTrackTitle = normalizeString(trackTitle);
      const normalizedLibTitle = normalizeTitle(trackTitle);

      // === FUZZY TITLE MATCHING ===
      // Calculate fuzzy similarity between base titles
      const baseTitleSimilarity = calculateSimilarity(baseTitle, normalizedLibTitle);

      // Calculate fuzzy similarity between full titles
      const fullTitleSimilarity = calculateSimilarity(fullTitle, normalizedTrackTitle);

      // Use the higher of the two similarities
      const titleSimilarity = Math.max(baseTitleSimilarity, fullTitleSimilarity);

      // Check if significant words from base title appear in library track
      const matchingWordCount = baseTitleWords.filter(word => normalizedTrackTitle.includes(word)).length;
      const hasMatchingWords = baseTitleWords.length > 0 &&
        matchingWordCount >= Math.ceil(baseTitleWords.length * 0.5);

      // Title matches if fuzzy similarity is decent OR has matching words
      const titleMatches = titleSimilarity > 0.4 || hasMatchingWords;

      // === ARTIST MATCHING (keep threshold higher for quality) ===
      const artistSimilarity = calculateArtistSimilarity(trackArtist, recognizedTrack.artist);
      const artistFirstWord = baseArtist.split(' ')[0];
      const artistInTitle = artistFirstWord.length > 2 && normalizedTrackTitle.includes(artistFirstWord);

      // Artist matches with higher threshold (0.5) for quality
      const artistMatches = artistSimilarity > 0.5 || artistInTitle;

      // === VARIATION KEYWORD DETECTION ===
      const hasVariationKeyword = variationKeywords.some(kw => normalizedTrackTitle.includes(kw));

      // === INCLUSION LOGIC ===
      // Include if:
      // 1. Title is a fuzzy match AND artist matches (high confidence)
      // 2. Title is very similar (>0.6) AND has variation keyword (remix/edit of same song)
      // 3. Title has matching words AND artist somewhat matches (different version)
      const shouldInclude =
        (titleMatches && artistMatches) ||
        (titleSimilarity > 0.6 && hasVariationKeyword) ||
        (hasMatchingWords && artistSimilarity > 0.4);

      if (shouldInclude) {
        variations.push({
          track,
          type: hasVariationKeyword ? 'variation' : 'related',
          similarity: titleSimilarity,
        });
      }
    }

    // Sort by similarity and return top 5
    return variations
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 5);
  },

  /**
   * Extract the base title without remix/edit suffixes
   * @param {string} title - Full track title
   * @returns {string} Base title
   */
  getBaseTitle(title) {
    return normalizeTitle(title);
  },
};

export default TrackMatchingService;
