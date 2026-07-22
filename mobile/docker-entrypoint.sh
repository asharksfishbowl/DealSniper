#!/bin/sh
set -eu

echo "DealSniper Expo Metro"
echo "  EXPO_PUBLIC_API_URL=${EXPO_PUBLIC_API_URL:-unset}"
echo "  REACT_NATIVE_PACKAGER_HOSTNAME=${REACT_NATIVE_PACKAGER_HOSTNAME:-unset}"
echo "  Scan: exp://${REACT_NATIVE_PACKAGER_HOSTNAME:-<host-lan-ip>}:8081"

exec npx expo start --lan --port 8081 "$@"
