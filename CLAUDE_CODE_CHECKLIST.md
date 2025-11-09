# Recrate Service - Claude Code Implementation Checklist

This is the master checklist for implementing all files. Check off each file as you complete it.

## 📦 Phase 1: Utilities & Foundation

### `src/utils/config.js`

- [ ] Create config module
- [ ] Export config object with serato, server, cache settings
- [ ] Auto-detect Serato path based on OS
- [ ] Support environment variables
- [ ] **Reference:** `docs/IMPLEMENTATION_UTILS.md`

### `src/utils/logger.js`

- [ ] Create Logger class
- [ ] Implement info, error, warn, debug, success methods
- [ ] Add colored console output
- [ ] Add timestamps
- [ ] Export singleton instance
- [ ] **Reference:** `docs/IMPLEMENTATION_UTILS.md`

### `src/utils/cache.js`

- [ ] Create LRUCache class
- [ ] Implement get, set, delete, clear methods
- [ ] Add TTL support
- [ ] Add size limit with LRU eviction
- [ ] Export LRUCache class
- [ ] **Reference:** `docs/IMPLEMENTATION_UTILS.md`

---

## 🎵 Phase 2: Serato Parsing (Core)

### `src/serato/parser.js`

- [ ] Create SeratoParser class
- [ ] Implement constructor(seratoPath)
- [ ] Implement parseLibrary() - Returns all tracks
- [ ] Implement getAllCrates() - Returns crate metadata
- [ ] Implement parseCrate(crateId) - Returns crate with tracks
- [ ] Implement getTrackById(trackId) - Returns single track
- [ ] Implement searchTracks(query, field) - Returns matching tracks
- [ ] Implement generateTrackId(filePath) - Hash to consistent ID
- [ ] Implement slugify(name) - Convert crate name to slug
- [ ] Implement invalidateCache(item) - Clear cached data
- [ ] Add binary parsing helpers (readString, readInt32, readFloat)
- [ ] Define error classes (SeratoNotFoundError, ParseError, CrateNotFoundError)
- [ ] Export all classes and functions
- [ ] **Reference:** `docs/IMPLEMENTATION_PARSER.md`
- [ ] **Note:** Start with directory scanning fallback if binary parsing is complex

---

## 🎧 Phase 3: Audio Handling

### `src/audio/metadata.js`

- [ ] Create MetadataExtractor class
- [ ] Implement extractMetadata(filePath) - Extract all metadata
- [ ] Implement getArtwork(filePath) - Extract artwork buffer
- [ ] Implement scanDirectory(dirPath, onProgress) - Scan for audio files
- [ ] Implement isAudioFile(filePath) - Check if supported format
- [ ] Use music-metadata library
- [ ] Export MetadataExtractor class
- [ ] **Reference:** `docs/IMPLEMENTATION_AUDIO.md`

### `src/audio/streamer.js`

- [ ] Create AudioStreamer class
- [ ] Implement constructor(parser)
- [ ] Implement streamTrack(trackId, req, res) - Stream with range support
- [ ] Implement getMimeType(filePath) - Detect content type
- [ ] Implement parseRange(rangeHeader, fileSize) - Parse HTTP range
- [ ] Implement getArtwork(trackId, res) - Stream artwork
- [ ] Implement streamFile(filePath, start, end, res) - Low-level streaming
- [ ] Support HTTP 206 Partial Content
- [ ] Export AudioStreamer class
- [ ] **Reference:** `docs/IMPLEMENTATION_AUDIO.md`

---

## 🌐 Phase 4: API Routes

### `src/api/routes/library.js`

- [ ] Export Express router factory function
- [ ] Implement GET /api/library
  - [ ] Query params: search, sortBy, limit, offset
  - [ ] Return paginated track list
- [ ] Implement GET /api/library/:trackId
  - [ ] Return single track details
  - [ ] Return 404 if not found
- [ ] Add error handling
- [ ] **Reference:** `docs/IMPLEMENTATION_API.md`

### `src/api/routes/crates.js`

- [ ] Export Express router factory function
- [ ] Implement GET /api/crates - List all crates
- [ ] Implement GET /api/crates/:crateId - Get crate with tracks
- [ ] Implement POST /api/crates - Create new crate
  - [ ] Body: { name, color? }
  - [ ] Validate input
- [ ] Implement POST /api/crates/:crateId/tracks - Add tracks to crate
  - [ ] Body: { trackIds: string[] }
  - [ ] Validate trackIds
- [ ] Implement DELETE /api/crates/:crateId/tracks/:trackId - Remove track
- [ ] Implement DELETE /api/crates/:crateId - Delete crate
- [ ] Add error handling
- [ ] **Reference:** `docs/IMPLEMENTATION_API.md`

### `src/api/routes/streaming.js`

- [ ] Export Express router factory function
- [ ] Implement GET /api/stream/:trackId - Stream audio
  - [ ] Delegate to AudioStreamer
  - [ ] Support range requests
- [ ] Implement GET /api/artwork/:trackId - Get artwork
  - [ ] Delegate to AudioStreamer
- [ ] Add error handling
- [ ] **Reference:** `docs/IMPLEMENTATION_API.md`

### `src/api/routes/search.js`

- [ ] Export Express router factory function
- [ ] Implement GET /api/search
  - [ ] Query params: q (required), field, limit
  - [ ] Delegate to parser.searchTracks()
- [ ] Add validation for required params
- [ ] Add error handling
- [ ] **Reference:** `docs/IMPLEMENTATION_API.md`

---

## 🖥️ Phase 5: API Server

### `src/api/server.js`

- [ ] Create APIServer class
- [ ] Implement constructor(config, parser, writer, streamer)
- [ ] Implement initialize()
  - [ ] Set up Express middleware (CORS, JSON, Morgan)
  - [ ] Mount all route handlers
  - [ ] Set up error handling
  - [ ] Set up 404 handler
- [ ] Implement start() - Start HTTP server and WebSocket
- [ ] Implement stop() - Graceful shutdown
- [ ] Implement healthCheck() - GET /health endpoint
- [ ] Implement errorHandler() - Global error middleware
- [ ] Implement setupWebSocket() - Socket.IO setup
- [ ] Implement broadcastUpdate(event, data) - Broadcast to clients
- [ ] Export APIServer class
- [ ] **Reference:** `docs/IMPLEMENTATION_API.md`

---

## ✍️ Phase 6: Serato Writer (Can be deferred for MVP)

### `src/serato/writer.js`

- [ ] Create SeratoWriter class
- [ ] Implement constructor(seratoPath, parser)
- [ ] Implement createCrate(name, color)
- [ ] Implement addTracksToCrate(crateId, trackIds)
- [ ] Implement removeTrackFromCrate(crateId, trackId)
- [ ] Implement reorderCrate(crateId, orderedTrackIds)
- [ ] Implement deleteCrate(crateId)
- [ ] Implement updateCrateMetadata(crateId, updates)
- [ ] Implement buildCrateBinary(crate) - Build binary structure
- [ ] Implement writeAtomic(filePath, data) - Atomic file writes
- [ ] Implement setReadOnly(readOnly) - Toggle read-only mode
- [ ] Implement checkReadOnly() - Throw if read-only
- [ ] Implement backupCrate(crateId) - Create backup
- [ ] Add binary writing helpers (writeString, writeInt32, concatBuffers)
- [ ] Add validation functions (validateCrateName, validateColor)
- [ ] Define error classes (ReadOnlyError, CrateExistsError, TrackNotFoundError)
- [ ] Export all classes and functions
- [ ] **Reference:** `docs/IMPLEMENTATION_WRITER.md`

---

## 👀 Phase 7: File Watching (Can be deferred for MVP)

### `src/serato/watcher.js`

- [ ] Create FileWatcher class extending EventEmitter
- [ ] Implement constructor(seratoPath)
- [ ] Implement start() - Start watching with chokidar
- [ ] Implement stop() - Stop watching
- [ ] Emit 'change' events for add, change, unlink
- [ ] Add debouncing for rapid changes
- [ ] Export FileWatcher class
- [ ] **Reference:** `docs/IMPLEMENTATION_UTILS.md`

---

## 🔍 Phase 8: Service Discovery (Can be deferred for MVP)

### `src/utils/discovery.js`

- [ ] Create ServiceDiscovery class
- [ ] Implement constructor(port)
- [ ] Implement start() - Publish mDNS service with Bonjour
- [ ] Implement stop() - Unpublish service
- [ ] Export ServiceDiscovery class
- [ ] **Reference:** `docs/IMPLEMENTATION_UTILS.md`

---

## 🚀 Phase 9: Main Entry Point

### `src/index.js`

- [ ] Create CrateLinkService class
- [ ] Implement constructor()
- [ ] Implement initialize()
  - [ ] Validate Serato path
  - [ ] Initialize parser
  - [ ] Initialize writer
  - [ ] Initialize streamer
  - [ ] Initialize API server
  - [ ] Initialize file watcher
  - [ ] Initialize service discovery
- [ ] Implement start() - Start all services
- [ ] Implement stop() - Graceful shutdown
- [ ] Implement handleFileChange(event) - Handle file system events
- [ ] Create bootstrap() function
  - [ ] Create service instance
  - [ ] Set up signal handlers (SIGINT, SIGTERM)
  - [ ] Set up error handlers (uncaughtException, unhandledRejection)
  - [ ] Initialize and start service
- [ ] Call bootstrap() if main module
- [ ] Export CrateLinkService class
- [ ] **Reference:** `docs/IMPLEMENTATION_MAIN.md`

---

## ✅ Phase 10: Testing & Validation

### Manual Testing

- [ ] Run `npm install` successfully
- [ ] Run `npm start` without errors
- [ ] Test GET /health endpoint
- [ ] Test GET /api/library endpoint
- [ ] Test GET /api/crates endpoint
- [ ] Test GET /api/stream/:trackId endpoint
- [ ] Test POST /api/crates endpoint
- [ ] Test POST /api/crates/:id/tracks endpoint
- [ ] Test search endpoint
- [ ] Test with real Serato library
- [ ] Test with mobile app connection

### Error Scenarios

- [ ] Handle missing Serato directory
- [ ] Handle invalid track IDs
- [ ] Handle invalid crate IDs
- [ ] Handle missing audio files
- [ ] Handle network errors
- [ ] Handle concurrent access

---

## 📊 Progress Tracking

**Total Files:** 15 core files + 4 route files = 19 files

**Essential for MVP (Priority 1):**

- [x] config.js
- [x] logger.js
- [x] cache.js
- [ ] parser.js (CRITICAL)
- [ ] metadata.js
- [ ] streamer.js (CRITICAL)
- [ ] library.js route
- [ ] crates.js route
- [ ] streaming.js route
- [ ] search.js route
- [ ] server.js (CRITICAL)
- [ ] index.js (CRITICAL)

**Optional for MVP (Priority 2):**

- [ ] writer.js
- [ ] watcher.js
- [ ] discovery.js

---

## 🎯 Quick Wins for Demo

To get a working demo quickly:

1. **Implement these first:**

   - config.js, logger.js, cache.js
   - parser.js (with directory scanning fallback)
   - streamer.js (basic streaming)
   - library.js and crates.js routes
   - server.js
   - index.js

2. **Test with:**

   - Point to your actual music folder
   - Test library endpoint
   - Test streaming endpoint
   - Connect React Native prototype

3. **Add later:**
   - Full binary parsing
   - Crate writing
   - File watching
   - Service discovery

---

## 📝 Implementation Notes

- Start with read-only mode (skip writer initially)
- Use directory scanning + metadata extraction for quick start
- Test each module independently before integration
- Refer to detailed specs in `docs/IMPLEMENTATION_*.md` files
- Use `BUILD_GUIDE.md` for overall guidance
- Check API spec in `docs/API.md` for endpoint details

---

## 🆘 When Stuck

1. Check the detailed implementation docs in `docs/`
2. Use simpler approaches (directory scanning vs binary parsing)
3. Build incrementally and test frequently
4. Focus on MVP features first
5. Skip optional features until core works

---

**Good luck building! Cross off items as you complete them.**
