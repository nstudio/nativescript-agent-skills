# Changelog

## 0.1.0 (2026-08-18)

* First packaged release: 20 skills under `skills/`, npm package with vendoring CLI (`install`/`update`/`check`), Claude Code marketplace manifest, skills.sh grouping.
* Renamed `iss-tracking-with-satellite-js` → `ns-iss-tracking-satellite-js` (all skills now share the `ns-` prefix).
* Skills: `ns-angular-vite-migration` now bundles the analogjs patch under `assets/patches/`; `ns-app-icons-and-launch-assets` ships runnable `scripts/make-icon.py` + `scripts/install-icons.sh`; `ns-corelocation-direct` / `ns-ios-framework-typings` corrected (`kCLLocationAccuracyKilometer` is declared in `objc!_LocationEssentials.d.ts`); all skills carry `license` + `metadata` frontmatter.
* Evals: skillgrade suite (`eval.yaml`, `evals/`) with one task per skill, executable graders for the math skills, transcript-based skill-discovery check, and a no-skill baseline.
