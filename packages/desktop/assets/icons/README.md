# App Icons

Place your app icons in this directory:

## Required Icons

### macOS
- `icon.icns` - macOS app icon (1024x1024 source, multi-resolution .icns file)
- `tray-icon.png` - System tray icon (16x16 or 32x32 PNG with transparency)

### Windows
- `icon.ico` - Windows app icon (multi-resolution .ico file)
- `tray-icon.png` - System tray icon (16x16 or 32x32 PNG with transparency)

### Linux
- `icon.png` - Linux app icon (512x512 PNG)
- `tray-icon.png` - System tray icon (16x16 or 32x32 PNG with transparency)

## Creating Icons

You can use tools like:
- **icon-gen** npm package
- **Sketch**, **Figma**, or **Adobe Illustrator** for design
- **Online converters** for format conversion

### Example with icon-gen

```bash
npm install -g icon-gen

# Create from a 1024x1024 PNG source
icon-gen -i icon-source.png -o . --icns --ico
```

## Temporary Solution

For development, you can:
1. Use a placeholder PNG (any PNG will work temporarily)
2. Create proper icons before distribution

The app will still work without icons, but will use Electron's default icon.
