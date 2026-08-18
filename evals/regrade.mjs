#!/usr/bin/env node
// Re-score saved trial workspaces with the current graders and rewrite the
// rewards in the latest result file for each task. Use after tightening or
// relaxing a check so results reflect the grader you ship, without paying
// for another agent run (the workspaces are the agent's actual output).
//   node evals/regrade.mjs [--baseline] [task ...]
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baseline = process.argv.includes('--baseline');
const only = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const wsRoot = path.join(root, 'evals/results/workspaces', baseline ? 'baseline' : 'skills');
const resDir = path.join(root, 'evals/results', baseline ? 'baseline' : 'nativescript-agent-skills', 'results');
const env = { ...process.env, SKILLGRADE_REPO: root, SKILLGRADE_KEEP_WORKSPACES: '0', ...(baseline ? { SKILLGRADE_BASELINE: '1' } : {}) };

for (const task of fs.readdirSync(wsRoot).sort()) {
  if (only.length && !only.includes(task)) continue;
  const files = fs.readdirSync(resDir).filter((f) => f.startsWith(task + '_') && f.endsWith('.json')).sort();
  if (!files.length) { console.log(`${task}: no result file`); continue; }
  const resPath = path.join(resDir, files[files.length - 1]);
  const report = JSON.parse(fs.readFileSync(resPath, 'utf8'));
  // newest N workspaces belong to the newest result file (older runs keep their snapshots)
  const all = fs.readdirSync(path.join(wsRoot, task)).sort();
  const runs = all.slice(-report.trials.length);
  if (runs.length !== report.trials.length) { console.log(`${task}: ${all.length} workspaces vs ${report.trials.length} trials — skipped`); continue; }
  const before = report.trials.map((t) => t.reward);
  runs.forEach((run, i) => {
    const r = spawnSync(process.execPath, [path.join(root, 'evals/graders/check.mjs'), task], { cwd: path.join(wsRoot, task, run), encoding: 'utf8', env });
    const out = JSON.parse(r.stdout.match(/\{[\s\S]*\}/)[0]);
    const trial = report.trials[i];
    const g = trial.grader_results.find((x) => x.grader_type === 'deterministic');
    if (g) { g.score = out.score; g.details = `${out.details}\n${out.checks.map((c) => `  ${c.passed ? '✓' : '✗'} ${c.name}: ${c.message || ''}`).join('\n')}`; }
    trial.reward = out.score;
    fs.writeFileSync(path.join(wsRoot, task, run, 'GRADE.json'), JSON.stringify({ task, baseline, score: out.score, results: out.checks }, null, 2));
  });
  const n = report.trials.length, ok = report.trials.filter((t) => t.reward >= 0.5).length;
  report.pass_rate = report.trials.reduce((a, t) => a + t.reward, 0) / n;
  report.pass_at_k = 1 - Math.pow(1 - ok / n, n); report.pass_pow_k = Math.pow(ok / n, n);
  report.regraded_at = new Date().toISOString();
  fs.writeFileSync(resPath, JSON.stringify(report, null, 2));
  console.log(`${task}: ${before.map((x) => x.toFixed(2)).join(' ')} → ${report.trials.map((t) => t.reward.toFixed(2)).join(' ')}`);
}
