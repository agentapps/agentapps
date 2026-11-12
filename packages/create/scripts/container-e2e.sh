#!/usr/bin/env bash
# End-to-end check of @agentapps/create as an outside author would use it, in fresh containers.
#
# Usage (from the repo root, after `pnpm build`):
#   packages/create/scripts/container-e2e.sh
#
# Packs @agentapps/protocol, sdk, station, host, cli and create and pipes the tarballs into new
# ubuntu:24.04 and debian:stable-slim containers (pulled fresh, nothing mounted; override with
# IMAGES="..."). As root the container only creates a normal user and installs curl, git and
# certificates; as that user, with no sudo, it installs Node 22 with nvm, starts a local npm
# registry (verdaccio) holding the tarballs and proxying everything else to npmjs (standing in
# for "after publishing"), and checks:
#   - `npm create @agentapps weather` installs, formats, and warns that the first git commit
#     failed (no git identity yet); AGENTS.md, CLAUDE.md, .gemini/settings.json and the skill
#     in .agents/skills and .claude/skills are there, without the monorepo-only reference;
#   - npm test, typecheck, lint and check pass; `check-app --strict` fails on the scaffold's
#     TODOs; `npx agentapps` is the real CLI and installs the app; `npm pack --dry-run` ships
#     no tests and no skill folders;
#   - with a git identity, the first commit includes package-lock.json;
#   - `pnpm create @agentapps` works, its project passes test and check (check-app's verdict
#     printed), and `pnpm run check` fails on an app with a missing annotation.
# Prints the image digests and RESULT: PASS|FAIL per image.
set -euo pipefail

IMAGES="${IMAGES:-ubuntu:24.04 debian:stable-slim}"
ROOT="$(git rev-parse --show-toplevel)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

mkdir "$WORK/tgz"
for pkg in protocol sdk station host cli create; do
  (cd "$ROOT/packages/$pkg" && pnpm pack --pack-destination "$WORK/tgz" >/dev/null)
done
ls "$WORK/tgz"

cat > "$WORK/user.sh" <<'EOS'
set -uo pipefail
export CI=true npm_config_update_notifier=false npm_config_fund=false npm_config_audit=false
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
fail=0
step() { echo; echo "\$ $*"; "$@" || { echo "!!! FAILED: $*"; fail=1; }; }
expect_fail() { echo; echo "\$ (expect failure) $*"; if "$@"; then echo "!!! UNEXPECTED SUCCESS: $*"; fail=1; fi; }

curl -fsSL -o /tmp/nvm-install.sh https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh
bash /tmp/nvm-install.sh >/dev/null 2>&1
export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"
nvm install 22 >/dev/null 2>&1
echo "node $(node -v), npm $(npm -v), user $(id -un), sudo: $(command -v sudo || echo none)"

# Local registry: our tarballs, everything else proxied to npmjs.
npm install -g verdaccio@6 > "$HOME/verdaccio-install.log" 2>&1 \
  || { echo "verdaccio install failed"; tail -20 "$HOME/verdaccio-install.log"; }
mkdir -p "$HOME/verdaccio"
cat > "$HOME/verdaccio/config.yaml" <<'YAML'
storage: ./storage
auth:
  htpasswd:
    file: ./htpasswd
    max_users: 100
uplinks:
  npmjs:
    url: https://registry.npmjs.org/
packages:
  '@agentapps/*':
    access: $all
    publish: $authenticated
  '**':
    access: $all
    proxy: npmjs
log: { type: stdout, format: pretty, level: error }
YAML
(cd "$HOME/verdaccio" && nohup verdaccio --config config.yaml --listen 127.0.0.1:4873 >"$HOME/verdaccio/log" 2>&1 &)
for _ in $(seq 1 60); do curl -fs http://127.0.0.1:4873/-/ping >/dev/null && break; sleep 1; done
curl -fs http://127.0.0.1:4873/-/ping >/dev/null && echo "registry up" \
  || { echo "registry not up"; tail -30 "$HOME/verdaccio/log"; }
TOKEN="$(curl -fs -XPUT -H 'content-type: application/json' \
  -d '{"name":"e2e","password":"e2e-pass"}' http://127.0.0.1:4873/-/user/org.couchdb.user:e2e \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).token))')"
echo "token length: ${#TOKEN}"
npm config set registry http://127.0.0.1:4873/
npm config set //127.0.0.1:4873/:_authToken "$TOKEN"
for t in /payload/tgz/*.tgz; do
  npm publish "$t" > "$HOME/publish.log" 2>&1 || { echo "publish failed: $t"; tail -15 "$HOME/publish.log"; fail=1; }
done
echo "published: $(npm view @agentapps/create version) $(npm view @agentapps/cli version)"

mkdir -p "$HOME/projects" && cd "$HOME/projects"

# 1. npm create, no git identity yet.
echo; echo '$ npm create @agentapps@latest weather -- --base-url https://api.open-meteo.com/v1'
npm create @agentapps@latest weather -- --base-url https://api.open-meteo.com/v1 > create.log 2>&1 \
  || { echo "!!! FAILED: npm create"; fail=1; }
tail -15 create.log
step grep -q 'first commit failed' create.log
cd weather || exit 1
step test -f AGENTS.md
step grep -qx '@AGENTS.md' CLAUDE.md
step grep -q AGENTS.md .gemini/settings.json
step test -f .agents/skills/create-agent-app/SKILL.md
step test -f .claude/skills/create-agent-app/SKILL.md
step test ! -e .agents/skills/create-agent-app/references/monorepo.md
step test -f package-lock.json
step npm test
step npm run typecheck
step npm run lint
# check-app must really run (its verdict printed), not just exit 0.
step sh -c 'npm run check 2>&1 | tee "$HOME/check.log"; grep -q "Validation passed" "$HOME/check.log"'
expect_fail npx agentapps-check-app --strict

# The agentapps CLI comes with the project.
step sh -c 'npx agentapps --help | grep -q "install <app-id> <alias>"'
mkdir -p "$HOME/scratch"
printf '{ "apps": [ { "source": "%s" } ] }\n' "$PWD" > "$HOME/scratch/agentapps.json"
step npx agentapps --config "$HOME/scratch/agentapps.json" install app.weather w
step npx agentapps --config "$HOME/scratch/agentapps.json" w tools

# What would be published.
npm pack --dry-run > "$HOME/pack.log" 2>&1
step grep -q 'agentapp.json' "$HOME/pack.log"
step sh -c "! grep -qE 'test/|\\.agents/|\\.claude/' '$HOME/pack.log'"

# 2. With a git identity the first commit is made, lockfile included.
cd "$HOME/projects"
git config --global user.name e2e && git config --global user.email e2e@example.com
step npm create @agentapps@latest committed -- --template minimal
step sh -c 'cd committed && git show --stat HEAD | grep -q package-lock.json'

# 3. pnpm create.
step corepack enable
step pnpm create @agentapps pweather --skip-git
step sh -c 'cd pweather && pnpm test'
step sh -c 'cd pweather && pnpm run check 2>&1 | tee "$HOME/pcheck.log"; grep -q "Validation passed" "$HOME/pcheck.log"'
# A broken app must fail under pnpm too.
sed -i 's/sensitive: false,//' pweather/src/tools/get-example.ts
expect_fail sh -c 'cd pweather && pnpm run check'
step sh -c 'cd pweather && pnpm run check 2>&1 | grep -q "does not declare sensitive"'

echo; [ $fail = 0 ] && echo "RESULT: PASS" || echo "RESULT: FAIL"
exit $fail
EOS

cat > "$WORK/root.sh" <<'EOS'
set -eu
mkdir /payload && tar -x -C /payload
apt-get update -qq >/dev/null
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends \
  curl ca-certificates git >/dev/null
useradd -m -s /bin/bash dev
chown -R dev /payload
exec su - dev -c 'bash /payload/user.sh'
EOS

tar -cf "$WORK/payload.tar" -C "$WORK" tgz user.sh

status=0
for img in $IMAGES; do
  echo "##### $img"
  docker pull -q "$img" >/dev/null
  echo "digest: $(docker image inspect --format '{{index .RepoDigests 0}}' "$img")"
  docker run --rm -i "$img" bash -c "$(cat "$WORK/root.sh")" < "$WORK/payload.tar" || status=1
done
exit $status
