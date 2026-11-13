# Project conventions

- After each completed update, validate and scan the staged changes, commit them and run a normal git push to origin on the current branch. Never force push or overwrite remote history. Report authentication or network blockers explicitly.

- Display versions use Va.b.c.d; version.json stores the four numeric components without V. Keep package.json, package-lock.json and build metadata synchronized via scripts/bump-version.mjs.
- a (major) and b (minor) change only on an explicit user request; reset every lower component to zero.
- For a completed new feature, increment c once and reset d. For optimization, UI/interaction adjustment or small bug fixes without new functionality, increment d once.
- Audit findings and their repairs do not trigger d. Only when the USER explicitly confirms that the audit repair round is finished, increment c once; never infer completion yourself.
- Pure audit, testing, documentation and unfinished development do not bump versions. Rebuilding, packaging and retesting the same delivery do not bump again.
- A task containing multiple changes receives one bump at the highest applicable priority. Run node scripts/bump-version.mjs --kind feature|revision for normal deliveries; audit requires --kind audit --audit-confirmed with explicit user confirmation. --kind none does not increment. Explicit user version requests use --set a.b.c.d; --authorized is required for user-authorized a/b changes. Do not use these flags as a substitute for actual user authorization.
- The user explicitly requested V0.2.0.0 for the stash ordering/close release; the initial logging release was V0.1.1.0.
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
