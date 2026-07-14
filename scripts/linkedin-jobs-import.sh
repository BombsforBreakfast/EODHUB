#!/usr/bin/env bash
# Wrapper for launchd — run-on-wake LinkedIn import.
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"
exec npx tsx scripts/linkedin-jobs-import.ts
