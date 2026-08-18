#!/usr/bin/env node
// nativescript-agent-skills — vendor the skills into a project (or globally)
// and keep the copies updatable.
//
//   npx @nstudio/nativescript-agent-skills install [--agent claude,agents,cursor,…] [--global] [--only a,b] [--dir path]
//   npx @nstudio/nativescript-agent-skills update  [--force]
//   npx @nstudio/nativescript-agent-skills check
//   npx @nstudio/nativescript-agent-skills list
//
// Copies (never symlinks) skills/<name>/ into each agent's skills directory and
// writes a manifest (.nativescript-agent-skills.json) with the package version
// and a content hash per file. `update` re-copies from the currently resolved
// package version and refuses to overwrite files you edited locally unless
// --force is given. Zero dependencies; Node ≥ 18.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(pkgRoot, 'package.json'), 'utf8'));
const SKILLS_SRC = path.join(pkgRoot, 'skills');
const MANIFEST = '.nativescript-agent-skills.json';

// Where each agent looks for skills, relative to the project root (or $HOME with --global).
// `agents` is the cross-agent convention (.agents/skills) read by Cursor, Codex, Copilot,
// Gemini CLI, OpenCode, Amp and others; use it when you are unsure.
const AGENT_DIRS = {
  claude: '.claude/skills',
  agents: '.agents/skills',
  cursor: '.cursor/skills',
  codex: '.codex/skills',
  copilot: '.github/skills',
  gemini: '.gemini/skills',
  windsurf: '.windsurf/skills',
  opencode: '.opencode/skills',
};

const argv = process.argv.slice(2);
const cmd = argv.find((a) => !a.startsWith('-')) || 'help';
const flag = (name) => argv.includes(`--${name}`);
const opt = (name) => { const i = argv.findIndex((a) => a === `--${name}` || a.startsWith(`--${name}=`)); if (i < 0) return null; const a = argv[i]; return a.includes('=') ? a.slice(a.indexOf('=') + 1) : argv[i + 1]; };
const list = (v) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : []);

const root = flag('global') ? os.homedir() : process.cwd();
const manifestPath = path.join(root, MANIFEST);
const readManifest = () => (fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : null);
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16);

function* walk(dir, rel = '') {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const r = path.join(rel, e.name);
    if (e.isDirectory()) yield* walk(path.join(dir, e.name), r); else yield r;
  }
}
const allSkills = () => fs.readdirSync(SKILLS_SRC, { withFileTypes: true }).filter((d) => d.isDirectory() && fs.existsSync(path.join(SKILLS_SRC, d.name, 'SKILL.md'))).map((d) => d.name).sort();
const describe = (name) => (fs.readFileSync(path.join(SKILLS_SRC, name, 'SKILL.md'), 'utf8').match(/^description:\s*(.+)$/m) || [, ''])[1].trim();

function targetsFor(agents, dir) {
  if (dir) return [{ agent: 'custom', dir: path.resolve(root, dir) }];
  return agents.map((a) => {
    if (!AGENT_DIRS[a]) { console.error(`unknown agent "${a}" — known: ${Object.keys(AGENT_DIRS).join(', ')} (or --dir <path>)`); process.exit(2); }
    return { agent: a, dir: path.join(root, AGENT_DIRS[a]) };
  });
}

function copySkill(name, destRoot, files) {
  const src = path.join(SKILLS_SRC, name), dest = path.join(destRoot, name);
  fs.mkdirSync(dest, { recursive: true });
  for (const rel of walk(src)) {
    const buf = fs.readFileSync(path.join(src, rel));
    fs.mkdirSync(path.dirname(path.join(dest, rel)), { recursive: true });
    fs.writeFileSync(path.join(dest, rel), buf);
    files[path.join(name, rel)] = sha(buf);
  }
}

function install({ agents, only, dir, quiet }) {
  const names = only.length ? only : allSkills();
  for (const n of names) if (!fs.existsSync(path.join(SKILLS_SRC, n, 'SKILL.md'))) { console.error(`no such skill: ${n}`); process.exit(2); }
  const targets = targetsFor(agents, dir);
  const manifest = { package: pkg.name, version: pkg.version, installedAt: new Date().toISOString(), targets: [] };
  for (const t of targets) {
    const files = {};
    fs.mkdirSync(t.dir, { recursive: true });
    for (const n of names) copySkill(n, t.dir, files);
    manifest.targets.push({ agent: t.agent, dir: path.relative(root, t.dir) || '.', skills: names, files });
    if (!quiet) console.log(`✓ ${names.length} skills → ${path.relative(process.cwd(), t.dir) || t.dir}`);
  }
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  if (!quiet) console.log(`  manifest: ${path.relative(process.cwd(), manifestPath)} (v${pkg.version})`);
}

function drift(m) {
  // returns [{target, file, state: 'modified'|'missing'|'stale'|'new'}]
  const out = [];
  for (const t of m.targets) {
    const base = path.join(root, t.dir);
    for (const [rel, hash] of Object.entries(t.files)) {
      const p = path.join(base, rel);
      if (!fs.existsSync(p)) { out.push({ target: t.dir, file: rel, state: 'missing' }); continue; }
      const cur = sha(fs.readFileSync(p));
      const [name, ...rest] = rel.split(path.sep);
      const srcP = path.join(SKILLS_SRC, name, ...rest);
      const upstream = fs.existsSync(srcP) ? sha(fs.readFileSync(srcP)) : null;
      if (cur !== hash) out.push({ target: t.dir, file: rel, state: 'modified' });
      else if (upstream && upstream !== hash) out.push({ target: t.dir, file: rel, state: 'stale' });
      else if (!upstream) out.push({ target: t.dir, file: rel, state: 'removed-upstream' });
    }
    for (const n of t.skills) {
      if (!fs.existsSync(path.join(SKILLS_SRC, n))) continue;
      for (const rel of walk(path.join(SKILLS_SRC, n))) {
        const key = path.join(n, rel);
        if (!(key in t.files)) out.push({ target: t.dir, file: key, state: 'new' });
      }
    }
  }
  return out;
}

function check() {
  const m = readManifest();
  if (!m) { console.log(`no ${MANIFEST} in ${root} — run \`install\` first`); process.exit(1); }
  const d = drift(m);
  console.log(`installed v${m.version}, package v${pkg.version}${m.version !== pkg.version ? '  ← update available' : ''}`);
  if (!d.length) { console.log('✓ vendored copies match the installed package'); return 0; }
  for (const x of d) console.log(`  ${x.state.padEnd(16)} ${x.target}/${x.file}`);
  const modified = d.filter((x) => x.state === 'modified').length;
  console.log(`\n${d.length} difference(s)${modified ? `, ${modified} locally modified (update needs --force to overwrite them)` : ''}`);
  return d.length ? 1 : 0;
}

function update({ force }) {
  const m = readManifest();
  if (!m) { console.log(`no ${MANIFEST} in ${root} — run \`install\` first`); process.exit(1); }
  const modified = drift(m).filter((x) => x.state === 'modified');
  if (modified.length && !force) {
    console.error(`refusing to overwrite ${modified.length} locally modified file(s); re-run with --force or revert them:`);
    for (const x of modified) console.error(`  ${x.target}/${x.file}`);
    process.exit(1);
  }
  const targets = m.targets.map((t) => ({ agent: t.agent, dir: path.join(root, t.dir), skills: t.skills }));
  const manifest = { package: pkg.name, version: pkg.version, installedAt: new Date().toISOString(), targets: [] };
  for (const t of targets) {
    const files = {};
    const names = t.skills.filter((n) => fs.existsSync(path.join(SKILLS_SRC, n, 'SKILL.md')));
    const gone = t.skills.filter((n) => !names.includes(n));
    for (const n of names) copySkill(n, t.dir, files);
    // remove files that no longer exist upstream for skills we manage
    for (const rel of Object.keys(t.files || {})) {
      const [name] = rel.split(path.sep);
      if (names.includes(name) && !(rel in files)) { try { fs.unlinkSync(path.join(t.dir, rel)); } catch {} }
    }
    manifest.targets.push({ agent: t.agent, dir: path.relative(root, t.dir) || '.', skills: names, files });
    console.log(`✓ ${names.length} skills refreshed → ${path.relative(process.cwd(), t.dir) || t.dir}${gone.length ? `  (no longer upstream: ${gone.join(', ')} — left in place)` : ''}`);
  }
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`  ${m.version} → ${pkg.version}`);
}

switch (cmd) {
  case 'install': case 'add':
    install({ agents: list(opt('agent')).length ? list(opt('agent')) : ['claude'], only: list(opt('only')), dir: opt('dir'), quiet: flag('quiet') });
    break;
  case 'update': case 'sync':
    update({ force: flag('force') });
    break;
  case 'check': case 'status':
    process.exit(check());
  case 'list': case 'ls':
    for (const n of allSkills()) console.log(`${n.padEnd(42)} ${describe(n)}`);
    break;
  default:
    console.log(`${pkg.name} v${pkg.version}

  install [--agent claude,agents,cursor,codex,copilot,gemini,windsurf,opencode] [--global] [--only a,b] [--dir path]
          copy the skills into each agent's skills directory (default: claude → .claude/skills)
  update  [--force]   re-copy from the installed package version; keeps your local edits unless --force
  check               show which vendored files are stale / modified / missing
  list                list skills with their descriptions

  Prefer skills.sh?  npx skills add nstudio/nativescript-agent-skills
  Claude Code plugin? /plugin marketplace add nstudio/nativescript-agent-skills`);
}
