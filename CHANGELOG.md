# Changelog

## 1.1.0 — 2026-10-21

- Fix OFM browser import failures caused by a malformed locale separator and an unmatched parenthesis in the local patch page.
- Validate generated JavaScript before changing live files; back up originals, replace files without changing pnpm hard-link targets, and restore committed files if writing fails.
- Add accurate syntax/patch diagnostics and asynchronous repair controls to the launcher.
- Add `patch.ps1` and `Repair.cmd` for existing installations, retaining profiles, credentials, conversations and custom dependency links.
- Install OFM 2.5.7 from a verified pinned upstream commit; that version is not published to npm.
- Add regression and console API coverage; eleven tests pass.
