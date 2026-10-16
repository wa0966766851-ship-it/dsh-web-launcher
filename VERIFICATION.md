# Verification (2026-10-16, Windows x64)

- Six automated tests pass: URL parsing, authenticated cookie exchange, process ownership, cross-process locking, secret redaction, and refusing to stop an unrelated listener.
- A separate fresh DSH profile installed Our Free Model 2.1.0, Orb 0.1.7 and the pinned GAL view. Running the installer again skipped all three without duplicate bundles.
- That isolated profile started on port 3091, returned authenticated HTML HTTP 200, and stopped successfully. Orb downloaded Electron 44.0.0 into the isolated data directory.
- The existing local installation passed start/reuse/stop/restart through the launcher API. An unauthenticated request returned 401; an unrelated Origin returned 403.
- Edge rendered the launcher with ready status and 13 existing plugin bundles; the desktop VBS entry exited successfully.

Model chat, third-party account eligibility and API billing are outside these installer checks.
