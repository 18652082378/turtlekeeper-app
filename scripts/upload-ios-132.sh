#!/usr/bin/env bash
set -euo pipefail
cd /c/Users/Administrator/Documents/Codex/2026-06-02/apple-store/outputs/turtlekeeper-app
if [ "$(git branch --show-current)" != main ]; then
  printf '%s\n' 'Run this release upload from the main branch.' >&2
  exit 1
fi
mapfile -t release_files < <(tr -d '\r' < scripts/ios-132-release-files.txt)
git add --pathspec-from-file=scripts/ios-132-release-files.txt
git diff --cached --check -- "${release_files[@]}"
if ! git diff --cached --quiet -- "${release_files[@]}"; then
  git -c gc.auto=0 -c maintenance.auto=false commit --only \
    -m "Refine application modules in iOS 1.1.7 build 132" \
    --pathspec-from-file=scripts/ios-132-release-files.txt
fi
git -c gc.auto=0 -c maintenance.auto=false push origin main
printf '%s\n' 'Upload complete. In Codemagic, build main using the iOS TestFlight workflow for 1.1.7 (132).'
