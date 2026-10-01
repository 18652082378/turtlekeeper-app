#!/usr/bin/env bash
set -euo pipefail

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
cd "$script_dir/.."
patch_file='deploy/patches/turtlekeeper-community-recommendation-v3.tar.gz'
expected_hash='6bd6fb390053e0ddbba11f4a474400e24ed0644f995d1701a770bc81b72ad358'

printf '%s  %s\n' "$expected_hash" "$patch_file" | sha256sum -c - >&2

emit_command() {
  cat <<'SERVER_HEAD'
(
set -euo pipefail
patch_dir=$(mktemp -d /tmp/turtlekeeper-recommend-v3.XXXXXX)
cd "$patch_dir"

base64 -d > turtlekeeper-community-recommendation-v3.tar.gz <<'TURTLE_PATCH_BASE64'
SERVER_HEAD
  base64 "$patch_file"
  printf '\n'
  cat <<'SERVER_TAIL'
TURTLE_PATCH_BASE64

printf '%s  %s\n' \
'6bd6fb390053e0ddbba11f4a474400e24ed0644f995d1701a770bc81b72ad358' \
'turtlekeeper-community-recommendation-v3.tar.gz' |
sha256sum -c -

tar -xzf turtlekeeper-community-recommendation-v3.tar.gz
sha256sum -c SHA256SUMS
node deploy-community-recommendation.cjs --check
node deploy-community-recommendation.cjs --apply
)
SERVER_TAIL
}

case "${1:---print}" in
  --print) emit_command ;;
  --clipboard)
    command -v clip.exe >/dev/null
    emit_command | clip.exe
    echo '服务器安装代码已复制到剪贴板。切到服务器终端，粘贴完整代码并执行。'
    ;;
  *) echo 'Use --print or --clipboard' >&2; exit 1 ;;
esac
