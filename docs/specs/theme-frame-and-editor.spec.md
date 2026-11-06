# Theme model: Frame and Editor

## Context and problem

A GigglyBits theme is built from one palette, usually five colors from a harmony rule on one base color. Before 2026-11-04 one accent color drove every UI part, the window bars included, and the bars could only be recolored per folder by the separate workspace identity feature, which writes `workbench.colorCustomizations` over any theme. That made the bars hard to design as part of a theme, and a saved theme (the library work that follows) could not carry its own bars.

## Decision

A theme has two color sets, each decided by its own settings and checked by its own contrast floors.

- **Frame**: the title bar, command center, activity bar and its badge, status bar (its no-folder colors and hovered items included), the remote item and the window border, and, since 2026-11-05, the six tab and split lines (`tab.activeBorderTop`, `tab.activeBorder`, `editorGroup.border`, `sideBar.border`, `panel.border`, `sash.hoverBorder`): in a Filled frame they take the frame color lifted to 3:1 on the editor, and in a Dark frame they keep the editor's accent, background and divider. It takes one palette color, or a custom color, and a style. **Filled** paints the bars in the frame color with black or white text; **Dark** keeps the look the GigglyBits themes had before the Frame existed, dark bars with accents in the frame color, and a transparent window border.
- **Editor**: every other key. It takes an accent color (a palette index) and a surface tint (Neutral, Tinted or Rich), and, since 2026-11-06, three settings the Lab's Roles step (step 4) sets: **syntax colors**, the palette color each of Keywords, Functions, Strings, Types and Numbers takes, as five indexes read modulo the palette's length (default 1 to 5 in order); **surface depth**, a multiplier from 0.5 to 2 in steps of 0.1 on how far each surface steps in lightness from the editor background (default 1); and **text contrast**, the four gray text lightnesses, Soft, Standard (default) or High. At their defaults the build is the one before they existed. None of them changes a Frame key.

Changing the Frame never changes an Editor key. In a Filled frame, changing the Editor never changes a Frame key; in a Dark frame the bars reuse the editor's dark surfaces on purpose, so they follow the surface tint.

New designs in the Theme Lab start Filled in palette color 1. The Lab theme and the 12 slot files, built with no frame, are Dark, and so is an older Try with no frame when it is restored.

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

- `buildColors(entry, { index, surfaces, frame: { index? | color?, style }, syntax?, depth?, text? }, edits, groups)`, `buildTheme(entry, chrome, edits, groups)` and `labSettings(entry, chrome, edits, groups)` in `media/themeBuilder.js`. `groups` is the style groups, `{ family, roles }` each (default `[]`), applied after the roles and before key edits; no group family holds a `FRAME_KEYS` key, so groups never change the Frame (`docs/specs/theme-library.spec.md`).
- `FRAME_KEYS`, `SWATCHES[name][2]` (the group), `SWATCH_OF[key]`.
- `cleanChrome(chrome)` returns the three Roles settings cleaned (`syntax` as five non-negative integers or null, `depth` clamped to 0.5 to 2 and rounded to 0.1, `text` a `TEXT_LEVELS` id); `TEXT_LEVELS` holds each level's four lightnesses, and `ROLE_FAMILIES` the seven families the Roles step shows.
- The Lab's `ui.palette.frame` state and the Try in VS Code message's `chrome.frame` and `settings.frame`; `TryRecord.frame` in `src/labStart.ts`.

## Verification

- `test/themeBuilder.test.ts`: a default build equals `test/fixtures/frame-baseline/` (the themes built from `test/fixtures/palettes.json` before the Frame existed) apart from `window.activeBorder` and the five input-outline keys; Frame and Editor independence and every contrast floor over every included palette, every palette color as the frame color, and both styles.
- `test/paletteLab.test.ts`, `test/themeLab.test.ts`: the Frame and Editor rows of step 3 drive the preview, Try posts the frame, a restored Try brings it back, step 3's heading reads the choice (`Frame 1 Filled · Accent 1 Neutral`), a narrow pick in the title, activity or status bar moves the Frame row into the Edit dock, and the Lab shows no "chrome" or "workspace identity" wording.
- Live, 2026-11-04: a Filled frame applied by Try in VS Code colored a real window's bars readably, and the Search view's input outline was visible.

## Related

- Work order `wo-theme-lab-separate-frame-and-editor-palettes` (item 1 of the theme-library sequence); item 2, the saved theme library, stores the Frame with each theme.
- `docs/VISION.md`, Settled decisions: "A theme has two color sets: Frame and Editor."
