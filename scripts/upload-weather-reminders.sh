#!/usr/bin/env bash
set -e
cd /c/Users/Administrator/Documents/Codex/2026-06-02/apple-store/outputs/turtlekeeper-app
git add --pathspec-from-file=scripts/weather-reminders-release-files.txt
git diff --cached --check
git -c gc.auto=0 -c maintenance.auto=false commit --only \
  -m "Add Apple WeatherKit temperature reminders" \
  --pathspec-from-file=scripts/weather-reminders-release-files.txt
git -c gc.auto=0 -c maintenance.auto=false push origin main
