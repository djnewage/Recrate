#!/bin/bash
# Release script for Recrate
# Usage: ./scripts/release.sh 1.0.0

set -e

VERSION=$1

if [ -z "$VERSION" ]; then
  echo "Usage: ./scripts/release.sh <version>"
  echo "Example: ./scripts/release.sh 1.0.0"
  exit 1
fi

# Validate version format
if ! [[ $VERSION =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Error: Version must be in format X.Y.Z (e.g., 1.0.0)"
  exit 1
fi

echo "🚀 Preparing release v$VERSION"

# Update version in package.json files
echo "📝 Updating version in package.json files..."

# Update root package.json
npm version $VERSION --no-git-tag-version

# Update desktop package.json
cd packages/desktop
npm version $VERSION --no-git-tag-version
cd ../..

# Update server package.json
cd packages/server
npm version $VERSION --no-git-tag-version
cd ../..

# Update mobile package.json
cd packages/mobile
npm version $VERSION --no-git-tag-version
cd ../..

echo "✅ Version updated to $VERSION"

# Commit and tag
echo "📦 Creating git commit and tag..."
git add -A
git commit -m "chore: release v$VERSION"
git tag -a "v$VERSION" -m "Release v$VERSION"

echo ""
echo "✅ Release v$VERSION prepared!"
echo ""
echo "Next steps:"
echo "  1. Review the changes: git log --oneline -5"
echo "  2. Push to trigger the build: git push origin main --tags"
echo "  3. GitHub Actions will build and create the release"
echo "  4. Download links will be at: https://github.com/djnewage/Recrate/releases"
