#!/usr/bin/env bash
# Installs the system shared libraries Playwright/Chromium needs for headless
# rendering, without root/sudo/apt-get write access to system paths.
#
# Why this exists: this container has no root and `apt-get update` fails with
# "Permission denied" on /var/lib/apt/lists/partial. Headless Chromium (via
# `npx playwright install chromium`) still needs ~20 shared libraries
# (glib, nss, X11, dbus, fontconfig, etc.) that aren't present. This script
# downloads the .deb packages with apt-get's own state/cache dirs redirected
# to a writable prefix (no root needed for that), then unpacks them with
# `dpkg -x` (extract-only, never touches /usr or /var) into a local prefix.
#
# Usage:
#   bash scripts/setup-headless-chromium-deps.sh
#   source scripts/headless-chromium-env.sh   # then run your Playwright script
#
# Re-run is safe/idempotent — re-downloads and re-extracts over the same prefix.

set -euo pipefail

PREFIX="${HEADLESS_CHROMIUM_PREFIX:-/tmp/apt-work}"
LISTS_DIR="$PREFIX/lists"
CACHE_DIR="$PREFIX/cache"
# Own subdir, not shared with setup-python-runtime.sh's debs-python/ — both
# scripts extract every .deb in their dir on every run, and a shared dir
# means one script's leftover .deb (e.g. fontconfig-config) gets silently
# re-extracted by the other, clobbering fonts.conf patches applied below.
DEBS_DIR="$PREFIX/debs-chromium"
EXTRACT_DIR="$PREFIX/extracted"

mkdir -p "$LISTS_DIR/partial" "$CACHE_DIR/archives/partial" "$DEBS_DIR" "$EXTRACT_DIR"

echo "==> Fetching package index (writable custom dirs, no root)..."
apt-get -o dir::state::lists="$LISTS_DIR" \
        -o dir::cache="$CACHE_DIR" \
        -o dir::cache::archives="$CACHE_DIR/archives" \
        update

# Packages needed by headless Chromium (direct + transitive), verified via
# `ldd chrome-headless-shell` against a fresh Debian 12 (bookworm) container.
# fontconfig/libfreetype6/fonts-liberation are for correct font rendering
# (without them Chromium runs but throws "Cannot load default config file").
PKGS="
libglib2.0-0 libnspr4 libnss3 libatk1.0-0 libatk-bridge2.0-0 libdbus-1-3
libx11-6 libxcomposite1 libxdamage1 libxext6 libxfixes3 libxrandr2 libgbm1
libxcb1 libxkbcommon0 libasound2 libatspi2.0-0 libcairo2 libpango-1.0-0
libxrender1 libdrm2 libwayland-server0 libxau6 libxdmcp6 libxi6
fontconfig fontconfig-config libfontconfig1 fonts-liberation libfreetype6
libpng16-16
"

echo "==> Downloading .deb packages..."
cd "$DEBS_DIR"
# shellcheck disable=SC2086
apt-get -o dir::state::lists="$LISTS_DIR" \
        -o dir::cache="$CACHE_DIR" \
        -o debug::nolocking=1 \
        download $PKGS

echo "==> Extracting (dpkg -x, no root, never touches system paths)..."
for f in "$DEBS_DIR"/*.deb; do
  dpkg -x "$f" "$EXTRACT_DIR"
done

# fonts.conf ships pointing at real system paths (/usr/share/fonts, and a
# cachedir under /var/cache which isn't writable here). Patch both so
# fontconfig actually finds the extracted Liberation fonts and can build its
# cache — without this, Chromium runs but silently renders NO text at all
# (borders/backgrounds paint fine; every glyph is invisible).
FONT_CACHE_DIR="$PREFIX/fontcache"
mkdir -p "$FONT_CACHE_DIR"
FONTS_CONF="$EXTRACT_DIR/etc/fonts/fonts.conf"
if [ -f "$FONTS_CONF" ]; then
  sed -i "s#<cachedir>/var/cache/fontconfig</cachedir>#<cachedir>$FONT_CACHE_DIR</cachedir>#" "$FONTS_CONF"
  if ! grep -q "$EXTRACT_DIR/usr/share/fonts" "$FONTS_CONF"; then
    sed -i "s#<dir>/usr/share/fonts</dir>#<dir>/usr/share/fonts</dir>\n\t<dir>$EXTRACT_DIR/usr/share/fonts</dir>#" "$FONTS_CONF"
  fi
  echo "==> Building font cache..."
  PATH="$EXTRACT_DIR/usr/bin:$PATH" \
    LD_LIBRARY_PATH="$EXTRACT_DIR/lib/x86_64-linux-gnu:$EXTRACT_DIR/usr/lib/x86_64-linux-gnu" \
    FONTCONFIG_PATH="$EXTRACT_DIR/etc/fonts" \
    fc-cache -f >/dev/null 2>&1 || true
fi

cat > "$PREFIX/../headless-chromium-env.sh" <<EOF
# Source this before running Playwright/Chromium in this container.
export LD_LIBRARY_PATH="$EXTRACT_DIR/lib/x86_64-linux-gnu:$EXTRACT_DIR/usr/lib/x86_64-linux-gnu\${LD_LIBRARY_PATH:+:\$LD_LIBRARY_PATH}"
export FONTCONFIG_PATH="$EXTRACT_DIR/etc/fonts"
EOF
ln -sf "$PREFIX/../headless-chromium-env.sh" /tmp/headless-chromium-env.sh 2>/dev/null || true

echo "==> Done. Verifying no missing libraries remain:"
export LD_LIBRARY_PATH="$EXTRACT_DIR/lib/x86_64-linux-gnu:$EXTRACT_DIR/usr/lib/x86_64-linux-gnu"
CHROME_BIN=$(find "$HOME/.cache/ms-playwright" -iname "chrome-headless-shell" -type f 2>/dev/null | head -1)
if [ -n "$CHROME_BIN" ]; then
  MISSING=$(ldd "$CHROME_BIN" 2>&1 | grep "not found" || true)
  if [ -z "$MISSING" ]; then
    echo "    All shared libraries resolved."
  else
    echo "    Still missing:"
    echo "$MISSING"
  fi
else
  echo "    (Playwright chromium not installed yet — run: npx playwright install chromium)"
fi

echo ""
echo "To use: source /tmp/headless-chromium-env.sh"
