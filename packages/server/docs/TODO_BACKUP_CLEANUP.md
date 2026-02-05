# Task: Remove/Optimize Backup Strategy for DJ File Writers

## Problem

Both Serato and VirtualDJ writers create timestamped backup files on every cue point write operation. These backups accumulate indefinitely and can fill up user disk space over time.

## Current Behavior

### VirtualDJWriter (`packages/server/src/parsers/VirtualDJWriter.js`)
- `backupDatabase()` - Creates `database.xml.backup-YYYY-MM-DDTHH-MM-SS` on every cue point write
- `backupPlaylist()` - Creates `.vdjfolder.backup-*` on playlist modifications
- No cleanup mechanism exists

### SeratoFileWriter (`packages/server/src/audio/serato-file-writer.js`)
- `createBackup()` - Creates `<audiofile>.serato-backup-*` on every cue point write
- `cleanupBackups()` exists but is never called
- `backupRetentionDays = 7` configured but unused

## Recommended Changes

### Option A: Remove Backups for Cue Points (Recommended)

Rationale:
- Atomic writes (temp file + rename) already protect against corruption
- Cue points are easily recreatable (2 seconds of work)
- VDJ database.xml is recoverable (VirtualDJ can rebuild by rescanning)
- Serato uses battle-tested ID3 libraries - corruption is extremely unlikely

#### 1. VirtualDJWriter.js
- Remove `await this.backupDatabase()` call from `setCuePoint()` (line ~549)
- Remove `await this.backupDatabase()` call from `deleteCuePoint()` (line ~672)
- Keep `backupPlaylist()` for playlist operations (more destructive)

#### 2. serato-file-writer.js
- Remove backup creation in `writeCuePoints()` (line ~471)
- Remove backup creation in `deleteCuePoint()` (line ~575)
- Remove `backupRetentionDays`, `backupSuffix` config
- Remove `cleanupBackups()`, `listBackups()`, `restoreFromBackup()` methods
- Keep `rollback()` for atomic write failure recovery (uses temp file, not backup)

#### 3. Update API responses
- Remove `backup` field from cue point API responses in `routes/cuepoints.js`

### Option B: Make Backups Configurable

If backups are still desired for some users:

1. Add to config:
   ```javascript
   backups: {
     enabled: false,  // default off
     maxCount: 5,     // keep only last N backups per file
   }
   ```

2. Both writers check config before creating backups

3. Add cleanup that runs after successful writes:
   ```javascript
   async cleanupBackups(filePath, maxToKeep = 5) {
     const dir = path.dirname(filePath);
     const baseName = path.basename(filePath);
     const files = await fs.readdir(dir);
     const backups = files
       .filter(f => f.startsWith(baseName + '.backup-'))
       .sort()
       .reverse(); // newest first

     // Delete all but the most recent N
     for (const backup of backups.slice(maxToKeep)) {
       await fs.unlink(path.join(dir, backup));
     }
   }
   ```

## Files to Modify

| File | Changes |
|------|---------|
| `packages/server/src/parsers/VirtualDJWriter.js` | Remove backup calls from cue point methods |
| `packages/server/src/audio/serato-file-writer.js` | Remove backup creation and unused cleanup methods |
| `packages/server/src/api/routes/cuepoints.js` | Remove `backup` field from responses |
| `packages/server/src/utils/config.js` | (Option B only) Add backup config |

## Verification

1. Set a cue point via API:
   ```bash
   curl -X POST http://localhost:3000/api/cuepoints/{trackId} \
     -H "Content-Type: application/json" \
     -d '{"bankNumber": 1, "position": 5.0}'
   ```

2. Verify no `.backup-*` files created:
   ```bash
   # VDJ
   ls ~/Library/Application\ Support/VirtualDJ/*.backup*

   # Serato (check music folder)
   find ~/Music -name "*.serato-backup-*"
   ```

3. Verify cue point still written correctly:
   - Open track in VDJ/Serato
   - Confirm cue appears at correct position

4. Verify atomic write still works:
   - Add debug pause mid-write
   - Kill server during write
   - Confirm original file is intact

## Cleanup Existing Backups

One-time cleanup script for existing backups:

```bash
# VDJ database backups
rm ~/Library/Application\ Support/VirtualDJ/database.xml.backup-*

# VDJ playlist backups
find ~/Library/Application\ Support/VirtualDJ/MyLists -name "*.backup-*" -delete

# Serato audio file backups
find ~/Music -name "*.serato-backup-*" -delete
```

**Warning:** Run these only after verifying your DJ software works correctly.
