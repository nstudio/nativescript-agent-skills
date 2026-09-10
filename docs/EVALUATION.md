# Evaluation — 2026-08-17/18

Three passes over the 20 skills: (1) static spec/quality review, (2) fact-checks of concrete claims against the real `@nativescript/types-ios` 9.0.0 typings and the stock `ns create --ng` template, (3) a behavioural [skillgrade](https://github.com/mgechev/skillgrade) run — one realistic task per skill, Claude Code (`sonnet`) as the agent, all 20 skills installed at once so discovery is part of the test, plus a no-skills baseline. How the suite works: [../evals/README.md](../evals/README.md).

## 1. Static review

`node evals/lint-skills.mjs` → **20 skills, 0 errors, 9 warnings**; `npx @tanstack/intent validate` → **20/20 pass**.

* Frontmatter: every `name` matches its directory and the spec's charset; descriptions are 130–330 chars, all phrased "Use when …" and dense with the literal error strings / API names an agent will see (good for matching). `license: MIT` + `metadata.author/source` added to all 20 (spec-legal keys).
* Size: 19–125 lines, ~450–1 830 tokens each — far under the 500-line / 5 000-token guidance, so loading one costs little context.
* Cross-references (`see ns-…`) resolve for all 20 — they assume the whole set is installed, which every distribution door does.
* Provenance: 15 skills state the environment they were verified in; `ns-ios-bottom-sheet-native` honestly marks 5 statements *untested*. Five skills carry no explicit "Verified …" line (`ns-haptics-direct`, `ns-ios-framework-typings`, `ns-no-intl-native-formatting`, `ns-webpack-angular-project-notes`, `ns-app-icons-and-launch-assets`) — worth one sentence each, since the README promises unverified parts are marked.

### Fixes applied during the review

| Skill | Finding | Fix |
|---|---|---|
| `ns-corelocation-direct`, `ns-ios-framework-typings` | Claimed `kCLLocationAccuracyKilometer` is absent from the typings. It is declared in `objc!_LocationEssentials.d.ts` (line 237 in types-ios 9.0.0) — the very file the skills tell you to reference. | Text corrected; typings skill now shows how to grep for a "missing" const and mentions the one-line `lib/ios/ios.d.ts` reference that pulls in every framework. |
| `ns-angular-vite-migration` | Told the agent to copy the analogjs patch "from the reference project" — a file it cannot reach. | Patch vendored at `assets/patches/@analogjs+vite-plugin-angular+2.6.3.patch`, text updated. |
| `ns-app-icons-and-launch-assets` | The "generate a 1024 icon" Python was an elided stub (`# … composited …`). | Runnable `scripts/make-icon.py` (PIL only, tested: 1024×1024 RGB, no alpha) and `scripts/install-icons.sh` bundled and referenced. |

### Fact-checks that held

CLLocation lives in `objc!_LocationEssentials.d.ts` (not `objc!CoreLocation.d.ts`) ✓ · `@nativescript/types-ios/index.d.ts` references only the `common.d.ts` subset (UIKit, Foundation, AVFoundation, …), so SceneKit/CoreLocation/CoreMotion/CoreHaptics indeed need explicit references ✓ · `SCNAction.group(...)` exists, `groupWithActions` and `SCNVector3Make` do not, `SCNVector3Zero` does ✓ · `UIGlassEffect`, `UIGlassEffectStyle`, `UICornerConfiguration` are in the iOS 26 UIKit typings ✓ · `customDetentWithIdentifierResolver`, `dateFormatFromTemplateOptionsLocale` exist ✓ · the template's `AndroidManifest.xml` really uses `@string/title_activity_kimera`, so that oddly named key in the icons skill is accurate, not a leak ✓ · the solar recipe reproduces its own sanity checks (equinox → 0.002°, solstice → 23.435°) and satellite.js@5 reproduces the ISS reference position ✓.

### Observations (no change made)

* `ns-iss-tracking-satellite-js` — bundled `FALLBACK_TLE` (epoch 2026-08-16) decays ~1 km/day; refresh it at each release (a `scripts/refresh-tle.sh` would make that a one-liner). Renamed from `ns-iss-tracking-satellite-js` after the run so every skill shares the `ns-` prefix (results below still show the task under its old name).
* `ns-angular-vite-migration` — pins alpha versions (`@nativescript/vite 8.0.0-alpha.73`, `@nativescript/angular 21.2.0-alpha.4`, core `9.1.0-next.2`); dated "Verified 2026-08", but expect a patch release when the stable set ships.
* `ns-webpack-angular-project-notes` — the only skill with no code block; the ATS/plist and manifest snippets would copy better than prose (the eval below shows agents still get it right, so low priority).
* Two `…` elisions remain inside code (`ns-android-java-interop-gotchas` colours array, `ns-custom-view-platform-split` abstract signatures) — illustrative, acceptable.

## 2. Behavioural results (skillgrade)

Setup: `evals/run.sh --trials=3 --parallel=4 --grader=deterministic` (skills on) and `evals/run.sh --baseline --trials=3 --parallel=3 --grader=deterministic` (skills off). Agent: Claude Code `sonnet` via the transcript-capturing wrapper; graders are deterministic (file/API/executable checks — no LLM judge because no API key was available; the `llm_rubric` graders are defined and will run when `ANTHROPIC_API_KEY` is set). Reward = 0.25 × skill-loaded + 0.75 × outcome checks; a trial passes at ≥ 0.5.

Tasks: 20/20 · trials/task: 3 · mean reward **1.00** · skill discovered in **100%** of trials · baseline (no skills) mean **0.77**

| task | skill | reward (skills) | pass | loaded | baseline (no skills) | Δ outcome | avg s |
|---|---|---|---|---|---|---|---|
| solar-terminator-math | `ns-solar-terminator-math` | 1.00 | 3/3 | 3/3 | 1.00 | +0.00 | 30 |
| ns-iss-tracking-satellite-js | `ns-iss-tracking-satellite-js` | 1.00 | 3/3 | 3/3 | 0.88 | +0.13 | 83 |
| no-intl-native-formatting | `ns-no-intl-native-formatting` | 1.00 | 3/3 | 3/3 | 0.79 | +0.21 | 56 |
| haptics-direct | `ns-haptics-direct` | 1.00 | 3/3 | 3/3 | 1.00 | +0.00 | 50 |
| android-java-interop-gotchas | `ns-android-java-interop-gotchas` | 1.00 | 3/3 | 3/3 | 0.58 | +0.42 | 111 |
| android-canvas-custom-view | `ns-android-canvas-custom-view` | 1.00 | 3/3 | 3/3 | 0.73 | +0.27 | 193 |
| ios-cadisplaylink-render-loop | `ns-ios-cadisplaylink-render-loop` | 1.00 | 3/3 | 3/3 | 0.75 | +0.25 | 193 |
| ios-framework-typings | `ns-ios-framework-typings` | 1.00 | 3/3 | 3/3 | 0.52 | +0.48 | 83 |
| ios-scenekit-from-typescript | `ns-ios-scenekit-from-typescript` | 1.00 | 3/3 | 3/3 | 0.70 | +0.30 | 256 |
| ios-simulator-automation | `ns-ios-simulator-automation` | 1.00 | 3/3 | 3/3 | 1.00 | +0.00 | 72 |
| custom-view-platform-split | `ns-custom-view-platform-split` | 1.00 | 3/3 | 3/3 | 0.79 | +0.21 | 336 |
| liquid-glass-panel | `ns-liquid-glass-panel` | 1.00 | 3/3 | 3/3 | 0.58 | +0.42 | 69 |
| ios-bottom-sheet-native | `ns-ios-bottom-sheet-native` | 1.00 | 3/3 | 3/3 | 1.00 | +0.00 | 171 |
| animated-panel-height | `ns-animated-panel-height` | 1.00 | 3/3 | 3/3 | 0.25 | +0.75 | 80 |
| corelocation-direct | `ns-corelocation-direct` | 1.00 | 3/3 | 3/3 | 0.60 | +0.40 | 484 |
| clgeocoder-place-and-timezone | `ns-clgeocoder-place-and-timezone` | 1.00 | 3/3 | 3/3 | 1.00 | +0.00 | 199 |
| angular-zoneless-native-choreography | `ns-angular-zoneless-native-choreography` | 1.00 | 3/3 | 3/3 | 0.67 | +0.33 | 139 |
| webpack-angular-project-notes | `ns-webpack-angular-project-notes` | 1.00 | 3/3 | 3/3 | 1.00 | +0.00 | 137 |
| angular-vite-migration | `ns-angular-vite-migration` | 1.00 | 3/3 | 3/3 | 0.63 | +0.37 | 157 |
| app-icons-and-launch-assets | `ns-app-icons-and-launch-assets` | 1.00 | 3/3 | 3/3 | 1.00 | +0.00 | 62 |

Reward = 0.25 × (skill loaded) + 0.75 × (weighted outcome checks). "Δ outcome" compares outcome checks only, skills on vs. off.

### Reading the numbers

* **Discovery works.** In all 60 skills-on trials the agent invoked the right skill via the `Skill` tool from a prompt that never named it — the descriptions are doing their job even with 20 siblings competing (and the user's own global skills present).
* **Outcome uplift is +0.22 on average (0.99 vs 0.77)** and concentrated exactly where the skills encode hard-won platform knowledge. Without the skill the agent: pinned `satellite.js` 7.x (3/3 trials; ESM/WASM breaks webpack), never reached for `UIGlassEffect` or the `GridLayout rows="auto"` layering trick (3/3), passed JS arrays/closures into Android interop (`Array.create`, `WeakRef`, plain `number[]` — 3/3), registered CADisplayLink on `NSRunLoopCommonModes` alone (2/3 — the case the skill documents as never firing), missed `objc!_LocationEssentials.d.ts` and the SceneKit references (2–3/3), and never measured the panel explicitly on Android (2/3 — the shrink-never-fires trap). Largest Δ: `ns-animated-panel-height` +0.75, `ns-ios-framework-typings` +0.48, `ns-liquid-glass-panel` +0.42, `ns-corelocation-direct` and `ns-angular-vite-migration` +0.37.
* **Seven skills show Δ 0.00 with this agent** (`ns-solar-terminator-math`, `ns-haptics-direct`, `ns-ios-simulator-automation`, `ns-ios-bottom-sheet-native`, `ns-clgeocoder-place-and-timezone`, `ns-webpack-angular-project-notes`, `ns-app-icons-and-launch-assets`): sonnet already produces the graded outcome without help. They still shorten the path (fewer turns, verified details), and a weaker agent or a stricter rubric may separate them — but if the catalog ever needs trimming, this is the list to look at first, and the tasks for these should get sharper checks (e.g. haptic *mapping* tick/tap/success, `prefersGrabberVisible` + iOS 26 transparency together, ocean fallback quality).
* **Adherence gaps found in the first pass — and fixed.** With the skill loaded, the first run still slipped on four rules: `ns-android-java-interop-gotchas` applied the `Array.create('int'|'float')` rule for the `RadialGradient` overload in only 1/3 trials (plain `number[]` for `drawPoints` in 2/3), `ns-android-canvas-custom-view` let a `Float32Array` reach the canvas in 1/3, `ns-corelocation-direct` skipped the `references.d.ts` additions in 1/3, and `ns-no-intl-native-formatting` produced uncached formatters in 3/3 (the skill's own Android path created a `SimpleDateFormat` per call — it contradicted its own note). Each skill was restructured so the missed rule is an imperative, copy-pastable block near the top (a "Checklist — apply ALL of these" for interop, "Three rules the runtime enforces" for Canvas, "iOS — step 1: typings" with the two reference lines for CoreLocation, and a cached Android formatter + "two rules" line for formatting). Re-running those four tasks (3 trials each) with the revised skills: **all four at 1.00, 12/12 trials, zero failing checks** — vs 0.88 / 0.91 / 0.97 / 0.97 before. The lesson generalises: agents follow numbered imperatives at the top far more reliably than the same rule stated as prose next to the code.
* **Grader corrections made after the first pass** (and applied by re-scoring the saved workspaces with `evals/regrade.mjs`, not by re-running the agent): six checks were over-strict — fov via a named constant, `registerElement` inside the view file, spread syntax in `nativeOptions`, handler-name casing, `network_security_config.xml` as a valid cleartext alternative, NOTES wording. All are recorded in `evals/tasks.mjs`.
* **Caveats.** Deterministic graders check for the APIs/files/values the skill teaches (plus real execution for the two math tasks and pixel measurement for icons); they do not judge code quality, and the `llm_rubric` graders did not run (no API key). Sample size is 3 trials/task. Both runs used Claude Code `sonnet` with the user's global skills present, so numbers reflect a realistic, not sterile, environment. Skill contents were lightly edited during the skills-on run (patch vendored, icon scripts added, frontmatter) — later tasks saw the newer files.

