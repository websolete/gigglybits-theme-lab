# Theme library: saved themes, slots and project frames

## Context and problem

The Theme Lab could build a design and try it as GigglyBits Dark (Lab), but nothing kept it. The user wanted to name a design, save it, delete it, and use it from any VS Code window or project, such as a 'copirate' theme in one workspace and a 'webscreenfw1' theme in another. VS Code only lists color themes an extension ships as files, so a design made at run time cannot appear in the theme picker under its own name.

## Decision

- **Saved themes live in the user setting `gigglybits.library`**, application-scoped, so every window reads the same list and Settings Sync carries it. A saved theme is `{ id, name, slot, design, groups, savedAt }`, where `design` is everything the Lab holds: the palette mode and the settings that made it, the resolved colors, the Editor accent and surfaces, the Frame, and color edits. `groups` is `[]` until shared style groups land.
- **Designs reach the picker through 12 fixed slots**, `GigglyBits Theme 1` to `GigglyBits Theme 12`, shipped as theme files built like the Lab theme. Each saved theme binds to the lowest free slot; with all 12 bound, saving or using another theme asks which one gives up its slot. A slot's real colors are written to user settings scoped to its label.
- **Use everywhere applies a theme's Editor colors; the frame belongs to the project.** Decided by the user during the live check: a frame applied to every window would defeat having differently colored workspaces. The user-level slot block carries the theme with a Dark frame. Use in this project also writes the theme's frame keys into the folder's settings under the slot's scope, which wins over the user block key by key.
- **Every save builds on the settings files on disk**, not on the window's configuration. A window that had been open since before another window's save wrote back the older values once in the live check.

Rejected: a dynamic theme file per saved theme (VS Code reads contributed themes only at install), and applying the frame everywhere (it erases the difference between projects).

## Architecture

- `src/themeLibrary.ts` holds every decision with no `vscode` import: `parseLibrary`, `saveTheme` (a trimmed, case-insensitive name match updates in place; a new name takes the lowest free slot; `needsSlot` when none is free), `bindTheme`, `deleteTheme`, `slotSettings`, `everywhereSettings`, `projectFrame`, `withProjectFrame`, `projectFrameRefresh`, `writeSlot`, `clearSlot`, `settingsFilesFor` and `freshestSetting`.
- `src/themeLibraryController.ts` does the VS Code side: settings writes, the delete modal, the slot quick pick, Use in this project and Use everywhere, the folder-color prompt, and **GigglyBits: Choose Theme**. Each window refreshes its folder's frame block at start-up and when `gigglybits.library` changes.
- `scripts/build-themes.js` writes the slot files after the Lab theme; `src/themeList.ts` leaves the slots out of the Shipped list.
- The Lab's Start from > Saved tab lists saved themes with Load, Use in this project (only with a folder open), Use everywhere and Delete. Include, Maybe and Exclude moved into a Catalog box shown only with this repository open.

## Settings written

| Setting | Level | Content |
|---|---|---|
| `gigglybits.library` | user (default profile file) | the saved themes |
| `workbench.colorCustomizations` `[GigglyBits Theme <n>]` | user | the theme with a Dark frame |
| `editor.tokenColorCustomizations` `[GigglyBits Theme <n>]` | user | `textMateRules` |
| `workbench.colorCustomizations` `[GigglyBits Theme <n>]` | folder | the theme's 25 frame keys |
| `workbench.colorTheme` | folder or user | the slot label |

## Key interfaces

- Webview to host: `saveTheme { name, design }`, `useTheme { id, where: 'project' | 'everywhere' }`, `deleteTheme { id }`.
- Host to webview: `library { themes, hasFolder }`, and `start { saved: { name, design } }` when the active theme is a bound slot.
- `media/themeBuilder.js`: `SLOT_COUNT`, `slotLabel(n)`, `slotFile(n)`.

## Verification

- `test/themeLibrary.test.ts`: parsing, slotting and the 13th save, update by name, delete, slot settings, Dark user blocks, project frames and their refresh, and a save built on a newer settings file keeping the newer theme.
- `test/buildThemes.test.ts`, `test/themeList.test.ts`, `test/labStart.test.ts`, `test/paletteLab.test.ts`, `test/themeLab.test.ts`: slot files, the Shipped list, starting on a saved theme, Save theme, the Saved tab, the Catalog box, and a save, read back and load that draws the same colors.
- Live, 2026-11-04: a folder window kept its theme's Filled frame while a window using another theme everywhere showed dark bars; a save in an already-open window left the other window's newer save in place; Delete asked first and freed the slot; the folder-color prompt appeared.

## Related

- Work order `wo-theme-library-save-use-and-delete-named-themes` (theme-library item 2 of 4). Item 3, shared style groups, applies groups across every saved theme.
- `docs/specs/theme-frame-and-editor.spec.md`: the Frame and Editor color sets this builds on.
- `docs/DEVELOPMENT.md`, Theme library and Identity write shape.
