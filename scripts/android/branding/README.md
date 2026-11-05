# App icon artwork

Current approved source: `guiyou-icon-source.png`, copied without modification from the user's `guiyou-icon-512.png` (512 by 512, supplied 2026-11-04). The artwork and installed app name both read 龟友手账.

On Windows, run `powershell -ExecutionPolicy Bypass -File scripts/build-app-icons.ps1` from the repository to export the opaque iOS 1024px asset, Android launcher densities and adaptive foregrounds, 512px store artwork, and web icon. The iOS image is an enlargement of the supplied 512px original.

The Android-only exporter `node scripts/android/build-icons.cjs` uses the same source and requires sharp (`SHARP_MODULE` may point to an installed module). Adaptive foregrounds retain the existing 60 percent safe-area placement.

`guizhongjie-icon-source.png` is retained only as historical artwork and is no longer used by the Android exporter. Harmony build scripts referencing `guiyou-icon-source.png` will also receive the new artwork when next built.
