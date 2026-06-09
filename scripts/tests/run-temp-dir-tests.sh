#!/usr/bin/env bash
set -u

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR" || exit 1

failures=0

section() {
  printf '\n== %s ==\n' "$1"
}

pass() {
  printf '[PASS] %s\n' "$1"
}

fail() {
  printf '[FAIL] %s\n' "$1"
  failures=$((failures + 1))
}

skip() {
  printf '[SKIP] %s\n' "$1"
}

run_required() {
  local name="$1"
  shift

  section "$name"
  "$@"
  local status=$?
  if [ "$status" -eq 0 ]; then
    pass "$name"
  else
    fail "$name (exit $status)"
  fi
}

assert_contains() {
  local name="$1"
  local file="$2"
  local pattern="$3"

  if grep -Fq "$pattern" "$file"; then
    pass "$name"
  else
    fail "$name"
    printf '  expected pattern: %s\n' "$pattern"
    printf '  file: %s\n' "$file"
  fi
}

assert_not_contains() {
  local name="$1"
  local file="$2"
  local pattern="$3"

  if grep -Fq "$pattern" "$file"; then
    fail "$name"
    printf '  unexpected pattern: %s\n' "$pattern"
    printf '  file: %s\n' "$file"
  else
    pass "$name"
  fi
}

section "Required behavior tests"
if command -v node >/dev/null 2>&1; then
  run_required \
    "shared getCcrTempDir returns a per-user temp directory" \
    node scripts/tests/ccr-temp-dir.test.mjs
else
  fail "node is required to run scripts/tests/ccr-temp-dir.test.mjs"
fi

section "Required source checks"
assert_contains \
  "shared helper is exported from constants" \
  "packages/shared/src/constants.ts" \
  "export const getCcrTempDir = (): string => {"

assert_contains \
  "shared helper uses uid-based temp directory on POSIX" \
  "packages/shared/src/constants.ts" \
  'typeof process.getuid === "function"'

assert_contains \
  "CLI settings path uses shared temp helper" \
  "packages/cli/src/utils/index.ts" \
  "const tempDir = getCcrTempDir();"

assert_contains \
  "CLI settings temp directory is private to the user" \
  "packages/cli/src/utils/index.ts" \
  "await fs.mkdir(tempDir, { recursive: true, mode: 0o700 });"

assert_not_contains \
  "CLI settings path no longer uses shared /tmp/claude-code-router" \
  "packages/cli/src/utils/index.ts" \
  "path.join(os.tmpdir(), 'claude-code-router')"

assert_contains \
  "statusline reads token stats from shared temp helper" \
  "packages/cli/src/utils/statusline.ts" \
  "const tempDir = getCcrTempDir();"

assert_not_contains \
  "statusline no longer reads token stats from shared /tmp/claude-code-router" \
  "packages/cli/src/utils/statusline.ts" \
  "path.join(tmpdir(), 'claude-code-router')"

assert_contains \
  "core temp-file handler defaults to shared temp helper" \
  "packages/core/src/plugins/output/temp-file-handler.ts" \
  "subdirectory: getCcrTempDir(),"

assert_contains \
  "core temp-file handler supports absolute temp paths" \
  "packages/core/src/plugins/output/temp-file-handler.ts" \
  "isAbsolute(subdirectory)"

assert_contains \
  "core temp-file directory is private to the user" \
  "packages/core/src/plugins/output/temp-file-handler.ts" \
  "mkdirSync(this.baseDir, { recursive: true, mode: 0o700 });"

assert_not_contains \
  "token-speed default does not override handler with shared temp directory" \
  "packages/core/src/plugins/token-speed.ts" \
  "subdirectory: 'claude-code-router'"

section "Optional build checks"
if command -v pnpm >/dev/null 2>&1; then
  run_required "build shared package" pnpm --filter @CCR/shared build
  run_required "build CLI package" pnpm --filter @CCR/cli build
  run_required "build core package" pnpm --filter @musistudio/llms build
else
  skip "pnpm not found; skipping package build checks"
fi

section "Summary"
if [ "$failures" -eq 0 ]; then
  printf 'All required checks passed.\n'
  exit 0
fi

printf '%s required check(s) failed.\n' "$failures"
exit 1
