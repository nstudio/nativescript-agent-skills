# NativeScript Agent Skills

Reusable, code-first skills for AI coding agents (Claude Code and compatible tools) working on
NativeScript projects. Each skill is a folder with a `SKILL.md`: a one-line `description` the
agent matches on, then concrete TypeScript that has actually run, plus the pitfalls around it.

## Install
```bash
# global (all projects)
cp -R skills/ns-ios-scenekit-from-typescript ~/.claude/skills/
# or per project
cp -R skills/ns-liquid-glass-panel <project>/.claude/skills/
# symlinks work too:  ln -s "$(pwd)/skills/ns-corelocation-direct" ~/.claude/skills/
```

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
| `ns-app-icons-and-launch-assets` | the app still shows the template icon/launch screen — generate and install icons on both platforms |
| `iss-tracking-with-satellite-js` | you need live satellite/ISS position, ground track, sunlit state, or visible-pass predictions |
| `ns-solar-terminator-math` | you need the sun from the clock: subsolar point, elevation, day phase, sunrise/sunset — dependency-free |
| `ns-webpack-angular-project-notes` | you're setting up or debugging an `ns create --ng` project (tsconfig, assets, ATS, plist/manifest, log noise) |
| `ns-angular-vite-migration` | you're moving a NativeScript Angular project from webpack to @nativescript/vite (working version set, analogjs patch, configs, NG0210 + Android FORTIFY launch crashes) |

Verified environment: macOS, Xcode 26.5, iOS 26.5 simulator, Android emulator Pixel 6a API 35 (SwiftShader), NativeScript CLI 9.1, @nativescript/core 9.0, Angular 20.
