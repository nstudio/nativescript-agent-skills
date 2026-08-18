# NativeScript Agent Skills

[![skills.sh](https://skills.sh/b/nstudio/nativescript-agent-skills)](https://skills.sh/nstudio/nativescript-agent-skills)
[![npm](https://img.shields.io/npm/v/@nstudio/nativescript-agent-skills.svg)](https://www.npmjs.com/package/@nstudio/nativescript-agent-skills)

Reusable, code-first [Agent Skills](https://agentskills.io) for AI coding agents (Claude Code, Cursor, Codex, Copilot, Gemini CLI and any other client of the open standard) working on **NativeScript** projects. Each skill is a folder with a `SKILL.md`: a one-line `description` the agent matches on, then concrete TypeScript that has actually run, plus the pitfalls around it.

## Install

Pick the door that matches your setup — they all serve the same `skills/` tree.

| You use… | Install | Update |
|---|---|---|
| **Any agent** (Claude Code, Cursor, Codex, Copilot, Gemini, Windsurf, …) | `npx skills add nstudio/nativescript-agent-skills` (add `--copy` to vendor real files, `-g` for global) | `npx skills update` |
| **Claude Code plugin** | `/plugin marketplace add nstudio/nativescript-agent-skills` then `/plugin install nativescript-agent-skills@nstudio` | `/plugin update nativescript-agent-skills@nstudio` |
| **npm, vendored & pinned in your repo** | `npx @nstudio/nativescript-agent-skills install --agent claude,agents` (writes `.nativescript-agent-skills.json`) | `npx @nstudio/nativescript-agent-skills@latest update` (`check` shows stale/modified files) |
| **TanStack Intent** | `npm i -D @nstudio/nativescript-agent-skills && npx @tanstack/intent@latest install` | `npm update @nstudio/nativescript-agent-skills` |
| **By hand** | `cp -R skills/ns-liquid-glass-panel <project>/.claude/skills/` (or `~/.claude/skills/`) | `cp` again |

Details, trade-offs and the release process: [docs/DISTRIBUTION.md](docs/DISTRIBUTION.md).

## Skills

| Skill | Use it when… |
|---|---|
| `ns-ios-scenekit-from-typescript` | you need real-time 3D on iOS: SCNView in a custom View, textures, Metal shader modifiers, hit testing, camera framing |
| `ns-ios-cadisplaylink-render-loop` | you need a 60fps JS tick on iOS — the CADisplayLink target that actually fires under NativeScript |
| `ns-ios-framework-typings` | TS can't find SCNView/CLLocation/CMMotionManager… — reference the framework d.ts, grep exact selectors, read the SDK header |
| `ns-custom-view-platform-split` | you're building a custom view with a different native renderer per platform (common/ios/android/d.ts, shared gestures + Properties, Angular registration) |
| `ns-android-canvas-custom-view` | you need custom 60fps 2D drawing on Android (android.view.View subclass, onDraw, Choreographer, batching + perf findings) |
| `ns-android-java-interop-gotchas` | you hit "Cannot marshal JavaScript argument", "Failed resolving method", "Class constructor … cannot be invoked without 'new'", or wrong 8-digit hex colours on Android |
| `ns-liquid-glass-panel` | you want a frosted/glass panel: UIGlassEffect on iOS 26, UIBlurEffect earlier, translucent drawable on Android; the GridLayout layering trick |
| `ns-ios-bottom-sheet-native` | you want a real UISheetPresentationController sheet (detents, grabber, glass) — and when an in-page panel is the better call |
| `ns-no-intl-native-formatting` | numbers/dates format wrong because the iOS runtime has no Intl — NSDateFormatter/SimpleDateFormat with time zones |
| `ns-corelocation-direct` | you need location/heading without a plugin: CLLocationManager delegate class, Android LocationManager, simulator setup |
| `ns-clgeocoder-place-and-timezone` | you need "what place is this coordinate and what time is it there" — CLGeocoder + CLPlacemark.timeZone, Android Geocoder, ocean fallback |
| `ns-haptics-direct` | you want tactile feedback: UIFeedbackGenerator / VibrationEffect |
| `ns-angular-zoneless-native-choreography` | you're wiring zoneless Angular signals to native views with polished motion (animate() intros, dimming, crossfades, SegmentedBar on iOS + custom animated tabs on Android) |
| `ns-ios-simulator-automation` | you're verifying an app on the iOS simulator/Android emulator from the shell: screenshots, frame-by-frame video, taps/swipes, locating tap targets, fake location, permissions, logs |
| `ns-animated-panel-height` | a panel/sheet body must grow/shrink smoothly with its content on both platforms (explicit measure + animated height; Android layoutChanged/ScrollView traps) |
| `ns-app-icons-and-launch-assets` | the app still shows the template icon/launch screen — generate and install icons on both platforms (bundled `scripts/make-icon.py`, `scripts/install-icons.sh`) |
| `ns-iss-tracking-satellite-js` | you need live satellite/ISS position, ground track, sunlit state, or visible-pass predictions |
| `ns-solar-terminator-math` | you need the sun from the clock: subsolar point, elevation, day phase, sunrise/sunset — dependency-free |
| `ns-webpack-angular-project-notes` | you're setting up or debugging an `ns create --ng` project (tsconfig, assets, ATS, plist/manifest, log noise) |
| `ns-angular-vite-migration` | you're moving a NativeScript Angular project from webpack to @nativescript/vite (working version set, bundled analogjs patch, configs, NG0210 + Android FORTIFY launch crashes) |

Verified environment: macOS, Xcode 26.5, iOS 26.5 simulator, Android emulator Pixel 6a API 35 (SwiftShader), NativeScript CLI 9.1, @nativescript/core 9.1.

## Quality

* `npm run lint` — Agent Skills spec lint; `npm run validate` — TanStack Intent's validator. Both run in CI.
* `evals/` — a [skillgrade](https://github.com/mgechev/skillgrade) suite with one realistic task per skill, executable graders where the code can run headless, and a check that the agent actually discovered the skill. See [evals/README.md](evals/README.md) and the latest report in [docs/EVALUATION.md](docs/EVALUATION.md).

## Contributing a skill

`skills/<name>/SKILL.md` with `name` (== folder), `description` starting "Use when …", `license`, `metadata`; code that has run, with the environment it was verified in; keep it under ~150 lines and put large helpers in `scripts/` or `assets/`. Add a task to `evals/tasks.mjs`. `npm run check` before opening a PR.

## License

MIT © nstudio
