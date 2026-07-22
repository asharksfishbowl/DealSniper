#!/bin/sh
set -eu

HOST="${REACT_NATIVE_PACKAGER_HOSTNAME:-<host-lan-ip>}"
MODE="${EXPO_START_MODE:-tunnel}"

echo "DealSniper Expo Metro"
echo "  EXPO_PUBLIC_API_URL=${EXPO_PUBLIC_API_URL:-unset}"
echo "  REACT_NATIVE_PACKAGER_HOSTNAME=${HOST}"
echo "  EXPO_START_MODE=${MODE}"
if [ "$MODE" = "lan" ]; then
  echo "  Connect in DealSniper app: exp://${HOST}:8081"
  exec npx expo start --dev-client --lan --port 8081 "$@"
fi

echo "  Connect: open DealSniper → enter the exp:// URL shown below"
exec npx expo start --dev-client --tunnel --port 8081 "$@"
