#!/bin/sh
# ─────────────────────────────────────────────────────────────────────────────
# Agent Apps installer (DIST-REQ-8)
#
#   curl -fsSL https://get.agentapps.tech/install.sh | sh
#
# Installs the single `agentapps` executable into ~/.local/bin and puts that
# folder on the PATH. No Node, git or sudo. Running it again upgrades.
#
# The executable is downloaded to a temporary file next to its final place,
# checked (sha256, ad-hoc signature on macOS, `--version`) and only then moved
# over the old one, so a failure never leaves a broken install.
#
# Environment:
#   AGENTAPPS_BASE_URL  where manifest.json and the executables live
#                       (default https://get.agentapps.tech)
#   AGENTAPPS_BIN_DIR   where to install (default ~/.local/bin)
#
# @spec DIST-REQ-8
# ─────────────────────────────────────────────────────────────────────────────
set -eu

# Everything runs inside main(), so a `curl | sh` cut short runs nothing.
main() {

BASE_URL="${AGENTAPPS_BASE_URL:-https://get.agentapps.tech}"
BASE_URL="${BASE_URL%/}"
BIN_DIR="${AGENTAPPS_BIN_DIR:-$HOME/.local/bin}"
BIN_PATH="$BIN_DIR/agentapps"

if [ -t 1 ]; then
  GREEN='\033[0;32m'; CYAN='\033[0;36m'; YELLOW='\033[1;33m'; RED='\033[0;31m'
  WHITE='\033[1;37m'; DIM='\033[2m'; RESET='\033[0m'
else
  GREEN=''; CYAN=''; YELLOW=''; RED=''; WHITE=''; DIM=''; RESET=''
fi

info()    { printf "  %b→%b  %s\n" "$CYAN" "$RESET" "$1"; }
success() { printf "  %b✓%b  %s\n" "$GREEN" "$RESET" "$1"; }
warn()    { printf "  %b!%b  %s\n" "$YELLOW" "$RESET" "$1"; }
fail()    { printf "\n  %b✗  %s%b\n\n" "$RED" "$1" "$RESET" >&2; exit 1; }

printf "\n  %bAgent Apps%b\n\n" "$WHITE" "$RESET"

# ── Requirements ────────────────────────────────────────────────────────────
command -v curl >/dev/null 2>&1 || fail "curl is required. Install it first."
if command -v sha256sum >/dev/null 2>&1; then
  SHA256="sha256sum"
elif command -v shasum >/dev/null 2>&1; then
  SHA256="shasum -a 256"
else
  fail "No sha256sum or shasum found, so the download cannot be checked."
fi
if [ "$(id -u)" = "0" ]; then
  warn "Running as root. Agent Apps is meant to be installed for your own user."
fi

# ── Platform ────────────────────────────────────────────────────────────────
case "$(uname -s)" in
  Darwin) OS="darwin" ;;
  Linux)  OS="linux" ;;
  *)      fail "Unsupported system: $(uname -s). Agent Apps runs on macOS and Linux." ;;
esac
case "$(uname -m)" in
  arm64|aarch64) ARCH="arm64" ;;
  x86_64|amd64)  ARCH="x64" ;;
  *)             fail "Unsupported processor: $(uname -m). Agent Apps runs on arm64 and x86_64." ;;
esac
PLATFORM="$OS-$ARCH"
success "Platform: $PLATFORM"

# ── Manifest ────────────────────────────────────────────────────────────────
TMP_MANIFEST="$(mktemp "${TMPDIR:-/tmp}/agentapps-manifest.XXXXXX")"
TMP_BIN=""
trap 'rm -f "$TMP_MANIFEST" ${TMP_BIN:+"$TMP_BIN"}' EXIT INT TERM

curl -fsSL --max-time 30 "$BASE_URL/manifest.json" -o "$TMP_MANIFEST" \
  || fail "Could not read $BASE_URL/manifest.json. Check your connection."

# The manifest is pretty-printed, one key per line (build-release.mjs).
json_string() { sed -n "s/.*\"$1\"[[:space:]]*:[[:space:]]*\"\([^\"]*\)\".*/\1/p" | head -1; }
VERSION="$(json_string version < "$TMP_MANIFEST")"
[ -n "$VERSION" ] || fail "The manifest at $BASE_URL has no version."
ASSET="$(awk -v key="\"$PLATFORM\"" '
  index($0, key) && /\{/ { inside = 1 }
  inside { print; if (/\}/) exit }
' "$TMP_MANIFEST")"
ASSET_URL="$(printf '%s\n' "$ASSET" | json_string url)"
ASSET_SHA="$(printf '%s\n' "$ASSET" | json_string sha256)"
[ -n "$ASSET_URL" ] && [ -n "$ASSET_SHA" ] || fail "Version $VERSION has no executable for $PLATFORM."
# Download from BASE_URL even when the manifest names another host.
ASSET_URL="$BASE_URL/${ASSET_URL##*/}"
success "Latest version: $VERSION"

# ── Already installed? ──────────────────────────────────────────────────────
if [ -x "$BIN_PATH" ] && [ "$("$BIN_PATH" --version 2>/dev/null || true)" = "$VERSION" ]; then
  success "agentapps $VERSION is already installed at $BIN_PATH"
else
  # ── Download, check, then swap ────────────────────────────────────────────
  mkdir -p "$BIN_DIR"
  TMP_BIN="$BIN_DIR/.agentapps.download.$$"
  info "Downloading $ASSET_URL"
  curl -fsSL --max-time 600 "$ASSET_URL" -o "$TMP_BIN" \
    || fail "Download failed. Nothing was changed."

  ACTUAL_SHA="$($SHA256 "$TMP_BIN" | awk '{print $1}')"
  [ "$ACTUAL_SHA" = "$ASSET_SHA" ] \
    || fail "The download does not match its sha256 (expected $ASSET_SHA, got $ACTUAL_SHA). Nothing was changed."
  success "Checksum OK"

  chmod 0755 "$TMP_BIN"
  if [ "$OS" = "darwin" ] && [ -x /usr/bin/codesign ]; then
    # Re-sign after the checksum: the manifest's hash is of the unsigned bytes.
    /usr/bin/codesign --force --sign - "$TMP_BIN" >/dev/null 2>&1 \
      || fail "Could not sign the executable for macOS. Nothing was changed."
  fi

  RAN_VERSION="$("$TMP_BIN" --version 2>/dev/null || true)"
  [ "$RAN_VERSION" = "$VERSION" ] \
    || fail "The downloaded executable does not run on this machine (got '${RAN_VERSION}'). Nothing was changed."

  mv -f "$TMP_BIN" "$BIN_PATH"
  TMP_BIN=""
  success "Installed agentapps $VERSION at $BIN_PATH"
fi

# ── PATH ────────────────────────────────────────────────────────────────────
RELOAD=""
case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *)
    case "$(basename "${SHELL:-sh}")" in
      zsh)  RC="$HOME/.zshrc" ;;
      bash) if [ "$OS" = "darwin" ]; then RC="$HOME/.bash_profile"; else RC="$HOME/.bashrc"; fi ;;
      fish) RC="" ; warn "fish: add it yourself with: fish_add_path $BIN_DIR" ;;
      *)    RC="$HOME/.profile" ;;
    esac
    if [ -n "$RC" ]; then
      case "$BIN_DIR" in
        "$HOME"/*) DIR_IN_RC="\$HOME/${BIN_DIR#"$HOME"/}" ;;
        *)         DIR_IN_RC="$BIN_DIR" ;;
      esac
      LINE="export PATH=\"$DIR_IN_RC:\$PATH\" # agentapps"
      if [ -f "$RC" ] && grep -qF "$LINE" "$RC"; then
        success "$RC already puts $BIN_DIR on the PATH"
      else
        printf '%s\n' "$LINE" >> "$RC"
        success "Added $BIN_DIR to the PATH in $RC"
      fi
      RELOAD="$RC"
    fi
    ;;
esac

# ── Next steps ──────────────────────────────────────────────────────────────
printf "\n  %b✓  Agent Apps %s is ready.%b\n\n" "$GREEN" "$VERSION" "$RESET"
if [ -n "$RELOAD" ]; then
  printf "  %bOpen a new terminal first, or run:%b  . %s\n\n" "$YELLOW" "$RESET" "$RELOAD"
fi
printf "  %bNext steps:%b\n\n" "$WHITE" "$RESET"
printf "    agentapps station start                %b# start your local station%b\n" "$DIM" "$RESET"
printf "    agentapps install <app> <alias>        %b# e.g. agentapps install app.hello hello%b\n" "$DIM" "$RESET"
printf "    agentapps connect claude-code          %b# use your apps from Claude Code%b\n\n" "$DIM" "$RESET"

}

main "$@"
