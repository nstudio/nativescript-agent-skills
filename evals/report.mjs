#!/usr/bin/env node
// Aggregate skillgrade result JSONs into a Markdown report.
//   node evals/report.mjs [--json] [--out docs/EVALUATION-results.md]
// Reads evals/results/nativescript-agent-skills/results/*.json (skills on)
// and evals/results/baseline/results/*.json (skills off) — latest file per task.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tasks } from './tasks.mjs';
import { collect } from './lib/results.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const rows = collect();

if (process.argv.includes('--json')) { console.log(JSON.stringify(rows, null, 2)); process.exit(0); }

const pct = (x) => `${Math.round(x * 100)}%`;
let md = `## skillgrade results\n\n`;
const withS = rows.filter((r) => r.s), withB = rows.filter((r) => r.b);
if (withS.length) {
  const overall = withS.reduce((a, r) => a + r.s.mean, 0) / withS.length;
  const loadRate = withS.reduce((a, r) => a + r.s.loaded, 0) / Math.max(1, withS.reduce((a, r) => a + r.s.loadedN, 0));
  md += `Tasks: ${withS.length}/${tasks.length} · trials/task: ${withS[0].s.n} · mean reward **${overall.toFixed(2)}** · skill discovered in **${pct(loadRate)}** of trials`;
  if (withB.length) {
    const ob = withB.reduce((a, r) => a + r.b.mean, 0) / withB.length;
    md += ` · baseline (no skills) mean **${ob.toFixed(2)}**`;
  }
  md += `\n\n| task | skill | reward (skills) | pass | loaded | baseline (no skills) | Δ outcome | avg s |\n|---|---|---|---|---|---|---|---|\n`;
  for (const r of rows) {
    if (!r.s) { md += `| ${r.task} | \`${r.skill}\` | — | | | | | |\n`; continue; }
    // outcome-only score for a fair Δ: skills reward = 0.25*loaded + 0.75*outcome
    const outcomeS = r.s.loadedN ? (r.s.mean - 0.25 * (r.s.loaded / r.s.loadedN)) / 0.75 : r.s.mean;
    const delta = r.b ? outcomeS - r.b.mean : null;
    md += `| ${r.task} | \`${r.skill}\` | ${r.s.mean.toFixed(2)} | ${r.s.passed}/${r.s.n} | ${r.s.loaded}/${r.s.loadedN} | ${r.b ? r.b.mean.toFixed(2) : '—'} | ${delta == null ? '—' : (delta >= 0 ? '+' : '') + delta.toFixed(2)} | ${r.s.dur.toFixed(0)} |\n`;
  }
  md += `\nReward = 0.25 × (skill loaded) + 0.75 × (weighted outcome checks). "Δ outcome" compares outcome checks only, skills on vs. off.\n`;
  const weak = [];
  for (const r of rows) {
    if (!r.s) continue;
    for (const [name, c] of Object.entries(r.s.checks)) if (c.pass < c.n) weak.push({ task: r.task, name, ...c });
  }
  if (weak.length) {
    md += `\n### Checks that did not always pass (skills on)\n\n| task | check | pass | example |\n|---|---|---|---|\n`;
    for (const w of weak) md += `| ${w.task} | ${w.name} | ${w.pass}/${w.n} | ${(w.msgs[0] || '').replace(/\|/g, '\\|').slice(0, 90)} |\n`;
  }
}
const out = process.argv[process.argv.indexOf('--out') + 1];
if (process.argv.includes('--out') && out) { fs.writeFileSync(path.join(root, out), md); console.log(`wrote ${out}`); } else console.log(md);
