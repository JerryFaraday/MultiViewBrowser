# UI design system adoption — 2026-11-15

Design system compliance: Exception (verification and retained product behavior below).

## Audit and implementation

Retained React 19, existing CSS, four theme palettes, accent choices and all config/IPC contracts. Added semantic aliases, shared SettingRow, NameEditor and modal focus hook. Reworked all six categories through common typography, responsive rows, content width and controls. Favorites management now has explicit create actions, counts, empty groups, full-name tooltips and labeled editing/deletion. Existing drag sorting and group reassignment remain intact. Both editor forms use stacked fields and consistent cancel/save actions; group names reject whitespace and existing duplicate merge behavior is preserved.

The user-provided source was read in full and copied verbatim to docs/UI_DESIGN_SYSTEM.md before repository mapping was appended. Existing untracked docs/MULTIVIEW_DESIGN_SYSTEM.md was left untouched. Existing AGENTS.md content was preserved.

## Validation

- TypeScript: pass.
- Vite renderer build and Electron/native build: pass.
- Vitest: 28 files, 215 tests pass (existing domain/settings/data compatibility coverage).
- Electron responsive screenshot smoke: blocked before app startup by Windows ACL on node_modules/electron/dist (install_dir_access.cc). Standard launch and isolated no-sandbox diagnostic both fail; production sandbox settings were not modified.
- Updated settings-layout smoke expectations for stacked rows, independent scrolling and compact navigation. It now captures all six categories and both editors when launch is possible.

## Acceptance limitations and exceptions

- No screenshots could be reviewed. Physical 1080p/1440p/4K monitors, Windows DPI, text magnification and pointer/keyboard interaction matrix remain unverified. Existing product UI scale choices remain 90/100/110/125%; no unsupported 150/200% preference was added.
- Actual rendered contrast across all four themes and three accents remains unverified; no claim of WCAG conformance is made. Readable helpers now use the existing secondary text color without opacity reduction.
- Navy default and existing theme choices are retained rather than changing user theme semantics. Selected navigation is quiet with a narrow accent marker.
- Existing persistence is asynchronous in App; inline field-specific failed-save/pending feedback is not yet fully implemented. Domain validation remains unchanged, and general error feedback remains available.
- Dialogs have bounded, scrolling forms and sticky footers; header and body are not yet independently scrolling regions. Discard confirmation is not added to explicit Cancel/Escape; backdrop cannot dismiss these editors.
- Collection extremes, save failure/cancel, live loading/error visuals, import/export round trips and full focus restoration need real Electron acceptance testing. Existing tests passing does not establish defect absence.

Final delivery version: V0.2.4.1 (one revision bump for this UI adjustment). Prettier full-repository check passes. The bump script synchronized build metadata and version references; package-lock did not require content changes because the three-component npm version remains 0.2.4.
