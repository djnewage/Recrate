/**
 * Serato Frame Debug Utility
 *
 * Diagnostic tool for analyzing Serato marker frames in audio files.
 * Use this to compare app-generated files with Serato-native files
 * to understand format differences.
 */

const logger = require('../utils/logger');
const { SeratoMarkersParser, DEFAULT_CUE_COLORS, rgbToHex } = require('./serato-markers');

/**
 * Format a buffer as hex dump with optional ASCII representation
 * @param {Buffer} buffer - Buffer to dump
 * @param {number} bytesPerLine - Bytes per line (default 16)
 * @param {number} maxLines - Maximum lines to output (default 32)
 * @returns {string} Formatted hex dump
 */
function hexDump(buffer, bytesPerLine = 16, maxLines = 32) {
  if (!buffer || buffer.length === 0) {
    return '  (empty)';
  }

  const lines = [];
  const maxBytes = Math.min(buffer.length, bytesPerLine * maxLines);

  for (let i = 0; i < maxBytes; i += bytesPerLine) {
    const slice = buffer.slice(i, Math.min(i + bytesPerLine, maxBytes));

    // Offset
    const offset = i.toString(16).padStart(4, '0');

    // Hex values
    const hexParts = [];
    for (let j = 0; j < bytesPerLine; j++) {
      if (j < slice.length) {
        hexParts.push(slice[j].toString(16).padStart(2, '0'));
      } else {
        hexParts.push('  ');
      }
    }
    const hex = hexParts.join(' ');

    // ASCII representation
    const ascii = slice
      .toString('binary')
      .split('')
      .map(c => {
        const code = c.charCodeAt(0);
        return code >= 32 && code < 127 ? c : '.';
      })
      .join('');

    lines.push(`  ${offset}: ${hex}  |${ascii}|`);
  }

  if (buffer.length > maxBytes) {
    lines.push(`  ... (${buffer.length - maxBytes} more bytes)`);
  }

  return lines.join('\n');
}

/**
 * Decode serato32 format back to 24-bit value
 * @param {Buffer} buf - 4-byte serato32 encoded buffer
 * @returns {number} Decoded 24-bit value
 */
function decodeSerato32(buf) {
  return ((buf[0] & 0x7f) << 21) |
         ((buf[1] & 0x7f) << 14) |
         ((buf[2] & 0x7f) << 7) |
         (buf[3] & 0x7f);
}

/**
 * Parse and annotate V1 (Serato Markers_) data
 * @param {Buffer} data - Raw V1 data
 * @returns {Object} Parsed data with annotations
 */
function parseV1Data(data) {
  const result = {
    valid: false,
    totalBytes: data?.length || 0,
    header: null,
    entries: [],
    footer: null,
    raw: null,
  };

  if (!data || data.length < 6) {
    result.error = 'Buffer too small';
    return result;
  }

  // Search for version header (02 05) in case of offset
  let offset = 0;
  for (let i = 0; i < Math.min(data.length - 1, 50); i++) {
    if (data[i] === 0x02 && data[i + 1] === 0x05) {
      offset = i;
      break;
    }
  }

  const workData = data.slice(offset);
  result.raw = workData;

  // Header validation
  if (workData[0] !== 0x02 || workData[1] !== 0x05) {
    result.error = `Invalid header: ${workData.slice(0, 2).toString('hex')} (expected 02 05)`;
    return result;
  }

  const entryCount = workData.readUInt32BE(2);
  result.header = {
    version: '02 05',
    entryCount,
    offset,
  };

  // Parse 14 entries (22 bytes each)
  let pos = 6;
  for (let i = 0; i < 14 && pos + 22 <= workData.length; i++) {
    const entryData = workData.slice(pos, pos + 22);
    const entry = {
      slot: i,
      slotType: i < 5 ? 'CUE' : 'LOOP',
      raw: entryData.toString('hex'),
      startSet: entryData[0] === 0x00,
      endSet: entryData[5] === 0x00,
    };

    if (entry.startSet) {
      entry.positionMs = decodeSerato32(entryData.slice(1, 5));
      const colorValue = decodeSerato32(entryData.slice(0x10, 0x14));
      entry.color = {
        r: (colorValue >> 16) & 0xff,
        g: (colorValue >> 8) & 0xff,
        b: colorValue & 0xff,
        hex: rgbToHex((colorValue >> 16) & 0xff, (colorValue >> 8) & 0xff, colorValue & 0xff),
      };
      entry.type = entryData[0x14];
      entry.typeName = entry.type === 0x01 ? 'CUE' : entry.type === 0x03 ? 'LOOP' : `UNKNOWN(${entry.type})`;
      entry.locked = entryData[0x15] === 0x01;
    }

    result.entries.push(entry);
    pos += 22;
  }

  // Footer (track color)
  if (pos + 4 <= workData.length) {
    const footerData = workData.slice(pos, pos + 4);
    const trackColor = decodeSerato32(footerData);
    result.footer = {
      trackColor: {
        r: (trackColor >> 16) & 0xff,
        g: (trackColor >> 8) & 0xff,
        b: trackColor & 0xff,
        hex: rgbToHex((trackColor >> 16) & 0xff, (trackColor >> 8) & 0xff, trackColor & 0xff),
      },
    };
  }

  result.valid = true;
  return result;
}

/**
 * Decode Serato Markers2 GEOB data (01 01 + base64 format)
 * @param {Buffer} data - Raw GEOB data
 * @returns {Buffer} Decoded binary markers
 */
function decodeV2FromGEOB(data) {
  if (!data || data.length < 4) {
    return { decoded: null, error: 'Buffer too small' };
  }

  // Search for 01 01 marker
  let markerIndex = -1;
  for (let i = 0; i < data.length - 3; i++) {
    if (data[i] === 0x01 && data[i + 1] === 0x01) {
      const nextByte = data[i + 2];
      // Check if followed by base64 characters
      if ((nextByte >= 0x41 && nextByte <= 0x5a) || // A-Z
          (nextByte >= 0x61 && nextByte <= 0x7a) || // a-z
          (nextByte >= 0x30 && nextByte <= 0x39)) { // 0-9
        markerIndex = i;
        break;
      }
    }
  }

  if (markerIndex === -1) {
    // Check if raw format (starts with 01 01 directly)
    if (data[0] === 0x01 && data[1] === 0x01) {
      return { decoded: data, format: 'raw', markerIndex: 0 };
    }
    return { decoded: null, error: 'No valid Serato marker pattern found' };
  }

  // Extract base64 content
  let base64Data = data.slice(markerIndex + 2);

  // Trim trailing nulls
  let endIndex = base64Data.length;
  while (endIndex > 0 && base64Data[endIndex - 1] === 0x00) {
    endIndex--;
  }
  base64Data = base64Data.slice(0, endIndex);

  try {
    const base64Str = base64Data.toString('ascii');
    const decoded = Buffer.from(base64Str, 'base64');
    return {
      decoded,
      format: 'base64',
      markerIndex,
      base64Length: base64Data.length,
      decodedLength: decoded.length,
    };
  } catch (e) {
    return { decoded: null, error: `Base64 decode failed: ${e.message}` };
  }
}

/**
 * Parse V2 (Serato Markers2) entries
 * @param {Buffer} data - Decoded V2 binary data
 * @returns {Object} Parsed data with annotations
 */
function parseV2Data(data) {
  const result = {
    valid: false,
    totalBytes: data?.length || 0,
    header: null,
    entries: [],
    cueCount: 0,
    cueIndices: [],
  };

  if (!data || data.length < 2) {
    result.error = 'Buffer too small';
    return result;
  }

  // Validate header
  if (data[0] !== 0x01 || data[1] !== 0x01) {
    result.error = `Invalid header: ${data.slice(0, 2).toString('hex')} (expected 01 01)`;
    return result;
  }

  result.header = { version: '01 01' };

  // Parse entries using SeratoMarkersParser
  try {
    const entries = SeratoMarkersParser.parse(data);
    result.entries = entries.map(entry => {
      const parsed = {
        type: entry.type,
        payloadLength: entry.payload?.length || 0,
        payloadHex: entry.payload?.slice(0, 32).toString('hex') || '',
      };

      if (entry.type === 'CUE' && entry.payload && entry.payload.length >= 13) {
        parsed.index = entry.payload[1];
        parsed.positionMs = entry.payload.readUInt32BE(2);
        parsed.color = {
          r: entry.payload[7],
          g: entry.payload[8],
          b: entry.payload[9],
          hex: rgbToHex(entry.payload[7], entry.payload[8], entry.payload[9]),
        };

        // Extract label
        if (entry.payload.length > 12) {
          const labelEnd = entry.payload.indexOf(0x00, 12);
          parsed.label = labelEnd !== -1
            ? entry.payload.slice(12, labelEnd).toString('utf8')
            : entry.payload.slice(12).toString('utf8');
        } else {
          parsed.label = '';
        }

        result.cueCount++;
        result.cueIndices.push(parsed.index);
      }

      return parsed;
    });

    result.valid = true;
  } catch (e) {
    result.error = `Parse error: ${e.message}`;
  }

  return result;
}

/**
 * Dump Serato frames from an audio file
 * @param {string} filePath - Path to audio file
 * @returns {Object} Diagnostic information about Serato frames
 */
async function dumpSeratoFrames(filePath) {
  const result = {
    filePath,
    v1: { found: false },
    v2: { found: false },
    comparison: {},
  };

  try {
    const mm = await import('music-metadata');
    const metadata = await mm.parseFile(filePath, {
      skipCovers: true,
      includeNative: true,
    });

    const v4Frames = metadata.native?.['ID3v2.4'] || [];
    const v3Frames = metadata.native?.['ID3v2.3'] || [];
    const nativeFrames = v4Frames.length > 0 ? v4Frames : v3Frames;

    result.id3Version = v4Frames.length > 0 ? 'ID3v2.4' : (v3Frames.length > 0 ? 'ID3v2.3' : 'none');
    result.totalFrames = nativeFrames.length;

    // Find GEOB frames
    const geobFrames = nativeFrames.filter(f => f.id === 'GEOB');
    result.geobCount = geobFrames.length;

    // Process V1 (Serato Markers_)
    const v1Frame = geobFrames.find(f => f.value?.description === 'Serato Markers_');
    if (v1Frame?.value?.data) {
      result.v1.found = true;
      const rawData = Buffer.isBuffer(v1Frame.value.data)
        ? v1Frame.value.data
        : Buffer.from(v1Frame.value.data);

      result.v1.rawLength = rawData.length;
      result.v1.hexDump = hexDump(rawData, 16, 24);
      result.v1.parsed = parseV1Data(rawData);
    }

    // Process V2 (Serato Markers2)
    const v2Frame = geobFrames.find(f => f.value?.description === 'Serato Markers2');
    if (v2Frame?.value?.data) {
      result.v2.found = true;
      const rawData = Buffer.isBuffer(v2Frame.value.data)
        ? v2Frame.value.data
        : Buffer.from(v2Frame.value.data);

      result.v2.rawLength = rawData.length;
      result.v2.rawHexDump = hexDump(rawData, 16, 8);

      // Decode from GEOB format
      const decodeResult = decodeV2FromGEOB(rawData);
      result.v2.decodeInfo = {
        format: decodeResult.format,
        markerIndex: decodeResult.markerIndex,
        decodedLength: decodeResult.decodedLength,
        error: decodeResult.error,
      };

      if (decodeResult.decoded) {
        result.v2.decodedHexDump = hexDump(decodeResult.decoded, 16, 24);
        result.v2.parsed = parseV2Data(decodeResult.decoded);
      }
    }

    // Generate comparison summary
    if (result.v1.found && result.v1.parsed?.valid) {
      const v1Cues = result.v1.parsed.entries
        .filter(e => e.startSet && e.slotType === 'CUE')
        .map(e => e.slot);
      result.comparison.v1CueIndices = v1Cues;
    }

    if (result.v2.found && result.v2.parsed?.valid) {
      result.comparison.v2CueIndices = result.v2.parsed.cueIndices;
    }

    // Identify missing cues
    if (result.comparison.v1CueIndices && result.comparison.v2CueIndices) {
      const v1Set = new Set(result.comparison.v1CueIndices);
      const v2Set = new Set(result.comparison.v2CueIndices);

      result.comparison.inV1NotV2 = result.comparison.v1CueIndices.filter(i => !v2Set.has(i));
      result.comparison.inV2NotV1 = result.comparison.v2CueIndices.filter(i => !v1Set.has(i));
      result.comparison.inBoth = result.comparison.v1CueIndices.filter(i => v2Set.has(i));
    }

  } catch (error) {
    result.error = error.message;
  }

  return result;
}

/**
 * Format diagnostic result for display
 * @param {Object} result - Result from dumpSeratoFrames
 * @returns {string} Formatted output
 */
function formatDiagnosticResult(result) {
  const lines = [];

  lines.push('=' .repeat(60));
  lines.push(`SERATO FRAME DIAGNOSTIC: ${result.filePath}`);
  lines.push('='.repeat(60));
  lines.push('');

  if (result.error) {
    lines.push(`ERROR: ${result.error}`);
    return lines.join('\n');
  }

  lines.push(`ID3 Version: ${result.id3Version}`);
  lines.push(`Total Frames: ${result.totalFrames}`);
  lines.push(`GEOB Frames: ${result.geobCount}`);
  lines.push('');

  // V1 Section
  lines.push('-'.repeat(60));
  lines.push('SERATO MARKERS_ (V1)');
  lines.push('-'.repeat(60));

  if (!result.v1.found) {
    lines.push('  NOT FOUND');
  } else {
    lines.push(`  Raw Length: ${result.v1.rawLength} bytes`);
    lines.push('');
    lines.push('  Hex Dump:');
    lines.push(result.v1.hexDump);
    lines.push('');

    if (result.v1.parsed?.valid) {
      const p = result.v1.parsed;
      lines.push(`  Header: version=${p.header.version}, entries=${p.header.entryCount}, offset=${p.header.offset}`);
      lines.push('');
      lines.push('  Cue Slots (0-4):');
      for (let i = 0; i < 5; i++) {
        const e = p.entries[i];
        if (e.startSet) {
          lines.push(`    Slot ${i}: ${e.positionMs}ms, color=${e.color.hex}, type=${e.typeName}`);
        } else {
          lines.push(`    Slot ${i}: (empty)`);
        }
      }
      lines.push('');
      lines.push('  Loop Slots (5-13):');
      let hasLoops = false;
      for (let i = 5; i < 14; i++) {
        const e = p.entries[i];
        if (e?.startSet) {
          lines.push(`    Slot ${i}: ${e.positionMs}ms`);
          hasLoops = true;
        }
      }
      if (!hasLoops) {
        lines.push('    (no loops)');
      }

      if (p.footer) {
        lines.push('');
        lines.push(`  Track Color: ${p.footer.trackColor.hex}`);
      }
    } else {
      lines.push(`  Parse Error: ${result.v1.parsed?.error}`);
    }
  }

  lines.push('');

  // V2 Section
  lines.push('-'.repeat(60));
  lines.push('SERATO MARKERS2 (V2)');
  lines.push('-'.repeat(60));

  if (!result.v2.found) {
    lines.push('  NOT FOUND');
  } else {
    lines.push(`  Raw Length: ${result.v2.rawLength} bytes`);
    lines.push('');
    lines.push('  Raw Hex (first 128 bytes):');
    lines.push(result.v2.rawHexDump);
    lines.push('');

    const di = result.v2.decodeInfo;
    lines.push(`  Decode Info: format=${di.format}, markerIndex=${di.markerIndex}, decodedLength=${di.decodedLength}`);

    if (di.error) {
      lines.push(`  Decode Error: ${di.error}`);
    } else {
      lines.push('');
      lines.push('  Decoded Hex:');
      lines.push(result.v2.decodedHexDump);
      lines.push('');

      if (result.v2.parsed?.valid) {
        const p = result.v2.parsed;
        lines.push(`  Header: version=${p.header.version}`);
        lines.push(`  Total Entries: ${p.entries.length}`);
        lines.push(`  CUE Entries: ${p.cueCount}`);
        lines.push(`  CUE Indices Present: [${p.cueIndices.join(', ')}]`);
        lines.push('');

        lines.push('  All Entries:');
        for (const e of p.entries) {
          if (e.type === 'CUE') {
            lines.push(`    CUE index=${e.index}: ${e.positionMs}ms, color=${e.color.hex}, label="${e.label}"`);
          } else {
            lines.push(`    ${e.type}: payloadLen=${e.payloadLength}`);
          }
        }
      } else {
        lines.push(`  Parse Error: ${result.v2.parsed?.error}`);
      }
    }
  }

  lines.push('');

  // Comparison Section
  lines.push('-'.repeat(60));
  lines.push('COMPARISON SUMMARY');
  lines.push('-'.repeat(60));

  const c = result.comparison;
  if (c.v1CueIndices) {
    lines.push(`  V1 CUE indices: [${c.v1CueIndices.join(', ')}]`);
  }
  if (c.v2CueIndices) {
    lines.push(`  V2 CUE indices: [${c.v2CueIndices.join(', ')}]`);
  }
  if (c.inV1NotV2?.length > 0) {
    lines.push(`  In V1 but NOT in V2: [${c.inV1NotV2.join(', ')}]  <-- POTENTIAL ISSUE`);
  }
  if (c.inV2NotV1?.length > 0) {
    lines.push(`  In V2 but NOT in V1: [${c.inV2NotV1.join(', ')}]  (expected for cues 6-8)`);
  }
  if (c.inBoth?.length > 0) {
    lines.push(`  In BOTH V1 and V2: [${c.inBoth.join(', ')}]`);
  }

  lines.push('');
  lines.push('='.repeat(60));

  return lines.join('\n');
}

module.exports = {
  dumpSeratoFrames,
  formatDiagnosticResult,
  hexDump,
  parseV1Data,
  parseV2Data,
  decodeV2FromGEOB,
};
