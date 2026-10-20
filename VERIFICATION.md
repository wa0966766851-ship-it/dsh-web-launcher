# Verification

## 1.1.0 — 2026-10-21, Windows x64

- Reproduced the active client's `SyntaxError: Unexpected template string`; after correcting the malformed separator, validation also caught the missing closing parenthesis in the added patch page.
- Eleven automated tests pass. New coverage rejects invalid syntax despite present patch markers, repairs both historical defects with a backup, preserves a hard-linked shared cache file, makes repeated repair a no-op, refuses unknown syntax/changed anchors without writing, and exercises the console's authenticated asynchronous repair API and duplicate-operation protection.
- Headless Edge loaded the existing DSH, opened Settings → Our Free Model → Local patches, and rendered that page without plugin-load failures or JavaScript exceptions.
- Headless Edge rendered the updated console with OFM 2.5.7 and all patch checks passing; it produced no JavaScript errors.
- A fresh isolated profile installed Orb, GAL and OFM 2.5.7 from the pinned upstream commit. All 22 patch anchors and generated JavaScript validation passed. That profile started on port 3093, loaded in Edge without import errors, and stopped successfully.
- Verified the npm registry has no OFM 2.5.7 publication; the installer now uses the verified GitHub commit instead.
- No live model generation, account verification or paid API calls were used for these checks. Upstream model saturation and channel network failures are separate from this repaired browser-import failure.

## Original installer — 2026-10-16, Windows x64

- Six automated tests pass: URL parsing, authenticated cookie exchange, process ownership, cross-process locking, secret redaction, and refusing to stop an unrelated listener.
- A separate fresh DSH profile installed Our Free Model 2.1.0, Orb 0.1.7 and the pinned GAL view. Running the installer again skipped all three without duplicate bundles.
- That isolated profile started on port 3091, returned authenticated HTML HTTP 200, and stopped successfully. Orb downloaded Electron 44.0.0 into the isolated data directory.
- The existing local installation passed start/reuse/stop/restart through the launcher API. An unauthenticated request returned 401; an unrelated Origin returned 403.
- Edge rendered the launcher with ready status and 13 existing plugin bundles; the desktop VBS entry exited successfully.
- The public GitHub bootstrap was run with an isolated user data directory and no Node.js or pnpm on PATH. It downloaded and checksum-verified Node.js 24.22.0, installed DSH 0.2.0-rc.2 and pnpm 11.25.0, and installed all three plugin bundles. It exited successfully and removed its archive staging directory.
- That newly installed DSH started on port 3092, returned authenticated HTML HTTP 200, had no `Invalid effect` or bundle loading errors in the captured startup log, and stopped successfully.
- A custom port profile was started on 3091; status and the VBS stop shortcut then used the saved port without an explicit port argument.
- Running the public bootstrap a second time succeeded, retained the installed DSH and skipped all three plugin bundles without duplicates.

Model chat, third-party account eligibility and API billing are outside these installer checks.
