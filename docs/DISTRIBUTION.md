# Distribution plan — `@nstudio/nativescript-agent-skills`

Goal: get these skills in front of every NativeScript developer's coding agent (Claude Code, Cursor, Codex, Copilot, Gemini CLI, …) with **one canonical source**, **vendored copies that end users can refresh**, and **versioned releases** — without maintaining three copies of anything.

## 1. One source tree, three doors

The repo already has the only layout every ecosystem agrees on:

```
skills/<name>/SKILL.md          ← Agent Skills spec (agentskills.io); name == directory
skills/<name>/{scripts,assets}/  ← optional supporting files (icons scripts, the analogjs patch)
```

Everything else is a thin manifest that points at that tree:

| Door | What we ship | How users install | How users update | Where the files land |
|---|---|---|---|---|
| **A. GitHub → skills.sh CLI** (broadest reach: 15+ agents) | nothing extra — the CLI scans `skills/` (`skills.sh.json` only groups the listing page) | `npx skills add nstudio/nativescript-agent-skills` (interactive agent picker) · add `--copy` to vendor real files, `-g` for global, `-a claude-code -s '*' -y` for CI | `npx skills update` (re-pulls current `main`; no lockfile/pin) | `.claude/skills/`, `.agents/skills/`, `.cursor/skills/` … in the project (or `~/…` with `-g`) |
| **B. Claude Code plugin marketplace** | `.claude-plugin/marketplace.json` + `plugin.json` (added) | `/plugin marketplace add nstudio/nativescript-agent-skills` then `/plugin install nativescript-agent-skills@nstudio` | `/plugin update nativescript-agent-skills@nstudio` (SHA-keyed cache: every commit is an update because `plugin.json` has no `version`) | user-global plugin cache; skills appear as `nativescript-agent-skills:ns-…`; a project can pre-register the marketplace in `.claude/settings.json` so teammates get it automatically |
| **C. npm `@nstudio/nativescript-agent-skills`** | `package.json` with `files: ["skills", "bin", …]`, keyword `tanstack-intent`, and a zero-dep `bin/cli.mjs` | **C1 (TanStack Intent, no vendoring):** `npm i -D @nstudio/nativescript-agent-skills && npx @tanstack/intent@latest install` (+ `hooks install` for Claude Code) — skills are read live from `node_modules` <br> **C2 (vendored + pinned):** `npx @nstudio/nativescript-agent-skills install --agent claude,agents` copies the skills into the project and writes `.nativescript-agent-skills.json` (package version + per-file hash) | C1: `npm update @nstudio/nativescript-agent-skills` <br> C2: `npx @nstudio/nativescript-agent-skills@latest update` (`check` shows stale/modified files; refuses to clobber local edits without `--force`) | C1: `node_modules/@nstudio/nativescript-agent-skills/skills/` <br> C2: `.claude/skills/`, `.agents/skills/` … + manifest at project root |

All three were smoke-tested against this tree: `npx skills add <repo> --list` discovers exactly the 20 skills (the `.claude-plugin/` folder does not confuse it), `npx @tanstack/intent validate` passes all 20, and `npm pack --dry-run` yields a 42 kB tarball with the CLI.

### Which door to recommend to whom

* **Individual developers, any agent** → A (`npx skills add nstudio/nativescript-agent-skills`). Lowest friction, appears on skills.sh automatically (telemetry-driven listing, badge in README).
* **Claude Code users / teams** → B. Auto-namespaced, one-command update, project-level pre-registration for teams.
* **Teams that want the files in their repo, pinned to a release, reviewable in PRs** → C2. This is the "vendored so we can easily update them for end users" requirement: semver from npm, drift detection, `update` is one command and never silently overwrites local edits.
* **Projects already using TanStack Intent** (TanStack Query/Router users) → C1. Skills version with the dependency, nothing to copy.

Do **not** recommend: symlink installs for teams (skills.sh's default) — they break for anyone else who clones the repo; git submodules; committing `node_modules`.

## 2. Naming is the API

Skill names are what agents match on and what users pin. Rules going forward:

* Keep the `ns-` prefix; it namespaces us inside `.claude/skills/` next to other packs. (In the Claude plugin door names are additionally prefixed `nativescript-agent-skills:`.)
* Renaming or removing a skill is a **major** version bump. Adding a skill is **minor**. Editing content is **patch**.
* `iss-tracking-with-satellite-js` was renamed to `ns-iss-tracking-satellite-js` before the first publish so every skill shares the prefix.
* Frontmatter now carries `license: MIT` and `metadata.author/source` (spec-legal keys; Intent validates them).

## 3. Release process

`main` is what door A and B serve, so `main` must always be releasable. Work on branches, squash-merge.

1. `npm run check` — spec lint (`evals/lint-skills.mjs`), `@tanstack/intent validate`, `npm pack --dry-run`. CI runs the same (`.github/workflows/ci.yml`).
2. `npm run eval:smoke` (local Mac, uses your Claude Code login — see `evals/README.md`) when a skill's *content* changed. Nightly/regression runs are opt-in; they cost real tokens.
3. Bump `package.json` version (semver rules above), add a `CHANGELOG.md` entry, tag `vX.Y.Z`, push the tag.
4. `.github/workflows/release.yml` publishes to npm with provenance (trusted publishing / OIDC — enable it on npmjs.com for the `@nstudio` org and drop the token), and creates the GitHub release. Doors A/B need nothing.

Version stamping inside each `SKILL.md` was deliberately **not** added — 20 files churning on every release is noise; the package version + manifest hash is the version of record for door C, and door A/B users are on `main`.

## 4. Discoverability

* README badge (added): `[![skills.sh](https://skills.sh/b/nstudio/nativescript-agent-skills)](https://skills.sh/nstudio/nativescript-agent-skills)`. The listing appears automatically after the first `npx skills add` installs.
* GitHub topics: `agent-skills`, `nativescript`, `claude-code`, `cursor`, `codex`, `mcp` (skills.sh and Intent's registry both key off npm keywords / repo metadata).
* Cross-link from the NativeScript docs "AI tooling" page and the nstudio blog (the bottom-sheet skill already cites one).
* Longer term (nstudio maintains NativeScript): ship framework-level skills *inside* `@nativescript/core` / `@nativescript/angular` under `skills/` so TanStack Intent users get them for free with the version they have installed — that is exactly Intent's model. This repo stays the place for app-level recipes and the fast-moving iOS/Android specifics.

## 5. What "vendored + updatable" looks like for an end user (door C2)

```bash
# once
npx @nstudio/nativescript-agent-skills install --agent claude,agents   # or --global
git add .claude/skills .agents/skills .nativescript-agent-skills.json

# later
npx @nstudio/nativescript-agent-skills@latest check    # v0.1.0 installed, v0.2.0 available; 3 stale, 1 modified
npx @nstudio/nativescript-agent-skills@latest update   # refuses to overwrite the modified file unless --force
```

The manifest records the package version and a content hash per vendored file, so `check`/`update` can distinguish *stale* (upstream changed), *modified* (user edited), *missing* and *new*.

## 6. Open items for you

* **License** — `MIT` was assumed (nstudio's usual); change `LICENSE`, `package.json#license` and the frontmatter `license:` lines if not.
* **npm org / GitHub repo** — the manifests assume `github.com/nstudio/nativescript-agent-skills` and the `@nstudio` scope; publishing needs npm 2FA/trusted publishing set up for the org.
* Whether to also add a `.cursor-plugin`/Cursor rules pointer — Cursor reads `.agents/skills`, so door A/C2 already covers it.
