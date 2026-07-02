const {
  parseBeatGridBuffer,
  computeBeats,
  parseMixedInKeyBeatGrid,
  readBeatGrid,
} = require('../../audio/serato-beatgrid');

/** Build a Mixed In Key `BeatGrid` GEOB payload: leftover description bytes + base64 JSON. */
function mikBuffer(tempo, beats, { prefix = 'eatGrid\0', trailing = '' } = {}) {
  const json = JSON.stringify({ source: 'mixedinkey', tempo, algorithm: 12, beats });
  const b64 = Buffer.from(json, 'utf8').toString('base64');
  return Buffer.from(prefix + b64 + trailing, 'latin1');
}

/** Build a single terminal-marker (constant tempo) BeatGrid buffer. */
function singleTempoBuffer(positionSec, bpm) {
  const buf = Buffer.alloc(2 + 4 + 8 + 1);
  buf.writeUInt8(1, 0);
  buf.writeUInt8(0, 1);
  buf.writeUInt32BE(1, 2); // 1 marker (terminal)
  buf.writeFloatBE(positionSec, 6);
  buf.writeFloatBE(bpm, 10);
  buf.writeUInt8(0, 14); // footer
  return buf;
}

/** Build a 2-marker (one tempo change) buffer: [non-terminal, terminal]. */
function twoMarkerBuffer(pos0, beatsTillNext, pos1, bpm) {
  const buf = Buffer.alloc(2 + 4 + 8 + 8 + 1);
  buf.writeUInt8(1, 0);
  buf.writeUInt8(0, 1);
  buf.writeUInt32BE(2, 2);
  buf.writeFloatBE(pos0, 6);
  buf.writeUInt32BE(beatsTillNext, 10);
  buf.writeFloatBE(pos1, 14);
  buf.writeFloatBE(bpm, 18);
  buf.writeUInt8(0, 22);
  return buf;
}

describe('serato-beatgrid', () => {
  describe('parseBeatGridBuffer', () => {
    it('parses a single terminal marker (position + bpm)', () => {
      const parsed = parseBeatGridBuffer(singleTempoBuffer(0.5, 120));
      expect(parsed).not.toBeNull();
      expect(parsed.markers).toHaveLength(1);
      expect(parsed.markers[0].positionSec).toBeCloseTo(0.5, 5);
      expect(parsed.markers[0].bpm).toBeCloseTo(120, 3);
    });

    it('parses non-terminal + terminal markers', () => {
      const parsed = parseBeatGridBuffer(twoMarkerBuffer(0, 4, 2, 120));
      expect(parsed.markers).toHaveLength(2);
      expect(parsed.markers[0].beatsTillNext).toBe(4);
      expect(parsed.markers[1].bpm).toBeCloseTo(120, 3);
    });

    it('returns null for a too-short / invalid buffer', () => {
      expect(parseBeatGridBuffer(Buffer.alloc(3))).toBeNull();
      expect(parseBeatGridBuffer(null)).toBeNull();
    });
  });

  describe('computeBeats', () => {
    it('spaces beats by 60/bpm, anchored to the first beat, within duration', () => {
      const beats = computeBeats({ markers: [{ positionSec: 0.5, bpm: 120 }] }, 2);
      // 120 bpm → 0.5s interval; backfilled to 0, extended to 2
      expect(beats).toEqual([0, 0.5, 1, 1.5, 2].map((n) => expect.closeTo(n, 5)));
      // consecutive spacing is the beat interval
      for (let i = 1; i < beats.length; i++) {
        expect(beats[i] - beats[i - 1]).toBeCloseTo(0.5, 5);
      }
    });

    it('handles a tempo change segment (evenly spaced between markers)', () => {
      const beats = computeBeats(
        { markers: [{ positionSec: 0, beatsTillNext: 4 }, { positionSec: 2, bpm: 120 }] },
        3
      );
      // first segment: 4 beats between 0 and 2 → interval 0.5
      expect(beats.slice(0, 4)).toEqual([0, 0.5, 1, 1.5].map((n) => expect.closeTo(n, 5)));
      // terminal at 120bpm continues from 2s
      expect(beats).toContainEqual(expect.closeTo(2, 5));
      expect(Math.max(...beats)).toBeLessThanOrEqual(3 + 1e-3);
    });

    it('returns [] for no markers', () => {
      expect(computeBeats({ markers: [] }, 10)).toEqual([]);
    });
  });

  describe('parseMixedInKeyBeatGrid', () => {
    it('decodes base64 JSON beats, skipping leftover description bytes', () => {
      const r = parseMixedInKeyBeatGrid(mikBuffer(128, [0.01, 0.48, 0.95]));
      expect(r).not.toBeNull();
      expect(r.tempo).toBeCloseTo(128, 3);
      expect(r.beats).toEqual([0.01, 0.48, 0.95].map((n) => expect.closeTo(n, 5)));
    });

    it('sorts beats and drops non-finite/negative values', () => {
      const r = parseMixedInKeyBeatGrid(mikBuffer(120, [1.0, 0.5, -0.2, 0]));
      expect(r.beats).toEqual([0, 0.5, 1.0].map((n) => expect.closeTo(n, 5)));
    });

    it('tolerates trailing junk after the JSON object', () => {
      const r = parseMixedInKeyBeatGrid(mikBuffer(120, [0, 0.5], { trailing: 'AAAA' }));
      expect(r?.beats).toHaveLength(2);
    });

    it('returns null when there is no base64 JSON payload', () => {
      expect(parseMixedInKeyBeatGrid(Buffer.from('no grid here', 'latin1'))).toBeNull();
      expect(parseMixedInKeyBeatGrid(null)).toBeNull();
    });
  });

  describe('readBeatGrid', () => {
    it('returns an empty grid (never throws) for a missing/invalid file', async () => {
      const result = await readBeatGrid('/nonexistent/file.mp3', 100);
      expect(result).toEqual({ bpm: null, firstBeatSec: null, beats: [] });
    });
  });
});
