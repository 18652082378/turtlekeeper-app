# Android icon

Current Android artwork (1.0.12 / build 13): `guizhongjie-icon-source.png`, copied from the user-approved `output/branding/龟中介图标.png`. The picture reads 龟中介; the installed application label remains 龟友手账. Run `node scripts/android/build-icons.cjs` to regenerate all launcher densities, adaptive foregrounds and `output/android/store/guiyou-icon-512.png` before packaging. Set `SHARP_MODULE` to an installed sharp module path if needed. These generated launcher resources are retained by Android packaging.

The previous `guiyou-icon-source.png` is retained because Harmony packaging still references it. iOS and Harmony artwork are not changed by this Android-only update.

## Previous artwork

Source: guiyou-icon-source.png. Generated with the built-in image_gen editing tool from the existing iOS AppIcon-512@2x.png. The iOS asset is unchanged.

Edit prompt: Preserve the orange cartoon turtle, pale yellow background and existing visual identity. Change only the bottom Chinese name from 壳友手账 to 龟友手账 using matching dark reddish brown rounded lettering with cream outline. Full square PNG without a device frame or outer mask.

The result was visually checked for the four-character name. scripts/android/build-icons.cjs exports the store PNG at 512×512 and the Android launcher resources. It uses sharp (set SHARP_MODULE when using a bundled runtime). Adaptive icons include an inset so the turtle and lettering remain inside launcher masks.

Version 1.0.8 inadvertently contained the default Capacitor launcher icon. Version 1.0.9 corrects it and must replace the uploaded 1.0.8 draft APK before submission. This is a launcher resource correction; approved application page layouts are unchanged.
