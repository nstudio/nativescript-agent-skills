# Changelog

## 1.0.0 (2026-08-18)

### Skills

  * `ns-android-java-interop-gotchas` — "Checklist — apply ALL of these to every Java call" at the top; the gradient case is named by its exact error (`RadialGradient(…, [c1, c2], [0, 1])` → "Cannot marshal JavaScript argument at index 3") with a note that fixing `drawPoints` does not fix it; the `drawPoints` example declares the field as `number[]` and calls out the `Array.from(f32)` per-frame trap.
  * `ns-android-canvas-custom-view` — "Three rules the runtime enforces" under the title (module-scope `@NativeClass` + `WeakRef`, plain `number[]` all the way through, `Array.create` for gradient arrays); `px`/`py` in the sample are `number[]`.
  * `ns-corelocation-direct` — typings are "iOS — step 1" with the two `/// <reference>` lines (`objc!CoreLocation.d.ts` + `objc!_LocationEssentials.d.ts`) ready to paste, ahead of the delegate code; Info.plist is step 3.
  * `ns-no-intl-native-formatting` — the two rules (never `Intl`/`toLocaleString`, cache every formatter) stated up front; the Android path now caches `SimpleDateFormat` in a `Map` like the iOS path (it previously created one per call, contradicting the skill's own note).

### Evals
* `evals/regrade.mjs` pairs the newest N saved workspaces with the newest result file, so re-running a subset of tasks and regrading no longer conflicts with earlier snapshots.
* `corelocation-direct` grader accepts the manager/delegate being held in a module-level `if (__IOS__) { … }` block (a legitimate pattern the `^let` anchor rejected).

## 0.1.0 (2026-08-18)

* First packaged release: 20 skills under `skills/`, npm package with vendoring CLI (`install`/`update`/`check`), Claude Code marketplace manifest, skills.sh grouping.
* Renamed `iss-tracking-with-satellite-js` → `ns-iss-tracking-satellite-js` (all skills now share the `ns-` prefix).
* Skills: `ns-angular-vite-migration` now bundles the analogjs patch under `assets/patches/`; `ns-app-icons-and-launch-assets` ships runnable `scripts/make-icon.py` + `scripts/install-icons.sh`; `ns-corelocation-direct` / `ns-ios-framework-typings` corrected (`kCLLocationAccuracyKilometer` is declared in `objc!_LocationEssentials.d.ts`); all skills carry `license` + `metadata` frontmatter.
* Evals: skillgrade suite (`eval.yaml`, `evals/`) with one task per skill, executable graders for the math skills, transcript-based skill-discovery check, and a no-skill baseline.
