#!/usr/bin/env node
/**
 * Generate platform-specific icons from icon.png
 * Creates .icns for macOS and .ico for Windows
 */

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ICONS_DIR = path.join(__dirname, '..', 'assets', 'icons');
const SOURCE_ICON = path.join(ICONS_DIR, 'icon.png');

// Icon sizes needed for .icns (macOS)
const ICNS_SIZES = [16, 32, 64, 128, 256, 512, 1024];

// Icon sizes needed for .ico (Windows)
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];

async function generateIconSet() {
  console.log('🎨 Generating icon set from:', SOURCE_ICON);

  // Create temporary directory for icon generation
  const tempDir = path.join(ICONS_DIR, 'temp-iconset');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  // Generate PNG files at various sizes
  console.log('\n📐 Generating PNG sizes...');

  for (const size of [...new Set([...ICNS_SIZES, ...ICO_SIZES])]) {
    const outputPath = path.join(tempDir, `icon_${size}x${size}.png`);
    await sharp(SOURCE_ICON)
      .resize(size, size, {
        kernel: sharp.kernel.lanczos3,
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .png()
      .toFile(outputPath);
    console.log(`  ✓ ${size}x${size}`);
  }

  // Generate macOS .icns using iconutil (macOS only)
  if (process.platform === 'darwin') {
    console.log('\n🍎 Generating macOS .icns...');

    const iconsetDir = path.join(tempDir, 'icon.iconset');
    if (!fs.existsSync(iconsetDir)) {
      fs.mkdirSync(iconsetDir, { recursive: true });
    }

    // Copy files with macOS iconset naming convention
    const icnsMapping = [
      { size: 16, name: 'icon_16x16.png' },
      { size: 32, name: 'icon_16x16@2x.png' },
      { size: 32, name: 'icon_32x32.png' },
      { size: 64, name: 'icon_32x32@2x.png' },
      { size: 128, name: 'icon_128x128.png' },
      { size: 256, name: 'icon_128x128@2x.png' },
      { size: 256, name: 'icon_256x256.png' },
      { size: 512, name: 'icon_256x256@2x.png' },
      { size: 512, name: 'icon_512x512.png' },
      { size: 1024, name: 'icon_512x512@2x.png' },
    ];

    for (const { size, name } of icnsMapping) {
      const src = path.join(tempDir, `icon_${size}x${size}.png`);
      const dest = path.join(iconsetDir, name);
      fs.copyFileSync(src, dest);
    }

    // Use iconutil to create .icns
    const icnsOutput = path.join(ICONS_DIR, 'icon.icns');
    try {
      execSync(`iconutil -c icns "${iconsetDir}" -o "${icnsOutput}"`, { stdio: 'inherit' });
      console.log('  ✓ icon.icns created');
    } catch (error) {
      console.error('  ✗ Failed to create .icns:', error.message);
    }
  } else {
    console.log('\n⚠️  Skipping .icns generation (only available on macOS)');
  }

  // Generate Windows .ico using sharp/png-to-ico approach
  console.log('\n🪟 Generating Windows .ico...');

  try {
    // For .ico, we'll create a multi-resolution ICO file
    // Using the png-to-ico package or manual approach
    const icoOutput = path.join(ICONS_DIR, 'icon.ico');

    // Try using png-to-ico if available, otherwise use sharp workaround
    try {
      // Create ICO manually by combining PNG data
      await createIcoFile(tempDir, icoOutput, ICO_SIZES);
      console.log('  ✓ icon.ico created');
    } catch (icoError) {
      console.log('  ⚠️  Could not create multi-res .ico, creating single-res fallback...');
      // Fallback: create a simple 256x256 ICO (electron-builder can work with this)
      await sharp(path.join(tempDir, 'icon_256x256.png'))
        .toFile(icoOutput.replace('.ico', '-256.png'));
      console.log('  ✓ icon-256.png created (use online converter for .ico)');
    }
  } catch (error) {
    console.error('  ✗ Failed to create .ico:', error.message);
  }

  // Cleanup temp directory
  console.log('\n🧹 Cleaning up...');
  fs.rmSync(tempDir, { recursive: true, force: true });
  console.log('  ✓ Temp files removed');

  console.log('\n✅ Icon generation complete!');
  console.log('\nGenerated files:');

  const icnsPath = path.join(ICONS_DIR, 'icon.icns');
  const icoPath = path.join(ICONS_DIR, 'icon.ico');

  if (fs.existsSync(icnsPath)) {
    console.log(`  - ${icnsPath}`);
  }
  if (fs.existsSync(icoPath)) {
    console.log(`  - ${icoPath}`);
  }
}

/**
 * Create ICO file from multiple PNG sizes
 * ICO format: https://en.wikipedia.org/wiki/ICO_(file_format)
 */
async function createIcoFile(tempDir, outputPath, sizes) {
  const images = [];

  // Sort sizes descending (largest first, as per ICO convention)
  const sortedSizes = [...sizes].sort((a, b) => b - a);

  for (const size of sortedSizes) {
    const pngPath = path.join(tempDir, `icon_${size}x${size}.png`);
    const pngData = fs.readFileSync(pngPath);
    images.push({
      size,
      data: pngData
    });
  }

  // ICO Header (6 bytes)
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);          // Reserved (must be 0)
  header.writeUInt16LE(1, 2);          // Image type (1 = ICO)
  header.writeUInt16LE(images.length, 4); // Number of images

  // Calculate offsets
  const directorySize = 16 * images.length;
  let currentOffset = 6 + directorySize;

  // Create directory entries (16 bytes each)
  const directories = [];
  for (const img of images) {
    const dir = Buffer.alloc(16);
    dir.writeUInt8(img.size >= 256 ? 0 : img.size, 0);  // Width (0 = 256)
    dir.writeUInt8(img.size >= 256 ? 0 : img.size, 1);  // Height (0 = 256)
    dir.writeUInt8(0, 2);                                // Color palette
    dir.writeUInt8(0, 3);                                // Reserved
    dir.writeUInt16LE(1, 4);                             // Color planes
    dir.writeUInt16LE(32, 6);                            // Bits per pixel
    dir.writeUInt32LE(img.data.length, 8);               // Size of image data
    dir.writeUInt32LE(currentOffset, 12);                // Offset to image data

    directories.push(dir);
    currentOffset += img.data.length;
  }

  // Combine all parts
  const ico = Buffer.concat([
    header,
    ...directories,
    ...images.map(img => img.data)
  ]);

  fs.writeFileSync(outputPath, ico);
}

// Run the generator
generateIconSet().catch(console.error);
