#!/usr/bin/env bash
# Install-checks one app of the agentapps monorepo in truly fresh containers.
#
# Usage (from the repo, with everything committed):
#   scripts/agent-skills/create-agent-app/scripts/fresh-container-check.sh <app-dir> [<alias>] [<read-tool> [key:value ...]]
#
# <app-dir> is the app's directory under apps/ (`google-ads`, or `apps/google-ads`); the app id
# is read from its agentapp.json, so it may differ from the directory (`app.google.ads`). The
# alias defaults to the directory name.
#
# For each image (default: ubuntu:24.04 and debian:stable-slim, pulled fresh; override with
# IMAGES="..."), it pipes `git archive HEAD` into a new container over stdin (nothing mounted,
# no host env). As root it only creates a normal user and installs curl, git and certificates.
# As that user, with no sudo, it installs Node 22 with nvm and pnpm through corepack, as the
# README says, then runs: frozen install, build, the app's tests, check-app, and
# `agentapps apps / info / install / tools` plus one read-only tool call if given.
# No secrets go into the container. Prints the image digests and RESULT: PASS|FAIL per image.
set -euo pipefail

APP_DIR="${1:?usage: fresh-container-check.sh <app-dir> [<alias>] [<read-tool> [key:value ...]]}"
APP_DIR="${APP_DIR#apps/}"; APP_DIR="${APP_DIR%/}"
ALIAS="${2:-$APP_DIR}"
shift $(( $# > 2 ? 2 : $# ))
IMAGES="${IMAGES:-ubuntu:24.04 debian:stable-slim}"

ROOT="$(git rev-parse --show-toplevel)"
MANIFEST="$ROOT/apps/$APP_DIR/agentapp.json"
[ -f "$MANIFEST" ] || { echo "No $MANIFEST: pass the app's directory under apps/" >&2; exit 2; }
APP_ID="$(node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).id)' "$MANIFEST")"
echo "app: apps/$APP_DIR, id $APP_ID, alias $ALIAS"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

git -C "$ROOT" archive --format=tar --prefix=agentapps/ HEAD > "$WORK/src.tar"
printf '%s\n' "$APP_DIR" > "$WORK/app_dir"
printf '%s\n' "$APP_ID" > "$WORK/app_id"
printf '%s\n' "$ALIAS" > "$WORK/alias"
printf '%s\n' "$@" > "$WORK/tool_call"

cat > "$WORK/user.sh" <<'EOS'
set -uo pipefail
export CI=true COREPACK_ENABLE_DOWNLOAD_PROMPT=0 PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
APP_DIR="$(cat /payload/app_dir)"; APP_ID="$(cat /payload/app_id)"; ALIAS="$(cat /payload/alias)"
mapfile -t TOOL_CALL < /payload/tool_call
fail=0
step() { echo; echo "\$ $*"; "$@" || { echo "!!! FAILED: $*"; fail=1; }; }

# Node the way the README says: nvm for the current user, then Node 22.
curl -fsSL -o /tmp/nvm-install.sh https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh
bash /tmp/nvm-install.sh >/dev/null 2>&1
export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"
nvm install 22 >/dev/null 2>&1
echo "node $(node -v), user $(id -un), sudo: $(command -v sudo || echo none)"
step corepack enable

mkdir -p "$HOME/work" && tar -xf /payload/src.tar -C "$HOME/work" && cd "$HOME/work/agentapps"
AA=(node "$HOME/work/agentapps/packages/cli/dist/bin.js")
step pnpm install --frozen-lockfile
step pnpm build
step pnpm vitest run "apps/$APP_DIR"
step node packages/create/dist/cli.js check-app "apps/$APP_DIR"
step sh -c "node packages/cli/dist/bin.js apps | grep -F '$APP_ID'"
step "${AA[@]}" info "$APP_ID"
step "${AA[@]}" install "$APP_ID" "$ALIAS"
step "${AA[@]}" "$ALIAS" tools
if [ -n "${TOOL_CALL[0]:-}" ]; then step "${AA[@]}" "$ALIAS" tool "${TOOL_CALL[@]}"; fi
echo; [ $fail = 0 ] && echo "RESULT: PASS" || echo "RESULT: FAIL"
exit $fail
EOS

cat > "$WORK/root.sh" <<'EOS'
set -eu
# Read the payload from stdin before anything else can consume it.
mkdir /payload && tar -x -C /payload
apt-get update -qq >/dev/null
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends \
  curl ca-certificates git xz-utils >/dev/null
useradd -m -s /bin/bash dev
chown -R dev /payload
exec su - dev -c 'bash /payload/user.sh'
EOS

tar -cf "$WORK/payload.tar" -C "$WORK" src.tar user.sh app_dir app_id alias tool_call

status=0
for img in $IMAGES; do
  echo "##### $img"
  docker pull -q "$img" >/dev/null
  echo "digest: $(docker image inspect --format '{{index .RepoDigests 0}}' "$img")"
  docker run --rm -i "$img" bash -c "$(cat "$WORK/root.sh")" < "$WORK/payload.tar" || status=1
done
exit $status
