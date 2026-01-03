#!/bin/bash

# Publish script for @picorules/compiler-core
# Usage: ./scripts/publish.sh [patch|minor|major] <otp>

set -e

VERSION_TYPE=${1:-patch}
OTP=$2

if [ -z "$OTP" ]; then
  echo "Usage: ./scripts/publish.sh [patch|minor|major] <otp>"
  echo "  patch - Bug fixes (1.0.0 → 1.0.1)"
  echo "  minor - New features (1.0.0 → 1.1.0)"
  echo "  major - Breaking changes (1.0.0 → 2.0.0)"
  exit 1
fi

if [[ ! "$VERSION_TYPE" =~ ^(patch|minor|major)$ ]]; then
  echo "Error: Version type must be patch, minor, or major"
  exit 1
fi

echo "📦 Publishing @picorules/compiler-core..."
echo "   Version bump: $VERSION_TYPE"

# Run tests first
echo "🧪 Running tests..."
npm test

# Bump version
echo "📝 Bumping version ($VERSION_TYPE)..."
npm version $VERSION_TYPE

# Publish
echo "🚀 Publishing to npm..."
npm publish --access public --otp=$OTP

# Push tags to git
echo "📤 Pushing tags to git..."
git push && git push --tags

echo "✅ Done! Package published successfully."
