# Recovery material (15 Oct 2026)

The 6.x source (versions 2.0 to 6.1.13, 132 commits) was lost with its cloud container before it was pushed.
This folder holds everything needed to rebuild it on top of this branch (v1.9.0):

- `apk/mindfiles-studio-6.1.13.apk.xz` - the last shipped build (behaviour reference).
- `apk/hermes-decompiled-6.1.13.js.xz` - its Hermes bytecode decompiled (hermes-dec); app functions keep their original names.
- `handoff/` - the CR-77 to CR-91 specs, `compliance_check.py`, `make_prompts_v4.py`, `cast.py`, prompt pack, thumbnail pack, banks.
- `banks/` - topic bank v4-8 and v4-9.
- `Mind_Files_Studio_Brief_v2.9.0.html` - how the app behaved at 2.9.0.

Rebuild order: core logic, rendering, screens and services, then a build matching 6.1.13, then bank v4-9. Every phase is pushed as it lands.
