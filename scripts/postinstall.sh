#!/bin/bash
# Automatically install mpv if missing (macOS only)

if [ "$(uname)" != "Darwin" ]; then
  exit 0
fi

if command -v mpv &>/dev/null; then
  exit 0
fi

echo "play-music: mpv not found, attempting to install via Homebrew..."

if ! command -v brew &>/dev/null; then
  echo "play-music: Homebrew not found. Please install mpv manually:"
  echo "  brew install mpv"
  exit 0
fi

brew install mpv || {
  echo "play-music: Failed to install mpv. Please install manually:"
  echo "  brew install mpv"
}
