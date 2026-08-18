// Shared aggregation of skillgrade result JSONs (latest file per task).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tasks } from '../tasks.mjs';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const dirs = { skills: path.join(root, 'evals/results/nativescript-agent-skills/results'), baseline: path.join(root, 'evals/results/baseline/results') };

export function latestPerTask(dir) {
  const out = {};
  if (!fs.existsSync(dir)) return out;
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
    const r = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    out[r.task] = { ...r, file: f };            // sorted by timestamp → last wins
  }
  return out;
}
export function summarize(r) {
  const trials = r.trials || [];
  const rewards = trials.map((t) => t.reward ?? 0);
  const mean = rewards.reduce((a, b) => a + b, 0) / (rewards.length || 1);
  const passed = rewards.filter((x) => x >= 0.5).length;
  const checks = {};
  let loaded = 0, loadedN = 0;
  for (const t of trials) {
    for (const g of t.grader_results || []) {
      if (g.grader_type !== 'deterministic') continue;
      for (const line of g.details.split('\n').slice(1)) {
        const m = line.match(/^\s*([✓✗])\s+(.+?):\s*(.*)$/);
        if (!m) continue;
        const ok = m[1] === '✓';
        if (m[2].startsWith('skill loaded')) { loadedN++; if (ok) loaded++; continue; }
        checks[m[2]] ??= { pass: 0, n: 0, msgs: [] };
        checks[m[2]].n++; if (ok) checks[m[2]].pass++; else checks[m[2]].msgs.push(m[3]);
      }
    }
  }
  const dur = trials.map((t) => t.duration_ms || 0).reduce((a, b) => a + b, 0) / (trials.length || 1) / 1000;
  return { n: trials.length, mean, passed, checks, loaded, loadedN, dur };
}


export function collect() {
  const S = latestPerTask(dirs.skills), B = latestPerTask(dirs.baseline);
  return tasks.map((t) => ({ task: t.name, skill: t.skill, s: S[t.name] ? summarize(S[t.name]) : null, b: B[t.name] ? summarize(B[t.name]) : null }));
}
