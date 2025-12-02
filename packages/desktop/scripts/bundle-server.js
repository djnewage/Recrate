#!/usr/bin/env node

/**
 * Bundle server for distribution
 *
 * This script creates a standalone server bundle with all dependencies
 * installed, ready to be packaged with electron-builder.
 *
 * NPM workspaces hoists dependencies to the root, but the packaged
 * Electron app needs all server dependencies in the server folder.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '../../..');
const SERVER_DIR = path.join(ROOT_DIR, 'packages/server');
const SHARED_DIR = path.join(ROOT_DIR, 'packages/shared');
const BUNDLE_DIR = path.join(__dirname, '../server-bundle');

console.log('📦 Bundling server for distribution...\n');

// Clean up previous bundle
if (fs.existsSync(BUNDLE_DIR)) {
  console.log('🧹 Cleaning previous bundle...');
  fs.rmSync(BUNDLE_DIR, { recursive: true });
}

// Create bundle directory
fs.mkdirSync(BUNDLE_DIR, { recursive: true });

// Copy server source
console.log('📁 Copying server source...');
const serverSrcDir = path.join(BUNDLE_DIR, 'src');
fs.mkdirSync(serverSrcDir, { recursive: true });
copyDir(path.join(SERVER_DIR, 'src'), serverSrcDir);

// Copy and modify package.json (remove workspace reference)
console.log('📝 Preparing package.json...');
const serverPkg = JSON.parse(fs.readFileSync(path.join(SERVER_DIR, 'package.json'), 'utf8'));

// Remove workspace reference to @recrate/shared
// We'll bundle shared as a local folder instead
delete serverPkg.dependencies['@recrate/shared'];

// Write modified package.json
fs.writeFileSync(
  path.join(BUNDLE_DIR, 'package.json'),
  JSON.stringify(serverPkg, null, 2)
);

// Copy shared package
console.log('📁 Copying shared package...');
const sharedBundleDir = path.join(BUNDLE_DIR, 'node_modules/@recrate/shared');
fs.mkdirSync(sharedBundleDir, { recursive: true });
copyDir(SHARED_DIR, sharedBundleDir);

// Install production dependencies
console.log('📥 Installing production dependencies...');
try {
  execSync('npm install --production --ignore-scripts', {
    cwd: BUNDLE_DIR,
    stdio: 'inherit'
  });
} catch (error) {
  console.error('❌ Failed to install dependencies:', error.message);
  process.exit(1);
}

// Verify key dependencies exist
const requiredDeps = ['express', 'music-metadata', 'socket.io', 'cors'];
let allDepsPresent = true;

console.log('\n✅ Verifying dependencies...');
for (const dep of requiredDeps) {
  const depPath = path.join(BUNDLE_DIR, 'node_modules', dep);
  if (fs.existsSync(depPath)) {
    console.log(`  ✓ ${dep}`);
  } else {
    console.log(`  ✗ ${dep} - MISSING`);
    allDepsPresent = false;
  }
}

if (!allDepsPresent) {
  console.error('\n❌ Some dependencies are missing!');
  process.exit(1);
}

// Count total packages
const nodeModulesPath = path.join(BUNDLE_DIR, 'node_modules');
const packageCount = fs.readdirSync(nodeModulesPath).filter(f => !f.startsWith('.')).length;
console.log(`\n📊 Total packages bundled: ${packageCount}`);

console.log('\n✅ Server bundle created successfully!');
console.log(`   Location: ${BUNDLE_DIR}`);

// Helper function to copy directory recursively
function copyDir(src, dest) {
  if (!fs.existsSync(src)) {
    return;
  }

  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    // Skip node_modules and other non-essential dirs
    if (entry.name === 'node_modules' || entry.name === '.git') {
      continue;
    }

    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else if (entry.isSymbolicLink()) {
      // Resolve symlinks
      const realPath = fs.realpathSync(srcPath);
      if (fs.statSync(realPath).isDirectory()) {
        copyDir(realPath, destPath);
      } else {
        fs.copyFileSync(realPath, destPath);
      }
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}
