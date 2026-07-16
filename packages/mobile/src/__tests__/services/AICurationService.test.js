/**
 * Unit tests for AICurationService — AI crate building via the cloud proxy
 * against the cached library (desktop unreachable).
 */

import AICurationService from '../../services/AICurationService';
import { CURATION_SYSTEM_PROMPT } from '@recrate/shared';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: {
    completeLLMViaProxy: jest.fn(),
  },
}));

const apiService = require('../../services/api').default;

const makeTrack = (id, overrides = {}) => ({
  id,
  title: `Title ${id}`,
  artist: `Artist ${id}`,
  bpm: 120,
  key: '8A',
  genre: 'House',
  duration: 300,
  filePath: `/Music/${id}.mp3`,
  ...overrides,
});

const llmResponse = (obj) => ({
  text: JSON.stringify(obj),
  usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
});

describe('AICurationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('curateViaProxy', () => {
    it('filters, prompts the proxy LLM, and returns enriched tracks in the desktop response shape', async () => {
      const tracks = [
        makeTrack('t1', { bpm: 122 }),
        makeTrack('t2', { bpm: 126 }),
        makeTrack('t3', { bpm: 90, genre: 'Hip Hop' }), // filtered out by bpm
      ];
      apiService.completeLLMViaProxy.mockResolvedValue(
        llmResponse({
          tracks: [
            { id: 't2', reason: 'peak energy' },
            { id: 't1', reason: 'warm up' },
          ],
          reasoning: 'Builds from warm to peak.',
          suggestedOrder: ['t1', 't2'],
        })
      );

      const result = await AICurationService.curateViaProxy({
        prompt: 'sunset house set',
        tracks,
        filters: { bpmRange: { min: 118, max: 130 } },
        limit: 2,
      });

      expect(result.success).toBe(true);
      expect(result.curation.tracks).toHaveLength(2);
      // Enriched with full metadata from the cached library + LLM reason
      expect(result.curation.tracks[0]).toMatchObject({
        id: 't2',
        title: 'Title t2',
        bpm: 126,
        reason: 'peak energy',
      });
      expect(result.curation.suggestedOrder).toEqual(['t1', 't2']);
      expect(result.curation.metadata.source).toBe('proxy');
      expect(result.curation.metadata.filteredTrackCount).toBe(2);

      // The LLM was given the curation system prompt and only the filtered tracks
      const [systemPrompt, userPrompt] = apiService.completeLLMViaProxy.mock.calls[0];
      expect(systemPrompt).toBe(CURATION_SYSTEM_PROMPT);
      expect(userPrompt).toContain('sunset house set');
      expect(userPrompt).toContain('"t1"');
      expect(userPrompt).not.toContain('"t3"');
    });

    it('drops hallucinated track ids from the LLM response', async () => {
      apiService.completeLLMViaProxy.mockResolvedValue(
        llmResponse({
          tracks: [
            { id: 't1', reason: 'real' },
            { id: 'made-up-id', reason: 'hallucinated' },
          ],
          reasoning: 'ok',
          suggestedOrder: ['t1', 'made-up-id'],
        })
      );

      const result = await AICurationService.curateViaProxy({
        prompt: 'x',
        tracks: [makeTrack('t1')],
      });

      expect(result.curation.tracks.map((t) => t.id)).toEqual(['t1']);
      expect(result.curation.suggestedOrder).toEqual(['t1']);
    });

    it('completes a partial suggestedOrder so no selected track can be dropped on save', async () => {
      // Model returns all 5 tracks but truncates suggestedOrder to 2 (output-token cap)
      const tracks = ['t1', 't2', 't3', 't4', 't5'].map((id) => makeTrack(id));
      apiService.completeLLMViaProxy.mockResolvedValue(
        llmResponse({
          tracks: tracks.map((t) => ({ id: t.id, reason: 'r' })),
          reasoning: 'ok',
          suggestedOrder: ['t3', 't1'],
        })
      );

      const result = await AICurationService.curateViaProxy({ prompt: 'x', tracks });

      // Model's ordering first, remaining tracks appended — nothing lost
      expect(result.curation.suggestedOrder).toEqual(['t3', 't1', 't2', 't4', 't5']);
      expect(result.curation.tracks).toHaveLength(5);
    });

    it('reports a friendly error when a truncated (max_tokens) response fails to parse', async () => {
      apiService.completeLLMViaProxy.mockResolvedValue({
        text: '{"tracks":[{"id":"t1","reason":"cut off mid',
        stopReason: 'max_tokens',
        usage: { totalTokens: 4096 },
      });

      await expect(
        AICurationService.curateViaProxy({ prompt: 'x', tracks: [makeTrack('t1')] })
      ).rejects.toThrow('The AI response was cut off — try a smaller track limit.');
    });

    it('parses markdown-wrapped JSON responses', async () => {
      apiService.completeLLMViaProxy.mockResolvedValue({
        text: '```json\n{"tracks":[{"id":"t1","reason":"r"}],"reasoning":"ok","suggestedOrder":["t1"]}\n```',
        usage: { totalTokens: 10 },
      });

      const result = await AICurationService.curateViaProxy({
        prompt: 'x',
        tracks: [makeTrack('t1')],
      });
      expect(result.curation.tracks).toHaveLength(1);
    });

    it('shrinks the track sample until the prompt fits the proxy size cap', async () => {
      // 2000 tracks with chunky titles would blow well past 30k chars unsampled
      const tracks = Array.from({ length: 2000 }, (_, i) =>
        makeTrack(`track-${i}`, {
          title: `An Unnecessarily Long Track Title For Padding ${i}`,
          artist: `A Collaboration Of Many Artists Featuring Someone ${i}`,
          bpm: 100 + (i % 60),
        })
      );
      apiService.completeLLMViaProxy.mockResolvedValue(
        llmResponse({ tracks: [], reasoning: 'ok', suggestedOrder: [] })
      );

      await AICurationService.curateViaProxy({ prompt: 'big library', tracks });

      const [systemPrompt, userPrompt] = apiService.completeLLMViaProxy.mock.calls[0];
      expect(systemPrompt.length + userPrompt.length).toBeLessThanOrEqual(30000);
    });

    it('throws a friendly error when no tracks match the filters', async () => {
      await expect(
        AICurationService.curateViaProxy({
          prompt: 'x',
          tracks: [makeTrack('t1', { bpm: 100 })],
          filters: { bpmRange: { min: 170, max: 180 } },
        })
      ).rejects.toThrow('No tracks in your library match the selected filters.');
      expect(apiService.completeLLMViaProxy).not.toHaveBeenCalled();
    });
  });

  describe('deriveFilterOptions', () => {
    it('derives sorted unique genres and the bpm range from cached tracks', () => {
      const options = AICurationService.deriveFilterOptions([
        makeTrack('t1', { genre: 'House', bpm: 124.6 }),
        makeTrack('t2', { genre: 'Techno', bpm: 138.2 }),
        makeTrack('t3', { genre: 'House', bpm: 118.4 }),
        makeTrack('t4', { genre: null, bpm: null }),
      ]);

      expect(options.genres).toEqual(['House', 'Techno']);
      expect(options.bpmStats).toEqual({ min: 118, max: 139 });
    });

    it('handles an empty library', () => {
      expect(AICurationService.deriveFilterOptions([])).toEqual({
        genres: [],
        bpmStats: null,
      });
    });
  });

  describe('countMatchingTracks', () => {
    it('counts tracks matching the combined filters', () => {
      const tracks = [
        makeTrack('t1', { bpm: 124, key: '8A', genre: 'House' }),
        makeTrack('t2', { bpm: 124, key: '3B', genre: 'House' }),
        makeTrack('t3', { bpm: 90, key: '8A', genre: 'House' }),
      ];
      const count = AICurationService.countMatchingTracks(tracks, {
        bpmRange: { min: 120, max: 130 },
        selectedKeys: ['8A'],
        selectedGenres: ['house'],
      });
      expect(count).toBe(1);
    });
  });
});
