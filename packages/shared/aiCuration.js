/**
 * AI crate curation logic shared between the desktop server and the mobile app.
 *
 * The desktop server historically owned this (packages/server/src/ai/prompts.js
 * and crate-curator.js); it is ported here so the mobile app can build the same
 * prompt from its cached library and call the proxy's /api/llm/complete when the
 * desktop is unreachable. Keep the prompt/response contract in sync with the
 * server until it migrates to this module.
 */

const CURATION_SYSTEM_PROMPT = `You are an expert DJ and music curator with deep knowledge of mixing, track selection, and building energy on the dancefloor.

Your task is to curate a set of tracks from the user's library based on their request. Consider these factors when selecting tracks:

MUSICAL COMPATIBILITY:
- BPM compatibility: Tracks within 3-5 BPM of each other are easy to mix
- Key compatibility: Use the Camelot wheel - compatible keys are the same number or +/-1 (e.g., 8A mixes well with 7A, 8A, 9A, 8B)
- Energy flow: Build and release tension appropriately throughout the set

THEMATIC FACTORS:
- Genre coherence while maintaining interest and variety
- Artist variety (avoid too many consecutive tracks from the same artist)
- Era/period if specified by the user
- Mood and vibe matching the user's request

PRACTICAL DJ CONSIDERATIONS:
- Consider track lengths for set pacing
- Mix of familiar tracks and deeper cuts when appropriate
- Opening, peak, and closing tracks if building a full set
- Smooth transitions between energy levels

You will receive a JSON array of tracks with their metadata. Return your curation as valid JSON with the following structure:
{
  "tracks": [
    {
      "id": "track_id_here",
      "reason": "Brief explanation why this track was selected and where it fits"
    }
  ],
  "reasoning": "Overall explanation of your curation approach and how the set flows",
  "suggestedOrder": ["id1", "id2", "id3"]
}

IMPORTANT RULES:
1. Only select tracks from the provided list - use exact track IDs from the input
2. Return ONLY valid JSON - no markdown, no code blocks, no extra text
3. The "tracks" array should contain objects with "id" and "reason" fields
4. The "suggestedOrder" array should list track IDs in recommended play order
5. Keep individual track reasons concise (1-2 sentences)
6. The overall "reasoning" should explain your curation strategy (2-4 sentences)`;

/**
 * Build the user prompt with track data and request.
 * @param {string} userRequest - The user's natural language prompt
 * @param {Array} tracks - Array of track objects with metadata
 * @param {Object} options - { limit, prioritizeMixability, includeVariety, buildEnergy }
 * @returns {string} Formatted user prompt
 */
function buildUserPrompt(userRequest, tracks, options = {}) {
  const trackSummary = tracks.map((t) => ({
    id: t.id,
    title: t.title,
    artist: t.artist,
    bpm: t.bpm,
    key: t.key,
    genre: t.genre,
    duration: t.duration,
  }));

  const limit = options.limit || 20;
  const additionalInstructions = [];

  if (options.prioritizeMixability) {
    additionalInstructions.push('Prioritize smooth mixing and key/BPM compatibility between consecutive tracks.');
  }

  if (options.includeVariety) {
    additionalInstructions.push('Include variety in artists and sub-styles while maintaining coherence.');
  }

  if (options.buildEnergy) {
    additionalInstructions.push('Structure the set to build energy progressively toward a peak.');
  }

  return `USER REQUEST: ${userRequest}

AVAILABLE TRACKS (${tracks.length} total):
${JSON.stringify(trackSummary, null, 2)}

Please select approximately ${limit} tracks that best match this request.
${additionalInstructions.length > 0 ? '\nADDITIONAL INSTRUCTIONS:\n- ' + additionalInstructions.join('\n- ') : ''}

Remember: Return ONLY valid JSON with the structure specified in your instructions.`;
}

/**
 * Parse and validate an LLM curation response.
 * @param {string} responseText - Raw response from the LLM
 * @param {Array<string>} validTrackIds - Track IDs the LLM was allowed to pick
 * @returns {{tracks: Array, reasoning: string, suggestedOrder: Array<string>}}
 */
function parseCurationResponse(responseText, validTrackIds) {
  // Try to extract JSON from the response (handle potential markdown wrapping)
  let jsonStr = (responseText || '').trim();

  if (jsonStr.startsWith('```json')) {
    jsonStr = jsonStr.slice(7);
  } else if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.slice(3);
  }
  if (jsonStr.endsWith('```')) {
    jsonStr = jsonStr.slice(0, -3);
  }
  jsonStr = jsonStr.trim();

  const parsed = JSON.parse(jsonStr);

  if (!parsed.tracks || !Array.isArray(parsed.tracks)) {
    throw new Error('Invalid response: missing tracks array');
  }

  const validIdSet = new Set(validTrackIds);
  const validatedTracks = parsed.tracks.filter((t) => t && t.id && validIdSet.has(t.id));

  let suggestedOrder = Array.isArray(parsed.suggestedOrder) ? parsed.suggestedOrder : [];
  suggestedOrder = suggestedOrder.filter((id) => validIdSet.has(id));

  // The LLM sometimes returns a PARTIAL order (e.g. when squeezed by the
  // output-token cap it emits all tracks but truncates suggestedOrder).
  // Consumers treat suggestedOrder as the authoritative id list, so make it
  // complete: keep the model's ordering first, append the rest.
  const orderedSet = new Set(suggestedOrder);
  const completeOrder = [
    ...suggestedOrder,
    ...validatedTracks.map((t) => t.id).filter((id) => !orderedSet.has(id)),
  ];

  return {
    tracks: validatedTracks,
    reasoning: parsed.reasoning || 'No reasoning provided',
    suggestedOrder: completeOrder,
  };
}

/**
 * Filter a track list by the crate-builder filters (pure version of the
 * desktop's CrateCurator.filterTracks, which reads its own library).
 * @param {Array} tracks
 * @param {Object} filters - { bpmRange: {min,max}, selectedKeys: [], selectedGenres: [] }
 */
function filterTrackList(tracks, filters = {}) {
  let result = tracks;

  if (filters.bpmRange) {
    const { min, max } = filters.bpmRange;
    result = result.filter((t) => t.bpm && t.bpm >= min && t.bpm <= max);
  }

  if (filters.selectedKeys && filters.selectedKeys.length > 0) {
    const keySet = new Set(filters.selectedKeys.map((k) => k.toLowerCase()));
    result = result.filter((t) => t.key && keySet.has(t.key.toLowerCase()));
  }

  if (filters.selectedGenres && filters.selectedGenres.length > 0) {
    const genreSet = new Set(filters.selectedGenres.map((g) => g.toLowerCase()));
    result = result.filter((t) => t.genre && genreSet.has(t.genre.toLowerCase()));
  }

  return result;
}

/**
 * Select a representative sample of tracks when the candidate pool is too
 * large for one prompt (evenly distributed across the BPM range).
 */
function selectRepresentativeSample(tracks, maxTracks) {
  if (tracks.length <= maxTracks) {
    return tracks;
  }

  const byBpm = [...tracks].sort((a, b) => (a.bpm || 0) - (b.bpm || 0));

  const result = [];
  const step = Math.floor(tracks.length / maxTracks);

  for (let i = 0; i < tracks.length && result.length < maxTracks; i += step) {
    result.push(byBpm[i]);
  }

  return result;
}

module.exports = {
  CURATION_SYSTEM_PROMPT,
  buildUserPrompt,
  parseCurationResponse,
  filterTrackList,
  selectRepresentativeSample,
};
