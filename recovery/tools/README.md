# Recovery tools

1. `xz -d recovery/apk/hermes-decompiled-6.1.13.js.xz` (output of `hbc-decompiler` from `pip install hermes-dec` on the APK's `assets/index.android.bundle`).
2. `python3 split.py out.js mods/` — split into metro modules (one per `rN = function(a0..a6)` at 4-space indent).
3. `python3 condense.py mods/mNNNN.js` then `python3 simplify.py` for readable pseudo-code.
4. `recovery/APP_MODULES.tsv` maps app module ids to source files.
