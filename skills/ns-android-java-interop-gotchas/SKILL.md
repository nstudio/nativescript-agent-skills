---
name: ns-android-java-interop-gotchas
description: Use when NativeScript Android code throws "Cannot marshal JavaScript argument … to Java type", "Failed resolving method … on class", "Class constructor X cannot be invoked without 'new'", or colours/8-digit hex render wrong — the Java interop rules that trip TypeScript authors.
license: MIT
metadata:
  author: nstudio
  source: https://github.com/nstudio/nativescript-agent-skills
---

# NativeScript ↔ Java interop gotchas (verified, core 9.0, API 35)

## "Class constructor <Base> cannot be invoked without 'new'"
Cause: a `@NativeClass()` class declared *inside* another class's method. `@nativescript/webpack`'s
NativeClass transformer falls back to a text regex (`/^\s*@NativeClass\b/m`) that matches the
enclosing class body and downlevels the OUTER class to ES5, which then can't extend a real ES class.
Fix: declare every `@NativeClass` at module scope; hand it the owner via a property:
```ts
@NativeClass()
class Surface extends android.view.View {
  owner: WeakRef<MyView> | null = null;
  constructor(ctx: android.content.Context) { super(ctx); return global.__native(this); }
  onDraw(c: android.graphics.Canvas) { this.owner?.deref()?.paint(c); }
}
// in createNativeView(): const v = new Surface(this._context); v.owner = new WeakRef(this);
```

## "Cannot marshal JavaScript argument at index N to Java type"
Overloaded Java methods/constructors that differ only by primitive array type (`int[]` vs `long[]`,
`float[]` vs `double[]`) can't be resolved from a JS array. Build a typed Java array:
```ts
const colors = Array.create('int', 3) as androidNative.Array<number>;   // type is androidNative.Array, not native.Array
colors[0] = android.graphics.Color.argb(255, 34, 88, 178); /* … */
const stops = Array.create('float', 3) as androidNative.Array<number>;
new android.graphics.RadialGradient(cx, cy, r, colors, stops, android.graphics.Shader.TileMode.CLAMP);
```

## "Failed resolving method drawPoints on class android.graphics.RecordingCanvas"
JS typed arrays (`Float32Array`, `Int32Array`, …) are **not** marshalled to Java primitive arrays.
Plain JS `number[]` arrays do marshal to `float[]` when the overload is unambiguous:
```ts
const xy: number[] = [];      // keep one array; xy.length = 0 to reuse per frame
xy.push(x0, y0, x1, y1);
canvas.drawPoints(xy, paint);   // OK   |  canvas.drawPoints(new Float32Array(...), paint) → fails
```
Where the overload IS ambiguous, fall back to `Array.create('float', n)`.

## Colours
NativeScript parses 8-digit hex as CSS `#RRGGBBAA`, not Android's `#AARRGGBB` — `"#1AFFFFFF"` in a
template becomes near-opaque cyan. Use `rgba(255,255,255,0.1)` in CSS/templates; in Java calls use
`android.graphics.Color.argb(a, r, g, b)` / `Color.parseColor('#AARRGGBB')` (Android order there).

## Images
`sys://symbol.name` (SF Symbols) is iOS-only; on Android it logs "Error in reading bitmap … sys:/name".
Provide `res://name` vector drawables under `App_Resources/Android/src/main/res/drawable/` and branch on `isIOS`.

## Misc
* Extending Android classes: constructor must call `super(...)` then `return global.__native(this)`.
* Interface implementations: `new android.view.Choreographer.FrameCallback({ doFrame(nanos) {…} })` (Java `long` arrives as a JS number).
* Units: NS gesture coords are dip; native drawing/measure is px — `Utils.layout.toDevicePixels` / `toDeviceIndependentPixels`; density via `Utils.layout.getDisplayDensity()`.
* SegmentedBar on Android: style with `background-color` / `selected-background-color` / `color` (rgba strings); titles render uppercase.
