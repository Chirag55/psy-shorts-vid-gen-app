#!/usr/bin/env bash
#
# Installs the FFmpegKit AAR this app builds against.
#
# Why this exists: FFmpegKit was retired by its author in 2025 and every
# `com.arthenica:ffmpeg-kit-*` artifact was removed from Maven Central. Gradle
# therefore cannot resolve the dependency remotely, and the build needs a
# locally vendored AAR in android/libs/ instead.
#
# This script does NOT download from a hardcoded mirror, because no official
# public mirror exists any more and guessing one would be a supply-chain risk
# for a binary that ships inside your APK. Supply the AAR yourself:
#
#   ./scripts/install-ffmpeg-aar.sh /path/to/ffmpeg-kit-full-gpl-6.0-2.aar
#   ./scripts/install-ffmpeg-aar.sh https://your-mirror/ffmpeg-kit-full-gpl-6.0-2.aar
#
# See docs/FFMPEG.md for the two supported ways to obtain it.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LIBS_DIR="$ROOT/android/libs"

if [[ $# -lt 1 ]]; then
  echo "usage: $0 <path-or-url-to-ffmpeg-kit-aar>" >&2
  echo >&2
  echo "The app needs the 'full-gpl' variant — it is the only one with libass," >&2
  echo "and without libass the renderer produces video with no burned captions." >&2
  echo "See docs/FFMPEG.md." >&2
  exit 2
fi

SOURCE="$1"
mkdir -p "$LIBS_DIR"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

if [[ "$SOURCE" =~ ^https?:// ]]; then
  echo "Downloading $SOURCE"
  curl -fSL --retry 3 --retry-delay 2 -o "$TMP/ffmpeg-kit.aar" "$SOURCE"
  STAGED="$TMP/ffmpeg-kit.aar"
  BASENAME="$(basename "${SOURCE%%\?*}")"
else
  [[ -f "$SOURCE" ]] || { echo "error: no such file: $SOURCE" >&2; exit 1; }
  STAGED="$SOURCE"
  BASENAME="$(basename "$SOURCE")"
fi

# An AAR is a zip. Reject anything that is not, so a stray HTML error page never
# gets vendored into the build as if it were a library.
if ! unzip -tqq "$STAGED" >/dev/null 2>&1; then
  echo "error: $BASENAME is not a valid archive — it is probably an error page, not an AAR." >&2
  exit 1
fi

if ! unzip -l "$STAGED" | grep -q "classes.jar"; then
  echo "error: $BASENAME has no classes.jar, so it is not an Android AAR." >&2
  exit 1
fi

if ! unzip -l "$STAGED" | grep -q "libffmpegkit.so"; then
  echo "error: $BASENAME contains no libffmpegkit.so — wrong artifact?" >&2
  exit 1
fi

# The Gradle config globs ffmpeg-kit-*.aar, so keep the upstream naming.
case "$BASENAME" in
  ffmpeg-kit-*.aar) TARGET="$LIBS_DIR/$BASENAME" ;;
  *)                TARGET="$LIBS_DIR/ffmpeg-kit-full-gpl-6.0-2.aar" ;;
esac

if ! unzip -l "$STAGED" | grep -qi "libass"; then
  echo "warning: no libass found in this AAR." >&2
  echo "         Captions will not burn in. You probably want the full-gpl variant." >&2
fi

rm -f "$LIBS_DIR"/ffmpeg-kit-*.aar
cp "$STAGED" "$TARGET"

echo "Installed $(basename "$TARGET") -> android/libs/"
echo "Next: npm run prebuild && npm run android"
