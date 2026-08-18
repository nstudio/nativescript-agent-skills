#!/usr/bin/env bash
# skillgrade "command" agent: runs Claude Code non-interactively on the prompt
# piped to stdin and keeps the full tool transcript in .agent-log/ so graders
# can verify which skills the agent actually loaded (the built-in `claude`
# adapter only keeps the final answer).
#
#   SKILLGRADE_CLAUDE_MODEL   model alias/id passed to `claude --model` (default: sonnet)
#   SKILLGRADE_MAX_TURNS      optional cap passed to `claude --max-turns`
set -uo pipefail

mkdir -p .agent-log
model="${SKILLGRADE_CLAUDE_MODEL:-sonnet}"
args=(-p --dangerously-skip-permissions --model "$model" --output-format stream-json --verbose)
if [[ -n "${SKILLGRADE_MAX_TURNS:-}" ]]; then args+=(--max-turns "$SKILLGRADE_MAX_TURNS"); fi

# stdin (the prompt) is inherited by claude
claude "${args[@]}" > .agent-log/stream.jsonl 2> .agent-log/stderr.log
code=$?

# Print the final assistant text so skillgrade's session log stays readable.
node - <<'JS'
const fs = require('fs');
let out = '';
for (const line of fs.readFileSync('.agent-log/stream.jsonl', 'utf8').split('\n')) {
  if (!line.trim()) continue;
  try { const o = JSON.parse(line); if (o.type === 'result') out = o.result || ''; } catch {}
}
process.stdout.write(out + '\n');
JS
if [[ $code -ne 0 ]]; then cat .agent-log/stderr.log >&2; fi
exit $code
