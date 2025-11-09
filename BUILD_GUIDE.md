# Recrate Service - Build Guide for Claude Code

This guide provides step-by-step instructions for Claude Code to implement the entire Recrate backend service.

## 📋 Overview

You will build a Node.js service that:

1. Reads Serato DJ database files
2. Parses crates and track information
3. Provides REST API for mobile app
4. Streams audio files
5. Manages crate modifications
6. Provides mDNS discovery for auto-connect

## 🎯 Implementation Order

Build in this exact order to ensure dependencies are met:

### Phase 1: Foundation (Essential utilities and core parsing)

1. ✅ Utils: Config, Logger, Cache
2. ✅ Serato Parser (Read-only operations)
3. ✅ Audio Metadata Extractor

### Phase 2: Core Services (API and streaming)

4. ✅ Audio Streamer
5. ✅ Express API Routes
6. ✅ API Server Setup

### Phase 3: Write Operations (Crate management)

7. ✅ Serato Writer (Write operations)
8. ✅ File Watcher
9. ✅ Service Discovery

### Phase 4: Integration (Tie everything together)

10. ✅ Main Entry Point
11. ✅ Testing & Bug Fixes

---

## 📁 File Implementation Checklist

### Utilities (`src/utils/`)

#### `src/utils/config.js`

**Purpose:** Load and manage configuration
**Spec:** See `docs/IMPLEMENTATION_UTILS.md`
**Key Features:**

- Load from environment variables
- Auto-detect Serato path
- Export config object

#### `src/utils/logger.js`

**Purpose:** Colored console logging
**Spec:** See `docs/IMPLEMENTATION_UTILS.md`
**Key Features:**

- Info, error, warn, debug, success methods
- Colored output
- Timestamps

#### `src/utils/cache.js`

**Purpose:** LRU cache for parsed data
**Spec:** See `docs/IMPLEMENTATION_UTILS.md`
**Key Features:**

- Size limit
- TTL support
- LRU eviction

---

### Serato Parsing (`src/serato/`)

#### `src/serato/parser.js`

**Purpose:** Read and parse Serato database files
**Spec:** See `docs/IMPLEMENTATION_PARSER.md`
**Priority:** HIGH - This is the foundation
**Dependencies:** fs, path, crypto, utils/cache

**Key Methods to Implement:**

```javascript
-parseLibrary() - // Parse database V2 file
  getAllCrates() - // List all .crate files
  parseCrate(crateId) - // Parse specific crate
  getTrackById(trackId) - // Get single track
  searchTracks(query) - // Search library
  generateTrackId(path) - // Hash file path to ID
  slugify(name); // Convert name to slug
```

**Implementation Notes:**

- For MVP, you can use a simplified parser that reads file paths from Serato files
- The binary format is complex, so consider using `serato-js` npm package if available
- If parsing full binary is too complex initially, you can:
  1. Scan the music directory directly for audio files
  2. Use music-metadata to extract tag information
  3. Read .crate files as text (they contain file path references)
  4. This gives you a working prototype while you figure out the binary format

**Fallback Strategy:**

```javascript
// If binary parsing is difficult, use this approach:
async parseLibrary() {
  // 1. Scan music directory recursively
  // 2. Filter for audio files
  // 3. Extract metadata with music-metadata
  // 4. Generate track objects
  // 5. Cache results
}
```

#### `src/serato/writer.js`

**Purpose:** Write to Serato crate files
**Spec:** See `docs/IMPLEMENTATION_WRITER.md`
**Priority:** MEDIUM - Can be done after read operations work
**Dependencies:** parser, fs, path

**Key Methods to Implement:**

```javascript
-createCrate(name, color) -
  addTracksToCrate(crateId, trackIds) -
  removeTrackFromCrate(crateId, trackId) -
  deleteCrate(crateId) -
  buildCrateBinary(crate) -
  writeAtomic(path, data);
```

**Implementation Notes:**

- Start with read-only mode
- Use atomic writes (temp file + rename)
- Always backup before writing
- For MVP, even simple text-based crate files work if Serato can't read them yet

#### `src/serato/watcher.js`

**Purpose:** Watch for file changes
**Spec:** See `docs/IMPLEMENTATION_UTILS.md`
**Priority:** LOW - Can be added later
**Dependencies:** chokidar, events

---

### Audio Handling (`src/audio/`)

#### `src/audio/metadata.js`

**Purpose:** Extract metadata from audio files
**Spec:** See `docs/IMPLEMENTATION_AUDIO.md`
**Priority:** MEDIUM
**Dependencies:** music-metadata

**Key Methods:**

```javascript
-extractMetadata(filePath) -
  getArtwork(filePath) -
  scanDirectory(dirPath) -
  isAudioFile(filePath);
```

#### `src/audio/streamer.js`

**Purpose:** Stream audio files to mobile
**Spec:** See `docs/IMPLEMENTATION_AUDIO.md`
**Priority:** HIGH - Core feature
**Dependencies:** fs, path, parser

**Key Methods:**

```javascript
-streamTrack(trackId, req, res) -
  getMimeType(filePath) -
  parseRange(rangeHeader, fileSize) -
  getArtwork(trackId, res);
```

**Implementation Notes:**

- Must support HTTP range requests for seeking
- Handle different audio formats
- Stream in chunks (256KB recommended)

---

### API Layer (`src/api/`)

#### `src/api/routes/library.js`

**Purpose:** Library endpoints
**Spec:** See `docs/IMPLEMENTATION_API.md`
**Endpoints:**

- `GET /api/library` - List tracks
- `GET /api/library/:trackId` - Get track details

#### `src/api/routes/crates.js`

**Purpose:** Crate management endpoints
**Spec:** See `docs/IMPLEMENTATION_API.md`
**Endpoints:**

- `GET /api/crates` - List crates
- `GET /api/crates/:crateId` - Get crate details
- `POST /api/crates` - Create crate
- `POST /api/crates/:crateId/tracks` - Add tracks
- `DELETE /api/crates/:crateId/tracks/:trackId` - Remove track
- `DELETE /api/crates/:crateId` - Delete crate

#### `src/api/routes/streaming.js`

**Purpose:** Audio streaming endpoints
**Spec:** See `docs/IMPLEMENTATION_API.md`
**Endpoints:**

- `GET /api/stream/:trackId` - Stream audio
- `GET /api/artwork/:trackId` - Get artwork

#### `src/api/routes/search.js`

**Purpose:** Search endpoint
**Spec:** See `docs/IMPLEMENTATION_API.md`
**Endpoints:**

- `GET /api/search?q=query` - Search tracks

#### `src/api/server.js`

**Purpose:** Main Express server setup
**Spec:** See `docs/IMPLEMENTATION_API.md`
**Priority:** HIGH
**Features:**

- CORS enabled
- JSON parser
- Logging middleware
- Error handling
- WebSocket setup
- Route mounting

---

### Main Entry Point (`src/`)

#### `src/index.js`

**Purpose:** Bootstrap and orchestrate all components
**Spec:** See `docs/IMPLEMENTATION_MAIN.md`
**Priority:** LAST - Ties everything together

**Key Responsibilities:**

- Initialize all components
- Start services in order
- Handle graceful shutdown
- Set up signal handlers
- Coordinate file watching and cache invalidation

---

## 🔧 Implementation Tips

### 1. Start Simple

- Get basic file reading working first
- Don't worry about perfect binary parsing initially
- Use music-metadata to extract tags directly from audio files
- Build up complexity gradually

### 2. Testing Strategy

```bash
# Create a test Serato directory
mkdir -p ~/Music/_Serato_Test/Subcrates
# Add some MP3 files to test with
# Test parsing with real files
```

### 3. Debugging

- Use extensive logging
- Test each module independently
- Validate with real Serato data
- Check file permissions

### 4. Binary Parsing Fallback

If binary parsing is too complex:

```javascript
// Quick win: Read crate files as text
// Serato crates contain file paths in a readable format
// You can extract these even without full binary parsing
```

### 5. Error Handling

- Always wrap file operations in try-catch
- Return meaningful error messages
- Log errors but don't crash
- Graceful degradation

---

## 🧪 Testing Checklist

After implementation, test these scenarios:

### Parser Tests

- [ ] Can read Serato database
- [ ] Can list all crates
- [ ] Can parse individual crate
- [ ] Can find track by ID
- [ ] Search returns results

### Streaming Tests

- [ ] Can stream MP3 file
- [ ] Range requests work (seeking)
- [ ] Different formats work (FLAC, WAV)
- [ ] Artwork extraction works

### API Tests

- [ ] GET /api/library returns tracks
- [ ] GET /api/crates returns crates
- [ ] POST /api/crates creates new crate
- [ ] POST /api/crates/:id/tracks adds tracks
- [ ] Streaming endpoints work

### Integration Tests

- [ ] Service starts without errors
- [ ] mDNS discovery works
- [ ] Mobile app can connect
- [ ] File changes trigger cache invalidation
- [ ] Graceful shutdown works

---

## 🚀 Quick Start Commands

```bash
# Install dependencies
npm install

# Start in development mode
npm run dev

# Test with curl
curl http://localhost:3000/health
curl http://localhost:3000/api/library
curl http://localhost:3000/api/crates

# Stream a track (replace track-id)
curl http://localhost:3000/api/stream/track-id --output test.mp3
```

---

## 📝 Notes for Claude Code

### Priority Order

1. **Must Have (MVP):** Parser, Streamer, Library/Crate routes, Server
2. **Should Have:** Writer, Search, Artwork
3. **Nice to Have:** File watcher, Discovery, Cache optimization

### Simplification Options

- Skip complex binary parsing, use directory scanning + metadata extraction
- Skip crate writing initially (read-only mode)
- Skip file watching initially (manual refresh)
- Skip mDNS discovery (manual IP entry in mobile app)

### When Stuck

- Reference the detailed specs in `docs/IMPLEMENTATION_*.md`
- Use simpler approaches first
- Get something working, then optimize
- Test incrementally

---

## 🎯 Success Criteria

You'll know it's working when:

1. ✅ Server starts on port 3000
2. ✅ `/health` returns 200 OK
3. ✅ `/api/library` returns your music tracks
4. ✅ `/api/crates` returns your Serato crates
5. ✅ `/api/stream/:trackId` plays audio
6. ✅ Mobile app can connect and browse library

Good luck! Build in order, test frequently, and refer to the detailed specs in the `docs/` folder.
