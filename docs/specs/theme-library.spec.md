# Theme library: saved themes, slots and project frames

## Context and problem

The Theme Lab could build a design and try it as GigglyBits Dark (Lab), but nothing kept it. The user wanted to name a design, save it, delete it, and use it from any VS Code window or project, such as a 'copirate' theme in one workspace and a 'webscreenfw1' theme in another. VS Code only lists color themes an extension ships as files, so a design made at run time cannot appear in the theme picker under its own name.

## Decision

- **Saved themes live in the user setting `gigglybits.library`**, application-scoped, so every window reads the same list and Settings Sync carries it. A saved theme is `{ id, name, slot, design, groups, savedAt }`, where `design` is everything the Lab holds: the palette mode and the settings that made it, the resolved colors, the Editor accent and surfaces, the Frame, color edits, and the Roles step's `syntax`, `depth` and `text` when they differ from their defaults (`[0, 1, 2, 3, 4]`, 1 and `standard`). A design without them builds as it did before they existed; `parseDesign` keeps them only when valid, and `slotSettings` and `everywhereSettings` pass them to the builder's `chrome`. `groups` stays `[]`: groups a theme names for itself are deferred, and the style groups that are on apply to every saved theme instead (below).
- **Style groups are a preference applied everywhere.** A style group `{ id, name, family, roles, on, savedAt }` in the user setting `gigglybits.groups` maps one family's colors (`tabs`, `lists`, `buttons`, `editorText`) to Editor swatches. Every group that is on, at most one per family, is written into every bound slot block, drawn from that theme's own swatches. A theme's single-key edits win, and no group sets a frame key.
- **Designs reach the picker through 12 fixed slots**, `GigglyBits Theme 1` to `GigglyBits Theme 12`, shipped as theme files built like the Lab theme. Each saved theme binds to the lowest free slot; with all 12 bound, saving or using another theme asks which one gives up its slot. A slot's real colors are written to user settings scoped to its label.
- **Use everywhere applies a theme's Editor colors; the frame belongs to the project.** Decided by the user during the live check: a frame applied to every window would defeat having differently colored workspaces. The user-level slot block carries the theme with a Dark frame. Use in this project also writes the theme's frame keys into the folder's settings under the slot's scope, which wins over the user block key by key.
- **Every save builds on the settings files on disk**, not on the window's configuration. A window that had been open since before another window's save wrote back the older values once in the live check.

Rejected: a dynamic theme file per saved theme (VS Code reads contributed themes only at install), and applying the frame everywhere (it erases the difference between projects).

## Architecture

- `src/themeLibrary.ts` holds every decision with no `vscode` import: `parseLibrary`, `saveTheme` (a trimmed, case-insensitive name match updates in place; a new name takes the lowest free slot; `needsSlot` when none is free), `bindTheme`, `deleteTheme`, `slotSettings`, `everywhereSettings`, `projectFrame`, `withProjectFrame`, `projectFrameRefresh`, `writeSlot`, `clearSlot`, `settingsFilesFor`, `freshestSetting`, and for style groups `parseGroups`, `saveGroup`, `setGroupOn`, `deleteGroup`, `activeGroups` and `writeAllSlots`. `slotSettings`, `everywhereSettings` and `writeSlot` take the active groups as a last parameter; `projectFrame` passes none.
- `src/themeLibraryController.ts` does the VS Code side: settings writes, the delete modal, the slot quick pick, Use in this project (which replaces a folder's old per-folder color with the theme's frame) and Use everywhere, **GigglyBits: Choose Theme**, and group save, switch and delete (delete asks in a modal), each followed by `writeAllSlots` over every bound slot. Each window refreshes its folder's frame block at start-up and when `gigglybits.library` changes.
- `GROUP_FAMILIES` in `media/themeBuilder.js` lists each family's keys and token rules; `buildColors`, `tokenColors`, `buildTheme` and `labSettings` take `groups` as a fourth parameter and apply them after the roles and before key edits. The Lab's Style groups mode, opened from the foot of Start from > Saved, lists saved groups one line each with On, name and family (Load and Delete behind a click), builds a draft under New group with the draft family's card alone on the stage, and saves it from the step 6 bar.
- `scripts/build-themes.js` writes the Lab theme and then the slot files, all 13 from its base palette `BASE`; since 2026-11-05 they are the only themes the extension contributes.
- The Lab's Start step has two tabs, Wheel and Saved. The Saved tab lists saved themes one line each with Load, and a chevron that shows Use in this project (only with a folder open), Use everywhere and Delete; Enter on a line loads it. A saved theme of pasted colors still loads and saves as pasted, though the Lab no longer takes pasted colors. The palette Catalog (Include, Maybe and Exclude, `palettes/catalog.json`) is retired: saved themes replace it.
- The step 6 bar says "Saved as" the name once a `library` message holds a theme of that name, and warns "Overwrites" while Name matches another saved theme, trimmed and in any letter case (the same match `saveTheme` uses).

## Settings written

| Setting | Level | Content |
|---|---|---|
| `gigglybits.library` | user (default profile file) | the saved themes |
| `gigglybits.groups` | user (default profile file) | the style groups |
| `workbench.colorCustomizations` `[GigglyBits Theme <n>]` | user | the theme with a Dark frame |
| `editor.tokenColorCustomizations` `[GigglyBits Theme <n>]` | user | `textMateRules` |
| `workbench.colorCustomizations` `[GigglyBits Theme <n>]` | folder | the theme's 31 frame keys, the six tab and split lines included, with any old per-folder color removed |
| `workbench.colorTheme` | folder or user | the slot label |

## Key interfaces

- Webview to host: `saveTheme { name, design }`, `useTheme { id, where: 'project' | 'everywhere' }`, `deleteTheme { id }`, `saveGroup { name, family, roles }`, `setGroupOn { id, on }`, `deleteGroup { id }`, and `applyPalette` carrying `groups`, the `{ family, roles }` list the preview draws.
- Host to webview: `library { themes, groups, hasFolder }`, re-sent when `gigglybits.library` or `gigglybits.groups` changes, and `start { saved: { name, design } }` when the active theme is a bound slot.
- `media/themeBuilder.js`: `SLOT_COUNT`, `slotLabel(n)`, `slotFile(n)`.

## Verification

- `test/themeLibrary.test.ts`: parsing, slotting and the 13th save, update by name, delete, slot settings, Dark user blocks, project frames and their refresh, and a save built on a newer settings file keeping the newer theme.
- `test/buildThemes.test.ts`, `test/labStart.test.ts`, `test/paletteLab.test.ts`, `test/themeLab.test.ts`: slot files, starting on a saved theme, Save theme, a saved theme of pasted colors, the Saved tab's rows, Saved as and Overwrites on the step 6 bar, the Style groups mode and its exact restore, and a save, read back and load that draws the same colors.
- Live, 2026-11-04: a folder window kept its theme's Filled frame while a window using another theme everywhere showed dark bars; a save in an already-open window left the other window's newer save in place; Delete asked first and freed the slot; the folder-color prompt appeared.

## Related

- Work order `wo-theme-library-save-use-and-delete-named-themes` (theme-library item 2 of 4). Item 3, shared style groups, applies groups across every saved theme.
- `docs/specs/theme-frame-and-editor.spec.md`: the Frame and Editor color sets this builds on.
- `docs/DEVELOPMENT.md`, Theme library and Identity write shape.
