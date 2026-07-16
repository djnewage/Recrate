/**
 * AI Crate Curation Prompts
 * System prompts and templates for LLM-powered crate building
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
 * Build the user prompt with track data and request
 * @param {string} userRequest - The user's natural language prompt
 * @param {Array} tracks - Array of track objects with metadata
 * @param {Object} options - Additional options for curation
 * @returns {string} Formatted user prompt
 */
function buildUserPrompt(userRequest, tracks, options = {}) {
  const trackSummary = tracks.map(t => ({
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
    additionalInstructions.push("Prioritize smooth mixing and key/BPM compatibility between consecutive tracks.");
  }

  if (options.includeVariety) {
    additionalInstructions.push("Include variety in artists and sub-styles while maintaining coherence.");
  }

  if (options.buildEnergy) {
    additionalInstructions.push("Structure the set to build energy progressively toward a peak.");
  }

  return `USER REQUEST: ${userRequest}

AVAILABLE TRACKS (${tracks.length} total):
${JSON.stringify(trackSummary, null, 2)}

Please select approximately ${limit} tracks that best match this request.
${additionalInstructions.length > 0 ? "\nADDITIONAL INSTRUCTIONS:\n- " + additionalInstructions.join("\n- ") : ""}

Remember: Return ONLY valid JSON with the structure specified in your instructions.`;
}

/**
 * Parse and validate LLM response
 * @param {string} responseText - Raw response from LLM
 * @param {Array} validTrackIds - List of valid track IDs to validate against
 * @returns {Object} Parsed curation object
 */
function parseResponse(responseText, validTrackIds) {
  // Try to extract JSON from the response (handle potential markdown wrapping)
  let jsonStr = responseText.trim();

  // Remove markdown code blocks if present
  if (jsonStr.startsWith("```json")) {
    jsonStr = jsonStr.slice(7);
  } else if (jsonStr.startsWith("```")) {
    jsonStr = jsonStr.slice(3);
  }
  if (jsonStr.endsWith("```")) {
    jsonStr = jsonStr.slice(0, -3);
  }
  jsonStr = jsonStr.trim();

  // Parse JSON
  const parsed = JSON.parse(jsonStr);

  // Validate structure
  if (!parsed.tracks || !Array.isArray(parsed.tracks)) {
    throw new Error("Invalid response: missing tracks array");
  }

  // Validate track IDs exist in library
  const validIdSet = new Set(validTrackIds);
  const validatedTracks = parsed.tracks.filter(t => {
    if (!t.id) return false;
    return validIdSet.has(t.id);
  });

  // Validate suggested order
  let suggestedOrder = parsed.suggestedOrder || [];
  suggestedOrder = suggestedOrder.filter(id => validIdSet.has(id));

  // The LLM sometimes returns a PARTIAL order (all tracks present but a
  // truncated suggestedOrder under its output-token cap). Consumers treat
  // suggestedOrder as authoritative, so complete it: model's order first,
  // remaining tracks appended.
  const orderedSet = new Set(suggestedOrder);
  const completeOrder = [
    ...suggestedOrder,
    ...validatedTracks.map(t => t.id).filter(id => !orderedSet.has(id)),
  ];

  return {
    tracks: validatedTracks,
    reasoning: parsed.reasoning || "No reasoning provided",
    suggestedOrder: completeOrder,
  };
}

module.exports = {
  CURATION_SYSTEM_PROMPT,
  buildUserPrompt,
  parseResponse,
};
