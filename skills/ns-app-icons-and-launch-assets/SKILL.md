---
name: ns-app-icons-and-launch-assets
description: Use when a NativeScript app still shows the template icon/launch screen — generate a 1024 icon programmatically and install it at every iOS and Android size, set launch screen colours, and fix display names.
---

# Icons, launch screen, names

## Generate a 1024×1024 icon (Python + PIL example)
```python
from PIL import Image, ImageDraw, ImageFilter
S=1024; img=Image.new('RGB',(S,S),(3,6,14)); px=img.load()
# gradient bg, stars, a planet limb with rim light + a blurred glow layer composited via Image.alpha_composite …
img.convert('RGB').save('icon-1024.png')
```
(PIL is usually available on macOS python3; numpy is not required.)

## iOS: fill the existing appiconset (keeps Contents.json valid)
```bash
D=App_Resources/iOS/Assets.xcassets/AppIcon.appiconset
for f in $D/icon-*.png; do sz=$(sips -g pixelWidth "$f" | tail -1 | awk '{print $2}'); sips -Z $sz icon-1024.png --out "$f" >/dev/null; done
cp icon-1024.png $D/icon-1024.png
```
Launch screen (`App_Resources/iOS/LaunchScreen.storyboard` + `LaunchScreen.AspectFill/Center` imagesets): swap the AspectFill PNGs for your background (a starfield/black), make Center a 4×4 transparent PNG if you don't want the logo, and set the storyboard `<color key="backgroundColor" red=… green=… blue=…/>` to match your first frame. Display name: `CFBundleDisplayName` in Info.plist. Status bar: `UIStatusBarStyle` = `UIStatusBarStyleLightContent`, `UIViewControllerBasedStatusBarAppearance` = false.

## Android
```bash
R=App_Resources/Android/src/main/res
for d in mdpi:48 hdpi:72 xhdpi:96 xxhdpi:144 xxxhdpi:192; do n=${d%%:*}; sz=${d##*:}; sips -Z $sz icon-1024.png --out $R/mipmap-$n/ic_launcher.png; done
```
Adaptive icon: write bitmap foregrounds (108/162/216/324/432 px, artwork inside ~72% safe zone on a solid bg) to `mipmap-*/ic_launcher_foreground.png`, point `mipmap-anydpi-v26/ic_launcher.xml` at `@mipmap/ic_launcher_foreground` (delete the template's vector `drawable/ic_launcher_foreground.xml`), set `values/ic_launcher_background.xml` colour. App name: add `values/strings.xml` with `app_name` and `title_activity_kimera` (the manifest references both). Dark status/action bar: `values/colors.xml` `ns_primary`/`ns_primaryDark`.

Changing App_Resources needs a full rebuild (`ns run` will do it; if not, `ns clean`).
