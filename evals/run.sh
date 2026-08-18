#!/usr/bin/env bash
# Run the skillgrade suite.
#   evals/run.sh [--baseline] [skillgrade args…]
# Examples:
#   evals/run.sh --smoke --grader=deterministic --parallel=4
#   evals/run.sh --eval=haptics-direct --trials=1
#   evals/run.sh --baseline --trials=2 --grader=deterministic
# Env: SKILLGRADE_CLAUDE_MODEL (default sonnet), ANTHROPIC_API_KEY (enables llm_rubric graders).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export SKILLGRADE_REPO="$ROOT"
node "$ROOT/evals/build.mjs" >/dev/null
if [[ "${1:-}" == "--baseline" ]]; then
  shift; export SKILLGRADE_BASELINE=1; cd "$ROOT/evals/baseline"
else
  cd "$ROOT"
fi
exec skillgrade --provider=local --output="$ROOT/evals/results" "$@"
