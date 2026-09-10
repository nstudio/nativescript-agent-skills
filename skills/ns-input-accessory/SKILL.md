---
name: ns-input-accessory
description: Use when adding @nativescript/input-accessory to a NativeScript app (any frontend flavor) for a keyboard-docked chat/composer/search bar, or when a docked bar is squeezed, its text sits off-center, it covers a tab bar or the Android gesture area, disappears after a modal, or floats over a sheet — install, the ScrollView + container + TextView contract, setup() with real geometry, CSS-padding text centering, IQKeyboardManager coexistence, Android insets, suspend/restore around dialogs (bundled 1.0.3 patch), and the verification checklist.
license: MIT
metadata:
  author: nstudio
  source: https://github.com/nstudio/nativescript-agent-skills
---

# @nativescript/input-accessory — a keyboard-docked composer, set up properly

Plugin: https://github.com/NativeScript/plugins/tree/main/packages/input-accessory

Use it for exactly one input pinned to the bottom edge with scrolling content
above it (chat, AI composer, docked search). Multi-field forms want
`@nativescript/iqkeyboardmanager` instead — the dock is built around one
`TextView`, not field-to-field navigation.

## Install

```bash
npm install @nativescript/input-accessory
```

Native code (Swift `KeyboardTrackingView`, Kotlin `KeyboardAccessoryHelper`)
ships inside the plugin; no plist, manifest, or gradle edits. It needs a full
`ns run` rebuild after install, and again after any change under the plugin's
`platforms/ios/src/` — HMR never recompiles Swift. Android needs API 30+;
below that `setup()` is a no-op and the layout below still works with the
platform's default keyboard resize.

## The layout contract (identical in every flavor)

Three views on one Page: a `ScrollView` for content, a transparent container
as the last `auto` row, one `TextView` inside it.

```xml
<GridLayout rows="*, auto">
  <!-- the plugin owns this viewport's frame/insets down to the screen edge -->
  <ScrollView row="0" iosOverflowSafeArea="false">
    <StackLayout class="px-4 pb-4">
      <Label text="messages…" textWrap="true" />
    </StackLayout>
  </ScrollView>
  <!-- container stays TRANSPARENT (iOS docks it on the system keyboard blur);
       the pill is the visible surface; the send button is a SIBLING column -->
  <GridLayout row="1" columns="*, auto" class="px-3 pt-1 pb-2 bg-transparent">
    <StackLayout col="0" minHeight="44" verticalAlignment="center" class="rounded-3xl bg-white">
      <TextView minHeight="44" hint="Message" class="mx-4 text-base bg-transparent border-0" />
    </StackLayout>
    <Button col="1" width="44" height="44" verticalAlignment="bottom" text="↑" class="ml-2 rounded-full p-0" />
  </GridLayout>
</GridLayout>
```

Rules the code enforces, not the docs:

* **`TextView`, never `TextField`** — auto-grow measures a multi-line text view.
* **`minHeight` on BOTH the pill and the TextView.** The plugin clamps only the
  accessory container; an emptied TextView measures near zero and the pill
  collapses around it.
* **Send button outside the pill**, explicit `width`/`height`. Inside a rounded,
  clipping pill the corner curve and the plugin-imposed container height slice it.
* **No `returnKeyType="send"` / `returnPress` on the TextView.** Return inserts a
  line break (the Messages/WhatsApp contract); on a TextView the newline lands in
  the text *and* `returnPress` fires, so you would get a send plus stray blank lines.
* **No `py-*` padding classes on the TextView** — vertical padding is computed in
  code (below) and must be the single source of truth.

## setup() — once per page, after all three views load, with real geometry

Framework-neutral controller; each flavor only feeds it the views and calls
`destroy()` on teardown.

```ts
import { Page, ScrollView, TextView, Utils, View } from '@nativescript/core';
import { InputAccessoryManager } from '@nativescript/input-accessory';

const PILL_HEIGHT = 44;      // == minHeight on the pill and the TextView
const COMPOSER_PADDING = 12; // container pt-1 (4) + pb-2 (8); keep in sync with the template

export class ComposerDock {
  private manager: InputAccessoryManager | null = null;
  private scrollView?: ScrollView;
  private container?: View;
  private textView?: TextView;

  constructor(private page: Page) {}

  // call each from that view's `loaded` handler; setup runs once all three exist
  attachScrollView(v: ScrollView) { this.scrollView = v; this.trySetup(); }
  attachContainer(v: View) { this.container = v; this.trySetup(); }
  attachTextView(v: TextView) { this.textView = v; this.trySetup(); }

  private trySetup() {
    if (this.manager || !this.scrollView || !this.container || !this.textView) return;
    this.manager = new InputAccessoryManager();
    this.manager.setup({
      page: this.page,
      scrollView: this.scrollView,
      inputContainer: this.container,
      textView: this.textView,
      baseHeight: PILL_HEIGHT + COMPOSER_PADDING,
      containerPadding: COMPOSER_PADDING,
    });
    this.centerText();
  }

  // Text and hint draw from the TOP inset on both platforms; split the leftover
  // pill height so a single line sits dead-center. Always via style, never
  // UITextView.textContainerInset (see below).
  private centerText() {
    const tv = this.textView!;
    const lineHeight = __APPLE__
      ? (tv.ios as UITextView).font.lineHeight
      : Utils.layout.toDeviceIndependentPixels((tv.android as android.widget.EditText).getLineHeight());
    const v = Math.max(0, (PILL_HEIGHT - lineHeight) / 2);
    tv.style.paddingTop = v;
    tv.style.paddingBottom = v;
    tv.style.paddingLeft = 10;
    tv.style.paddingRight = 10;
  }

  textChanged() { this.manager?.updateAccessoryHeight(); }
  sent() { this.manager?.updateAccessoryHeight(); }        // after clearing the text; keyboard stays up
  contentChanged() { this.manager?.relayoutScrollViewContent(); } // messages appended while idle
  dismissKeyboard() { this.manager?.dismissKeyboard(); }   // tap on the list; bar stays docked
  suspend() { this.manager?.suspend(); }                   // patched plugin — see Dialogs
  restore() { this.manager?.restore(); }
  destroy() { this.manager?.cleanup(); this.manager = null; }
}
```

Why the geometry is explicit: `setup()` trusts the container's measured height
only when it is ≤ 50pt. A padded 56pt container silently falls back to
`baseHeight` 48 and is then laid out at exactly 48, squeezing a 44pt pill and
button to 36. `baseHeight` = pill + container vertical padding,
`containerPadding` = that padding. `maxHeight` above 200 is ignored on iOS (the
Swift side clamps 48…200).

Why padding via `style`: core maps the TextView's CSS padding onto
`textContainerInset` and re-applies that mapping on every full style pass
(dark/light toggle, trait change). A raw native write survives until the next
pass, then the text drifts off-center. Set the padding *after* `setup()` —
unpatched 1.0.3 writes a 10pt inset during setup.

Do not `dismissSoftInput()` after send — the composer stays docked and the
keyboard stays up, Messages-style.

### Wiring per flavor

| Flavor | `page` | The three views | Teardown |
|---|---|---|---|
| Angular | `inject(Page)` in the routed component | `(loaded)="dock.attachScrollView($event.object)"` etc. | `ngOnDestroy` → `dock.destroy()` |
| Core XML/TS | `args.object as Page` in `navigatingTo` | `loaded="…"` attributes, or `page.getViewById` from the TextView's `loaded` | `page.on('navigatingFrom')` |
| Vue | `args.object` in `@loaded` on `<Page>` | `this.$refs.x.nativeView` | `@unloaded` |
| Svelte / Solid / React | page ref | element refs in `onMount` / effect | `onDestroy` / effect cleanup |

Use the per-view `loaded` events rather than `ngAfterViewInit`/`onMount` +
`setTimeout`: they fire only once the page is attached to its frame, so
`page.viewController` (iOS) and the activity (Android) exist. If you must set
up from a view-init hook, guard on `page.frame` and fall back to
`page.once('navigatedTo', …)`. Null the manager in teardown so a re-entered
page sets up fresh.

## Keep the bar off the bottom chrome

**No tab bar on this screen.** With the keyboard closed the bar docks at the
*screen* bottom — directly over a TabView/BottomNavigation. There is no CSS
fix: present the screen outside the tab shell. Angular: a root-level route that
is a sibling of the shell route (`/chat` pushes over the whole shell, back pops
it and restores every tab outlet). Core: navigate on the root `Frame`, or a
fullscreen modal page.

**IQKeyboardManager off for the page's lifetime** if the app enables it at
bootstrap. It distance-shifts the whole page and attaches its own touch-resign
gesture, both of which fight the dock:

```ts
// enter: if (__APPLE__) IQKeyboardManager.shared.isEnabled = false;
// leave: if (__APPLE__) IQKeyboardManager.shared.isEnabled = true;
```

**Android gesture-nav inset** (core 9.1 edge-to-edge, API 35+): when the app
root applies the bottom inset (default) there is nothing to do. When the root
skips it (`androidOverflowEdge="bottom"` so a tab bar can paint under the
gesture strip), the composer page must pad itself for the *stable*
navigation-bar inset — the IME inset is the plugin's business:

```ts
// page root GridLayout: androidOverflowEdge="dont-apply" (loaded)="loadedRoot($event)"
loadedRoot(args) {
  if (!__ANDROID__) return;
  const insets = Utils.android.getCurrentActivity()?.getWindow()?.getDecorView()?.getRootWindowInsets();
  if (!insets) return;
  const bottom = android.os.Build.VERSION.SDK_INT >= 30
    ? insets.getInsets(android.view.WindowInsets.Type.navigationBars()).bottom
    : insets.getSystemWindowInsetBottom();
  (args.object as View).style.paddingBottom = Utils.layout.toDeviceIndependentPixels(bottom);
}
```

## Dialogs, sheets and modals (iOS)

The bar is not in the page hierarchy: the plugin reparents it into an
`inputAccessoryView` hosted in the keyboard's own window (`UITextEffectsWindow`)
and keeps it on screen by holding first responder. UIKit z-orders that window
**above** sheets, popovers and drawers.

| Presentation | Bar behavior | Do |
|---|---|---|
| Page sheet / form sheet / popover / in-app drawer | Page stays in the window → bar floats **on top** of it | `suspend()` as it starts opening, `restore()` as it starts closing |
| Fullscreen modal (e.g. `SFSafariViewController` `.FullScreen`) | First responder resigns → bar leaves by itself, UIKit never brings it back | patched plugin restores it via `didMoveToWindow`; unpatched 1.0.3 loses the bar for good |
| Centered alert (`Dialogs.confirm`) | Bar stays over the dimmed backdrop | acceptable; suspend if it bothers you |

* Route suspend/restore through the one service that presents sheets (a
  `sheetOpen` signal/subject the composer page reacts to), never at call sites.
* `restore()` polls until `presentedViewController` is nil, so calling it the
  moment dismissal begins is safe (including swipe-down dismiss where no
  button code runs). Both calls are idempotent.
* Do **not** `dismissKeyboard()` before `suspend()` — the dismiss queues the
  plugin's auto-restore ahead of the suspension and the bar pops back over the
  sheet. Do **not** hide the container with `visibility`/`opacity` — it was
  reparented; collapsing breaks its measure and leaves a blank blur bar docked.
* Android: dialogs are separate windows above the activity, so `suspend()` /
  `restore()` are no-ops there (parity API).

## The bundled patch for 1.0.3

Published 1.0.3 (latest at time of writing) has no `suspend()`/`restore()` and
no modal recovery. `assets/patches/@nativescript+input-accessory+1.0.3.patch`
(next to this file) adds, on top of 1.0.3:

* `suspend()` / `restore()` with an `isSuspended` gate in every auto-restore
  path, plus `didMoveToWindow` recovery after fullscreen modals;
* TextView scrolling once text outgrows `maxHeight` (caret stays reachable) and
  an offset reset when it shrinks back;
* no forced `textContainerInset`, and input traits left at UIKit defaults
  (unpatched Swift forces autocorrect/spell-check/smart-punctuation off on every
  begin-editing, so the composer does not type like Messages);
* `collapsedHorizontalInset` config (iOS): the bar floats narrower against the
  rounded corners while the keyboard is hidden and widens in step with it
  (ChatGPT-style) — the reference app uses 26;
* the home-indicator padding refreshed via `reloadInputViews` on each
  keyboard state change, so the container never sticks at the previous height.

Apply: copy into `patches/`, `npm i -D patch-package`, add
`"postinstall": "patch-package"`, `npm install`, full `ns run`. Check first —
if `typeof new InputAccessoryManager().suspend === 'function'` your release
already has it; skip the patch.

## Verify (simulator + emulator)

1. Focus → bar docks flush above the keyboard; the newest message is visible.
2. Keyboard closed → bar rests at the bottom with home-indicator padding; **no
   tab bar under it**; Android: clear of the gesture pill.
3. Type past several lines → bar grows to `maxHeight`, then the text scrolls
   with the caret visible. Delete everything → pill keeps its rest height, hint
   centered.
4. Send → text clears, height resets, keyboard stays up.
5. Swipe down on the list → interactive dismiss follows the finger (iOS, and
   Android API 30+).
6. Open a sheet and close it by button *and* by swipe → bar leaves and returns.
   Open a fullscreen modal and return → bar returns.
7. Leave and re-enter the screen → setup runs again (the `manager` guard and
   `destroy()` are right).
8. Toggle dark/light → text still centered (style padding survived the pass).
9. Simulator shows a caret but no keyboard → hardware-keyboard mode; turn off
   I/O › Keyboard › Connect Hardware Keyboard.

Verified 2026-07/08 in two production chat screens (Angular 20/21, zoneless)
that ship this exact setup — iOS 26 simulator + device, Android 15 emulator
(Pixel 6a API 35), @nativescript/core 9.1.0-alpha.11,
@nativescript/input-accessory 1.0.3 + the bundled patch,
@nativescript/iqkeyboardmanager 3.x. Vue/Svelte/Solid wiring follows the
plugin README's shapes and was not exercised here.
