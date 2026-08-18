#!/usr/bin/env node
// Static checks for skills/*/SKILL.md against the Agent Skills spec
// (agentskills.io/specification) plus house rules. No LLM, runs anywhere.
//   node evals/lint-skills.mjs            → human report, exit 1 on errors
//   node evals/lint-skills.mjs --json     → machine-readable
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const skillsDir = path.join(root, 'skills');
const dirs = fs.readdirSync(skillsDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
const names = new Set(dirs);

const NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const report = [];

function parseFrontmatter(src) {
  const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { fm: null, body: src };
  const fm = {};
  let key = null;
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z_-]+):\s*(.*)$/);
    if (kv && !line.startsWith(' ')) { key = kv[1]; fm[key] = kv[2].replace(/^['"]|['"]$/g, ''); }
    else if (key && line.startsWith(' ')) fm[key] = (fm[key] ? fm[key] + '\n' : '') + line.trim();
  }
  return { fm, body: src.slice(m[0].length) };
}

for (const dir of dirs) {
  const file = path.join(skillsDir, dir, 'SKILL.md');
  const errors = [], warnings = [], info = {};
  if (!fs.existsSync(file)) { report.push({ skill: dir, errors: ['no SKILL.md'], warnings, info }); continue; }
  const src = fs.readFileSync(file, 'utf8');
  const { fm, body } = parseFrontmatter(src);
  if (!fm) errors.push('missing YAML frontmatter');
  const name = fm?.name, desc = fm?.description;
  if (!name) errors.push('frontmatter: name missing');
  else {
    if (name !== dir) errors.push(`name "${name}" ≠ directory "${dir}"`);
    if (!NAME_RE.test(name)) errors.push('name must be lowercase alphanumerics + single hyphens');
    if (name.length > 64) errors.push(`name ${name.length} chars > 64`);
  }
  if (!desc) errors.push('frontmatter: description missing');
  else {
    if (desc.length > 1024) errors.push(`description ${desc.length} chars > 1024`);
    if (desc.length < 60) warnings.push(`description short (${desc.length} chars) — say what AND when`);
    if (!/^Use when/i.test(desc) && !/\bwhen\b/i.test(desc)) warnings.push('description does not state when to use it');
  }
  const allowed = new Set(['name', 'description', 'license', 'compatibility', 'metadata', 'allowed-tools']);
  for (const k of Object.keys(fm || {})) if (!allowed.has(k)) warnings.push(`frontmatter key "${k}" is not in the spec (put custom keys under metadata)`);
  if (fm && !fm.license) info.license = 'none (add license: for distribution)';

  const lines = body.split('\n').length;
  const tokens = Math.round(src.length / 4);
  info.lines = lines; info.bytes = src.length; info.approxTokens = tokens;
  if (lines > 500) errors.push(`body ${lines} lines > 500`);
  if (tokens > 5000) warnings.push(`~${tokens} tokens > 5000 guidance`);

  // cross references to sibling skills
  const refs = [...body.matchAll(/`(ns-[a-z0-9-]+)`/g)].map((m) => m[1]).filter((r) => r !== name);
  // element selectors like `ns-panel` are not skill refs — real names have ≥2 hyphens
  const unresolved = [...new Set(refs)].filter((r) => !names.has(r) && (r.match(/-/g) || []).length >= 2);
  info.crossRefs = [...new Set(refs)];
  if (unresolved.length) errors.push(`references unknown skills: ${unresolved.join(', ')}`);

  // provenance markers
  info.verified = /verified/i.test(body);
  if (!info.verified && !/sanity checks? that passed|cross-check|matched/i.test(body)) warnings.push('no "Verified …" / provenance line');
  info.untestedMarks = (body.match(/untested/gi) || []).length;

  // code blocks
  info.codeBlocks = (body.match(/^```/gm) || []).length / 2;
  if (info.codeBlocks === 0) warnings.push('no code blocks (skills here are code-first)');
  if (/\t/.test(body)) warnings.push('contains tab characters');
  // stub markers inside code (elided code the agent cannot run)
  if (/^\s*#?\s*…\s*$|\/\* … \*\/|# .*… *$/m.test(body)) warnings.push('code block contains an elided "…" section');
  // external files referenced but not shipped
  const extFiles = [...body.matchAll(/(?:assets\/)?(?:patches|scripts|references)\/[^\s`)]+/g)].map((m) => m[0]);
  for (const f of new Set(extFiles)) if (!fs.existsSync(path.join(skillsDir, dir, f))) warnings.push(`mentions "${f}" which is not bundled with the skill`);
  const supporting = fs.readdirSync(path.join(skillsDir, dir)).filter((f) => f !== 'SKILL.md');
  info.supportingFiles = supporting;

  report.push({ skill: dir, errors, warnings, info });
}

const totalErr = report.reduce((n, r) => n + r.errors.length, 0);
const totalWarn = report.reduce((n, r) => n + r.warnings.length, 0);
if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ skills: report, errors: totalErr, warnings: totalWarn }, null, 2));
} else {
  for (const r of report) {
    const status = r.errors.length ? '✗' : r.warnings.length ? '△' : '✓';
    console.log(`${status} ${r.skill}  (${r.info.lines} lines, ~${r.info.approxTokens} tok${r.info.verified ? ', verified' : ''}${r.info.untestedMarks ? `, ${r.info.untestedMarks} untested marks` : ''})`);
    for (const e of r.errors) console.log(`    error: ${e}`);
    for (const w of r.warnings) console.log(`    warn:  ${w}`);
  }
  console.log(`\n${report.length} skills, ${totalErr} errors, ${totalWarn} warnings`);
}
process.exitCode = totalErr ? 1 : 0;
