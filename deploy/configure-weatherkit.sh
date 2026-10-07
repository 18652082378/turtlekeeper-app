#!/usr/bin/env bash
# Run the saved file on ECS. Do not paste this interactive file line by line.
set -e
trap 'unset WEATHERKIT_KEY_INPUT weather_key_input' EXIT
read -r -p 'Apple Team ID（10位）: ' weather_team
read -r -p 'WeatherKit Key ID（10位）: ' weather_kid
read -r -p 'Services ID [com.turtlekeeper.weather]: ' weather_service
read -r -s -p '粘贴 WeatherKit .p8 文件的 Base64（隐藏输入，完成按回车）: ' weather_key_input
printf '\n'
export WEATHERKIT_TEAM_ID="$weather_team" WEATHERKIT_KEY_ID="$weather_kid"
export WEATHERKIT_SERVICE_ID="${weather_service:-com.turtlekeeper.weather}" WEATHERKIT_KEY_INPUT="$weather_key_input"
node "$(dirname "$0")/../scripts/configure-weatherkit.cjs"
unset WEATHERKIT_KEY_INPUT weather_key_input
export WEATHERKIT_KEY_PATH="/www/turtlekeeper-app/server/keys/weatherkit-${weather_kid}.p8"
pm2 restart turtlekeeper-api --update-env
