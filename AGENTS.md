# Project conventions

- Current display version is stored in `version.json` (four numeric components).
- For each future delivered task that changes application behavior, run `node scripts/bump-version.mjs` once before building. Increment only the fourth component unless the user explicitly requests another component change.
- Rebuilding, testing, formatting, reviewing, or packaging the same change must not increment the version again. The initial logging release was V0.1.1.0.
- Operation logs must never contain URLs, page titles, typed text, favorite/group/workspace names, passwords, cookies, file paths, raw errors, or raw IPC payloads. Use only allowlisted operation identifiers and validated numeric/boolean metadata.

## Documentation conventions

- Do not append debugging transcripts or temporary requirement feedback directly to README.
- README is for project introduction, capabilities, installation and document navigation.
- Update CHANGELOG as appropriate when application behavior changes.
- Record important development and debugging processes in docs/DEVLOG.md or a focused report.
- Record newly discovered issues in docs/KNOWN_ISSUES.md and update their status when fixed.
- Keep test methods and results in validation records; passing tests do not prove absence of defects.
- Documentation-only changes must not increment the software behavior version.
- Prefer docs/ for new documentation to avoid accumulating files in the repository root.
