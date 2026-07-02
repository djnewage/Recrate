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
 * Read + parse the Serato beat grid for a file and expand it to beat timestamps.
 * Returns an empty grid (never throws) when there's no grid or on unsupported formats.
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

    const geob = native.find(
      (f) => f.id === 'GEOB' && f.value?.description === 'Serato BeatGrid'
    );
    if (!geob || !geob.value?.data) {
      logger.debug(`[BEATGRID] No Serato BeatGrid in: ${path.basename(filePath)}`);
      return empty;
    }

    const buffer = Buffer.isBuffer(geob.value.data)
      ? geob.value.data
      : Buffer.from(geob.value.data);
    const parsed = parseBeatGridBuffer(buffer);
    if (!parsed) return empty;

    const beats = computeBeats(parsed, duration);
    const terminal = parsed.markers[parsed.markers.length - 1];
    return {
      bpm: terminal && typeof terminal.bpm === 'number' ? terminal.bpm : null,
      firstBeatSec: parsed.markers[0].positionSec,
      beats,
    };
  } catch (error) {
    logger.warn(`[BEATGRID] Failed to read beat grid for ${path.basename(filePath || '')}: ${error.message}`);
    return empty;
  }
}

module.exports = { parseBeatGridBuffer, computeBeats, readBeatGrid };
