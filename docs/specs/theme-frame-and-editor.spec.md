# Theme model: Frame and Editor

## Context and problem

A GigglyBits theme is built from one palette, usually five colors from a harmony rule on one base color. Before 2026-11-04 one accent color drove every UI part, the window bars included, and the bars could only be recolored per folder by the separate workspace identity feature, which writes `workbench.colorCustomizations` over any theme. That made the bars hard to design as part of a theme, and a saved theme (the library work that follows) could not carry its own bars.

## Decision

A theme has two color sets, each decided by its own settings and checked by its own contrast floors.

- **Frame**: the title bar, command center, activity bar and its badge, status bar (its no-folder colors and hovered items included), the remote item and the window border. It takes one palette color, or a custom color, and a style. **Filled** paints the bars in the frame color with black or white text; **Dark** keeps the shipped look, dark bars with accents in the frame color, and a transparent window border.
- **Editor**: every other key. It takes an accent color (a palette index) and a surface tint (Neutral, Tinted or Rich).

Changing the Frame never changes an Editor key. In a Filled frame, changing the Editor never changes a Frame key; in a Dark frame the bars reuse the editor's dark surfaces on purpose, so they follow the surface tint.

New designs in the Theme Lab start Filled in palette color 1. The shipped variants, and a design started from one, stay Dark, so they look as they always have.

Rejected: a separate harmony rule for the Frame (the shared palette was enough for the user's happy path; recorded as deferred), and keeping the per-folder color as the only way to color the bars (it cannot travel with a saved theme).

## Architecture

- `media/themeBuilder.js` is the only theme builder. The Theme Lab webview loads it, and `scripts/theme-builder.js` re-exports it for the build script and the extension host, so a preview always shows what Try in VS Code applies.
- Every key belongs to one swatch (a role). `KEY_GROUPS` maps swatches to keys; `SWATCHES` gives each swatch a label, a description and a group, `frame` or `editor`. `FRAME_KEYS` is every key a frame swatch takes.
- `swatches(entry, chrome, edits)` computes the editor swatches first, then the frame swatches from `frameOf(entry, chrome)`, which cleans `chrome.frame`: a `#rrggbb` color wins over an index, a missing or bad frame follows `chrome.index` in Dark.
- Input, dropdown, checkbox, panel filter and chat input outlines have their own role, the border color lifted until it reads 3:1 against the editor and the side bar.

## Contrast floors

| Pair | Floor |
|---|---|
| Frame text on its bar (title, activity, status, no-folder status, hovered item, remote item, badge) | 4.5:1 |
| Inactive activity bar icons on the activity bar | 3:1 |
| Input outlines on the editor and on the side bar | 3:1 |
| Syntax colors and the accent on `#1e1e1e` | 4.5:1 (unchanged) |

Filled text is black or white, picked against the exact background it sits on, so it always reaches at least 4.58:1.

## Key interfaces

- `buildColors(entry, { index, surfaces, frame: { index? | color?, style } }, edits)`, `buildTheme`, `labSettings` in `media/themeBuilder.js`.
- `FRAME_KEYS`, `SWATCHES[name][2]` (the group), `SWATCH_OF[key]`.
- The Lab's `ui.palette.frame` state and the Try in VS Code message's `chrome.frame` and `settings.frame`; `TryRecord.frame` in `src/labStart.ts`.

## Verification

- `test/themeBuilder.test.ts`: a default build equals `test/fixtures/frame-baseline/` (the shipped variants before the Frame existed) apart from `window.activeBorder` and the five input-outline keys; Frame and Editor independence and every contrast floor over every included palette, every palette color as the frame color, and both styles.
- `test/paletteLab.test.ts`, `test/themeLab.test.ts`: the Frame and Editor boxes drive the preview, Try posts the frame, a restored Try brings it back, and the Lab shows no "chrome" or "workspace identity" wording.
- Live, 2026-11-04: a Filled frame applied by Try in VS Code colored a real window's bars readably, and the Search view's input outline was visible.

## Related

- Work order `wo-theme-lab-separate-frame-and-editor-palettes` (item 1 of the theme-library sequence); item 2, the saved theme library, stores the Frame with each theme.
- `docs/VISION.md`, Settled decisions: "A theme has two color sets: Frame and Editor."
