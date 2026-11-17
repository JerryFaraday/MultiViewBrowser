# Project conventions

- After each completed update, validate and scan the staged changes, commit them and run a normal git push to origin on the current branch. Never force push or overwrite remote history. Report authentication or network blockers explicitly.

- Display versions use Va.b.c.d; version.json stores the four numeric components without V. Keep package.json, package-lock.json and build metadata synchronized via scripts/maintenance/bump-version.mjs.
- a (major) and b (minor) change only on an explicit user request; reset every lower component to zero.
- For a completed new feature, increment c once and reset d. For optimization, UI/interaction adjustment or small bug fixes without new functionality, increment d once.
- Audit findings and their repairs do not trigger d. Only when the USER explicitly confirms that the audit repair round is finished, increment c once; never infer completion yourself.
- Pure audit, testing, documentation and unfinished development do not bump versions. Rebuilding, packaging and retesting the same delivery do not bump again.
- A task containing multiple changes receives one bump at the highest applicable priority. Run node scripts/maintenance/bump-version.mjs --kind feature|revision for normal deliveries; audit requires --kind audit --audit-confirmed with explicit user confirmation. --kind none does not increment. Explicit user version requests use --set a.b.c.d; --authorized is required for user-authorized a/b changes. Do not use these flags as a substitute for actual user authorization.
- The user explicitly requested V0.2.0.0 for the stash ordering/close release; the initial logging release was V0.1.1.0.
- Operation logs must never contain URLs, page titles, typed text, favorite/group/workspace names, passwords, cookies, file paths, raw errors, or raw IPC payloads. Use only allowlisted operation identifiers and validated numeric/boolean metadata.

## Documentation conventions

- Do not append debugging transcripts or temporary requirement feedback directly to README.
- README is for project introduction, capabilities, installation and document navigation.
- Update CHANGELOG as appropriate when application behavior changes.
- Record important development and debugging processes in docs/development/devlog.md or a focused report.
- Record newly discovered issues in docs/development/known-issues.md and update their status when fixed.
- Keep test methods and results in validation records; passing tests do not prove absence of defects.
- Documentation-only changes must not increment the software behavior version.
- Prefer docs/ for new documentation to avoid accumulating files in the repository root.

## UI/UX design governance

- 所有涉及界面设计、布局、样式、组件及交互的任务，必须先完整阅读 docs/design/ui-design-system.md；规范适用于整个桌面应用。
- 新增或修改 UI 时必须优先复用设计变量和公共组件。
- 不允许随意引入与设计规范冲突的字体、颜色、间距及交互样式。
- 当新增通用设计规则时，应同步更新设计规范。
- UI 修改完成后，必须根据规范中的验收清单进行检查，并记录例外与未验证项目。

## Directory, naming and artifact conventions

- Scripts run from the repository root. Put build/native compilation in `scripts/build/`, local launch code in `scripts/dev/`, smoke/diagnostic/benchmark runners in `scripts/smoke/`, repository maintenance in `scripts/maintenance/`, and shared pure helpers in `scripts/lib/`. Root-level script files are compatibility forwarders only; keep the existing build/dev/smoke/drag/version command entrypoints working.
- React components and primary TypeScript classes use PascalCase; hooks use `use` + camelCase; scripts, tests and helper modules use kebab-case. Preserve framework entry/config names and existing source import contracts; do not rename established source modules just for cosmetic consistency. Unit tests use `.test.ts` (existing JS-only policy tests may use `.test.js`); Electron integration entrypoints use `-smoke.ts` or `-probe.ts`/`-diagnostic.ts` where applicable.
- Keep unit tests in `tests/` and native integration fixtures in `tests/electron/`. Keep `src/components/`, `src/core/` and `electron/live/`; evaluate runtime resource paths and lifecycle coupling before introducing new source subdirectories. Do not create a directory for each file.
- Current user documentation belongs in `docs/user/`, the sole UI standard in `docs/design/ui-design-system.md`, and engineering/validation/issue records in `docs/development/`. `docs/DOCUMENTATION_MAP.md` is the document index. `docs/reviews/` contains dated historical evidence, not competing current policies. New reports use `topic-YYYY-MM-DD.md` and optional `topic-YYYY-MM-DD-data.json`; legacy unknown dates use an explicit archival date rather than an invented report date.
- Maintain only `docs/user/user-guide.md` as the current general user guide; `settings.md` is its focused settings reference. The four uppercase guide/design files in `docs/` are compatibility links only. Preserve archived report contents, caveats and evidence when moving them; update links and record moves.
- `release/` is reserved for release packaging, `out/validation/` for temporary packaged verification (`npm run pack:validation`). `dist/`, `dist-electron/`, `dist-native/` are disposable build staging directories; smoke bundles may share `dist-electron/` because native resource paths depend on it, but must never enter the package allowlist. Do not move runtime logs, profiles or user configuration as part of artifact organization.
- Route test screenshots/results/diagnostics through `scripts/lib/test-artifacts.mjs`: latest files in `test-artifacts/<module>/`, superseded results in `test-artifacts/archive/<run-id>/<module>/`. Child processes inherit `MVB_TEST_RUN_ID`; set one safe batch ID explicitly for a multi-command run. Never overwrite an archive. Existing archives are retained; cleanup requires a separate authorized decision.
- `.cache/` holds local downloads/tool caches, `.npm-tools/` local npm tooling, `out/` temporary packages, and `test-artifacts/` private generated evidence. These and runtime `logs/` remain ignored. Artifacts/screenshots can contain browsing or account information; review and sanitize before deliberately promoting evidence to `docs/`. Never commit browser profiles or raw diagnostic dumps.
- Directory snapshots default to `node scripts/maintenance/file-tree.mjs` under test artifacts. Only generate a root `PROJECT_FILE_TREE_TEMP.txt` on explicit request; it is ignored and temporary. Keep root toolchain configuration, package metadata, README/CHANGELOG/AGENTS and the Windows launcher in place. File organization alone does not bump the version.
