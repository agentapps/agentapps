#!/usr/bin/env bash
# Agent Apps — one-command installer.
#
# Usage (after cloning the repo, see the README):
#   ./install.sh
#
# What it does:
#   1. Clones the repo (skipped if already inside it)
#   2. Installs dependencies (pnpm install)
#   3. Builds the CLI (pnpm build)
#   4. Symlinks `agentapps` into ~/.local/bin (or $BIN_DIR) and adds that
#      directory to PATH in your shell rc file if it is not there yet
#   5. Configures shell tab-completion (bash/zsh)
#
# It never uses sudo and never stops to ask a question.
#
# Requirements: node 24 or 26 (26 recommended; others warn), git, and pnpm. If
# pnpm is not installed, corepack (bundled with Node) links it into $BIN_DIR.
#
# Environment:
#   AGENTAPPS_DIR  where to clone the repo (default: ~/agent-apps)
#   BIN_DIR        where to symlink `agentapps` (default: ~/.local/bin), e.g.
#                  BIN_DIR=/usr/local/bin ./install.sh. Must be writable by you.

set -euo pipefail

REPO_URL="git@github.com:agentapps/agentapps.git"
INSTALL_DIR="${AGENTAPPS_DIR:-$HOME/agent-apps}"
BIN_DIR="${BIN_DIR:-$HOME/.local/bin}"
# PATH as the user's shell has it; the script itself may add BIN_DIR below.
USER_PATH="$PATH"

# The pnpm version is pinned in package.json (packageManager). Let corepack
# download it without asking: unanswered, its prompt silently skips the command.
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
# Hide pnpm's "Update available" box: the pinned version is the one to use.
export npm_config_update_notifier=false

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

info()  { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
ok()    { printf '\033[1;32m OK\033[0m %s\n' "$*"; }
warn()  { printf '\033[1;33mWRN\033[0m %s\n' "$*" >&2; }
fail()  { printf '\033[1;31mERR\033[0m %s\n' "$*" >&2; exit 1; }

check_dep() {
  command -v "$1" >/dev/null 2>&1 || fail "$1 is required but not installed.${2:+ $2}"
}

# True when the `pnpm` on PATH is corepack's shim.
pnpm_is_corepack() {
  local pnpm_path
  pnpm_path="$(command -v pnpm)" || return 1
  case "$(node -e 'process.stdout.write(require("fs").realpathSync(process.argv[1]))' "$pnpm_path" 2>/dev/null)" in
    */corepack/*) return 0 ;;
    *) return 1 ;;
  esac
}

# ---------------------------------------------------------------------------
# Preflight
# ---------------------------------------------------------------------------

# What to tell the user when their Node version is the problem.
if [ -s "${NVM_DIR:-$HOME/.nvm}/nvm.sh" ]; then
  NODE_FIX="run 'nvm install 26 && nvm alias default 26', open a new terminal, and run ./install.sh again"
else
  NODE_FIX="install Node 26 as the README shows (Install, step 1), open a new terminal, and run ./install.sh again"
fi

check_dep node "To fix it, $NODE_FIX."
NODE_MAJOR=$(node -e 'process.stdout.write(String(process.versions.node.split(".")[0]))') ||
  fail "node is installed but does not start (see the error above). To fix it, $NODE_FIX."
[ "$NODE_MAJOR" -ge 24 ] || fail "Node $NODE_MAJOR is too old; Agent Apps needs Node 24 or 26. To fix it, $NODE_FIX."
case "$NODE_MAJOR" in
  24|26) ;;
  *) warn "Node $NODE_MAJOR is not tested (CI uses Node 24 and 26). Recommended: $NODE_FIX." ;;
esac

check_dep git

# Make sure the `agentapps` symlink can be created before installing or
# building anything, so a missing permission does not fail at the very end.
if [ ! -d "$BIN_DIR" ]; then
  mkdir -p "$BIN_DIR" 2>/dev/null || true
fi
if [ ! -d "$BIN_DIR" ] || [ ! -w "$BIN_DIR" ]; then
  fail "Cannot write to $BIN_DIR, so the agentapps command cannot be linked there.
    Nothing was installed. Run ./install.sh without BIN_DIR to use ~/.local/bin,
    or set BIN_DIR to a directory you can write to."
fi

# pnpm: use the one on PATH, or link corepack's pnpm into BIN_DIR later.
if command -v pnpm >/dev/null 2>&1; then
  LINK_PNPM=0
elif command -v corepack >/dev/null 2>&1; then
  LINK_PNPM=1
else
  fail "pnpm is not installed, and corepack was not found. Nothing was installed.
    Install pnpm (npm install -g pnpm@10) and run ./install.sh again."
fi

# Shell rc file for PATH and completions (empty if the shell is unknown).
DETECTED_SHELL="$(basename "${SHELL:-/bin/bash}")"
case "$DETECTED_SHELL" in
  zsh) RC_FILE="${ZDOTDIR:-$HOME}/.zshrc" ;;
  # macOS uses .bash_profile, Linux uses .bashrc
  bash) if [ "$(uname)" = "Darwin" ]; then RC_FILE="$HOME/.bash_profile"; else RC_FILE="$HOME/.bashrc"; fi ;;
  *) RC_FILE="" ;;
esac

# ---------------------------------------------------------------------------
# Clone or reuse
# ---------------------------------------------------------------------------

# Are we already inside the repo?
if [ -f "$(pwd)/packages/cli/package.json" ] && grep -q '@agentapps/cli' "$(pwd)/packages/cli/package.json" 2>/dev/null; then
  INSTALL_DIR="$(pwd)"
  info "Already inside agent-apps repo at $INSTALL_DIR"
elif [ -d "$INSTALL_DIR/.git" ]; then
  info "Repo exists at $INSTALL_DIR — pulling latest"
  git -C "$INSTALL_DIR" pull --ff-only
else
  info "Cloning agent-apps into $INSTALL_DIR"
  git clone "$REPO_URL" "$INSTALL_DIR"
fi

cd "$INSTALL_DIR"

# ---------------------------------------------------------------------------
# Install & build
# ---------------------------------------------------------------------------

if [ "$LINK_PNPM" -eq 1 ]; then
  info "pnpm not found; linking corepack's pnpm into $BIN_DIR"
  corepack enable --install-directory "$BIN_DIR" pnpm </dev/null ||
    fail "corepack enable --install-directory $BIN_DIR failed (see the error above)."
  # Also for the scripts pnpm runs (e.g. pretest calls pnpm by name).
  export PATH="$BIN_DIR:$PATH"
fi

# Fetch the pinned pnpm now, so the first pnpm command does not stop to download it.
if pnpm_is_corepack && command -v corepack >/dev/null 2>&1; then
  info "Preparing $(node -p 'require("./package.json").packageManager') through corepack"
  corepack install </dev/null || fail "corepack could not download pnpm (see the error above)."
fi

info "Installing dependencies"
pnpm install --frozen-lockfile --config.confirm-modules-purge=false </dev/null ||
  fail "pnpm install --frozen-lockfile failed (see the pnpm error above).
    If it says pnpm-lock.yaml is out of date, the lockfile in this checkout does
    not match package.json: pull the latest changes or report it. install.sh
    does not rewrite pnpm-lock.yaml for you."
[ -d node_modules ] || fail "pnpm install finished but installed nothing (no node_modules)."

info "Building"
pnpm build </dev/null

# ---------------------------------------------------------------------------
# Symlink
# ---------------------------------------------------------------------------

BIN_TARGET="$INSTALL_DIR/packages/cli/dist/bin.js"
chmod +x "$BIN_TARGET"

ln -sf "$BIN_TARGET" "$BIN_DIR/agentapps"

# Put BIN_DIR on PATH for new shells if it is not there yet. This runs before
# the completions setup so the export comes before the completions line.
PATH_UPDATED=0
case ":$USER_PATH:" in
  *":$BIN_DIR:"*) ;;
  *)
    if [ -n "$RC_FILE" ]; then
      # Write $HOME literally so the line stays readable and portable.
      case "$BIN_DIR" in
        "$HOME"/*) path_entry="\$HOME${BIN_DIR#"$HOME"}" ;;
        *) path_entry="$BIN_DIR" ;;
      esac
      path_line="export PATH=\"$path_entry:\$PATH\""
      if ! grep -qxF "$path_line" "$RC_FILE" 2>/dev/null; then
        printf '\n# agentapps\n%s\n' "$path_line" >> "$RC_FILE"
        info "Added $BIN_DIR to PATH in $RC_FILE"
      fi
      PATH_UPDATED=1
    else
      warn "Add $BIN_DIR to your PATH to use the agentapps command"
    fi
    ;;
esac

# Persist workspace path so the CLI works from any directory.
info "Saving workspace path to ~/.agentapps/config.json"
mkdir -p "$HOME/.agentapps"
cat > "$HOME/.agentapps/config.json" <<JSON
{
  "workspace": "$INSTALL_DIR"
}
JSON

# ---------------------------------------------------------------------------
# Shell completions
# ---------------------------------------------------------------------------

# The CLI writes the script to ~/.agentapps and one guarded line to the rc file
# (and replaces the eval line older versions of this script wrote).
if [ -n "$RC_FILE" ]; then
  if node "$BIN_TARGET" completions install "$DETECTED_SHELL" >/dev/null; then
    info "Tab completion set up in $RC_FILE"
  else
    info "Could not set up completions; run 'agentapps completions install' later"
  fi
else
  info "Unknown shell ($DETECTED_SHELL) — completions are available for bash and zsh: 'agentapps completions install bash'"
fi

# ---------------------------------------------------------------------------
# Verify
# ---------------------------------------------------------------------------

if [ -x "$BIN_DIR/agentapps" ]; then
  echo ""
  ok "Installed successfully!"
  echo ""
  echo "   agentapps apps                          — list available apps"
  echo "   agentapps install app.hello hello       — install the sample app as \"hello\""
  echo "   agentapps hello tools                   — list its tools"
  echo "   agentapps hello tool greet name:World   — call one"
  echo ""
  echo "   Repo: $INSTALL_DIR"
  echo "   After pulling changes: cd $INSTALL_DIR && pnpm build"
  if [ "$PATH_UPDATED" -eq 1 ]; then
    echo ""
    echo "   Open a new terminal so $BIN_DIR is on your PATH and agentapps works."
  elif [ -n "$RC_FILE" ]; then
    echo "   Open a new terminal (or run 'source $RC_FILE') for tab-completion"
  fi
  echo ""
else
  fail "Could not create $BIN_DIR/agentapps"
fi
