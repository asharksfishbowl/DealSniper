#!/usr/bin/env bash
# Installs a Python 3.11 runtime + backend/requirements.txt into a local
# prefix, without root/sudo/apt-get write access to system paths.
#
# Why this exists: this container ships no Python interpreter at all (no
# `python`/`python3` anywhere), and `apt-get update` fails with "Permission
# denied" (no root). Same technique as scripts/setup-headless-chromium-deps.sh:
# apt-get download (with its state/cache dirs redirected to a writable
# prefix) + `dpkg -x` (extract-only, never touches /usr or /var).
#
# Usage:
#   bash scripts/setup-python-runtime.sh
#   source /tmp/python-runtime-env.sh
#   python3.11 backend/scripts/benchmark_report.py   # etc.
#
# Re-run is safe/idempotent.

set -euo pipefail

PREFIX="${HEADLESS_CHROMIUM_PREFIX:-/tmp/apt-work}"
LISTS_DIR="$PREFIX/lists"
CACHE_DIR="$PREFIX/cache"
# Own subdir, not shared with setup-headless-chromium-deps.sh's debs-chromium/
# — see the comment in that script for why a shared debs dir is unsafe (its
# extraction loop re-extracts every .deb present, including leftovers from
# the other script's run, which can clobber patched config files like
# fonts.conf).
DEBS_DIR="$PREFIX/debs-python"
EXTRACT_DIR="$PREFIX/extracted"
PY_TARGET="$PREFIX/py-target"

mkdir -p "$LISTS_DIR/partial" "$CACHE_DIR/archives/partial" "$DEBS_DIR" "$EXTRACT_DIR" "$PY_TARGET"

echo "==> Fetching package index..."
apt-get -o dir::state::lists="$LISTS_DIR" \
        -o dir::cache="$CACHE_DIR" \
        -o dir::cache::archives="$CACHE_DIR/archives" \
        update

PKGS="
python3 python3-minimal python3.11 python3.11-minimal
libpython3.11-stdlib libpython3.11-minimal libpython3.11 libpython3-stdlib
python3-pip python3-pip-whl python3-setuptools-whl python3-venv
python3.11-venv media-types libsqlite3-0
"

echo "==> Downloading .deb packages..."
cd "$DEBS_DIR"
# shellcheck disable=SC2086
apt-get -o dir::state::lists="$LISTS_DIR" \
        -o dir::cache="$CACHE_DIR" \
        -o debug::nolocking=1 \
        download $PKGS

echo "==> Extracting..."
for f in "$DEBS_DIR"/*.deb; do
  dpkg -x "$f" "$EXTRACT_DIR"
done

ENV_FILE="/tmp/python-runtime-env.sh"
cat > "$ENV_FILE" <<EOF
export LD_LIBRARY_PATH="$EXTRACT_DIR/lib/x86_64-linux-gnu:$EXTRACT_DIR/usr/lib/x86_64-linux-gnu\${LD_LIBRARY_PATH:+:\$LD_LIBRARY_PATH}"
export PATH="$EXTRACT_DIR/usr/bin:\$PATH"
export PYTHONPATH="$EXTRACT_DIR/usr/lib/python3/dist-packages:$PY_TARGET"
EOF

echo "==> Verifying interpreter..."
# shellcheck disable=SC1090
source "$ENV_FILE"
python3.11 -c "import sys; print('Python', sys.version)"

if [ -f /repos/DealSniper/backend/requirements.txt ]; then
  echo "==> Installing backend/requirements.txt into $PY_TARGET..."
  python3.11 -m pip install --target="$PY_TARGET" -r /repos/DealSniper/backend/requirements.txt
fi

echo ""
echo "To use: source $ENV_FILE"
