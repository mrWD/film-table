#!/usr/bin/env bash
# Builds a TestFlight-ready .ipa. Does not upload — see docs/RELEASE-IOS.md for why.
#
# Usage:  scripts/release-ios.sh [build-number]
#
# The build number must rise with every upload; App Store Connect rejects a repeat.
# Passing nothing keeps whatever is in the project.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${ROOT}/build/ios"
ARCHIVE="${OUT}/FilmTable.xcarchive"

if [ "${1:-}" != "" ]; then
  # -PBXCp is not a thing; agvtool is, and it edits the project in place.
  (cd "${ROOT}/ios/App" && xcrun agvtool new-version -all "$1")
fi

# The web build that goes inside the app ships no service worker: inside the shell every
# file is already on the device, and the worker's only observable effect was serving the
# previous build after an update. See vite.config.ts.
cd "${ROOT}"
npm run build:native
npx cap sync ios

mkdir -p "${OUT}"
rm -rf "${ARCHIVE}" "${OUT}/export"

cd "${ROOT}/ios/App"
xcodebuild -project App.xcodeproj -scheme App -configuration Release \
  -destination 'generic/platform=iOS' -archivePath "${ARCHIVE}" \
  -allowProvisioningUpdates archive

xcodebuild -exportArchive -archivePath "${ARCHIVE}" \
  -exportOptionsPlist ExportOptions.plist -exportPath "${OUT}/export" \
  -allowProvisioningUpdates

echo
# The archive is signed for development; only the export carries the distribution
# signature, and checking the wrong one is how "signed with Apple Development" got
# printed for a perfectly good build.
rm -rf "${OUT}/verify" && mkdir -p "${OUT}/verify"
(cd "${OUT}/verify" && unzip -q "${OUT}/export/App.ipa")
echo "Signed with:"
codesign -dvv "${OUT}/verify/Payload/App.app" 2>&1 | grep "^Authority=Apple" | head -1
echo "Ready: ${OUT}/export/App.ipa"
