#!/usr/bin/env node
// Renders docs/report.html — the shareable evaluation + distribution report —
// from the latest skillgrade results, the spec-lint output and the docs.
//   node evals/report-html.mjs [--out docs/report.html]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { tasks } from './tasks.mjs';
import { collect } from './lib/results.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rows = collect();
const lint = JSON.parse(execFileSync(process.execPath, [path.join(root, 'evals/lint-skills.mjs'), '--json'], { encoding: 'utf8' }));
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const pct = (x) => `${Math.round(x * 100)}%`;
const f2 = (x) => x.toFixed(2);

const withS = rows.filter((r) => r.s), withB = rows.filter((r) => r.b);
const meanS = withS.length ? withS.reduce((a, r) => a + r.s.mean, 0) / withS.length : null;
const loadedTot = withS.reduce((a, r) => a + r.s.loaded, 0), loadedN = withS.reduce((a, r) => a + r.s.loadedN, 0);
const outcomeOf = (r) => (r.s.loadedN ? (r.s.mean - 0.25 * (r.s.loaded / r.s.loadedN)) / 0.75 : r.s.mean);
const meanOutcome = withS.length ? withS.reduce((a, r) => a + outcomeOf(r), 0) / withS.length : null;
const meanB = withB.length ? withB.reduce((a, r) => a + r.b.mean, 0) / withB.length : null;
const trialsPerTask = withS[0]?.s.n ?? 0;
const totalTrials = withS.reduce((a, r) => a + r.s.n, 0);
const passTrials = withS.reduce((a, r) => a + r.s.passed, 0);
const date = new Date().toISOString().slice(0, 10);

const skillMeta = Object.fromEntries(lint.skills.map((s) => [s.skill, s]));
const weak = [];
for (const r of withS) for (const [name, c] of Object.entries(r.s.checks)) if (c.pass < c.n) weak.push({ task: r.task, skill: r.skill, name, ...c });
const baseMiss = [];
for (const r of withB) for (const [name, c] of Object.entries(r.b.checks)) if (c.pass < c.n) baseMiss.push({ task: r.task, skill: r.skill, name, miss: c.n - c.pass, n: c.n });
const topUplift = withS.filter((r) => r.b).map((r) => ({ skill: r.skill, d: outcomeOf(r) - r.b.mean })).sort((a, b) => b.d - a.d);
const noUplift = topUplift.filter((x) => Math.abs(x.d) < 0.03).map((x) => x.skill);
const upliftCards = withB.length ? `<div class="grid2" style="margin-top:16px">
<div class="card"><h3>Where the skills earn their keep</h3><p class="muted" style="margin:0 0 6px">Largest outcome uplift vs. no skills, and what the no-skill agent got wrong most often.</p><ul>
${topUplift.slice(0, 6).map((x) => `<li><code>${esc(x.skill)}</code> <b class="pos">+${f2(x.d)}</b> — ${esc(baseMiss.filter((m) => m.skill === x.skill).sort((a, b) => b.miss - a.miss).slice(0, 3).map((m) => `${m.name} (${m.miss}/${m.n})`).join('; '))}</li>`).join('')}
</ul></div>
<div class="card"><h3>Adherence gaps with the skill loaded</h3><p class="muted" style="margin:0 0 6px">The agent read the skill and still slipped — candidates for a wording pass.</p><ul>
${weak.map((w) => `<li><code>${esc(w.skill)}</code> — ${esc(w.name)} <span class="muted">(${w.pass}/${w.n})</span></li>`).join('') || '<li>none</li>'}
</ul>${noUplift.length ? `<p class="muted" style="margin-top:10px">Δ ≈ 0 with this agent (sonnet already knows it): ${noUplift.map((n) => `<code>${esc(n)}</code>`).join(', ')} — first candidates for sharper checks or, later, trimming.</p>` : ''}</div>
</div>` : '';

const bar = (v, cls = '') => `<span class="bar ${cls}" style="--v:${Math.max(0, Math.min(1, v || 0))}"><i></i><b>${f2(v || 0)}</b></span>`;

const resultRows = rows.map((r) => {
  const m = skillMeta[r.skill] || {};
  if (!r.s) return `<tr><td class="mono">${esc(r.skill)}</td><td colspan="6" class="muted">not run</td></tr>`;
  const outcome = outcomeOf(r), delta = r.b ? outcome - r.b.mean : null;
  const cls = r.s.mean >= 0.85 ? 'ok' : r.s.mean >= 0.6 ? 'warn' : 'bad';
  return `<tr>
    <td class="mono"><span class="dot ${cls}"></span>${esc(r.skill)}<div class="sub">${esc(r.task)} · ${m.info?.lines ?? "?"} lines</div></td>
    <td>${bar(r.s.mean, cls)}</td>
    <td class="num">${r.s.passed}/${r.s.n}</td>
    <td class="num">${r.s.loaded}/${r.s.loadedN}</td>
    <td>${r.b ? bar(r.b.mean, 'base') : '<span class="muted">—</span>'}</td>
    <td class="num ${delta == null ? '' : delta > 0.05 ? 'pos' : delta < -0.05 ? 'neg' : ''}">${delta == null ? '—' : (delta >= 0 ? '+' : '') + f2(delta)}</td>
    <td class="num muted">${r.s.dur.toFixed(0)}s</td>
  </tr>`;
}).join('\n');

const weakRows = weak.map((w) => `<tr><td class="mono">${esc(w.skill)}</td><td>${esc(w.name)}</td><td class="num">${w.pass}/${w.n}</td><td class="muted">${esc((w.msgs[0] || '').slice(0, 110))}</td></tr>`).join('\n');

const lintRows = lint.skills.map((s) => {
  const st = s.errors.length ? 'bad' : s.warnings.length ? 'warn' : 'ok';
  const notes = [...s.errors.map((e) => `error: ${e}`), ...s.warnings].join(' · ');
  return `<tr><td class="mono"><span class="dot ${st}"></span>${esc(s.skill)}</td><td class="num">${s.info.lines}</td><td class="num">${s.info.approxTokens}</td><td>${s.info.verified ? 'verified' : '<span class="muted">—</span>'}${s.info.untestedMarks ? ` <span class="muted">(${s.info.untestedMarks} untested)</span>` : ''}</td><td>${s.info.supportingFiles?.length ? esc(s.info.supportingFiles.join(', ')) : '<span class="muted">—</span>'}</td><td class="muted">${esc(notes) || '✓'}</td></tr>`;
}).join('\n');

const html = `<title>NativeScript Agent Skills Evaluation</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700&family=Source+Sans+3:ital,wght@0,400;0,600;1,400&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
:root{--bg:#F6F7FA;--panel:#FFFFFF;--ink:#1A2130;--muted:#66718A;--line:#DCE1EA;--accent:#2F6BD8;--accent-ink:#1E4FA8;--ok:#2B9464;--warn:#C98A1E;--bad:#C94C4C;--base:#98A3B8;--chip:#EEF2F9;--code:#F0F3F8}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--bg:#0E1320;--panel:#151C2C;--ink:#E7EBF3;--muted:#98A3B8;--line:#26304A;--accent:#6FA0F0;--accent-ink:#9DBDF5;--ok:#4FBF8C;--warn:#E0A63C;--bad:#E4706F;--base:#5C6784;--chip:#1C2538;--code:#111827}}
:root[data-theme="dark"]{--bg:#0E1320;--panel:#151C2C;--ink:#E7EBF3;--muted:#98A3B8;--line:#26304A;--accent:#6FA0F0;--accent-ink:#9DBDF5;--ok:#4FBF8C;--warn:#E0A63C;--bad:#E4706F;--base:#5C6784;--chip:#1C2538;--code:#111827}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.55 "Source Sans 3",system-ui,-apple-system,Segoe UI,sans-serif}
main{max-width:1120px;margin:0 auto;padding:40px 24px 80px}
h1,h2,h3{font-family:"Bricolage Grotesque","Source Sans 3",sans-serif;text-wrap:balance;letter-spacing:-.01em;margin:0}
h1{font-size:clamp(30px,4.5vw,44px);font-weight:700;line-height:1.1}
h2{font-size:24px;font-weight:700;margin:56px 0 12px}
h3{font-size:18px;font-weight:600;margin:28px 0 8px}
p,li{max-width:70ch}
a{color:var(--accent-ink)}
.eyebrow{font-family:"IBM Plex Mono",ui-monospace,monospace;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
.lede{font-size:18px;color:var(--muted);max-width:68ch;margin-top:12px}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin:28px 0 8px}
.stat{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:14px 16px}
.stat .v{font-family:"Bricolage Grotesque",sans-serif;font-size:32px;font-weight:700;font-variant-numeric:tabular-nums;line-height:1.1}
.stat .l{font-size:13px;color:var(--muted);margin-top:4px}
.stat.ok .v{color:var(--ok)}.stat.accent .v{color:var(--accent-ink)}
.tablewrap{overflow-x:auto;background:var(--panel);border:1px solid var(--line);border-radius:10px}
table{border-collapse:collapse;width:100%;font-size:14px}
th{font-family:"IBM Plex Mono",monospace;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);text-align:left;padding:10px 12px;border-bottom:1px solid var(--line);white-space:nowrap}
td{padding:9px 12px;border-bottom:1px solid var(--line);vertical-align:top}
tr:last-child td{border-bottom:0}
td.num,th.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.mono{font-family:"IBM Plex Mono",ui-monospace,monospace;font-size:13px}
.sub{font-family:"Source Sans 3",sans-serif;font-size:12px;color:var(--muted)}
.muted{color:var(--muted)}
.pos{color:var(--ok);font-weight:600}.neg{color:var(--bad);font-weight:600}
.dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:8px;background:var(--base);vertical-align:1px}
.dot.ok{background:var(--ok)}.dot.warn{background:var(--warn)}.dot.bad{background:var(--bad)}
.bar{display:inline-grid;grid-template-columns:120px auto;align-items:center;gap:8px;font-variant-numeric:tabular-nums}
.bar i{display:block;height:8px;border-radius:4px;background:var(--chip);position:relative;overflow:hidden}
.bar i::after{content:"";position:absolute;inset:0;width:calc(var(--v)*100%);background:var(--accent);border-radius:4px}
.bar.ok i::after{background:var(--ok)}.bar.warn i::after{background:var(--warn)}.bar.bad i::after{background:var(--bad)}.bar.base i::after{background:var(--base)}
.bar b{font-weight:600;font-size:13px}
.grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:16px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:16px 18px}
.card h3{margin-top:0}
.card ul{padding-left:18px;margin:8px 0 0}
code,pre{font-family:"IBM Plex Mono",ui-monospace,monospace;font-size:13px}
code{background:var(--code);padding:1px 5px;border-radius:4px}
pre{background:var(--code);padding:12px 14px;border-radius:8px;overflow-x:auto;line-height:1.5}
.doors td:first-child{font-weight:600;white-space:nowrap}
.note{border-left:3px solid var(--accent);padding:6px 14px;color:var(--muted);margin:16px 0}
.kicker{display:inline-block;background:var(--chip);color:var(--accent-ink);border-radius:999px;padding:2px 10px;font-size:12px;font-weight:600;margin-left:8px;vertical-align:middle}
footer{margin-top:64px;color:var(--muted);font-size:13px}
@media (prefers-reduced-motion:no-preference){.bar i::after{transition:width .4s ease}}
</style>
<main>
<div class="eyebrow">nstudio · nativescript-agent-skills · ${date}</div>
<h1>Are these 20 skills ready to ship, and how do we ship them?</h1>
<p class="lede">Static spec review, fact-checks against the real NativeScript typings, and a behavioural skillgrade run (Claude Code · sonnet, all 20 skills installed at once, ${trialsPerTask} trials per task${withB.length ? ', plus a no-skills baseline' : ''}) — followed by the distribution plan for <code>@nstudio/nativescript-agent-skills</code>.</p>

<div class="stats">
  <div class="stat ok"><div class="v">${lint.errors === 0 ? '20/20' : `${20 - lint.skills.filter((s) => s.errors.length).length}/20`}</div><div class="l">pass Agent Skills spec lint + TanStack Intent validate</div></div>
  <div class="stat accent"><div class="v">${meanS == null ? '—' : f2(meanS)}</div><div class="l">mean reward with skills (${passTrials}/${totalTrials} trials ≥ 0.5)</div></div>
  <div class="stat accent"><div class="v">${loadedN ? pct(loadedTot / loadedN) : '—'}</div><div class="l">trials where the agent found the right skill unprompted</div></div>
  <div class="stat ${meanB != null && meanOutcome - meanB > 0.05 ? 'ok' : ''}"><div class="v">${meanB == null ? '—' : (meanOutcome - meanB >= 0 ? '+' : '') + f2(meanOutcome - meanB)}</div><div class="l">outcome uplift vs. no skills (${meanOutcome == null ? '—' : f2(meanOutcome)} vs ${meanB == null ? '—' : f2(meanB)})</div></div>
</div>

<h2>Behavioural results <span class="kicker">skillgrade</span></h2>
<p>One realistic developer prompt per skill; the prompt never names the skill. Reward = 0.25 × <em>skill loaded</em> (seen in the tool transcript) + 0.75 × weighted outcome checks (APIs the skill teaches, files, pinned versions, and for the two math skills the agent's code is actually executed against reference values). Baseline runs the identical prompt with no skills installed; Δ compares outcome checks only.</p>
<div class="tablewrap"><table>
<thead><tr><th>skill · task</th><th>reward (skills on)</th><th class="num">pass</th><th class="num">loaded</th><th>baseline (no skills)</th><th class="num">Δ outcome</th><th class="num">avg</th></tr></thead>
<tbody>${resultRows}</tbody></table></div>
${weak.length ? `<h3>Checks that did not always pass (skills on)</h3>
<div class="tablewrap"><table><thead><tr><th>skill</th><th>check</th><th class="num">pass</th><th>example</th></tr></thead><tbody>${weakRows}</tbody></table></div>` : ''}
${upliftCards}
<p class="note">Reproduce: <code>evals/run.sh --trials=3 --parallel=4 --grader=deterministic</code> then <code>node evals/report-html.mjs</code>. Per-trial workspaces and transcripts are kept under <code>evals/results/workspaces/</code>.</p>

<h2>Static review</h2>
<div class="tablewrap"><table>
<thead><tr><th>skill</th><th class="num">lines</th><th class="num">≈tokens</th><th>provenance</th><th>bundled files</th><th>lint notes</th></tr></thead>
<tbody>${lintRows}</tbody></table></div>

<div class="grid2" style="margin-top:16px">
<div class="card"><h3>Fixed during the review</h3><ul>
<li><code>ns-corelocation-direct</code>, <code>ns-ios-framework-typings</code> — said <code>kCLLocationAccuracyKilometer</code> is missing from the typings; it is declared in <code>objc!_LocationEssentials.d.ts</code> (types-ios 9.0.0). Corrected, and the typings skill now shows how to grep for a “missing” const plus the one-line <code>ios.d.ts</code> reference.</li>
<li><code>ns-angular-vite-migration</code> — told the agent to copy the analogjs patch “from the reference project”. Patch now bundled at <code>assets/patches/</code>.</li>
<li><code>ns-app-icons-and-launch-assets</code> — icon generator was an elided stub. Runnable <code>scripts/make-icon.py</code> + <code>scripts/install-icons.sh</code> bundled and tested.</li>
<li>All 20 — <code>license: MIT</code> and <code>metadata.author/source</code> added to the frontmatter (spec-legal, Intent-validated).</li>
</ul></div>
<div class="card"><h3>Fact-checks that held</h3><ul>
<li><code>CLLocation</code> lives in <code>_LocationEssentials.d.ts</code>; <code>@nativescript/types-ios</code> references only the <code>common.d.ts</code> subset by default.</li>
<li><code>SCNAction.group</code> exists; <code>groupWithActions</code> and <code>SCNVector3Make</code> do not; <code>SCNVector3Zero</code> does.</li>
<li>iOS 26 <code>UIGlassEffect</code> / <code>UICornerConfiguration</code>, <code>customDetentWithIdentifierResolver</code>, <code>dateFormatFromTemplateOptionsLocale</code> are all in the typings.</li>
<li>The stock template's manifest really uses <code>title_activity_kimera</code>; the solar recipe reproduces its own sanity checks (equinox 0.002°, solstice 23.435°); satellite.js@5 reproduces the ISS reference position.</li>
</ul></div>
<div class="card"><h3>Still worth doing</h3><ul>
<li>Add a one-line “Verified …” provenance to the five skills without one (haptics, framework-typings, no-intl, webpack notes, app-icons).</li>
<li>Refresh the bundled ISS TLE at each release (it decays ~1 km/day); consider <code>scripts/refresh-tle.sh</code>.</li>
<li>Vite skill pins alpha versions — plan a patch release when the stable set ships.</li>
</ul></div>
</div>

<h2>Distribution plan <span class="kicker">docs/DISTRIBUTION.md</span></h2>
<p>One canonical tree — <code>skills/&lt;name&gt;/SKILL.md</code> — served through three doors. Everything else in the repo is a thin manifest pointing at that tree, so nothing is ever copied twice on our side.</p>
<div class="tablewrap"><table class="doors">
<thead><tr><th>door</th><th>we ship</th><th>user installs</th><th>user updates</th><th>files land</th></tr></thead>
<tbody>
<tr><td>A · skills.sh CLI<br><span class="sub">any agent</span></td><td>nothing extra (<code>skills.sh.json</code> groups the listing; badge in README)</td><td><code>npx skills add nstudio/nativescript-agent-skills</code> (<code>--copy</code> to vendor, <code>-g</code> global)</td><td><code>npx skills update</code> — tracks <code>main</code>, no lockfile</td><td><code>.claude/skills/</code>, <code>.agents/skills/</code>, … in the project</td></tr>
<tr><td>B · Claude Code plugin<br><span class="sub">Claude Code</span></td><td><code>.claude-plugin/marketplace.json</code> + <code>plugin.json</code></td><td><code>/plugin marketplace add nstudio/nativescript-agent-skills</code> · <code>/plugin install nativescript-agent-skills@nstudio</code></td><td><code>/plugin update …</code> — SHA-keyed, every commit counts</td><td>user-global plugin cache; namespaced <code>nativescript-agent-skills:ns-…</code></td></tr>
<tr><td>C · npm package<br><span class="sub">vendored &amp; pinned, or Intent</span></td><td><code>@nstudio/nativescript-agent-skills</code> — 42 kB, zero-dep <code>bin/cli.mjs</code>, keyword <code>tanstack-intent</code></td><td><code>npx @nstudio/nativescript-agent-skills install --agent claude,agents</code><br>or <code>npm i -D … &amp;&amp; npx @tanstack/intent install</code></td><td><code>npx …@latest update</code> (<code>check</code> shows stale / modified / missing; refuses to clobber edits without <code>--force</code>) · Intent: <code>npm update</code></td><td>project <code>.claude/skills/</code> + <code>.nativescript-agent-skills.json</code> manifest · Intent: <code>node_modules</code></td></tr>
</tbody></table></div>
<div class="grid2" style="margin-top:16px">
<div class="card"><h3>Who gets which door</h3><ul>
<li><b>Individuals, any agent</b> → A. Lowest friction; listing on skills.sh is automatic.</li>
<li><b>Claude Code teams</b> → B. Namespaced, one-command update, marketplace can be pre-registered in project settings.</li>
<li><b>Teams that want files in their repo, pinned, PR-reviewable</b> → C (vendoring CLI). This is the “vendored so we can update end users” requirement, with drift detection.</li>
<li><b>Projects already on TanStack Intent</b> → C (Intent). Skills version with the dependency.</li>
</ul></div>
<div class="card"><h3>Release process</h3><ul>
<li><code>main</code> is what A and B serve → always releasable; work on branches.</li>
<li><code>npm run check</code> = spec lint + Intent validate + pack dry-run (CI does the same on every push/PR).</li>
<li>Content change → <code>npm run eval:smoke</code> locally (uses your Claude login).</li>
<li>Semver: edit = patch, new skill = minor, rename/remove = major. Tag <code>vX.Y.Z</code> → <code>release.yml</code> publishes with provenance.</li>
</ul></div>
<div class="card"><h3>Open decisions</h3><ul>
<li>License — MIT assumed; change <code>LICENSE</code>, <code>package.json</code> and the frontmatter if not.</li>
<li>npm trusted publishing for the <code>@nstudio</code> scope; GitHub repo at <code>nstudio/nativescript-agent-skills</code>.</li>
<li>Later: ship framework-level skills inside <code>@nativescript/core</code> for Intent users; keep this repo for app-level recipes.</li>
</ul></div>
</div>

<footer>Generated by <code>evals/report-html.mjs</code> from <code>evals/results/</code>, <code>evals/lint-skills.mjs</code> and <code>docs/DISTRIBUTION.md</code>.</footer>
</main>
`;
const outIdx = process.argv.indexOf('--out');
const out = outIdx > 0 ? process.argv[outIdx + 1] : 'docs/report.html';
fs.writeFileSync(path.join(root, out), html);
console.log(`wrote ${out}`);
