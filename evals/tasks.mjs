// Single source of truth for the skillgrade suite. `node evals/build.mjs`
// renders this into ./eval.yaml (skills on) and evals/baseline/eval.yaml
// (skills off); evals/graders/check.mjs runs the `checks` of one task.
//
// Rules for a task:
//  * `instruction` never names a skill — discovery is part of what is graded.
//  * `checks` grade outcomes in the workspace (files the instruction names).
//    Each check: { name, weight?, file|files|dir, match|notMatch|custom }.
//    `dir` + `match` passes if any file under dir matches.
//  * `rubric` feeds an llm_rubric grader (needs ANTHROPIC/GEMINI/OPENAI key).

const NS_APP = { src: 'evals/fixtures/ns-app', dest: '.' };

export const tasks = [
  // ───────────────────────────── pure math / JS ─────────────────────────────
  {
    name: 'solar-terminator-math',
    skill: 'ns-solar-terminator-math',
    instruction: `This is a NativeScript app that shows a day/night terminator on a globe.

Create \`src/app/sun.ts\` — plain TypeScript, no dependencies, no NativeScript imports — exporting:

- \`subsolarPoint(date: Date): { lat: number; lon: number }\` — where the sun is directly overhead, in degrees (lon in -180..180).
- \`sunElevation(date: Date, lat: number, lon: number): number\` — the sun's elevation above the horizon in degrees at that place and time.

Accuracy of ~0.5° is fine; it just needs to be cheap enough to call every second. Add a short comment on the algorithm you used.`,
    workspace: [NS_APP],
    checks: [
      { name: 'sun.ts exists', file: 'src/app/sun.ts', match: /export\s+(function|const)\s+subsolarPoint/ },
      { name: 'no imports (dependency-free)', file: 'src/app/sun.ts', notMatch: /^\s*import\s/m },
      {
        name: 'runs and matches reference (equinox/solstice, elevation)', weight: 3,
        custom: async ({ runTs }) => {
          const r = await runTs(`
            import { subsolarPoint, sunElevation } from './src/app/sun.ts';
            const out = [];
            const cases = [
              ['2026-03-20T14:46:00Z', 0.002, -39.643, 4.88],
              ['2026-06-21T08:24:00Z', 23.435, 54.448, -21.00],
              ['2026-12-21T20:03:00Z', -23.435, -121.193, 21.04],
            ];
            for (const [iso, lat, lon, elPdx] of cases) {
              const d = new Date(iso); const p = subsolarPoint(d); const e = sunElevation(d, 45.5152, -122.6784);
              out.push({ iso, lat: p.lat, lon: p.lon, el: e, okLat: Math.abs(p.lat - lat) < 0.5, okLon: Math.abs(((p.lon - lon + 540) % 360) - 180) < 1.5, okEl: Math.abs(e - elPdx) < 1.5 });
            }
            console.log(JSON.stringify(out));`);
          if (!r.ok) return { passed: false, message: `run failed: ${r.error.slice(0, 300)}` };
          const bad = r.value.filter((c) => !(c.okLat && c.okLon && c.okEl));
          return { passed: bad.length === 0, message: bad.length ? `off: ${JSON.stringify(bad).slice(0, 300)}` : `3/3 within tolerance` };
        },
      },
    ],
    rubric: `- Did the agent implement the USNO-style approximate solar coordinates (mean longitude/anomaly → ecliptic longitude → declination/right ascension → GMST → subsolar lon) rather than a heavy library or a crude sinusoid?
- Is the code dependency-free and small enough to run every second?
- Did it avoid re-deriving from memory when a proven recipe was available in the workspace's skills?`,
  },

  {
    name: 'ns-iss-tracking-satellite-js',
    skill: 'ns-iss-tracking-satellite-js',
    instruction: `Add live ISS tracking to this NativeScript (webpack) app.

1. Add the satellite propagation dependency to package.json (pick a version that works with webpack; do not run a native build).
2. Create \`src/app/iss.ts\` exporting \`issPosition(date: Date, tle?: [string, string]): { lat: number; lon: number; altKm: number }\` in degrees / km. When \`tle\` is omitted it must still return a real position on first launch with no network — bundle a recent ISS TLE as the default and note where to refresh it from.

Return \`{ lat: NaN, lon: NaN, altKm: NaN }\` instead of throwing if propagation fails.`,
    workspace: [NS_APP],
    checks: [
      { name: 'satellite.js pinned to 5.x', file: 'package.json', match: /"satellite\.js"\s*:\s*"[~^]?5\./ },
      { name: 'not 7.x (ESM/WASM only)', file: 'package.json', notMatch: /"satellite\.js"\s*:\s*"[~^]?7\./ },
      { name: 'uses SGP4 API', file: 'src/app/iss.ts', match: /twoline2satrec[\s\S]*propagate[\s\S]*eciToGeodetic/ },
      { name: 'bundled fallback TLE (offline first launch)', file: 'src/app/iss.ts', match: /['"`]1 25544U[\s\S]*['"`]2 25544/ },
      { name: 'guards failed propagation', file: 'src/app/iss.ts', match: /NaN/ },
      {
        name: 'installs and matches satellite.js@5 reference', weight: 3,
        custom: async ({ sh, runTs }) => {
          const i = await sh('npm install --silent --no-audit --no-fund --no-package-lock 2>&1 | tail -3');
          if (i.code !== 0) return { passed: false, message: `npm install failed: ${i.out.slice(-200)}` };
          const r = await runTs(`
            import { issPosition } from './src/app/iss.ts';
            const l1 = '1 25544U 98067A   26228.56710022  .00005115  00000+0  99348-4 0  9991';
            const l2 = '2 25544  51.6334   1.2594 0007609  53.1141 307.0544 15.49461657581119';
            const p = issPosition(new Date('2026-08-17T12:34:56Z'), [l1, l2]);
            const d = issPosition(new Date('2026-08-17T12:34:56Z'));
            console.log(JSON.stringify({ p, dOk: Number.isFinite(d.lat) && Number.isFinite(d.lon) && d.altKm > 300 && d.altKm < 500 }));`);
          if (!r.ok) return { passed: false, message: `run failed: ${r.error.slice(0, 300)}` };
          const { p, dOk } = r.value;
          const ok = Math.abs(p.lat - -41.4646) < 0.05 && Math.abs(p.lon - 157.803) < 0.05 && Math.abs(p.altKm - 433.96) < 1;
          return { passed: ok && dOk, message: `got ${JSON.stringify(p)} defaultTLE=${dOk}` };
        },
      },
    ],
    rubric: `- Did the agent pin satellite.js to 5.x and explain why 7.x is a problem for webpack (ESM-only, WASM subpath imports)?
- Did it bundle a fallback TLE and mention refreshing from CelesTrak?
- Did it guard \`propagate\` returning false?`,
  },

  // ───────────────────────────── platform formatting / haptics ─────────────────────────────
  {
    name: 'no-intl-native-formatting',
    skill: 'ns-no-intl-native-formatting',
    instruction: `On the iOS build of this NativeScript app, times render like "Tue Aug 18 2026 05:14:26 GMT-0700 (PDT)" and \`(27597).toLocaleString()\` prints "27597" with no grouping. On Android it looks fine.

Create \`src/app/format.ts\` exporting:
- \`formatTime(date: Date, timeZone?: string): string\` — short localized time like "9:42 PM" or "21:42", honouring the user's 12/24-hour preference, optionally in an IANA time zone (e.g. "Africa/Lagos"), on BOTH platforms.
- \`groupDigits(n: number): string\` — "27,597".

Don't add a polyfill or a date library.`,
    workspace: [NS_APP],
    checks: [
      { name: 'iOS uses NSDateFormatter with a template/skeleton', file: 'src/app/format.ts', match: /NSDateFormatter[\s\S]*dateFormatFromTemplateOptionsLocale/ },
      { name: 'Android uses SimpleDateFormat/getBestDateTimePattern', file: 'src/app/format.ts', match: /getBestDateTimePattern[\s\S]*SimpleDateFormat|SimpleDateFormat[\s\S]*getBestDateTimePattern/ },
      { name: 'time zone applied natively', file: 'src/app/format.ts', match: /timeZoneWithName|TimeZone\.getTimeZone/ },
      { name: 'no Intl / toLocaleString', file: 'src/app/format.ts', notMatch: /\bIntl\.|toLocale(Time|Date)?String/ },
      { name: 'no polyfill/date lib added', file: 'package.json', notMatch: /"(dayjs|date-fns|luxon|moment|@formatjs\/intl|intl)"\s*:/ },
      { name: 'formatters cached', weight: 0.5, file: 'src/app/format.ts', match: /new Map\(|cache|memo|Record<string,\s*NSDateFormatter>|formatters?\s*[:=]\s*(\{|new )/i },
    ],
    rubric: `- Did the agent explain that the iOS V8 runtime has no ICU (Intl undefined) and use platform formatters instead of a polyfill?
- Did it use Unicode skeletons ("jmm") so 12/24h follows the device setting?
- Did it cache NSDateFormatter instances?`,
  },

  {
    name: 'haptics-direct',
    skill: 'ns-haptics-direct',
    instruction: `Add tactile feedback to this NativeScript app without adding a plugin.

Create \`src/app/haptics.ts\` exporting an object \`haptics\` with \`tick()\` (segmented-control / tab change), \`tap()\` (a selection) and \`success()\` (a rare celebratory moment). Both iOS and Android must work; make sure any Android manifest change needed is applied in App_Resources.`,
    workspace: [NS_APP],
    checks: [
      { name: 'iOS feedback generators', file: 'src/app/haptics.ts', match: /UISelectionFeedbackGenerator[\s\S]*UINotificationFeedbackGenerator|UINotificationFeedbackGenerator[\s\S]*UISelectionFeedbackGenerator/ },
      { name: 'UIImpactFeedbackGenerator for tap', file: 'src/app/haptics.ts', match: /UIImpactFeedbackGenerator/ },
      { name: 'Android VibrationEffect', file: 'src/app/haptics.ts', match: /VibrationEffect\.createOneShot/ },
      { name: 'VIBRATE permission in manifest', file: 'App_Resources/Android/src/main/AndroidManifest.xml', match: /android\.permission\.VIBRATE/ },
      { name: 'no haptics plugin', file: 'package.json', notMatch: /haptic|feedback|vibrat/i },
      { name: 'generators created lazily / cached', file: 'src/app/haptics.ts', match: /\?\?=|\|\|=|if \(!\w+\)/ },
    ],
    rubric: `- Did the agent map tick→selection, tap→impact(light), success→notification(success) on iOS?
- Did it warn that the simulator produces no haptics?
- Did it add the VIBRATE permission itself rather than only telling the user?`,
  },

  // ───────────────────────────── Android native ─────────────────────────────
  {
    name: 'android-java-interop-gotchas',
    skill: 'ns-android-java-interop-gotchas',
    instruction: `\`src/app/dots/dots-view.android.ts\` is a custom NativeScript view that draws animated dots with the Android Canvas. On the Android emulator the app crashes:

    JS: Error: Class constructor View cannot be invoked without 'new'

After I hacked around that locally I then got:

    Error: Cannot marshal JavaScript argument at index 3 to Java type.
    Failed resolving method drawPoints on class android.graphics.RecordingCanvas

Also the overlay styled by \`src/app/dots/dots.css\` (\`.dots-overlay\`, meant to be white at 10% opacity) renders as an almost opaque cyan on Android.

Fix all of it in place (same files, same public class name \`DotsView\`). Explain each root cause briefly in your final message.`,
    workspace: [NS_APP, { src: 'evals/fixtures/interop-bug', dest: '.' }],
    checks: [
      { name: '@NativeClass moved to module scope', file: 'src/app/dots/dots-view.android.ts', match: /^@NativeClass\(\)\s*\n\s*class\s+\w+\s+extends\s+android\.view\.View/m },
      { name: 'no @NativeClass inside createNativeView', file: 'src/app/dots/dots-view.android.ts', notMatch: /createNativeView\([^)]*\)[^{]*\{[\s\S]*?@NativeClass/ },
      { name: 'owner held via WeakRef, not a closure', file: 'src/app/dots/dots-view.android.ts', match: /new WeakRef\(/ },
      { name: 'gradient uses typed Java arrays', file: 'src/app/dots/dots-view.android.ts', match: /Array\.create\(\s*['"]int['"][\s\S]*Array\.create\(\s*['"]float['"]/ },
      { name: 'drawPoints gets a plain number[]', file: 'src/app/dots/dots-view.android.ts', notMatch: /drawPoints\(\s*(new\s+)?(xy|Float32Array)/ },
      { name: 'no Float32Array reaches drawPoints', file: 'src/app/dots/dots-view.android.ts', custom: async ({ read }) => {
        const s = read('src/app/dots/dots-view.android.ts') || '';
        const m = s.match(/drawPoints\(\s*([A-Za-z_$][\w$.]*)/);
        if (!m) return { passed: false, message: 'no drawPoints call' };
        const v = m[1].split('.').pop();
        const typed = new RegExp(`${v}\\s*(:\\s*Float32Array|=\\s*new\\s+Float32Array)`).test(s);
        return { passed: !typed, message: typed ? `${v} is a Float32Array` : `${v} is not a typed array` };
      } },
      { name: 'CSS colour fixed (rgba or #RRGGBBAA)', file: 'src/app/dots/dots.css', notMatch: /#1AFFFFFF/i },
      { name: 'CSS uses rgba()/8-digit css order', file: 'src/app/dots/dots.css', match: /rgba\(\s*255\s*,\s*255\s*,\s*255\s*,\s*0?\.1\s*\)|#FFFFFF1A/i },
    ],
    rubric: `- Did the agent identify that a @NativeClass declared inside a method makes the webpack NativeClass transformer downlevel the OUTER class (root cause of "Class constructor View cannot be invoked without 'new'")?
- Did it explain that JS typed arrays don't marshal to Java primitive arrays and that overloaded int[]/float[] constructors need Array.create?
- Did it explain NativeScript parses 8-digit hex as #RRGGBBAA (CSS order), not Android's #AARRGGBB?`,
  },

  {
    name: 'android-canvas-custom-view',
    skill: 'ns-android-canvas-custom-view',
    instruction: `Create an Android-only custom NativeScript view in \`src/app/particles/particles-view.android.ts\` (class \`ParticlesView extends View\`) that draws 3000 slowly drifting dots at 60fps using the Android Canvas from TypeScript, with a soft radial-gradient background. It has to keep a steady frame rate on a low-end emulator, so batch the drawing and don't allocate per frame. Clean up properly when the view is disposed.

Also add \`src/app/particles/particles-view.d.ts\` and \`src/app/particles/particles-view.ios.ts\` (iOS can be a plain black UIView placeholder).`,
    workspace: [NS_APP],
    checks: [
      { name: '@NativeClass android.view.View subclass at module scope', file: 'src/app/particles/particles-view.android.ts', match: /^@NativeClass\(\)\s*\n\s*class\s+\w+\s+extends\s+android\.view\.View/m },
      { name: 'global.__native(this)', file: 'src/app/particles/particles-view.android.ts', match: /return\s+global\.__native\(this\)/ },
      { name: 'onDraw override', file: 'src/app/particles/particles-view.android.ts', match: /onDraw\(/ },
      { name: 'Choreographer frame callback re-armed', file: 'src/app/particles/particles-view.android.ts', match: /Choreographer[\s\S]*postFrameCallback[\s\S]*postFrameCallback/ },
      { name: 'invalidate per frame', file: 'src/app/particles/particles-view.android.ts', match: /postInvalidateOnAnimation|invalidate\(\)/ },
      { name: 'batched drawPoints with number[]', file: 'src/app/particles/particles-view.android.ts', match: /drawPoints\(/ },
      { name: 'no typed array to canvas', file: 'src/app/particles/particles-view.android.ts', notMatch: /drawPoints\(\s*new\s+Float32Array|Float32Array\([^)]*\)[\s\S]{0,80}drawPoints/ },
      { name: 'gradient via Array.create', file: 'src/app/particles/particles-view.android.ts', match: /Array\.create\(\s*['"](int|float)['"]/ },
      { name: 'removeFrameCallback in dispose', file: 'src/app/particles/particles-view.android.ts', match: /disposeNativeView[\s\S]*removeFrameCallback/ },
      { name: 'platform split files', files: ['src/app/particles/particles-view.d.ts', 'src/app/particles/particles-view.ios.ts'] },
    ],
    rubric: `- Is the @NativeClass surface declared at module scope with the owner held via WeakRef?
- Are Paint/arrays reused across frames and points batched into few drawPoints calls?
- Did it use Array.create for int[]/float[] gradient params and avoid typed arrays?`,
  },

  // ───────────────────────────── iOS native ─────────────────────────────
  {
    name: 'ios-cadisplaylink-render-loop',
    skill: 'ns-ios-cadisplaylink-render-loop',
    instruction: `\`src/app/spinner/spinner-view.ios.ts\` should host a UIView and rotate a CALayer smoothly. Right now I'd use setInterval(16) but that stutters. Give the view a real 60fps tick driven by CADisplayLink under the NativeScript iOS runtime: create the file with class \`SpinnerView extends View\`, an \`onFrame(dt: number)\` method advancing rotation by dt seconds, keep ticking while the user scrolls a parent ScrollView, and tear the link down when the view is disposed.`,
    workspace: [NS_APP],
    checks: [
      { name: '@NativeClass NSObject target with ObjCExposedMethods', file: 'src/app/spinner/spinner-view.ios.ts', match: /@NativeClass\(\)[\s\S]*extends NSObject[\s\S]*ObjCExposedMethods/ },
      { name: 'CADisplayLink displayLinkWithTargetSelector', file: 'src/app/spinner/spinner-view.ios.ts', match: /displayLinkWithTargetSelector\(/ },
      { name: 'registered on default AND tracking run loop modes', file: 'src/app/spinner/spinner-view.ios.ts', match: /NSDefaultRunLoopMode[\s\S]*UITrackingRunLoopMode|UITrackingRunLoopMode[\s\S]*NSDefaultRunLoopMode/ },
      { name: 'not relying on NSRunLoopCommonModes alone', file: 'src/app/spinner/spinner-view.ios.ts', custom: async ({ read }) => {
        const s = read('src/app/spinner/spinner-view.ios.ts') || '';
        const common = /NSRunLoopCommonModes/.test(s), def = /NSDefaultRunLoopMode/.test(s);
        return { passed: !(common && !def), message: common && !def ? 'only NSRunLoopCommonModes (never fires under NS)' : 'ok' };
      } },
      { name: 'WeakRef owner', file: 'src/app/spinner/spinner-view.ios.ts', match: /WeakRef/ },
      { name: 'invalidate on dispose', file: 'src/app/spinner/spinner-view.ios.ts', match: /disposeNativeView[\s\S]*invalidate\(\)/ },
      { name: 'dt from link.timestamp, clamped', file: 'src/app/spinner/spinner-view.ios.ts', match: /timestamp[\s\S]*Math\.min\(|Math\.min\([\s\S]*timestamp/ },
      { name: 'no setInterval', file: 'src/app/spinner/spinner-view.ios.ts', notMatch: /setInterval\(/ },
    ],
    rubric: `- Did the agent use a @NativeClass target with static ObjCExposedMethods and the selector string 'tick' (no colon)?
- Did it register the link on NSDefaultRunLoopMode + UITrackingRunLoopMode and note that NSRunLoopCommonModes alone never fires under NativeScript?
- Are strong refs to link+target kept on the view, with a WeakRef back?`,
  },

  {
    name: 'ios-framework-typings',
    skill: 'ns-ios-framework-typings',
    instruction: `\`npx tsc --noEmit\` fails on this NativeScript project — see \`tsc-output.txt\`: "Cannot find name 'SCNView'", "'SCNScene'", "'CLLocation'" in \`src/app/native/scene.ios.ts\`. The code runs fine on device, so this is a typings problem. Fix the project's TypeScript setup so those names resolve properly (don't stub them with \`declare const … : any\` and don't rewrite scene.ios.ts). Then tell me how I could have found the right method spelling for e.g. \`SCNView.hitTest\` myself.`,
    workspace: [NS_APP, { src: 'evals/fixtures/typings-bug', dest: '.' }],
    checks: [
      { name: 'SceneKit typings referenced', file: 'references.d.ts', match: /types-ios\/lib\/ios\/objc-x86_64\/objc!SceneKit\.d\.ts/ },
      { name: 'CoreLocation typings referenced', file: 'references.d.ts', match: /objc!CoreLocation\.d\.ts/ },
      { name: '_LocationEssentials referenced (CLLocation lives there)', file: 'references.d.ts', match: /objc!_LocationEssentials\.d\.ts/ },
      { name: 'base types reference kept', weight: 0.5, file: 'references.d.ts', match: /@nativescript\/types\/index\.d\.ts/ },
      { name: 'no any-stubs', weight: 0.5, dir: 'src', notMatch: /declare\s+(const|var|class)\s+(SCNView|SCNScene|CLLocation)\b/ },
      { name: 'scene.ios.ts untouched', weight: 0.5, file: 'src/app/native/scene.ios.ts', match: /SCNView\.alloc\(\)\.initWithFrameOptions\(CGRectZero, null\)/ },
    ],
    rubric: `- Did the agent add /// <reference path> lines for the framework d.ts files under @nativescript/types-ios/lib/ios/objc-x86_64/ (including _LocationEssentials for CLLocation)?
- Did it recommend grepping the generated d.ts (and/or reading Apple SDK headers) for exact selector spellings?
- Did it avoid \`declare const X: any\` stubs?`,
  },

  {
    name: 'ios-scenekit-from-typescript',
    skill: 'ns-ios-scenekit-from-typescript',
    instruction: `Build an iOS custom view \`src/app/globe/globe-view.ios.ts\` (class \`GlobeView extends View\`) that hosts a SceneKit scene directly from TypeScript, no plugin:

- a unit sphere textured with \`src/assets/earth/day.jpg\` (bundled asset; load it from the app's folder at runtime), a camera with a 40° field of view framing the globe in portrait, and no default lighting;
- \`rotateTo(lonDeg: number)\` that turns the globe so that longitude faces the camera;
- \`hitTest(x: number, y: number): { lat: number; lon: number } | null\` that maps a tap (in NativeScript dip coordinates) to lat/lon on the sphere.

Also make sure the project's TypeScript setup knows about SceneKit. Do not add a plugin.`,
    workspace: [NS_APP],
    checks: [
      { name: 'SCNView created with initWithFrameOptions', file: 'src/app/globe/globe-view.ios.ts', match: /SCNView\.alloc\(\)\.initWithFrameOptions\(/ },
      { name: 'texture from app folder', file: 'src/app/globe/globe-view.ios.ts', match: /knownFolders\.currentApp\(\)[\s\S]*imageWithContentsOfFile|imageWithContentsOfFile[\s\S]*knownFolders/ },
      { name: 'camera fov 40 / no default lighting', file: 'src/app/globe/globe-view.ios.ts', custom: async ({ read }) => { const s = read('src/app/globe/globe-view.ios.ts') || ''; const ok = /fieldOfView\s*=/.test(s) && /\b40\b/.test(s) && /autoenablesDefaultLighting\s*=\s*false/.test(s); return { passed: ok, message: ok ? 'ok' : 'fov 40 / autoenablesDefaultLighting=false not both found' }; } },
      { name: 'hit test via hitTestOptions', file: 'src/app/globe/globe-view.ios.ts', match: /hitTestOptions\(/ },
      { name: 'lat/lon from local coords: lat=asin(y), lon=atan2(x, z)', file: 'src/app/globe/globe-view.ios.ts', match: /atan2\(\s*\w+\.x\s*,\s*\w+\.z\s*\)|atan2\(\s*x\s*,\s*z\s*\)/ },
      { name: 'no SCNVector3Make (does not exist)', file: 'src/app/globe/globe-view.ios.ts', notMatch: /SCNVector3Make/ },
      { name: 'no groupWithActions (does not exist)', file: 'src/app/globe/globe-view.ios.ts', notMatch: /groupWithActions/ },
      { name: 'SceneKit typings referenced', file: 'references.d.ts', match: /objc!SceneKit\.d\.ts/ },
      { name: 'no plugin added', file: 'package.json', notMatch: /scenekit|three|babylon/i },
    ],
    rubric: `- Did the agent pass SCNVector3 as plain {x,y,z} objects and set scene/pointOfView in initNativeView?
- Did it use the calibrated sphere UV mapping (lon 0 faces +Z, east +X) so rotateTo(-lon about Y) is right?
- Did it mention driving per-frame updates from a CADisplayLink rather than SCNSceneRendererDelegate?`,
  },

  {
    name: 'ios-simulator-automation',
    skill: 'ns-ios-simulator-automation',
    instruction: `I run this NativeScript app on the iOS simulator from CI-like shell scripts with no human watching. Write \`scripts/verify-ios.sh\` (bash) that, given the bundle id as \$1:

1. finds the booted simulator's UDID,
2. fakes the location to Portland (45.5152, -122.6784) and pre-grants the location permission so no prompt blocks the UI, then (re)launches the app,
3. takes two screenshots 3 seconds apart and exits non-zero if the screen did not change at all (frozen render loop),
4. dumps the last 2 minutes of the app's system log filtered for SceneKit/Metal errors,
5. explains in comments how I would tap a control at a given point without guessing coordinates.

Don't run it — just write it and make it executable.`,
    workspace: [NS_APP],
    checks: [
      { name: 'script exists & executable', custom: async ({ sh }) => { const r = await sh('test -x scripts/verify-ios.sh && echo yes'); return { passed: r.out.trim() === 'yes', message: r.out.trim() || 'missing or not executable' }; } },
      { name: 'booted udid via simctl list', file: 'scripts/verify-ios.sh', match: /simctl list devices booted|simctl list devices.*booted|booted/i },
      { name: 'simctl location set', file: 'scripts/verify-ios.sh', match: /simctl location .* set/ },
      { name: 'simctl privacy grant location', file: 'scripts/verify-ios.sh', match: /simctl privacy .* grant location/ },
      { name: 'terminate/launch after granting', file: 'scripts/verify-ios.sh', match: /simctl launch/ },
      { name: 'two screenshots + compare', file: 'scripts/verify-ios.sh', match: /simctl io .* screenshot[\s\S]*simctl io .* screenshot[\s\S]*(cmp|diff|md5|shasum)/ },
      { name: 'log show with predicate', file: 'scripts/verify-ios.sh', match: /log show[\s\S]*--predicate/ },
      { name: 'mentions idb / describe-all for tap targets', file: 'scripts/verify-ios.sh', match: /idb ui (describe-all|tap)|describe-all/ },
    ],
    rubric: `- Did the agent use xcrun simctl (list/location/privacy/io/launch/spawn log show) correctly?
- Did it note that privacy grants apply at next launch and that idb coordinates are points (dip)?
- Is the frozen-screen check sound (identical images ⇒ fail)?`,
  },

  // ───────────────────────────── cross-platform views ─────────────────────────────
  {
    name: 'custom-view-platform-split',
    skill: 'ns-custom-view-platform-split',
    instruction: `Scaffold a custom NativeScript view called \`Radar\` under \`src/app/radar/\` that has a different native renderer per platform (a UIView subclass drawing on iOS, an android.view.View on Android — the drawing itself can be a stub), sharing:

- a boolean \`sweeping\` property usable from templates (\`<Radar sweeping="false">\`),
- a \`radarTap\` event that carries the tap position,
- pan + tap gesture handling in shared code.

Wire it up so it can be used as \`<Radar>\` in this Angular app's home template, and set up the file layout so TypeScript and webpack both resolve \`import { RadarView } from './radar/radar-view'\`.`,
    workspace: [NS_APP],
    checks: [
      { name: 'common/ios/android/d.ts split', files: ['src/app/radar/radar-view.common.ts', 'src/app/radar/radar-view.ios.ts', 'src/app/radar/radar-view.android.ts', 'src/app/radar/radar-view.d.ts'] },
      { name: 'Property registered in common', file: 'src/app/radar/radar-view.common.ts', match: /new Property<[\s\S]*name:\s*['"]sweeping['"][\s\S]*\.register\(/ },
      { name: 'booleanConverter', file: 'src/app/radar/radar-view.common.ts', match: /booleanConverter/ },
      { name: 'event constant', file: 'src/app/radar/radar-view.common.ts', match: /radarTap/ },
      { name: 'gestures attached with string names', file: 'src/app/radar/radar-view.common.ts', match: /\.on\(\s*['"](pan|tap)['"]/ },
      { name: 'platform files re-export common', dir: 'src/app/radar', match: /export \* from ['"]\.\/radar-view\.common['"]/ },
      { name: 'registerElement in main.ts', file: 'src/main.ts', match: /registerElement\(\s*['"]Radar['"]/ },
      { name: 'used in home template', file: 'src/app/home/home.component.html', match: /<Radar/ },
    ],
    rubric: `- Is there a *.common.ts abstract base + *.ios.ts / *.android.ts + a hand-written *.d.ts that the bare import resolves to?
- Are gestures attached with string names in the base and detached on dispose?
- Did it use registerElement before bootstrap and NO_ERRORS_SCHEMA?`,
  },

  {
    name: 'liquid-glass-panel',
    skill: 'ns-liquid-glass-panel',
    instruction: `I want a frosted-glass bottom panel over the full-bleed content in this NativeScript Angular app: real Liquid Glass on iOS 26+, a blur on older iOS, and something that reads as glass on Android (there is no backdrop blur there). White text on it must stay readable over dark content.

Create \`src/app/glass/glass-view.ts\` (class \`GlassView\`, usable as \`<Glass>\` with a \`glassRadius\` property), register it, and update \`src/app/home/home.component.html\` so a bottom panel with a couple of labels sits on the glass — and does NOT accidentally stretch to cover the whole screen.`,
    workspace: [NS_APP],
    checks: [
      { name: 'UIGlassEffect behind an SDK guard', file: 'src/app/glass/glass-view.ts', match: /SDK_VERSION\s*>=\s*26[\s\S]*UIGlassEffect|UIGlassEffect[\s\S]*SDK_VERSION\s*>=\s*26/ },
      { name: 'UIBlurEffect fallback', file: 'src/app/glass/glass-view.ts', match: /UIBlurEffect\.effectWithStyle/ },
      { name: 'UIVisualEffectView host', file: 'src/app/glass/glass-view.ts', match: /UIVisualEffectView\.alloc\(\)\.initWithEffect/ },
      { name: 'dark tint so white type stays readable', file: 'src/app/glass/glass-view.ts', match: /tintColor\s*=/ },
      { name: 'Android translucent drawable', file: 'src/app/glass/glass-view.ts', match: /GradientDrawable[\s\S]*setCornerRadius/ },
      { name: 'glassRadius Property', file: 'src/app/glass/glass-view.ts', match: /name:\s*['"]glassRadius['"]/ },
      { name: 'registerElement Glass', dir: 'src', match: /registerElement\(\s*['"]Glass['"]/ },
      { name: 'panel GridLayout rows="auto" with glass first', file: 'src/app/home/home.component.html', match: /<GridLayout[^>]*rows="auto"[^>]*>\s*<Glass/ },
    ],
    rubric: `- Did the agent explain the rows="auto" trap (implicit * row makes a bare View child fill the screen)?
- iOS 26 corner radius via cornerConfiguration, pre-26 via layer.cornerRadius?
- Did it explain Android has no backdrop-blur primitive and why RenderEffect doesn't help?`,
  },

  {
    name: 'ios-bottom-sheet-native',
    skill: 'ns-ios-bottom-sheet-native',
    instruction: `In this NativeScript Angular app, open \`src/app/details/details.component.ts\` (create it — a simple standalone component with a couple of labels) as a REAL iOS bottom sheet: medium and large detents, a visible grabber, rounded corners, and on iOS 26 let the system glass show through instead of an opaque background. Use \`NativeDialogService\` from \`@nativescript/angular\`; put the opener in \`src/app/home/home.component.ts\` as \`openDetails()\`. Explain what happens on Android and when a sheet is the wrong tool.`,
    workspace: [NS_APP],
    checks: [
      { name: 'PageSheet presentation style', dir: 'src/app', match: /UIModalPresentationStyle\.PageSheet/ },
      { name: 'sheetPresentationController configured', dir: 'src/app', match: /sheetPresentationController/ },
      { name: 'medium + large detents', dir: 'src/app', match: /mediumDetent\(\)[\s\S]*largeDetent\(\)|largeDetent\(\)[\s\S]*mediumDetent\(\)/ },
      { name: 'grabber', dir: 'src/app', match: /prefersGrabberVisible\s*=\s*true/ },
      { name: 'JS array → NSArray for detents', dir: 'src/app', match: /jsArrayToNSArray|NSArray\.arrayWithArray/ },
      { name: 'configured after load (loaded/setTimeout)', dir: 'src/app', match: /loaded[\s\S]*setTimeout|setTimeout[\s\S]*sheetPresentationController/ },
      { name: 'iOS 26 transparency', dir: 'src/app', match: /SDK_VERSION\s*>=\s*26[\s\S]*(clearColor|transparent)/ },
      { name: 'NativeDialogService.open with nativeOptions.ios', dir: 'src/app', match: /nativeOptions[\s\S]{0,400}presentationStyle\s*:\s*UIModalPresentationStyle\.PageSheet/ },
    ],
    rubric: `- Did the agent configure the *presented* view controller after the view loaded?
- Did it set both the NS Page background and vc.view.backgroundColor clear on iOS 26?
- Did it explain Android has no sheet controller (fullscreen fallback / in-page panel) and when an in-page glass panel is better (page-level choreography)?`,
  },

  {
    name: 'animated-panel-height',
    skill: 'ns-animated-panel-height',
    instruction: `\`src/app/home/home.component.html\` has a bottom panel (\`ScrollView\` → \`<ns-panel>\`) whose content switches between a short summary and a 12-item list when \`store.mode()\` changes.

Make the panel animate its height smoothly to fit the new content on BOTH platforms, never taller than half the screen (then it scrolls). It works on iOS with a naive approach but on Android the panel grows and never shrinks back — fix that properly. Edit the home + panel components as needed.`,
    workspace: [NS_APP, { src: 'evals/fixtures/panel', dest: '.' }],
    checks: [
      { name: 'explicit measure with UNSPECIFIED height', dir: 'src/app', match: /\.measure\([\s\S]*UNSPECIFIED/ },
      { name: 'animate height', dir: 'src/app', match: /animate\(\s*\{[^}]*height/ },
      { name: 'cap at half the screen', dir: 'src/app', match: /heightDIPs\s*\*\s*0\.5|heightDIPs\s*\/\s*2/ },
      { name: 'ScrollView ref captured via (loaded)', file: 'src/app/home/home.component.html', match: /<ScrollView[^>]*\(loaded\)=/ },
      { name: 'layout event bound on a real layout view inside ns-panel (not the host)', file: 'src/app/panel/panel.component.html', match: /<StackLayout[^>]*\((loaded|layoutChanged)\)=/ },
      { name: 'no (layoutChanged) on the Angular host element', file: 'src/app/home/home.component.html', notMatch: /<ns-panel[^>]*\(layoutChanged\)/ },
      { name: 'skips no-op animations (last target)', dir: 'src/app', match: /lastTarget|Math\.abs\([^)]*\)\s*<\s*1/ },
      { name: 'effect() re-fits after mode change', dir: 'src/app', match: /effect\(\s*\(\)\s*=>[\s\S]*mode\(\)/ },
    ],
    rubric: `- Did the agent explain that Android's VerticalScrollView lays its child out at least as tall as itself so layoutChanged never fires when content shrinks?
- Did it re-emit loaded/layoutChanged from the panel's root layout as outputs instead of binding on the host element?
- Did it avoid animating on first layout and skip no-op targets?`,
  },

  // ───────────────────────────── location / geo ─────────────────────────────
  {
    name: 'corelocation-direct',
    skill: 'ns-corelocation-direct',
    instruction: `Add device location to this NativeScript app WITHOUT a plugin. Create \`src/app/location.ts\` exporting \`requestOnce(cb: (loc: { lat: number; lon: number } | null, error?: string) => void)\` that:

- on iOS asks for when-in-use authorization if needed and then delivers ONE fix (handle denied/restricted),
- on Android checks/requests ACCESS_COARSE_LOCATION and returns the last known location.

Also add whatever the two platform manifests/plists need, make sure the iOS types compile, and tell me how to fake a location on the simulator and emulator.`,
    workspace: [NS_APP],
    checks: [
      { name: '@NativeClass delegate implementing CLLocationManagerDelegate', file: 'src/app/location.ts', match: /@NativeClass\(\)[\s\S]*ObjCProtocols\s*=\s*\[\s*CLLocationManagerDelegate\s*\]/ },
      { name: 'iOS 14+ authorization callback', file: 'src/app/location.ts', match: /locationManagerDidChangeAuthorization/ },
      { name: 'requestWhenInUseAuthorization → requestLocation', file: 'src/app/location.ts', match: /requestWhenInUseAuthorization[\s\S]*requestLocation\(\)|requestLocation\(\)[\s\S]*requestWhenInUseAuthorization/ },
      { name: 'didUpdateLocations + didFailWithError', file: 'src/app/location.ts', match: /locationManagerDidUpdateLocations[\s\S]*locationManagerDidFailWithError|locationManagerDidFailWithError[\s\S]*locationManagerDidUpdateLocations/ },
      { name: 'manager and delegate kept alive at module scope', file: 'src/app/location.ts', match: /^(let|const|var)\s+\w*(manager|delegate)\w*\s*[:=]/mi },
      { name: 'Android permission check + LocationManager', file: 'src/app/location.ts', match: /checkSelfPermission[\s\S]*ACCESS_COARSE_LOCATION[\s\S]*LocationManager|LocationManager[\s\S]*checkSelfPermission/ },
      { name: 'Info.plist usage string', file: 'App_Resources/iOS/Info.plist', match: /NSLocationWhenInUseUsageDescription/ },
      { name: 'Android manifest permission', file: 'App_Resources/Android/src/main/AndroidManifest.xml', match: /ACCESS_COARSE_LOCATION|ACCESS_FINE_LOCATION/ },
      { name: 'CoreLocation + _LocationEssentials typings', file: 'references.d.ts', match: /objc!CoreLocation\.d\.ts[\s\S]*objc!_LocationEssentials\.d\.ts|objc!_LocationEssentials\.d\.ts[\s\S]*objc!CoreLocation\.d\.ts/ },
      { name: 'no location plugin', file: 'package.json', notMatch: /geolocation|nativescript-geo/i },
    ],
    rubric: `- Does the delegate keep both manager and delegate strongly referenced?
- Did the agent note kCLLocationAccuracyKilometer is missing from typings (numeric fallback) and that CLLocation is declared in _LocationEssentials?
- Did it give simctl location set / simctl privacy grant and adb emu geo fix (lon first)?`,
  },

  {
    name: 'clgeocoder-place-and-timezone',
    skill: 'ns-clgeocoder-place-and-timezone',
    instruction: `When the user taps a point on the globe in this NativeScript app I need to show "Lagos, Nigeria · 9:42 PM" — i.e. a place name and the local time there — with no API keys or paid services.

Create \`src/app/place.ts\` exporting \`describePlace(lat: number, lon: number): Promise<{ name: string; timeZone?: string; ocean: boolean }>\` using the platform geocoders on iOS and Android, returning an IANA time-zone id where the platform provides it, and a sensible friendly name for taps on open water (which ocean). Note any rate-limit caveats.`,
    workspace: [NS_APP],
    checks: [
      { name: 'CLGeocoder reverse geocode', file: 'src/app/place.ts', match: /CLGeocoder[\s\S]*reverseGeocodeLocationCompletionHandler/ },
      { name: 'CLPlacemark.timeZone', file: 'src/app/place.ts', match: /timeZone\??\.name/ },
      { name: 'Android Geocoder.getFromLocation', file: 'src/app/place.ts', match: /android\.location\.Geocoder[\s\S]*getFromLocation/ },
      { name: 'ocean fallback by lat/lon', file: 'src/app/place.ts', match: /Southern Ocean|Pacific Ocean|Atlantic Ocean|Indian Ocean/ },
      { name: 'ocean flag from placemark water fields', file: 'src/app/place.ts', match: /\.ocean|inlandWater/ },
      { name: 'CLLocation for the geocoder', file: 'src/app/place.ts', match: /CLLocation\.alloc\(\)\.initWithLatitudeLongitude/ },
      { name: 'no third-party geocoding', file: 'package.json', notMatch: /geocod|timezone|tz-lookup|geo-tz/i },
    ],
    rubric: `- Did the agent read timeZone from CLPlacemark and explain Android's Geocoder has no time zone (mean solar time / tz lib fallback)?
- Did it warn about Apple's geocoder rate limits (geocode on tap/dwell only, not per drag)?
- Ocean fallback returns a friendly ocean name?`,
  },

  // ───────────────────────────── Angular ─────────────────────────────
  {
    name: 'angular-zoneless-native-choreography',
    skill: 'ns-angular-zoneless-native-choreography',
    instruction: `This NativeScript Angular app is zoneless (signals). In \`src/app/home/home.component.{ts,html}\`:

1. Add a store signal \`mode: 'earth' | 'lookup'\` (create \`src/app/state/app.store.ts\`) and bind it to a native \`SegmentedBar\` with items "Earth" / "Look up".
2. Add a bottom info panel (a StackLayout with two labels) that starts hidden and fades + slides in ~2.3 s after load, timed with a 3D intro that runs behind it.
3. A custom \`<Globe>\` view (assume it exists and emits an \`interaction\` event with \`{ active: boolean }\`) sits full-bleed underneath; while the user is manipulating the globe, dim the panel to 30% and restore it after — smoothly, not a snap.
4. Push \`mode()\` into the globe by calling \`globe.setMode(mode)\` whenever it changes, and make sure the very first value reaches the globe even though it is created after the component.

Don't add zone.js.`,
    workspace: [NS_APP],
    checks: [
      { name: 'store with mode signal', file: 'src/app/state/app.store.ts', match: /signal<['"]earth['"]\s*\|\s*['"]lookup['"]>|mode\s*=\s*signal/ },
      { name: 'SegmentedBar bound to signal', file: 'src/app/home/home.component.html', match: /<SegmentedBar[^>]*\[selectedIndex\]=[^>]*\(selectedIndexChanged\)=|<SegmentedBar[^>]*\(selectedIndexChanged\)=[^>]*\[selectedIndex\]=/ },
      { name: 'newIndex read from event', file: 'src/app/home/home.component.ts', match: /\.newIndex/ },
      { name: 'panel ref via (loaded)', file: 'src/app/home/home.component.html', match: /\(loaded\)=/ },
      { name: 'intro animate opacity+translate with delay', file: 'src/app/home/home.component.ts', match: /setTimeout\([\s\S]*animate\(\s*\{[^}]*opacity[^}]*translate|animate\(\s*\{[^}]*translate[^}]*opacity/ },
      { name: 'dim/restore via animate on interaction', file: 'src/app/home/home.component.ts', match: /interaction[\s\S]*animate\(\s*\{[^}]*opacity[^}]*0\.3/i },
      { name: 'effect() pushes mode into globe', file: 'src/app/home/home.component.ts', match: /effect\(\s*\(\)\s*=>[\s\S]*setMode\(/ },
      { name: 'seed once in (loaded) after view exists', file: 'src/app/home/home.component.ts', match: /onGlobeLoaded|globe\s*=\s*args\.object|\.object as GlobeView/ },
      { name: 'no zone.js', file: 'package.json', notMatch: /"zone\.js"/ },
      { name: 'no [opacity] binding for the dim', file: 'src/app/home/home.component.html', notMatch: /\[opacity\]/ },
    ],
    rubric: `- Did the agent use view.animate() for anything the eye follows (intro, dim) instead of [opacity] bindings?
- Is effect() declared in the constructor (injection context) and the first value seeded in the (loaded) handler?
- Did it use args.newIndex and NO_ERRORS_SCHEMA correctly?`,
  },

  {
    name: 'webpack-angular-project-notes',
    skill: 'ns-webpack-angular-project-notes',
    instruction: `This is a fresh \`ns create --ng\` NativeScript app. Three things:

1. It fetches \`http://api.open-notify.org/astros.json\` (plain HTTP) and the request fails on both platforms — fix the platform config so that host is allowed.
2. The UI is dark and immersive: make the iOS status bar light-content app-wide (not per view controller) and set the display name to "Overview" on both platforms.
3. I keep seeing red type errors scroll past during \`ns run ios\` yet the app still launches — explain in a short paragraph in \`NOTES.md\` why that happens with this toolchain and how to catch them.`,
    workspace: [NS_APP],
    checks: [
      { name: 'ATS exception for host', file: 'App_Resources/iOS/Info.plist', match: /NSAppTransportSecurity[\s\S]*NSExceptionDomains[\s\S]*api\.open-notify\.org[\s\S]*NSExceptionAllowsInsecureHTTPLoads/ },
      { name: 'Android cleartext (usesCleartextTraffic or network_security_config)', dir: 'App_Resources/Android', match: /usesCleartextTraffic\s*=\s*"true"|cleartextTrafficPermitted\s*=\s*"true"/ },
      { name: 'light status bar', file: 'App_Resources/iOS/Info.plist', match: /UIStatusBarStyleLightContent/ },
      { name: 'UIViewControllerBasedStatusBarAppearance false', file: 'App_Resources/iOS/Info.plist', match: /UIViewControllerBasedStatusBarAppearance<\/key>\s*<false\/>/ },
      { name: 'CFBundleDisplayName Overview', file: 'App_Resources/iOS/Info.plist', match: /CFBundleDisplayName<\/key>\s*<string>Overview<\/string>/ },
      { name: 'Android app_name override', file: 'App_Resources/Android/src/main/res/values/strings.xml', match: /name="app_name">Overview</ },
      { name: 'NOTES.md explains errors don\'t stop the dev bundle', file: 'NOTES.md', match: /compiled with (\d+|N) errors|still (syncs|bundles|launches|emits|builds)|grep|doesn.t (stop|block|gate)/i },
    ],
    rubric: `- Did the agent edit Info.plist / AndroidManifest / strings.xml directly and correctly?
- Does NOTES.md say the webpack dev build syncs a bundle despite TS errors and suggest grepping the run log?
- Did it avoid unrelated changes?`,
  },

  {
    name: 'angular-vite-migration',
    skill: 'ns-angular-vite-migration',
    instruction: `Migrate this NativeScript Angular project from @nativescript/webpack to @nativescript/vite. Do the file/config/package.json changes only — do NOT run npm install or a build here (no network / no simulator in this environment).

Use a version set that is known to work together, add whatever config files the Vite pipeline needs, keep it zoneless, and pre-empt the two launch-time crashes people hit after this migration (one on iOS/Angular bootstrap, one on Android). Summarize the version choices and why in \`MIGRATION.md\`.`,
    workspace: [NS_APP],
    checks: [
      { name: '@nativescript/vite added', file: 'package.json', match: /"@nativescript\/vite"\s*:/ },
      { name: 'analogjs plugin', file: 'package.json', match: /"@analogjs\/vite-plugin-angular"\s*:/ },
      { name: '@nativescript/android pinned 9.0.5 (FORTIFY crash on 9.1 alpha)', file: 'package.json', match: /"@nativescript\/android"\s*:\s*"[~^]?9\.0\.5"/ },
      { name: 'patch-package postinstall', file: 'package.json', match: /"postinstall"\s*:\s*"patch-package"/ },
      { name: 'zoneless (no zone.js)', file: 'package.json', notMatch: /"zone\.js"/ },
      { name: 'bundler vite in nativescript.config.ts', file: 'nativescript.config.ts', match: /bundler:\s*['"]vite['"][\s\S]*bundlerConfigPath|bundlerConfigPath[\s\S]*bundler:\s*['"]vite['"]/ },
      { name: 'vite.config.mts uses angularConfig', file: 'vite.config.mts', match: /@nativescript\/vite\/angular[\s\S]*angularConfig\(/ },
      { name: 'IMAGE_CONFIG provider (NG0210 fix)', file: 'src/main.ts', match: /IMAGE_CONFIG[\s\S]*disableImageSizeWarning/ },
      { name: '.ns-vite-build ignored', file: '.gitignore', match: /\.ns-vite-build/ },
      { name: 'MIGRATION.md written', file: 'MIGRATION.md', match: /9\.0\.5|NG0210|FORTIFY/ },
    ],
    rubric: `- Did the agent name the compatible version set (@nativescript/vite alpha, @nativescript/angular alpha, core next, Angular 21, analogjs) and the analogjs patch?
- Did it pre-empt NG0210 (IMAGE_CONFIG) and the Android FORTIFY fseeko abort (pin @nativescript/android 9.0.5)?
- Did it keep tsconfig/polyfills unchanged and delete webpack.config.js/hooks?`,
  },

  // ───────────────────────────── assets ─────────────────────────────
  {
    name: 'app-icons-and-launch-assets',
    skill: 'ns-app-icons-and-launch-assets',
    instruction: `This NativeScript app still ships the template icon. Generate a simple new icon (any design — e.g. a dark gradient with a light circle) as \`icon-1024.png\` in the project root, then install it at every size the project already expects for iOS (keep \`Assets.xcassets/AppIcon.appiconset/Contents.json\` valid — don't invent new filenames) and at all Android launcher densities. Tools available on this Mac: python3 with PIL, sips. Don't run a NativeScript build.`,
    workspace: [NS_APP],
    checks: [
      { name: 'icon-1024.png is 1024×1024', custom: async ({ sh }) => { const r = await sh(`sips -g pixelWidth -g pixelHeight icon-1024.png 2>/dev/null | awk '/pixel/{print $2}' | tr '\\n' 'x'`); return { passed: r.out.trim() === '1024x1024x', message: r.out.trim() || 'missing' }; } },
      { name: 'Contents.json valid & unchanged filenames', weight: 1, custom: async ({ read }) => {
        try { const j = JSON.parse(read('App_Resources/iOS/Assets.xcassets/AppIcon.appiconset/Contents.json')); const n = j.images.filter((i) => i.filename).length; return { passed: n >= 15, message: `${n} entries` }; } catch (e) { return { passed: false, message: 'invalid JSON' }; }
      } },
      { name: 'every iOS icon has the size Contents.json declares', weight: 3, custom: async ({ read, sh }) => {
        const j = JSON.parse(read('App_Resources/iOS/Assets.xcassets/AppIcon.appiconset/Contents.json'));
        let bad = [], n = 0;
        for (const i of j.images) {
          if (!i.filename) continue; n++;
          const px = Math.round(parseFloat(i.size) * parseInt(i.scale));
          const r = await sh(`sips -g pixelWidth "App_Resources/iOS/Assets.xcassets/AppIcon.appiconset/${i.filename}" 2>/dev/null | awk '/pixelWidth/{print $2}'`);
          if (parseInt(r.out.trim()) !== px) bad.push(`${i.filename}:${r.out.trim() || 'missing'}≠${px}`);
        }
        return { passed: bad.length === 0, message: bad.length ? bad.slice(0, 5).join(', ') : `${n} sizes correct` };
      } },
      { name: 'iOS icons actually replaced (differ from template)', weight: 2, custom: async ({ sh, fixtureFile }) => {
        const r = await sh(`cmp -s "App_Resources/iOS/Assets.xcassets/AppIcon.appiconset/icon-60@3x.png" "${fixtureFile('ns-app/App_Resources/iOS/Assets.xcassets/AppIcon.appiconset/icon-60@3x.png')}" && echo same || echo different`);
        return { passed: r.out.trim() === 'different', message: r.out.trim() };
      } },
      { name: 'Android launcher densities', weight: 2, custom: async ({ sh }) => {
        const want = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 }; const bad = [];
        for (const [d, px] of Object.entries(want)) {
          const r = await sh(`sips -g pixelWidth "App_Resources/Android/src/main/res/mipmap-${d}/ic_launcher.png" 2>/dev/null | awk '/pixelWidth/{print $2}'`);
          if (parseInt(r.out.trim()) !== px) bad.push(`${d}:${r.out.trim() || 'missing'}`);
        }
        return { passed: bad.length === 0, message: bad.length ? bad.join(', ') : '5/5' };
      } },
    ],
    rubric: `- Did the agent fill the EXISTING appiconset filenames (sips -Z per file) rather than rewriting Contents.json?
- Did it cover Android mipmaps (and ideally the adaptive-icon foreground)?
- Did it mention App_Resources changes need a full rebuild / ns clean?`,
  },
];
