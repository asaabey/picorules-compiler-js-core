#!/bin/bash

# Publish script for @picorules/compiler-core
# Usage: ./scripts/publish.sh [patch|minor|major]

set -e

VERSION_TYPE=${1:-patch}

if [[ ! "$VERSION_TYPE" =~ ^(patch|minor|major)$ ]]; then
  echo "Usage: ./scripts/publish.sh [patch|minor|major]"
  echo "  patch - Bug fixes (1.0.0 → 1.0.1)"
  echo "  minor - New features (1.0.0 → 1.1.0)"
  echo "  major - Breaking changes (1.0.0 → 2.0.0)"
  exit 1
fi

echo "📦 Publishing @picorules/compiler-core..."
echo "   Version bump: $VERSION_TYPE"

# Run tests first
echo "🧪 Running tests..."
npm test

# Bump version and capture the new version
echo "📝 Bumping version ($VERSION_TYPE)..."
NEW_VERSION=$(npm version $VERSION_TYPE)
echo "   New version: $NEW_VERSION"

# Publish (will open browser for passkey authentication)
echo "🚀 Publishing to npm (browser will open for authentication)..."
npm publish --access public

# Push commit and only the new tag (not all tags)
echo "📤 Pushing to git..."
git push
echo "📤 Pushing tag $NEW_VERSION..."
git push origin "$NEW_VERSION"

echo "✅ Done! Package published successfully."
