/**
 * Serato BeatGrid Parser
 *
 * Reads Serato's real beat grid from the `Serato BeatGrid` ID3v2 GEOB frame
 * (MP3/AIFF), giving a true first-beat anchor + tempo so a beat grid can be drawn
 * that locks to the audio (unlike a BPM-only guess). Sibling to serato-markers.js,
 * which reads the separate `Serato Markers2` frame for cue points.
 *
 * GEOB objectData binary layout:
 *   [0..1]   0x01 0x00                version
 *   [2..5]   uint32 BE                number of markers (N)
 *   N markers, the LAST is "terminal":
 *     non-terminal (8 bytes): float32 BE position(sec) + uint32 BE beats_till_next_marker
 *     terminal     (8 bytes): float32 BE position(sec) + float32 BE bpm
 *   [end]    1 byte footer
 *
 * Only ID3 GEOB (MP3/AIFF) is handled here; FLAC (Vorbis SERATO_BEATGRID) and
 * MP4/M4A atoms are a follow-up — for those we return an empty grid gracefully.
 *
 * FALLBACK — Mixed In Key: many libraries are tagged by Mixed In Key, which writes a
 * `BeatGrid` GEOB (no "Serato " prefix) whose payload is a base64-encoded JSON blob:
 *   { "source":"mixedinkey", "tempo":<bpm>, "algorithm":<n>, "beats":[<sec>, ...] }
 * The `beats` array is an EXPLICIT list of every beat timestamp — richer than Serato's
 * marker format — so when there's no `Serato BeatGrid` frame we read the grid straight
 * from it. See parseMixedInKeyBeatGrid.
 */

const path = require('path');
const logger = require('../utils/logger');

// music-metadata is ESM-only — lazy dynamic import (mirrors metadata.js).
let parseFile = null;
async function getParseFile() {
  if (!parseFile) {
    const mm = await import('music-metadata');
    parseFile = mm.parseFile;
  }
  return parseFile;
}

/**
 * Parse the raw `Serato BeatGrid` GEOB objectData buffer into markers.
 * @param {Buffer} buffer
 * @returns {{ markers: Array<{positionSec:number, beatsTillNext?:number, bpm?:number}> } | null}
 */
function parseBeatGridBuffer(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 6) return null;
  // Expect version 0x01 0x00; be lenient if the first byte was stripped in storage.
  let offset = 2;
  const count = buffer.readUInt32BE(offset);
  offset += 4;
  if (!(count > 0) || count > 4096) return null; // sanity bound

  const markers = [];
  for (let i = 0; i < count; i++) {
    if (offset + 8 > buffer.length) break;
    const positionSec = buffer.readFloatBE(offset);
    offset += 4;
    const isTerminal = i === count - 1;
    if (isTerminal) {
      const bpm = buffer.readFloatBE(offset);
      markers.push({ positionSec, bpm });
    } else {
      const beatsTillNext = buffer.readUInt32BE(offset);
      markers.push({ positionSec, beatsTillNext });
    }
    offset += 4;
  }

  if (!markers.length) return null;
  return { markers };
}

/**
 * Expand markers into an explicit list of beat timestamps (seconds), covering the
 * whole track. Handles tempo changes (per-segment interval) and extends the constant
 * terminal tempo out to `duration`, plus backfills beats before the first marker.
 * @param {{markers:Array}} parsed
 * @param {number} duration - track duration in seconds
 * @returns {number[]}
 */
function computeBeats(parsed, duration) {
  const { markers } = parsed;
  if (!markers || !markers.length) return [];
  const dur = duration > 0 ? duration : markers[markers.length - 1].positionSec + 60;
  const beats = [];

  // Interval of the first segment (for backfilling before the anchor).
  const firstInterval =
    markers.length > 1 && markers[0].beatsTillNext > 0
      ? (markers[1].positionSec - markers[0].positionSec) / markers[0].beatsTillNext
      : 60 / (markers[markers.length - 1].bpm || 120);

  // Backfill beats before the first marker down to 0.
  const preBeats = [];
  for (let t = markers[0].positionSec - firstInterval; t >= -1e-6; t -= firstInterval) {
    preBeats.push(t);
  }
  preBeats.reverse();
  beats.push(...preBeats.filter((t) => t >= 0));

  // Walk each segment.
  for (let i = 0; i < markers.length; i++) {
    const m = markers[i];
    if (i < markers.length - 1) {
      const next = markers[i + 1];
      const n = m.beatsTillNext > 0 ? m.beatsTillNext : 1;
      const interval = (next.positionSec - m.positionSec) / n;
      for (let k = 0; k < n; k++) beats.push(m.positionSec + k * interval);
    } else {
      // Terminal: constant tempo out to the end of the track.
      const interval = 60 / (m.bpm || 120);
      for (let t = m.positionSec; t <= dur + 1e-6; t += interval) beats.push(t);
    }
  }

  return beats.filter((t) => t >= 0 && t <= dur + 1e-6);
}

/**
 * Parse a Mixed In Key `BeatGrid` GEOB payload into an explicit beat list.
 * The payload is a base64-encoded JSON object `{tempo, beats:[sec,...]}`, usually with a
 * few bytes of leftover description ("...eatGrid\0") before the base64 — so we locate the
 * JSON by its base64 prefix `eyJ` (== `{"`), strip non-base64 chars (newline wraps), decode,
 * and tolerate trailing junk by trimming to the last closing brace.
 * @param {Buffer|Uint8Array} data
 * @returns {{ tempo: number|null, beats: number[] } | null}
 */
function parseMixedInKeyBeatGrid(data) {
  try {
    if (!data) return null;
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
    const ascii = buf.toString('latin1');
    const start = ascii.indexOf('eyJ'); // base64 for `{"`
    if (start < 0) return null;

    const b64 = ascii.slice(start).replace(/[^A-Za-z0-9+/=]/g, '');
    const decoded = Buffer.from(b64, 'base64').toString('utf8');

    let json = null;
    try {
      json = JSON.parse(decoded);
    } catch {
      const end = decoded.lastIndexOf('}'); // drop trailing bytes past the JSON object
      if (end > 0) {
        try {
          json = JSON.parse(decoded.slice(0, end + 1));
        } catch {
          return null;
        }
      }
    }
    if (!json || !Array.isArray(json.beats)) return null;

    const beats = json.beats
      .map(Number)
      .filter((n) => Number.isFinite(n) && n >= 0)
      .sort((a, b) => a - b);
    if (!beats.length) return null;

    return { tempo: typeof json.tempo === 'number' ? json.tempo : null, beats };
  } catch {
    return null;
  }
}

/**
 * Read + parse a beat grid for a file and expand it to beat timestamps. Prefers Serato's
 * native `Serato BeatGrid` GEOB; falls back to a Mixed In Key `BeatGrid` GEOB (explicit
 * beats). Returns an empty grid (never throws) when there's no grid or on unsupported
 * formats.
 * @param {string} filePath
 * @param {number} duration - track duration in seconds (bounds the beat list)
 * @returns {Promise<{ bpm: number|null, firstBeatSec: number|null, beats: number[] }>}
 */
async function readBeatGrid(filePath, duration = 0) {
  const empty = { bpm: null, firstBeatSec: null, beats: [] };
  try {
    const parse = await getParseFile();
    const metadata = await parse(filePath, { skipCovers: true, includeNative: true });
    const nativeFrames = metadata.native?.['ID3v2.4'] || metadata.native?.['ID3v2.3'];
    const native = Array.isArray(nativeFrames) ? nativeFrames : [];

    // 1. Prefer Serato's native binary beat grid when present.
    const seratoGeob = native.find(
      (f) => f.id === 'GEOB' && f.value?.description === 'Serato BeatGrid'
    );
    if (seratoGeob?.value?.data) {
      const buffer = Buffer.isBuffer(seratoGeob.value.data)
        ? seratoGeob.value.data
        : Buffer.from(seratoGeob.value.data);
      const parsed = parseBeatGridBuffer(buffer);
      if (parsed) {
        const beats = computeBeats(parsed, duration);
        const terminal = parsed.markers[parsed.markers.length - 1];
        return {
          bpm: terminal && typeof terminal.bpm === 'number' ? terminal.bpm : null,
          firstBeatSec: parsed.markers[0].positionSec,
          beats,
        };
      }
    }

    // 2. Fall back to Mixed In Key's `BeatGrid` GEOB (explicit beats[]).
    const mikGeob = native.find(
      (f) => f.id === 'GEOB' && f.value?.description === 'BeatGrid'
    );
    if (mikGeob?.value?.data) {
      const mik = parseMixedInKeyBeatGrid(mikGeob.value.data);
      if (mik?.beats?.length) {
        // Bound to the track duration when known (MIK grids run to the end already).
        const beats = duration > 0 ? mik.beats.filter((t) => t <= duration + 1e-6) : mik.beats;
        return { bpm: mik.tempo, firstBeatSec: beats[0] ?? null, beats };
      }
    }

    logger.debug(`[BEATGRID] No beat grid (Serato or MIK) in: ${path.basename(filePath)}`);
    return empty;
  } catch (error) {
    logger.warn(`[BEATGRID] Failed to read beat grid for ${path.basename(filePath || '')}: ${error.message}`);
    return empty;
  }
}

module.exports = { parseBeatGridBuffer, computeBeats, parseMixedInKeyBeatGrid, readBeatGrid };
