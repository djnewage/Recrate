# Serato Cue Points: Implementation Guide

This document explains how Recrate reads and writes cue points to be compatible with Serato DJ. This was a complex reverse-engineering effort that required understanding Serato's undocumented binary formats.

---

## Executive Summary

Serato stores cue points in **two different formats** within audio file ID3 tags:

| Format | Frame Description | Cues Supported | Encoding |
|--------|-------------------|----------------|----------|
| **v1** | `Serato Markers_` | 1-5 (index 0-4) | Raw binary |
| **v2** | `Serato Markers2` | 1-8 (index 0-7) | Base64 |

### The Critical Discovery

**Both formats MUST be written for full Serato compatibility.**

- If you only write v2: Serato shows **NO cue points** (even if v2 is perfectly valid)
- If you only write v1: Serato shows only cues 1-5
- If you write both: Serato shows all 8 cue points correctly

This behavior is undocumented and was discovered through trial and error.

---

## How Serato DJ Reads Cue Points

Through extensive testing, we discovered Serato's reading behavior:

| Cue Points | Read From | Notes |
|------------|-----------|-------|
| Cues 1-5 (index 0-4) | **v1 format ONLY** | v2 data is ignored for these |
| Cues 6-8 (index 5-7) | v2 format | But ONLY if v1 is also present |

This explains why apps that only write v2 format don't work with Serato - the v1 format is not optional, it's **required** as a prerequisite for Serato to read anything.

---

## The Two Serato Marker Formats

### Format 1: Serato Markers_ (v1)

**Location in file:**
- ID3v2.4 GEOB frame
- Description: `Serato Markers_`
- MIME type: `application/octet-stream`

**Characteristics:**
- Fixed size: **318 bytes**
- Raw binary encoding (NOT base64)
- Supports 5 cue slots + 9 loop slots
- Uses "serato32" encoding for positions and colors

**Structure:**
```
[Header: 6 bytes]
  02 05              - Version bytes
  XX XX XX XX        - Entry count (always 14, big-endian)

[Entries: 14 × 22 bytes = 308 bytes]
  Entry 0-4:  Cue points (index 0-4)
  Entry 5-13: Loop points (index 0-8)

[Footer: 4 bytes]
  XX XX XX XX        - Track color (serato32 encoded)
```

### Format 2: Serato Markers2 (v2)

**Location in file:**
- ID3v2.4 GEOB frame
- Description: `Serato Markers2`
- MIME type: `application/octet-stream`

**Characteristics:**
- Variable size
- Base64 encoded binary (with `01 01` prefix)
- Supports 8 cue points, loops, colors, BPM lock, and more
- Each entry is self-describing with type strings

**Structure:**
```
[Raw prefix: 2 bytes]
  01 01              - Version bytes (before base64)

[Base64 encoded content:]
  [Header: 2 bytes]
    01 01            - Version bytes (inside base64)

  [Entries: variable]
    00               - Entry marker
    "CUE\0"          - Type string (null-terminated)
    XX XX XX XX      - Payload length (4 bytes, big-endian)
    [payload]        - Type-specific data
```

---

## Binary Format Details

### Serato32 Encoding (v1 format)

Serato uses a special encoding for 24-bit values (positions and colors) that ensures no byte has the high bit set. This is likely for compatibility with MIDI or other 7-bit protocols.

**Encoding a 24-bit value to 4 bytes:**
```javascript
function encodeSerato32(value) {
  return Buffer.from([
    (value >> 21) & 0x7F,  // Bits 21-27 (only 7 bits)
    (value >> 14) & 0x7F,  // Bits 14-20
    (value >> 7) & 0x7F,   // Bits 7-13
    value & 0x7F           // Bits 0-6
  ]);
}
```

**Decoding 4 bytes back to 24-bit value:**
```javascript
function decodeSerato32(buf) {
  return ((buf[0] & 0x7F) << 21) |
         ((buf[1] & 0x7F) << 14) |
         ((buf[2] & 0x7F) << 7) |
         (buf[3] & 0x7F);
}
```

### V1 Entry Format (22 bytes)

```
Offset  Size  Field              Description
------  ----  -----              -----------
0x00    1     startSet           0x00 = position is set, 0x7F = not set
0x01    4     startPosition      Serato32-encoded milliseconds
0x05    1     endSet             0x00 = end position set (for loops)
0x06    4     endPosition        Serato32-encoded milliseconds
0x0A    6     reserved           Always zeros
0x10    4     color              Serato32-encoded RGB (0xRRGGBB)
0x14    1     type               0x01 = Cue, 0x03 = Loop
0x15    1     locked             0x00 = unlocked, 0x01 = locked
```

**Example: Cue at 30 seconds, red color:**
```
00                    // startSet = true
00 1D 4C 00          // startPosition = 30000ms (serato32)
7F                    // endSet = false (cue, not loop)
7F 7F 7F 7F          // endPosition = not set
00 00 00 00 00 00    // reserved
01 48 00 00          // color = 0xCC0000 (red, serato32)
01                    // type = Cue
00                    // locked = false
```

### V2 CUE Entry Payload

```
Offset  Size  Field         Description
------  ----  -----         -----------
0x00    1     reserved      Always 0x00
0x01    1     index         Cue index 0-7 (maps to banks 1-8)
0x02    4     position      Milliseconds (big-endian, NOT serato32)
0x06    1     padding       Always 0x00
0x07    1     red           Red component 0-255
0x08    1     green         Green component 0-255
0x09    1     blue          Blue component 0-255
0x0A    2     padding       Always 0x00 0x00
0x0C    N+1   label         Null-terminated UTF-8 string
```

---

## Reading Flow

### 1. Parse ID3 Tags
```javascript
const mm = await import('music-metadata');
const metadata = await mm.parseFile(filePath, {
  skipCovers: true,
  includeNative: true,
});
const frames = metadata.native?.['ID3v2.4'] || metadata.native?.['ID3v2.3'];
```

### 2. Find GEOB Frames
```javascript
const geobFrames = frames.filter(f => f.id === 'GEOB');
const v2Frame = geobFrames.find(f => f.value?.description === 'Serato Markers2');
const v1Frame = geobFrames.find(f => f.value?.description === 'Serato Markers_');
```

### 3. Decode V2 Data
```javascript
// V2 format: "01 01" prefix + base64 content
// Search for 01 01 pattern (music-metadata bug workaround)
let offset = findPattern(data, [0x01, 0x01]);
let base64Data = data.slice(offset + 2);
let binary = Buffer.from(base64Data.toString('ascii'), 'base64');
let entries = SeratoMarkersParser.parse(binary);
```

### 4. Decode V1 Data (Fallback)
```javascript
// V1 format: raw binary starting with "02 05"
let offset = findPattern(data, [0x02, 0x05]);
let v1Data = data.slice(offset);
let entries = parseMarkersV1Data(v1Data);
```

---

## Writing Flow

### 1. Create Backup
```javascript
const backupPath = `${filePath}.serato-backup-${timestamp}`;
await fs.copyFile(filePath, backupPath);
```

### 2. Read Existing Markers
Preserve non-cue entries (COLOR, BPMLOCK, etc.) when updating.

### 3. Build V1 Frame (Raw Binary)
```javascript
const v1Binary = buildMarkersV1Data(cuePoints);  // 318 bytes
const v1Frame = buildRawGEOBFrame('Serato Markers_', v1Binary);
```

### 4. Build V2 Frame (Base64)
```javascript
const v2Binary = SeratoMarkersParser.encode(entries);
const v2Data = Buffer.concat([
  Buffer.from([0x01, 0x01]),           // Raw prefix
  Buffer.from(v2Binary.toString('base64'), 'ascii')
]);
const v2Frame = buildRawGEOBFrame('Serato Markers2', v2Data);
```

### 5. Construct ID3 Tag
```javascript
// Must be ID3v2.4 (Serato requirement)
const header = Buffer.alloc(10);
header[0] = 0x49; // 'I'
header[1] = 0x44; // 'D'
header[2] = 0x33; // '3'
header[3] = 0x04; // Version: ID3v2.4
header[4] = 0x00; // Revision
header[5] = 0x00; // Flags
// Size in syncsafe encoding...

const newTag = Buffer.concat([header, existingFrames, v1Frame, v2Frame]);
```

### 6. Write Atomically
```javascript
await fs.copyFile(filePath, tempPath);
await writeNewID3Tag(tempPath, newTag);
await fs.rename(tempPath, filePath);  // Atomic replace
```

### 7. Verify
Read back and confirm all cue points were written correctly.

---

## Implementation Files

| File | Purpose |
|------|---------|
| `src/audio/serato-file-writer.js` | Main writer class, handles backups, v1 encoding, file I/O |
| `src/audio/serato-markers.js` | V2 binary parser/encoder (`SeratoMarkersParser` class) |

### Key Functions

**serato-file-writer.js:**
- `SeratoFileWriter.writeCuePoints()` - Main entry point
- `buildMarkersV1Data()` - Creates 318-byte v1 binary
- `buildMarkersV1Entry()` - Creates single 22-byte entry
- `encodeSerato32()` / `decodeSerato32()` - Serato32 encoding
- `buildRawGEOBFrame()` - Creates GEOB frame with proper encoding
- `encodeMarkersForGEOB()` - Adds `01 01` prefix + base64

**serato-markers.js:**
- `SeratoMarkersParser.parse()` - Parses v2 binary
- `SeratoMarkersParser.encode()` - Creates v2 binary
- `SeratoMarkersParser.extractCuePoints()` - Gets cue points from entries
- `SeratoMarkersParser.mergeEntries()` - Merges new cues with existing

---

## Gotchas and Lessons Learned

### 1. music-metadata GEOB Parsing Bug
The `music-metadata` library sometimes includes part of the GEOB description in the data buffer. Always search for the version bytes (`01 01` or `02 05`) instead of assuming they're at offset 0.

### 2. ID3 Version Matters
Serato requires **ID3v2.4** tags. Writing ID3v2.3 will cause Serato to ignore the markers.

### 3. GEOB Encoding
GEOB frames must use **UTF-8 encoding** (byte 0x03). Using UTF-16 (as `node-id3` defaults to) breaks Serato compatibility.

### 4. node-id3 Tag Corruption
The `node-id3` library has different formats for reading vs writing certain tags (images, comments, etc.). Only preserve simple text tags when rewriting ID3.

### 5. Safe Text Tags
```javascript
const SAFE_TEXT_TAGS = [
  'title', 'artist', 'album', 'year', 'genre', 'composer',
  'trackNumber', 'partOfSet', 'bpm', 'initialKey', 'publisher',
  // ... (see serato-file-writer.js for full list)
];
```

### 6. Always Write Both Formats
Never skip v1 format. Even though v2 supports all 8 cues, Serato won't read anything without v1 present.

### 7. Syncsafe Integers
ID3v2.4 uses "syncsafe" integers where each byte only uses 7 bits:
```javascript
const syncsafe = [
  (size >> 21) & 0x7F,
  (size >> 14) & 0x7F,
  (size >> 7) & 0x7F,
  size & 0x7F
];
```

---

## Default Cue Colors

Serato's default color palette (used when no color is specified):

| Index | Color | RGB |
|-------|-------|-----|
| 0 | Red | `#CC0000` |
| 1 | Orange | `#CC4400` |
| 2 | Yellow | `#CC8800` |
| 3 | Green | `#00CC00` |
| 4 | Cyan | `#00CCCC` |
| 5 | Blue | `#0044CC` |
| 6 | Purple | `#CC00CC` |
| 7 | Pink | `#CC4488` |

---

## Testing

### Verify Cue Points in Serato
1. Write cues using Recrate
2. Open the track in Serato DJ
3. Verify all 8 cue points appear with correct positions
4. Verify colors match

### Debug Logging
Enable debug logging to see frame-by-frame details:
```
[SERATO WRITER] Writing ID3 GEOB frames (v1 + v2) with 8 cue points
[SERATO WRITER] V1 frame size: 358 bytes (5 cues for slots 0-4)
[SERATO WRITER] V2 frame size: 245 bytes
```

### Hex Dump Analysis
Use a hex editor to verify the raw ID3 tag structure:
- Search for `Serato Markers_` - v1 frame
- Search for `Serato Markers2` - v2 frame
- Verify both are present with correct data

---

## References

- Serato does not provide official documentation for these formats
- Format details were reverse-engineered from existing Serato-tagged files
- Community resources: [serato-tags](https://github.com/Holzhaus/serato-tags) (Python library with format documentation)
