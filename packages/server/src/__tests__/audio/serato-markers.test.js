/**
 * Unit tests for SeratoMarkersParser
 * Tests parsing, encoding, and round-trip functionality for Serato Markers2 format
 */

const {
  SeratoMarkersParser,
  ENTRY_TYPES,
  DEFAULT_CUE_COLORS,
  rgbToHex,
  hexToRgb,
} = require('../../audio/serato-markers');

describe('SeratoMarkersParser', () => {
  describe('parse()', () => {
    test('parses empty buffer', () => {
      const buffer = Buffer.from([]);
      const entries = SeratoMarkersParser.parse(buffer);
      expect(entries).toEqual([]);
    });

    test('parses buffer with only header (no entries)', () => {
      const buffer = Buffer.from([0x01, 0x01]);
      const entries = SeratoMarkersParser.parse(buffer);
      expect(entries).toEqual([]);
    });

    test('parses valid header and single CUE entry', () => {
      // Create a valid buffer with header and one CUE entry
      const buffer = Buffer.concat([
        Buffer.from([0x01, 0x01]), // Header
        Buffer.from([0x00]), // Entry marker
        Buffer.from('CUE\x00', 'utf8'), // Type
        Buffer.from([0x00, 0x00, 0x00, 0x0d]), // Length = 13
        createMinimalCuePayload(0, 1000, 0xCC, 0x00, 0x00),
      ]);

      const entries = SeratoMarkersParser.parse(buffer);
      expect(entries.length).toBe(1);
      expect(entries[0].type).toBe('CUE');
    });

    test('continues parsing with invalid header (non-01 01)', () => {
      // Some files might have different versions
      const buffer = Buffer.concat([
        Buffer.from([0x02, 0x01]), // Different header
        Buffer.from([0x00]), // Entry marker
        Buffer.from('CUE\x00', 'utf8'), // Type
        Buffer.from([0x00, 0x00, 0x00, 0x0d]), // Length = 13
        createMinimalCuePayload(0, 1000, 0xCC, 0x00, 0x00),
      ]);

      // Should still parse entries
      const entries = SeratoMarkersParser.parse(buffer);
      expect(entries.length).toBe(1);
    });

    test('handles truncated buffer gracefully', () => {
      const buffer = Buffer.from([0x01, 0x01, 0x00, 0x43]); // Header + partial entry
      const entries = SeratoMarkersParser.parse(buffer);
      expect(entries).toEqual([]);
    });
  });

  describe('extractCuePoints()', () => {
    test('extracts cue with label', () => {
      const label = 'Drop';
      const payload = createCuePayloadWithLabel(2, 5000, 0x00, 0xCC, 0x00, label);
      const entries = [{
        type: ENTRY_TYPES.CUE,
        payload,
      }];

      const cuePoints = SeratoMarkersParser.extractCuePoints(entries);
      expect(cuePoints.length).toBe(1);
      expect(cuePoints[0].index).toBe(2);
      expect(cuePoints[0].positionMs).toBe(5000);
      expect(cuePoints[0].positionSec).toBe(5);
      expect(cuePoints[0].r).toBe(0x00);
      expect(cuePoints[0].g).toBe(0xCC);
      expect(cuePoints[0].b).toBe(0x00);
      expect(cuePoints[0].label).toBe(label);
      expect(cuePoints[0].colorHex).toBe('#00CC00');
    });

    test('extracts cue without label', () => {
      const payload = createMinimalCuePayload(0, 0, 0xCC, 0x00, 0x00);
      const entries = [{
        type: ENTRY_TYPES.CUE,
        payload,
      }];

      const cuePoints = SeratoMarkersParser.extractCuePoints(entries);
      expect(cuePoints.length).toBe(1);
      expect(cuePoints[0].label).toBe('');
    });

    test('handles empty label (immediate null byte at position 12)', () => {
      // Create payload with immediate null after fixed bytes
      const payload = Buffer.alloc(13);
      payload[0] = 0x00; // Always 0
      payload[1] = 0x00; // Index
      payload.writeUInt32BE(1000, 2); // Position
      payload[6] = 0x00; // Padding
      payload[7] = 0xCC; // R
      payload[8] = 0x00; // G
      payload[9] = 0x00; // B
      payload[10] = 0x00; // Padding
      payload[11] = 0x00; // Padding
      payload[12] = 0x00; // Null terminator (empty label)

      const entries = [{
        type: ENTRY_TYPES.CUE,
        payload,
      }];

      const cuePoints = SeratoMarkersParser.extractCuePoints(entries);
      expect(cuePoints.length).toBe(1);
      expect(cuePoints[0].label).toBe('');
    });

    test('skips malformed CUE entries (payload too small)', () => {
      const entries = [{
        type: ENTRY_TYPES.CUE,
        payload: Buffer.alloc(10), // Too small (needs minimum 13)
      }];

      const cuePoints = SeratoMarkersParser.extractCuePoints(entries);
      expect(cuePoints.length).toBe(0);
    });

    test('skips non-CUE entries', () => {
      const entries = [
        { type: 'COLOR', payload: Buffer.alloc(20) },
        { type: 'BPMLOCK', payload: Buffer.alloc(5) },
      ];

      const cuePoints = SeratoMarkersParser.extractCuePoints(entries);
      expect(cuePoints.length).toBe(0);
    });

    test('sorts cue points by index', () => {
      const entries = [
        { type: ENTRY_TYPES.CUE, payload: createMinimalCuePayload(5, 5000, 0xCC, 0x00, 0x00) },
        { type: ENTRY_TYPES.CUE, payload: createMinimalCuePayload(1, 1000, 0xCC, 0x00, 0x00) },
        { type: ENTRY_TYPES.CUE, payload: createMinimalCuePayload(3, 3000, 0xCC, 0x00, 0x00) },
      ];

      const cuePoints = SeratoMarkersParser.extractCuePoints(entries);
      expect(cuePoints.length).toBe(3);
      expect(cuePoints[0].index).toBe(1);
      expect(cuePoints[1].index).toBe(3);
      expect(cuePoints[2].index).toBe(5);
    });
  });

  describe('createCuePayload()', () => {
    test('creates valid payload', () => {
      const payload = SeratoMarkersParser.createCuePayload(0, 1000, 0xCC, 0x00, 0x00, 'Test');
      expect(payload).toBeInstanceOf(Buffer);
      expect(payload.length).toBe(12 + 4 + 1); // Fixed + label + null
      expect(payload[1]).toBe(0); // Index
      expect(payload.readUInt32BE(2)).toBe(1000); // Position
      expect(payload[7]).toBe(0xCC); // R
      expect(payload[8]).toBe(0x00); // G
      expect(payload[9]).toBe(0x00); // B
    });

    test('rejects invalid index (negative)', () => {
      expect(() => {
        SeratoMarkersParser.createCuePayload(-1, 1000, 0xCC, 0x00, 0x00);
      }).toThrow('Invalid cue index');
    });

    test('rejects invalid index (> 7)', () => {
      expect(() => {
        SeratoMarkersParser.createCuePayload(8, 1000, 0xCC, 0x00, 0x00);
      }).toThrow('Invalid cue index');
    });

    test('rejects invalid RGB (negative)', () => {
      expect(() => {
        SeratoMarkersParser.createCuePayload(0, 1000, -1, 0x00, 0x00);
      }).toThrow('Invalid RGB values');
    });

    test('rejects invalid RGB (> 255)', () => {
      expect(() => {
        SeratoMarkersParser.createCuePayload(0, 1000, 256, 0x00, 0x00);
      }).toThrow('Invalid RGB values');
    });

    test('rejects invalid position (negative)', () => {
      expect(() => {
        SeratoMarkersParser.createCuePayload(0, -100, 0xCC, 0x00, 0x00);
      }).toThrow('Invalid position');
    });

    test('rejects invalid position (NaN)', () => {
      expect(() => {
        SeratoMarkersParser.createCuePayload(0, NaN, 0xCC, 0x00, 0x00);
      }).toThrow('Invalid position');
    });

    test('rejects invalid position (Infinity)', () => {
      expect(() => {
        SeratoMarkersParser.createCuePayload(0, Infinity, 0xCC, 0x00, 0x00);
      }).toThrow('Invalid position');
    });

    test('truncates long labels to 256 characters', () => {
      const longLabel = 'A'.repeat(500);
      const payload = SeratoMarkersParser.createCuePayload(0, 1000, 0xCC, 0x00, 0x00, longLabel);

      // Extract label from payload
      const labelEnd = payload.indexOf(0x00, 12);
      const extractedLabel = payload.slice(12, labelEnd).toString('utf8');
      expect(extractedLabel.length).toBe(256);
    });

    test('handles empty label', () => {
      const payload = SeratoMarkersParser.createCuePayload(0, 1000, 0xCC, 0x00, 0x00, '');
      expect(payload.length).toBe(13); // 12 fixed + 1 null terminator
    });
  });

  describe('encode()', () => {
    test('encodes empty entries to header only', () => {
      const buffer = SeratoMarkersParser.encode([]);
      expect(buffer.length).toBe(2);
      expect(buffer[0]).toBe(0x01);
      expect(buffer[1]).toBe(0x01);
    });

    test('encodes single CUE entry', () => {
      const payload = createMinimalCuePayload(0, 1000, 0xCC, 0x00, 0x00);
      const entries = [{ type: 'CUE', payload }];

      const buffer = SeratoMarkersParser.encode(entries);
      expect(buffer.length).toBeGreaterThan(2);

      // Verify header
      expect(buffer[0]).toBe(0x01);
      expect(buffer[1]).toBe(0x01);

      // Verify entry marker
      expect(buffer[2]).toBe(0x00);
    });
  });

  describe('round-trip', () => {
    test('parse -> encode -> parse produces same data', () => {
      const originalCues = [
        { index: 0, positionMs: 0, r: 0xCC, g: 0x00, b: 0x00, label: 'Intro' },
        { index: 1, positionMs: 30000, r: 0x00, g: 0xCC, b: 0x00, label: 'Verse' },
        { index: 2, positionMs: 60000, r: 0x00, g: 0x00, b: 0xCC, label: '' },
      ];

      // Create entries
      const entries = originalCues.map(cue => ({
        type: ENTRY_TYPES.CUE,
        payload: SeratoMarkersParser.createCuePayload(
          cue.index, cue.positionMs, cue.r, cue.g, cue.b, cue.label
        ),
      }));

      // Encode to buffer
      const buffer = SeratoMarkersParser.encode(entries);

      // Parse buffer back
      const parsedEntries = SeratoMarkersParser.parse(buffer);
      const parsedCues = SeratoMarkersParser.extractCuePoints(parsedEntries);

      // Verify
      expect(parsedCues.length).toBe(originalCues.length);
      for (let i = 0; i < originalCues.length; i++) {
        expect(parsedCues[i].index).toBe(originalCues[i].index);
        expect(parsedCues[i].positionMs).toBe(originalCues[i].positionMs);
        expect(parsedCues[i].r).toBe(originalCues[i].r);
        expect(parsedCues[i].g).toBe(originalCues[i].g);
        expect(parsedCues[i].b).toBe(originalCues[i].b);
        expect(parsedCues[i].label).toBe(originalCues[i].label);
      }
    });

    test('preserves non-CUE entries through merge', () => {
      // Simulate existing entries with COLOR and BPMLOCK
      const colorEntry = { type: 'COLOR', payload: Buffer.from([0x01, 0x02, 0x03, 0x04]) };
      const bpmLockEntry = { type: 'BPMLOCK', payload: Buffer.from([0x01]) };
      const existingEntries = [colorEntry, bpmLockEntry];

      // Merge with new cue points
      const newCues = [
        { index: 0, positionMs: 1000, colorHex: '#CC0000', label: 'Test' },
      ];

      const merged = SeratoMarkersParser.mergeEntries(existingEntries, newCues);

      // Should have COLOR, BPMLOCK, and CUE
      expect(merged.length).toBe(3);
      expect(merged.find(e => e.type === 'COLOR')).toBeTruthy();
      expect(merged.find(e => e.type === 'BPMLOCK')).toBeTruthy();
      expect(merged.find(e => e.type === 'CUE')).toBeTruthy();
    });
  });

  describe('validate()', () => {
    test('rejects buffer too small', () => {
      const result = SeratoMarkersParser.validate(Buffer.from([0x01]));
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/too small/i);
    });

    test('rejects invalid header', () => {
      const result = SeratoMarkersParser.validate(Buffer.from([0x00, 0x00]));
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/invalid header/i);
    });

    test('accepts valid header only', () => {
      const result = SeratoMarkersParser.validate(Buffer.from([0x01, 0x01]));
      expect(result.valid).toBe(true);
    });

    test('accepts valid buffer with entries', () => {
      const buffer = Buffer.concat([
        Buffer.from([0x01, 0x01]),
        Buffer.from([0x00]),
        Buffer.from('CUE\x00', 'utf8'),
        Buffer.from([0x00, 0x00, 0x00, 0x0d]),
        createMinimalCuePayload(0, 1000, 0xCC, 0x00, 0x00),
      ]);

      const result = SeratoMarkersParser.validate(buffer);
      expect(result.valid).toBe(true);
    });
  });

  describe('removeCuePoint()', () => {
    test('removes cue by index', () => {
      const entries = [
        { type: ENTRY_TYPES.CUE, payload: createMinimalCuePayload(0, 0, 0xCC, 0x00, 0x00) },
        { type: ENTRY_TYPES.CUE, payload: createMinimalCuePayload(1, 1000, 0x00, 0xCC, 0x00) },
        { type: ENTRY_TYPES.CUE, payload: createMinimalCuePayload(2, 2000, 0x00, 0x00, 0xCC) },
      ];

      const result = SeratoMarkersParser.removeCuePoint(entries, 1);
      const cues = SeratoMarkersParser.extractCuePoints(result);

      expect(cues.length).toBe(2);
      expect(cues.find(c => c.index === 1)).toBeUndefined();
    });

    test('preserves non-CUE entries', () => {
      const entries = [
        { type: 'COLOR', payload: Buffer.from([0x01, 0x02]) },
        { type: ENTRY_TYPES.CUE, payload: createMinimalCuePayload(0, 0, 0xCC, 0x00, 0x00) },
      ];

      const result = SeratoMarkersParser.removeCuePoint(entries, 0);

      expect(result.length).toBe(1);
      expect(result[0].type).toBe('COLOR');
    });
  });

  describe('utility functions', () => {
    test('rgbToHex converts correctly', () => {
      expect(rgbToHex(0xCC, 0x00, 0x00)).toBe('#CC0000');
      expect(rgbToHex(0, 255, 128)).toBe('#00FF80');
      expect(rgbToHex(0, 0, 0)).toBe('#000000');
    });

    test('hexToRgb converts correctly', () => {
      expect(hexToRgb('#CC0000')).toEqual({ r: 0xCC, g: 0x00, b: 0x00 });
      expect(hexToRgb('00FF80')).toEqual({ r: 0x00, g: 0xFF, b: 0x80 });
      expect(hexToRgb('#000000')).toEqual({ r: 0, g: 0, b: 0 });
    });

    test('hexToRgb returns null for invalid input', () => {
      expect(hexToRgb('invalid')).toBeNull();
      expect(hexToRgb('#GG0000')).toBeNull();
    });
  });
});

// Helper function to create minimal CUE payload (13 bytes)
function createMinimalCuePayload(index, positionMs, r, g, b) {
  const payload = Buffer.alloc(13);
  payload[0] = 0x00; // Always 0
  payload[1] = index;
  payload.writeUInt32BE(positionMs, 2);
  payload[6] = 0x00; // Padding
  payload[7] = r;
  payload[8] = g;
  payload[9] = b;
  payload[10] = 0x00; // Padding
  payload[11] = 0x00; // Padding
  payload[12] = 0x00; // Null terminator (empty label)
  return payload;
}

// Helper function to create CUE payload with label
function createCuePayloadWithLabel(index, positionMs, r, g, b, label) {
  const labelBytes = Buffer.from(label, 'utf8');
  const payload = Buffer.alloc(13 + labelBytes.length);
  payload[0] = 0x00;
  payload[1] = index;
  payload.writeUInt32BE(positionMs, 2);
  payload[6] = 0x00;
  payload[7] = r;
  payload[8] = g;
  payload[9] = b;
  payload[10] = 0x00;
  payload[11] = 0x00;
  labelBytes.copy(payload, 12);
  payload[12 + labelBytes.length] = 0x00; // Null terminator
  return payload;
}
