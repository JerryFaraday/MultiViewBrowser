# MultiView Browser — UI/UX Design System

> Version: 1.0.0 · 2026-11-15 · Status: Project standard / normative
>
> Scope: Electron/Chromium application shell, settings, favorites, dialogs, menus, onboarding, notifications and future features. Web page content rendered from external sites is **not** restyled by this system.
>
> This is an original, project-specific design system inspired by Chrome's settings information architecture, ChatGPT's visual restraint, and Codex's desktop-workflow interaction patterns. **It is not an official Google/OpenAI design specification and does not reproduce proprietary assets.** Numeric tokens below are MultiView Browser decisions, not claimed measurements of the reference products.

## 0. Normative language and priorities

- **MUST / 必须**: required for new UI and touched UI. **SHOULD / 应**: strongly preferred; exceptions documented. **MAY / 可**: optional.
- P0: keep functionality, accessibility, data compatibility, usability. P1: consistency. P2: polish/animation.
- Product behavior and user data take precedence over appearance. When a design rule conflicts with an existing functional requirement, preserve function and document the deviation.
- Apply incrementally to existing screens; new screens MUST comply. Do not rewrite the full app or add a new UI library solely to follow this document.

## 1. Product character

Five adjectives: **clear / restrained / legible / efficient / coherent** (清晰、克制、易读、高效、一致).

- Browser-like: direct and predictable controls, stable information hierarchy, explicit effects of settings.
- ChatGPT-like: restrained surface layering, readable typography, quiet visual emphasis, no gratuitous cards.
- Codex-like: desktop-appropriate density, keyboard-first paths, sensible inline editing, reliable action feedback.
- Avoid: tiny low-contrast captions, over-bright selection bars, giant blank gaps between small controls, a sea of identical fixed-width selects, icon-only destructive actions without labels/tooltips, nested modals, decorative gradients, forced animations.

## 2. Design tokens

### 2.1 Colors — dark neutral (default)

| Token | Value | Usage |
|---|---|---|
| `--bg-canvas` | `#1B1B1D` | main background |
| `--bg-sidebar` | `#202023` | navigation/sidebar |
| `--bg-surface` | `#262629` | panels/dialogs |
| `--bg-elevated` | `#303034` | popovers/menus/inputs |
| `--bg-hover` | `#35353A` | hover state |
| `--bg-selected` | `#313C45` | selected navigation/list item |
| `--border-subtle` | `#38383D` | restrained boundaries |
| `--border-strong` | `#55555D` | focus-adjacent/active separators |
| `--text-primary` | `#F2F2F3` | headings, primary labels |
| `--text-secondary` | `#C5C5CB` | explanations, metadata |
| `--text-tertiary` | `#A6A6AE` | low-priority *readable* text |
| `--text-disabled` | `#85858D` | disabled only; not informational copy |
| `--accent` | `#4AAAF0` | primary action and focus |
| `--accent-hover` | `#72BEF4` | accent hover |
| `--accent-on` | `#101A22` | text on bright accent |
| `--danger` | `#F07A7A` | destructive action/error |
| `--success` | `#69C99A` | success/live status |
| `--warning` | `#F1C16E` | caution |
| `--overlay` | `rgba(0,0,0,.60)` | modal backdrop |

- These colors are *starting tokens*, not unchangeable pixel targets. Validate actual foreground/background combinations automatically. Ordinary readable text MUST achieve ≥4.5:1; large text ≥3:1; meaningful non-text controls and focus indicators aim ≥3:1. Disabled controls may use lower contrast but MUST remain recognizably disabled. Do not use color as the only semantic status cue.
- Selected navigation uses a restrained dark tint and narrow optional accent marker, not a fully saturated cyan rectangle. Reserve bright accent for primary buttons, checked controls and focused fields.
- Theme supports **dark / light / system**, if present in the product, through tokens; never hard-code dark colors inside components. Existing theme choices MUST be preserved. New light-theme colors require separate contrast verification.

### 2.2 Typography

- UI font stack: `Inter, "Segoe UI", "Microsoft YaHei UI", "PingFang SC", sans-serif` where available. **Do not download or bundle fonts merely to satisfy this stack**. Prefer system fonts and existing project assets.
- Use CSS logical pixels at 100% UI scaling. The same scale mechanism must proportionally affect text and control geometry; distinguish browser-page zoom from app UI scale.

| Role | Font size | Weight | Line height |
|---|---:|---:|---:|
| Page title | 20px | 600 | 28px |
| Section heading | 16px | 600 | 24px |
| Dialog title | 18px | 600 | 26px |
| Setting label / body | 14px | 500 / 400 | 21px |
| Control text | 14px | 400–500 | 20px |
| Description / helper | 13px | 400 | 19px |
| Small metadata | 12px | 400 | 18px |

- MUST NOT put important instructions into 10–11px text. Small metadata 12px is not a substitute for descriptions. Bold is for hierarchy, not a substitute for contrast.
- Chinese text MUST use sensible line breaks and line height, avoid overly tight letter-spacing. Long strings MUST wrap, scroll or reveal in a tooltip; never silently clip essential option names.

### 2.3 Spacing, radius, dimensions

- Base spacing: **4px grid**; available steps `4, 8, 12, 16, 20, 24, 32, 40, 48`.
- Inline icon/text gap 8px; related field gap 12px; setting-row gap 16px; section gap 24–32px; page padding 24–32px (reduce to 16px on narrow screens).
- Setting row vertical padding 12–16px; variable-height row when description wraps. Do NOT enforce equal heights between different content types; do enforce equal inset/rhythm across comparable rows.
- Control height 36px (compact 32px only in dense lists); icon-action hit target ≥32×32px, preferred ≥36×36px. Interactive icons 16px or 18px, optically centered.
- Radius: `6px` small fields, `8px` controls, `12px` dialog/panel; use one radius scale.
- Sidebar width 200–224px (may collapse responsibly); main settings content `max-width: 880px`, center inside available main pane, not across whole display width. Keep useful whitespace, do not stretch controls just to fill it.
- Dialog widths: rename/simple 400–440px; normal form 480–560px; constrained to `calc(100vw - 32px)`; max viewport height 85vh with an independently scrolling body.

## 3. Layout and information architecture

### 3.1 Settings shell

- Keep persistent header/back affordance and left navigation when enough space exists.
- Preserve existing sections: **常规、网页浏览、收藏栏、外观、数据与隐私、关于与诊断**. Reorder only with a documented migration rationale.
- Sidebar rows 36–40px, consistent icon box ~18px, 8–12px gaps; selected state has text emphasis and quiet background, hover changes surface, keyboard focus visible. Sidebar itself may scroll independently.
- Main heading followed by semantically grouped settings, generally separated by fine dividers and spacing; do not put each row into a separate heavy card.
- Form settings row: left **label + optional description**, right **control**; align first text line to input vertical center when possible. Prefer grid `minmax(0, 1fr) auto`, with minimum 12–24px column gap. Descriptions wrap naturally.
- On narrower containers (suggested breakpoint ≈760px main-pane width), switch to stacked label + control; control must remain fully usable. No horizontal overflow.

### 3.2 Control width: by intent, not equal width

| Control type | Suggested width |
|---|---|
| Toggle | natural width, aligned to right |
| Short number | 96–120px + visible unit outside field |
| Small enum select | 160–200px |
| Long enum select | 220–320px / max-content constrained to container |
| URL/path | flexible width, 280px minimum when room exists |
| Search/long text | flexible width |
| Dialog field | full form width |

- Dropdown trigger may widen for long values; menu viewport height limited and scrolls; option text should be readable without truncation where feasible; when unavoidable, add accessible full-text tooltip/title and clear keyboard navigation.
- Do not conflate disabled, loading, and read-only.

## 4. Component contract

### 4.1 Buttons

- Variants: `primary` (one dominant action per decision region), `secondary` (cancel/neutral), `ghost` (quiet), `danger` (destructive). Sizes: normal 36px high, compact 32px; minimum comfortable pointer target 32px and preferably 36px.
- Text action buttons include a clear verb: `添加分组`, `保存收藏`, `取消`, `删除`. Do not use `+`, pencil, `×` as the *only* action explanation unless supplied with tooltip and accessible name.
- Group-action order across dialogs consistent: bottom-right `[取消] [保存]`; destructive action separate or explicitly red, with confirmation when needed.
- Buttons never change sizes randomly between groups, favorites, dialogs; icon glyph size 16px, consistent surrounding padding.

### 4.2 Inputs and selects

- Every input has an explicit label, value, validation state and focus state. Place helper/error text adjacent to relevant field.
- Focus: visible outline/ring ≥2px; keyboard focus distinct from hover. Selects must support mouse and keyboard, not clip option labels.
- Units such as `秒` outside numeric field; numeric bounds enforced both in UI and business logic. For live detection: **30–1800 seconds**, default **60 seconds**, only if this feature is already part of current product.
- Inline error text describes what is wrong and how to fix it. Do not save invalid values silently.
- Avoid placeholder-only labels.

### 4.3 Switches and conditional controls

- Switch rows explain effect, particularly for destructive or background-process behavior. Label-click toggles if safe.
- Disabled dependent control should explain why it is unavailable (e.g., favoriting/live-check setting disabled while favorites bar hidden). Do not silently allow unsupported combinations.
- Bookmark children (group names, group structure, live detection) share one dependency on the bar switch. Disabled UI must retain the saved checked state and knob position: native disabled button + grey rgba(128,128,128,.68) overlay, opacity 1, default cursor and no hover/pressed feedback. Row labels/descriptions share a readable disabled token; dimensions remain unchanged. Neither hiding the parent nor parsing/saving config may erase the child preferences; actual detection remains gated by the parent.
- Changes: instant-save for safe toggles with reliable persistence and feedback; explicit Save/Cancel for multi-field editors. Define one strategy per control.

### 4.4 Icons and status

- Choose one consistent icon set already used in repository; standard icon sizes 16/18/20px and 1.75–2px visual stroke. Avoid mixing glyph styles and emoji in application chrome.
- Livestream status: green dot **plus** text/tooltip `直播中`; red/neutral dot **plus** `未开播`; unknown, loading and error have distinct icon/text representations; errors MUST NOT be mislabeled offline. Screen readers must receive status in text. Avoid layout shifts.

### 4.5 List, group, and destructive controls

- Use single consistent row structure: drag handle (only if supported) | icon/type | text + secondary detail | actions. Optional action visibility on hover **and always available on keyboard focus/touch**.
- Accessible tooltips for edit/remove; confirm destructive actions and state their scope. Use consistent undo where technically possible.
- Long names elide only in narrow list views with full accessible title; edit dialogs must always show complete value.

### 4.6 Dialogs

- Header: title left + same-sized close control at right. Body: 16–24px padding, fields stacked with consistent 12–16px gap, labels above inputs for data entry, not cramped inline micro-labels. Footer: consistent `[取消] [保存]` controls right-aligned.
- Modal focus trapped; initial focus on primary editable field; Esc cancels except while an incompatible nested process is running; Enter submits a simple rename dialog, multiline textarea Enter adds line break and Ctrl+Enter can save if documented.
- Closing via backdrop is disabled when unsaved changes may be lost; confirm discard if needed. Exiting a modal restores focus to invoking control. Avoid modal inside modal.
- Saving shows a pending state when asynchronous; prevent duplicate submissions and surface errors without destroying entered data.

## 5. Screen-level specifications

### 5.1 General / browsing / appearance / data & privacy / about

- Convert to Section + SettingRow: consistent label / description / control grammar.
- General: launch state, restore behavior, session persistence logically grouped.
- Browsing: URL fields flexible; screen resolution and scaling independent; explain page zoom vs app UI scale.
- Appearance: theme, UI scale, accent and hover display uses quiet samples without excess decoration. Do not introduce new options that backend does not support.
- Data/privacy: import/export and destructive clear actions in distinct groups; explain exactly what is included/excluded, if known; retain existing safety confirmations. Diagnostic paths use safe copy/open affordances.
- About/diagnostics: version readout readable, consistent action sizes and wrapping, status of update check and diagnostics explicit.

### 5.2 Favorites settings — priority redesign

Suggested page layout:

1. `收藏栏` section: show bar, show group names, livestream checking and interval. Dependent controls only active when appropriate; retain existing behavior.
2. `收藏夹` section header with a **normal-sized** `[+ 新建分组]` action (replace tiny `+`).
3. Each group has a 36–40px header row with expand/collapse (if implemented), group name, count (if available), edit and delete actions at consistent positions. Each favorite is an indented 36–44px row with name, type/status detail and equally sized edit/delete controls. Add a properly labeled `[+ 添加收藏]` action near the list/context, not an isolated icon.
4. If drag-and-drop reordering is already supported, preserve it and show drag affordance; otherwise **do not pretend that visual drag handles work**. If implement drag sorting later, persist order and expose keyboard alternatives.
5. Large collections should scroll in content area. Long text must not force action buttons offscreen.
6. Empty group/empty library: describe the empty state and provide a prominent create action.
7. Prefer consistent tooltip labels (`编辑分组`, `删除分组`, `编辑收藏`, `删除收藏`). Deleting a group must clearly explain what happens to its bookmarks and must preserve existing semantics until explicitly changed.

### 5.3 Group editor

- Modal width ~420px. Title: `新建分组` or `编辑分组`.
- Single `分组名称` label and full-width input (not an input plus a giant button-like control).
- Footer `[取消] [创建分组/保存]`; Enter to submit; preselect name text on edit when appropriate.
- Reject blank/whitespace-only names; describe any duplicates behavior consistent with current product; no accidental deletion.

### 5.4 Favorite editor

- Modal width ~520px; title `新建收藏` or `编辑收藏`.
- Field order: `名称` → `类型` → type-specific `网址 / 直播间号` → `所属分组` → `备注（可选）`.
- For Bilibili type, show pure numeric room ID and explanation; when type changes, preserve data safely according to current conversion rules. Do **not** invent a stream-provider conversion if not implemented.
- `新增分组` should be an adjacent secondary affordance of the `所属分组` field, or an inline flow that returns to this editor; avoid unnecessary nested dialogs or losing unsaved values.
- Textarea spans field width with reasonable min-height. Error messages next to their fields. Footer actions aligned consistently, full labels.
- Preserve all existing fields, URL conversion logic, group assignment and notes, even if not visible in the example screenshot.

## 6. States and motion

- Mandatory interactive states: default, hover, pressed, focus-visible, selected, disabled, loading, validation error, success.
- Feedback: short non-blocking toast for completion (e.g., saved), inline errors for failures, confirmation for irreversible actions. Never claim save succeeded before persistence result.
- Transition durations: hover/focus 100–150ms, opening/closing 150–200ms; prefer subtle opacity/transform changes, no bouncy motion; respect `prefers-reduced-motion`. Motion must never delay essential interactions.

## 7. Keyboard, accessibility, and language

- Full tab order logical and visible. Esc closes cancelable dialogs, Enter activates focused buttons, Space operates switches/checks. Icon buttons have accessible names and tooltips. Do not bind browser-page shortcuts while a user is editing a settings field.
- Use semantic HTML labels/buttons/listbox/dialog roles according to actual components. Focus restoration and live error announcements where applicable.
- WCAG 2.2 AA as target: normal text contrast ≥4.5:1, large text ≥3:1, interactive non-text contrast ~≥3:1, no reliance on color alone. Keep usable targets ≥24×24px as absolute floor, with larger preferred sizes for desktop usability.
- Confirm at 100%, 125%, 150%, 200% app scaling where technically supported, on 1080p/1440p/4K and at Windows 100%/125%/150% system DPI. Check window resizing and 200% text magnification without losing required controls.
- Prioritize Chinese wording consistency. Use `收藏夹/分组/收藏/直播间号` consistently, avoid mixing unexplained technical labels. The app name is **MultiView Browser**; never insert personal branding.

## 8. Engineering application

Suggested architecture (adapt filenames to existing stack; do not force new dependencies):

- `design-tokens` (CSS custom properties or current styling system): semantic color, spacing, typography, radius, motion.
- Shared UI: `SettingsShell`, `SettingsSection`, `SettingRow`, `FormField`, `Button`, `IconButton`, `Select`, `Switch`, `Modal`, `ConfirmDialog`, `Toast`, `FavoriteGroupRow`, `FavoriteRow`.
- Do not scatter literal hex colors, hardcoded per-instance font sizes or arbitrary margins through pages. Prefer semantic tokens and shared variants.
- Avoid premature abstraction: create shared component for repeated interaction patterns; preserve domain-specific validation in the domain layer.
- Retain settings persistence, bookmarks, group order, livestream polling/cache, browsing behavior, import/export, accessibility and all existing API contracts. UI refactor must not change data semantics; any unavoidable migration requires explicit report and tests.

## 9. Verification checklist / acceptance criteria

Each UI change MUST verify:

- [ ] Labels and descriptions readable; contrast checked against actual surrounding surface.
- [ ] All comparable rows share baseline, insets and spacing. Long descriptions wrap gracefully.
- [ ] No clipping of dropdown selected values/options or favorite names without a full-text recovery mechanism.
- [ ] All comparable action buttons and icons consistent in dimensions and stroke.
- [ ] Mouse hover, keyboard focus, Tab/Shift+Tab, Enter, Esc, disabled state work.
- [ ] Confirmation, validation, cancel, failed save and successful save paths tested.
- [ ] Dialogs have proper width, footer alignment, focus restoration, scroll at small windows.
- [ ] Collections: empty, populated, many items, long names, different types and group reassignment tested.
- [ ] Live state: live/offline/unknown/error/loading visibly and textually different; polling values bounds validated.
- [ ] Theme, UI zoom, page zoom remain independent and functional.
- [ ] Test 1080p, 1440p, 4K; small resized window; Windows scaled DPI; text zoom where applicable.
- [ ] Existing settings and user data are not lost; import/export and backward compatibility verified.
- [ ] Lint/type/build/tests pass (or limitations listed). Screenshots of each settings category + both editor dialogs reviewed for regressions.

## 10. Future feature implementation protocol (Codex MUST follow)

1. Read **this entire document** before changing any application UI. Also read project-level `AGENTS.md` / existing component/style patterns.
2. Identify existing reusable components and tokens. Reuse them; do not create a different style for the new feature.
3. For a new control, specify its parent section, label, helper text, states, validation, keyboard interaction, persistence, and narrow-window behavior.
4. If a design requirement is not covered here, prefer the closest established component pattern. When introducing a reusable convention, document it here in the same change.
5. Verify against Section 9; explain any deviations and failed checks in final summary.
6. Do not update project-wide style rules merely to camouflage a visual regression; fix the component/root cause.
7. Any future UI PR should list `Design system compliance: Pass / Exception (reason)`.

## 11. References and attribution

These references inform *principles*, not exact copied measurements:

- OpenAI, ChatGPT visual appearance and contrast: https://help.openai.com/en/articles/11958281-updating-your-visual-experience-on-chatgpt
- OpenAI, desktop app settings and font controls: https://learn.chatgpt.com/docs/app/settings
- OpenAI, keyboard/navigation conventions: https://learn.chatgpt.com/docs/app/commands
- W3C, WCAG 2.2: https://www.w3.org/TR/WCAG22/
- Google Chrome settings UI: conceptual reference to its structured preferences, grouping and predictable controls; not a claim of an officially published Chrome settings design-token specification.

**Governance:** This document is the project's single source of truth for app-shell UI after adoption. Keep stable at `docs/design/ui-design-system.md` and reference it from repository-root `AGENTS.md` without overwriting unrelated instructions. Changes to tokens/component conventions should update this document, implementations and verification in one reviewable change.

## 12. Repository implementation mapping

- Existing React + CSS stack is retained. Semantic aliases in src/style.css bridge the existing Theme.ts / ThemeTokens.ts theme palettes and Accent.ts choices; no font or UI dependencies are added. Existing navy, gray, black and light themes remain available. Default navy is retained for compatibility; the neutral palette in section 2 remains the direction for future palette changes, not a forced theme migration.
- SettingsPanel is the settings shell; SettingRow and SettingSwitch implement common preferences. FavoritesList is shared with the bookmarks bar. NameEditor and FavoriteEditor share useModalFocus for Escape, Tab containment and focus restoration. New repeated patterns should extend these implementations.
- Narrow settings panes stack controls below labels at 760px content width. At 640px window width navigation becomes a horizontally scrolling category strip.
- Group creation reuses an existing name. From V0.2.5.0, inline renaming rejects blank or duplicate names; deleting a group still moves its favorites to 未分组 and requires confirmation.
- Existing instant-save persistence remains owned by App and IPC; this change does not introduce a second settings store. Editor submission preserves existing domain validation and conversion logic.

## 13. Explicit favorites requirements (V0.2.5.0)

The user's newer requirements supersede conflicting examples in sections 4–5 for favorites only:

- Group rename is inline: focus/select the single-line name, pencil → green check, trash → red X (cancel only), Enter saves, Esc cancels; reject blank/duplicate names. New-group creation may retain its existing dialog. No group item counts.
- Group/favorite management uses the existing linear SVG set, 16px glyphs, equal 32×32px targets and 8px gaps, tooltips and accessible names. Destructive confirmations remain. Semantic success/danger tokens in the current shell are #2a9158/#d04444.
- Both favorite editors use an 88px label column + flexible control column, 12px horizontal gap, 16px row spacing and 36px controls. Small enum selects cap at 220px; room platform and number share the control area, stacking below 480px window width when needed. Notes have no editing control; retain legacy data and tolerate missing notes.
- “显示收藏栏分组” defaults on and only hides bar group titles/separators. “显示收藏分组名称” and the new switch are disabled while the bar is hidden, preserving their values; management remains available.
- Both platforms: normal live green; confirmed not-live or replay red; unavailable/unreliable grey. A first failed round can retain a recent valid result; two failed rounds or expiry make it grey. Status tooltips distinguish replay and error categories. These explicit status rules supersede earlier replay examples.
