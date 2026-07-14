import {
  CURATION_SYSTEM_PROMPT,
  buildUserPrompt,
  parseCurationResponse,
  filterTrackList,
  selectRepresentativeSample,
} from '@recrate/shared';
import apiService from './api';

/**
 * AI crate curation that runs WITHOUT the desktop: the phone filters its cached
 * library, builds the same prompt the desktop would, and calls the proxy's
 * /api/llm/complete directly (which enforces entitlement, monthly quota, rate
 * limits, and usage recording server-side).
 *
 * Used when the desktop is unreachable but the phone has internet — the crate
 * save then rides the offline op queue and lands in Serato on the next sync.
 */

// The proxy rejects prompts over 32k chars; leave headroom for the system prompt.
const MAX_PROMPT_CHARS = 30000;
// Starting sample size; halved until the prompt fits.
const INITIAL_SAMPLE = 300;
const MIN_SAMPLE = 25;

export async function curateViaProxy({ prompt, tracks, filters = {}, limit = 25, options = {} }) {
  const filtered = filterTrackList(tracks || [], filters);
  if (filtered.length === 0) {
    throw new Error('No tracks in your library match the selected filters.');
  }

  // Shrink the sample until the prompt fits the proxy's size cap
  let sampleSize = Math.min(INITIAL_SAMPLE, filtered.length);
  let sample = selectRepresentativeSample(filtered, sampleSize);
  let userPrompt = buildUserPrompt(prompt, sample, { limit, ...options });
  while (
    userPrompt.length + CURATION_SYSTEM_PROMPT.length > MAX_PROMPT_CHARS &&
    sampleSize > MIN_SAMPLE
  ) {
    sampleSize = Math.max(MIN_SAMPLE, Math.floor(sampleSize / 2));
    sample = selectRepresentativeSample(filtered, sampleSize);
    userPrompt = buildUserPrompt(prompt, sample, { limit, ...options });
  }

  const result = await apiService.completeLLMViaProxy(CURATION_SYSTEM_PROMPT, userPrompt, {
    maxTokens: 4096,
  });

  const parsed = parseCurationResponse(result.text, sample.map((t) => t.id));

  // Enrich with full track metadata (same shape the desktop's /api/ai/curate returns)
  const byId = new Map(sample.map((t) => [t.id, t]));
  const enrichedTracks = parsed.tracks.map((t) => ({ ...byId.get(t.id), reason: t.reason }));

  return {
    success: true,
    curation: {
      tracks: enrichedTracks,
      reasoning: parsed.reasoning,
      suggestedOrder: parsed.suggestedOrder,
      metadata: {
        filteredTrackCount: filtered.length,
        sampledTrackCount: sample.length,
        source: 'proxy',
      },
    },
    tokensUsed: result.usage?.totalTokens,
    filteredTrackCount: filtered.length,
  };
}

/**
 * Filter options (genres + BPM range) derived from the cached library —
 * replaces the desktop's /api/ai/filter-options when it's unreachable.
 */
export function deriveFilterOptions(tracks) {
  const genres = [...new Set((tracks || []).map((t) => t.genre).filter(Boolean))].sort();

  let min = Infinity;
  let max = -Infinity;
  (tracks || []).forEach((t) => {
    if (typeof t.bpm === 'number' && t.bpm > 0) {
      if (t.bpm < min) min = t.bpm;
      if (t.bpm > max) max = t.bpm;
    }
  });

  return {
    genres,
    bpmStats: min !== Infinity ? { min: Math.floor(min), max: Math.ceil(max) } : null,
  };
}

/**
 * Local equivalent of the desktop's /api/ai/preview-filter.
 */
export function countMatchingTracks(tracks, filters) {
  return filterTrackList(tracks || [], filters).length;
}

export default { curateViaProxy, deriveFilterOptions, countMatchingTracks };
