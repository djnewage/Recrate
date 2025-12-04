# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Recrate** is a full-stack DJ application that enables DJs to stream their Serato music library to mobile devices and manage crates remotely. This repository contains comprehensive specifications and implementation guides for building the system.

**Current State:** This is a specification repository containing detailed documentation, build guides, and implementation checklists. No actual implementation exists yet.

## Project Architecture

### Two-Tier Architecture

1. **Backend Service (Node.js)**

   - Reads and parses Serato DJ database files (binary format)
   - Provides REST API for library access
   - Streams audio files with HTTP range request support
   - Manages crate creation/modification (writes back to Serato files)
   - Real-time updates via WebSocket (Socket.IO)
   - mDNS service discovery for auto-connect

2. **Mobile App (React Native)**
   - Prototype UI provided in `DJLibraryApp.jsx`
   - Browses library with search and sorting
   - Manages crates (create, add/remove tracks, bulk operations)
   - Streams and previews tracks
   - Modern purple/pink gradient theme

### Backend Module Structure

The backend is organized into distinct layers:

- **`src/utils/`** - Foundation utilities (config, logger, LRU cache, mDNS discovery)
- **`src/serato/`** - Serato-specific modules (parser, writer, file watcher)
- **`src/audio/`** - Audio handling (metadata extraction, streaming with range support)
- **`src/api/`** - API layer (Express server, route handlers for library/crates/streaming/search)
- **`src/index.js`** - Main entry point that orchestrates all components

### Key Technical Challenges

1. **Serato Binary Format Parsing**

   - Serato database files use a proprietary binary format
   - Crate files (.crate) contain track references and metadata
   - Fallback strategy: Directory scanning + music-metadata extraction if binary parsing is complex
   - Important: Atomic writes and backups required when modifying Serato files

2. **Audio Streaming**

   - Must support HTTP range requests for seeking/scrubbing
   - Handle multiple audio formats (MP3, FLAC, WAV, AAC)
   - Stream in chunks (recommended 256KB)
   - Return HTTP 206 Partial Content responses

3. **Cache Strategy**
   - LRU cache for parsed library data
   - TTL-based invalidation
   - File watcher triggers cache invalidation on Serato file changes

## Implementation Approach

### Build Order (Critical)

Follow this exact sequence to ensure dependencies are met:

1. **Phase 1: Foundation**

   - `src/utils/config.js` - Configuration management
   - `src/utils/logger.js` - Colored logging
   - `src/utils/cache.js` - LRU cache implementation

2. **Phase 2: Core Services**

   - `src/serato/parser.js` - Read Serato files (CRITICAL - use directory scanning fallback if needed)
   - `src/audio/metadata.js` - Extract metadata with music-metadata
   - `src/audio/streamer.js` - Stream audio with range support (CRITICAL)

3. **Phase 3: API Layer**

   - `src/api/routes/library.js` - Library endpoints
   - `src/api/routes/crates.js` - Crate management endpoints
   - `src/api/routes/streaming.js` - Audio streaming endpoints
   - `src/api/routes/search.js` - Search endpoint
   - `src/api/server.js` - Express server setup (CRITICAL)

4. **Phase 4: Integration**

   - `src/index.js` - Main entry point (CRITICAL)

5. **Phase 5: Optional Features** (can be deferred for MVP)
   - `src/serato/writer.js` - Write to Serato crate files
   - `src/serato/watcher.js` - File system watching
   - `src/utils/discovery.js` - mDNS service discovery

### Simplified Fallback Strategy

If binary Serato parsing proves too complex:

- Use directory scanning to find audio files
- Extract metadata directly with `music-metadata` npm package
- Read .crate files as text (they contain file path references)
- Build up full binary parsing later

### Testing Strategy

```bash
# Start server
npm start

# Test core endpoints
curl http://localhost:3000/health
curl http://localhost:3000/api/library
curl http://localhost:3000/api/crates
curl http://localhost:3000/api/stream/<trackId> --output test.mp3
```

Test incrementally:

1. Unit test each module as built
2. Integration test API endpoints with curl
3. Manual test full workflow with mobile app prototype
4. Real data test with actual Serato library

## Key Documentation Files

**Read these in order when implementing:**

1. **`PROJECT_SUMMARY.md`** - Start here! Quick overview of the project
2. **`BUILD_GUIDE.md`** - Step-by-step implementation guide with build order
3. **`CLAUDE_CODE_CHECKLIST.md`** - Master checklist of all 19 files to implement
4. **`README.md`** - Overall project package description and feature list

**Note:** The guides reference additional detailed specs in a `docs/` folder (API.md, IMPLEMENTATION\_\*.md) which may not exist yet in this repository but are described in the documentation.

## Common Gotchas

1. **Serato Binary Parsing**: The binary format is complex. Start with simpler directory scanning approach first.

2. **File Permissions**: Audio files may have permission restrictions. Always wrap file operations in try-catch.

3. **Atomic Writes**: When writing to Serato crate files, always use atomic writes (temp file + rename) and create backups.

4. **Range Requests**: Streaming MUST support HTTP range requests or seeking won't work on mobile.

5. **CORS**: Ensure CORS is properly configured for mobile app access.

6. **Graceful Shutdown**: Implement proper signal handlers (SIGINT, SIGTERM) for clean shutdowns.

## Tech Stack

**Backend:**

- Node.js 18+
- Express (REST API)
- Socket.IO (Real-time updates)
- music-metadata (Audio metadata extraction)
- chokidar (File watching)
- bonjour (mDNS discovery)
- morgan (HTTP logging)

**Mobile:**

- React Native
- React Navigation
- Zustand/Redux (State management)
- react-native-track-player (Audio playback)
- Lucide icons

## MVP vs Full Feature Set

**Essential for MVP (get working quickly):**

- Parser (with directory scanning fallback)
- Audio streamer (with range support)
- Library and crates routes (read-only)
- Search functionality
- Basic Express server

**Optional for MVP (add later):**

- Full binary Serato parsing
- Crate writer (write operations)
- File watcher (auto-refresh)
- mDNS discovery (can use manual IP)
- WebSocket real-time updates

## Development Workflow

1. No git repository initialized - this is a fresh specification project
2. No package.json exists yet - will need to be created
3. No source code exists - this is implementation-ready documentation
4. Focus on MVP features first, add polish later
5. Test with real Serato library data for validation

## Implementation Time Estimates

- **MVP (read-only):** 4-6 hours of coding
- **Full implementation:** 8-12 hours of coding
- **Total specification lines:** ~3,500 lines across 13 documents
- **Modules to implement:** 19 files
- **API endpoints:** 12 endpoints

## Known Issues & TODOs

### Security: Remove Hardcoded ACRCloud API Credentials
**Priority: HIGH**
**File:** `packages/mobile/src/services/ACRCloudService.js`

The ACRCloud API credentials (access key, access secret, host) are currently hardcoded in the service file. These need to be:
1. Removed from the codebase
2. Moved to environment variables or a secure configuration
3. Optionally proxied through the backend server to hide credentials from the mobile app entirely

### Bug: Recording Error After 4+ Sequential Identifications
**Priority: MEDIUM**
**File:** `packages/mobile/src/services/AudioRecordingService.js`

When using the track identification feature multiple times in a row (4+ sequential recordings), a "recorder not prepared" error occurs. This is likely due to:
- iOS audio session not fully releasing between recordings
- Race condition in cleanup/setup cycle
- expo-av recording state not being properly reset

Potential fixes to investigate:
- Add longer delays between recordings
- Implement a recording queue/cooldown
- Check expo-av documentation for proper cleanup patterns
- Consider using a different recording approach for rapid sequential use
