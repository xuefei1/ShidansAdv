#!/bin/bash
# Finder-compatible launcher for macOS (Apple silicon and Intel), also usable on Linux.
set -u

# Finder may not inherit the user's interactive shell PATH. Include the standard
# Node installer, Homebrew and Volta locations without sourcing shell profiles.
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${HOME}/.volta/bin:${PATH:-}"
cd -- "$(dirname -- "$0")" || exit 1
game_node="${SHIDAN_NODE:-$(command -v node || true)}"
if [ -z "$game_node" ] || ! "$game_node" -e 'if (Number(process.versions.node.split(".")[0]) < 22) process.exit(1)' 2>/dev/null; then
  printf '\nShidan needs Node.js 22 or newer. Install a supported LTS version from:\nhttps://nodejs.org/en/download\nThen open Start-Game.command again.\n\n'
  if [ -t 0 ]; then read -r -p 'Press Return to close this window. ' _reply; fi
  exit 1
fi

printf "\nStarting Shidan's Adventure...\nKeep this Terminal window open while playing. Press Control-C to stop.\n\n"
exec "$game_node" scripts/serve.mjs --open "$@"
