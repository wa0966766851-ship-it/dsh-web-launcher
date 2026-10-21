# Changelog

## 1.2.0 — 2026-10-21

- Replace periodic patch guarding with update activation and launcher-start checks; refuse incompatible releases before activation and use the upstream verified rollback.
- Retain recovery code outside the package for interrupted installs, serialize repairs with updates, and preserve pending recovery data.
- Add independent plugin reload, explicit page reload, and clearly labeled window opening without service restart. Exit the optional console server after its last page closes.
- Detect repository transfers by stable GitHub ID, check source versions on demand with a cache, and preserve installed versions on offline failures or stale installers.
- Add signed-update, rollback, recovery corruption, lock, transfer, offline, console lifecycle and existing-installer tests.

## 1.1.0 — 2026-10-21

- Fix OFM browser import failures caused by a malformed locale separator and an unmatched parenthesis in the local patch page.
- Validate generated JavaScript before changing live files; back up originals, replace files without changing pnpm hard-link targets, and restore committed files if writing fails.
- Add accurate syntax/patch diagnostics and asynchronous repair controls to the launcher.
- Add `patch.ps1` and `Repair.cmd` for existing installations, retaining profiles, credentials, conversations and custom dependency links.
- Install OFM 2.5.7 from a verified pinned upstream commit; that version is not published to npm.
- Add regression and console API coverage; eleven tests pass.
