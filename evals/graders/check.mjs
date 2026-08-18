#!/usr/bin/env node
// Generic skillgrade deterministic grader.
//   node check.mjs <task-name>        (cwd = the agent's workspace)
// Runs the task's `checks` from ../tasks.mjs plus one automatic check that
// the expected skill was actually loaded (read from .agent-log/stream.jsonl,
// written by evals/agent/claude-cli.sh). SKILLGRADE_BASELINE=1 drops the
// skill-usage check so the same task grades a no-skills control run.
import fs from 'node:fs';
import path from 'node:path';
import { execSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { tasks } from '../tasks.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const ws = process.cwd();
const taskName = process.argv[2];
const task = tasks.find((t) => t.name === taskName);
if (!task) {
  console.log(JSON.stringify({ score: 0, details: `unknown task ${taskName}` }));
  process.exit(0);
}

const SKIP = new Set(['node_modules', '.git', '.agent-log', '.claude', '.agents', 'tests', 'prompts', 'environment']);

function read(rel) {
  try { return fs.readFileSync(path.join(ws, rel), 'utf8'); } catch { return null; }
}
function* walk(dir) {
  let entries = [];
  try { entries = fs.readdirSync(path.join(ws, dir), { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (SKIP.has(e.name)) continue;
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(rel);
    else if (/\.(ts|mts|js|mjs|html|css|scss|json|xml|plist|md|sh|txt|gitignore)$/.test(e.name) || e.name.startsWith('.')) yield rel;
  }
}
function grepDir(dir, re) {
  for (const f of walk(dir)) { const s = read(f); if (s && re.test(s)) return f; }
  return null;
}
async function sh(cmd) {
  const r = spawnSync('bash', ['-lc', cmd], { cwd: ws, encoding: 'utf8', timeout: 180_000, env: process.env });
  return { code: r.status ?? 1, out: (r.stdout || '') + (r.stderr || '') };
}
// Runs a TypeScript snippet inside the workspace (Node ≥ 22.7 type stripping);
// the snippet must console.log one JSON value as its last line.
async function runTs(code) {
  const file = path.join(ws, `.grader-run-${process.pid}.mts`);
  fs.writeFileSync(file, code);
  try {
    const r = spawnSync(process.execPath, ['--experimental-transform-types', '--no-warnings', file], { cwd: ws, encoding: 'utf8', timeout: 120_000 });
    if (r.status !== 0) return { ok: false, error: (r.stderr || r.stdout || 'exit ' + r.status).trim() };
    const lines = r.stdout.trim().split('\n');
    return { ok: true, value: JSON.parse(lines[lines.length - 1]) };
  } catch (e) {
    return { ok: false, error: String(e) };
  } finally {
    try { fs.unlinkSync(file); } catch {}
  }
}
const fixtureFile = (rel) => path.join(here, '..', 'fixtures', rel);

function skillUsage() {
  const log = read('.agent-log/stream.jsonl');
  if (log == null) return { passed: false, message: 'no .agent-log/stream.jsonl (agent wrapper not used?)' };
  let viaSkillTool = false, viaRead = false, others = new Set();
  for (const line of log.split('\n')) {
    if (!line.trim()) continue;
    let o; try { o = JSON.parse(line); } catch { continue; }
    const content = o?.message?.content;
    if (!Array.isArray(content)) continue;
    for (const c of content) {
      if (c.type !== 'tool_use') continue;
      const inp = c.input || {};
      if (c.name === 'Skill') {
        if (inp.skill === task.skill || (inp.skill || '').endsWith(':' + task.skill)) viaSkillTool = true; else others.add(inp.skill);
      }
      const p = inp.file_path || inp.path || inp.command || '';
      if (typeof p === 'string' && p.includes(`skills/${task.skill}/`)) viaRead = true;
    }
  }
  const passed = viaSkillTool || viaRead;
  const how = viaSkillTool ? 'Skill tool' : viaRead ? 'read SKILL.md' : 'not loaded';
  const extra = others.size ? ` (other skills: ${[...others].join(', ')})` : '';
  return { passed, message: `${task.skill}: ${how}${extra}` };
}

const results = [];
const ctx = { ws, read, sh, runTs, grepDir, fixtureFile };
for (const c of task.checks) {
  const weight = c.weight ?? 1;
  let passed = false, message = '';
  try {
    if (c.custom) {
      ({ passed, message } = await c.custom(ctx));
    } else if (c.files) {
      const missing = c.files.filter((f) => !fs.existsSync(path.join(ws, f)));
      passed = missing.length === 0; message = missing.length ? `missing ${missing.join(', ')}` : 'all present';
    } else if (c.dir) {
      if (c.match) { const f = grepDir(c.dir, c.match); passed = !!f; message = f ? `in ${f}` : 'no match'; }
      if (c.notMatch) { const f = grepDir(c.dir, c.notMatch); passed = !f; message = f ? `found in ${f}` : 'clean'; }
    } else if (c.file) {
      const s = read(c.file);
      if (s == null) { passed = false; message = `${c.file} missing`; }
      else if (c.match && c.notMatch) { passed = c.match.test(s) && !c.notMatch.test(s); message = passed ? 'ok' : (!c.match.test(s) ? 'pattern missing' : 'forbidden pattern present'); }
      else if (c.match) { passed = c.match.test(s); message = passed ? 'ok' : 'pattern missing'; }
      else if (c.notMatch) { passed = !c.notMatch.test(s); message = passed ? 'clean' : 'forbidden pattern present'; }
      else { passed = true; message = 'exists'; }
    }
  } catch (e) {
    passed = false; message = `check error: ${String(e).slice(0, 200)}`;
  }
  results.push({ name: c.name, passed, message, weight });
}

const baseline = process.env.SKILLGRADE_BASELINE === '1';
const contentTotal = results.reduce((s, r) => s + r.weight, 0);
const contentScore = results.reduce((s, r) => s + (r.passed ? r.weight : 0), 0) / (contentTotal || 1);
let score = contentScore;
if (!baseline) {
  const u = skillUsage();
  results.unshift({ name: `skill loaded (${task.skill})`, passed: u.passed, message: u.message, weight: 0 });
  // Skill discovery is 25% of the reward; outcome quality is the rest.
  score = 0.25 * (u.passed ? 1 : 0) + 0.75 * contentScore;
}
// Keep the workspace (minus node_modules) + transcript for post-hoc inspection;
// skillgrade deletes the temp dir right after grading. Disable with SKILLGRADE_KEEP_WORKSPACES=0.
if (process.env.SKILLGRADE_KEEP_WORKSPACES !== '0') {
  try {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const dest = path.join(here, '..', 'results', 'workspaces', baseline ? 'baseline' : 'skills', taskName, `${stamp}-${process.pid}`);
    fs.mkdirSync(dest, { recursive: true });
    fs.cpSync(ws, dest, { recursive: true, filter: (src) => !/\/(node_modules|\.git)(\/|$)/.test(src) });
    fs.writeFileSync(path.join(dest, 'GRADE.json'), JSON.stringify({ task: taskName, baseline, score, results }, null, 2));
  } catch {}
}
const passedN = results.filter((r) => r.passed).length;
console.log(JSON.stringify({
  score: Math.round(score * 1000) / 1000,
  details: `${passedN}/${results.length} checks; outcome ${(contentScore * 100).toFixed(0)}%${baseline ? ' (baseline, no skill check)' : ''}`,
  checks: results.map(({ name, passed, message }) => ({ name, passed, message })),
}));
