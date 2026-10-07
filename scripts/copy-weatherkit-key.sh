#!/usr/bin/env bash
set -euo pipefail
read -r -p '输入刚下载的 WeatherKit Key ID（10位）: ' weather_kid
if [[ ! "$weather_kid" =~ ^[A-Z0-9]{10}$ ]]; then echo 'Key ID格式无效' >&2; exit 1; fi
weather_key_file="/c/Users/Administrator/Downloads/AuthKey_${weather_kid}.p8"
if [[ ! -f "$weather_key_file" ]]; then echo "未找到文件：$weather_key_file" >&2; exit 1; fi
base64 -w0 "$weather_key_file" | clip.exe
echo 'WeatherKit私钥Base64已复制到剪贴板。只粘贴到服务器配置脚本的隐藏输入中，完成后可复制其他文本清空剪贴板。'
