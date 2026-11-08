# Theme library: saved themes, slots and project frames

## Context and problem

The Theme Lab could build a design and try it as GigglyBits Dark (Lab), but nothing kept it. The user wanted to name a design, save it, delete it, and use it from any VS Code window or project, such as a 'copirate' theme in one workspace and a 'webscreenfw1' theme in another. VS Code only lists color themes an extension ships as files, so a design made at run time cannot appear in the theme picker under its own name.

## Decision

- **Saved themes live in the user setting `gigglybits.library`**, application-scoped, so every window reads the same list and Settings Sync carries it. A saved theme is `{ id, name, slot, design, savedAt }`, where `design` is everything the Lab holds: the palette mode and the settings that made it, the resolved colors, the Editor accent and surfaces, the Frame, color edits, and the Roles step's `syntax`, `depth` and `text` when they differ from their defaults (`[0, 1, 2, 3, 4]`, 1 and `standard`). A design without them builds as it did before they existed; `parseDesign` keeps them only when valid, and `slotSettings` and `everywhereSettings` pass them to the builder's `chrome`. `design.syntaxSet` names the syntax set its code colors come from, when it uses one (below). A `groups` field from the retired style groups is ignored when read.
- **Syntax sets replace style groups (2026-11-07).** Style groups mapped a widget family's colors to roles drawn from each theme's palette, so they could not keep code colors the same across themes. A syntax set `{ id, name, colors, isDefault, savedAt }` in the user setting `gigglybits.syntaxSets` holds one fixed `#rrggbb` per kind of code (keyword, function, string, type, number, comment, tag, attribute, variable, property, constant, operator, regex). A saved theme names its set by id; its slot is built with that set's colors, each lifted to 4.5:1 keeping its hue, so changing a set rewrites every theme on it. A theme on no set builds exactly as before. `gigglybits.groups` stays declared, deprecated, and unread.
- **Start set from fills an unsaved draft, never a stored set (2026-11-07).** The Syntax family's Start set from row offers three starter sources, one group at a time, each starter a chip that draws a few lines of code in its colors as a theme would draw them: the user's installed dark (`vs-dark`) themes, read from their extensions' theme files and mapped onto the thirteen kinds by the most specific matching TextMate scope; well-known dark schemes bundled as credited data (`SYNTAX_SCHEMES`: Dracula, Nord, Solarized Dark, Gruvbox (dark), One Dark, Tokyo Night, Catppuccin Mocha, each permissively licensed); and the Quiet and Harmony recipes worked out from the design's own palette and frame. A pick makes a draft held in the page only, outside the saved Lab state: nothing writes `gigglybits.syntaxSets`, saves the Lab state or sends a Try until Save New Set, which stores the draft's colors as a new set. A starter never loads into an existing set, so it cannot recolor the themes on one.
- **Designs reach the picker through 12 fixed slots**, `GigglyBits Theme 1` to `GigglyBits Theme 12`, shipped as theme files built like the Lab theme. Each saved theme binds to the lowest free slot; with all 12 bound, saving or using another theme asks which one gives up its slot. A slot's real colors are written to user settings scoped to its label.
- **Use everywhere applies a theme's Editor colors; the frame belongs to the project.** Decided by the user during the live check: a frame applied to every window would defeat having differently colored workspaces. The user-level slot block carries the theme with a Dark frame. Use in this project also writes the theme's frame keys into the folder's settings under the slot's scope, which wins over the user block key by key.
- **Every save builds on the settings files on disk**, not on the window's configuration. A window that had been open since before another window's save wrote back the older values once in the live check.

Rejected: a dynamic theme file per saved theme (VS Code reads contributed themes only at install), and applying the frame everywhere (it erases the difference between projects).

## Architecture

- `src/themeLibrary.ts` holds every decision with no `vscode` import: `parseLibrary`, `saveTheme` (a trimmed, case-insensitive name match updates in place; a new name takes the lowest free slot; `needsSlot` when none is free), `bindTheme`, `deleteTheme`, `slotSettings`, `everywhereSettings`, `projectFrame`, `withProjectFrame`, `projectFrameRefresh`, `writeSlot`, `clearSlot`, `settingsFilesFor`, `freshestSetting`, and for syntax sets `parseSyntaxSets`, `saveSyntaxSet`, `setDefaultSyntaxSet`, `deleteSyntaxSet`, `themesUsingSyntaxSet`, `syntaxColorsFor` and `writeAllSlots`. `slotSettings`, `everywhereSettings` and `writeSlot` take the syntax sets as a last parameter and resolve each theme's set; `projectFrame` passes none, since a set never touches the frame.
- `src/themeLibraryController.ts` does the VS Code side: settings writes, the delete modal, the slot quick pick, Use in this project (which replaces a folder's old per-folder color with the theme's frame) and Use everywhere, **GigglyBits: Choose Theme**, and group save, switch and delete (delete asks in a modal), each followed by `writeAllSlots` over every bound slot. Each window refreshes its folder's frame block at start-up and when `gigglybits.library` changes.
- `media/themeBuilder.js` takes a set's colors as `chrome.syntaxColors` (`cleanChrome` keeps them only when every `SYNTAX_SET_KEYS` key is a `#rrggbb`) and draws the code roles and token rules from them, adding `SET_RULES` after today's six. The Lab's step 4 Syntax family chooses From this palette or a set, edits the set's colors, saves the drawn colors as a new set, and makes a set the default for new designs.
- `scripts/build-themes.js` writes the Lab theme and then the slot files, all 13 from its base palette `BASE`; since 2026-11-05 they are the only themes the extension contributes.
- The Lab's Start step has two tabs, Wheel and Saved. The Saved tab lists saved themes one line each with Load, and a chevron that shows Use in this project (only with a folder open), Use everywhere and Delete; Enter on a line loads it. A saved theme of pasted colors still loads and saves as pasted, though the Lab no longer takes pasted colors. The palette Catalog (Include, Maybe and Exclude, `palettes/catalog.json`) is retired: saved themes replace it.
- The step 6 bar says "Saved as" the name once a `library` message holds a theme of that name, and warns "Overwrites" while Name matches another saved theme, trimmed and in any letter case (the same match `saveTheme` uses).

## Settings written

| Setting | Level | Content |
|---|---|---|
| `gigglybits.library` | user (default profile file) | the saved themes |
| `gigglybits.syntaxSets` | user (default profile file) | the syntax sets |
| `workbench.colorCustomizations` `[GigglyBits Theme <n>]` | user | the theme with a Dark frame |
| `editor.tokenColorCustomizations` `[GigglyBits Theme <n>]` | user | `textMateRules` |
| `workbench.colorCustomizations` `[GigglyBits Theme <n>]` | folder | the theme's 31 frame keys, the six tab and split lines included, with any old per-folder color removed |
| `workbench.colorTheme` | folder or user | the slot label |

## Key interfaces

- Webview to host: `saveTheme { name, design }`, `useTheme { id, where: 'project' | 'everywhere' }`, `deleteTheme { id }`, `saveSyntaxSet { id?, name, colors }`, `setDefaultSyntaxSet { id | null }`, `deleteSyntaxSet { id }`, and `applyPalette` whose chrome carries `syntaxColors` when the design is on a set.
- Host to webview: `library { themes, syntaxSets, hasFolder }`, re-sent when `gigglybits.library` or `gigglybits.syntaxSets` changes, `installedStarters { starters }` (each `{ id, label, extension, colors }`, from `listInstalledSyntaxStarters` in `src/themeSource.ts`), sent last on `ready` and again when extensions change, and `start { saved: { name, design } }` when the active theme is a bound slot.
- `media/themeBuilder.js` for Start set from: `SYNTAX_SCHEMES`, `starterFromRules(rules, foreground)`, `recipeColors(id, { sw, foreground, comment, baseHue })`, `harmonyHue(frameHex, accentHex)`, `setColor`, `cleanSyntaxColors`.
- `media/themeBuilder.js`: `SLOT_COUNT`, `slotLabel(n)`, `slotFile(n)`.

## Verification

- `test/themeLibrary.test.ts`: parsing, slotting and the 13th save, update by name, delete, slot settings, Dark user blocks, project frames and their refresh, and a save built on a newer settings file keeping the newer theme.
- `test/buildThemes.test.ts`, `test/labStart.test.ts`, `test/paletteLab.test.ts`, `test/themeLab.test.ts`: slot files, starting on a saved theme, Save theme, a saved theme of pasted colors, the Saved tab's rows, Saved as and Overwrites on the step 6 bar, syntax sets in step 4 (source choice, Save New Set, a palette change keeping a set's colors, Save theme and load keeping the set), Start set from (its three groups, a draft that saves and sends nothing until Save New Set, the lightened-color line, the draft dropped by Discard, a Code colors change and a reload), and a save, read back and load that draws the same colors.
- `test/themeBuilder.test.ts`, `test/themeSource.test.ts`, `test/themePreviewPanel.test.ts`: the scope match rule, the scheme data and the recipes; the installed-theme list with its include chain and without this extension's own themes; `installedStarters` on `ready` and on an extension change.
- Live, 2026-11-04: a folder window kept its theme's Filled frame while a window using another theme everywhere showed dark bars; a save in an already-open window left the other window's newer save in place; Delete asked first and freed the slot; the folder-color prompt appeared.

## Related

- Work order `wo-theme-library-save-use-and-delete-named-themes` (theme-library item 2 of 4). Item 3, shared style groups, was retired on 2026-11-07 by `wo-syntax-sets-replace-style-groups-code-colors-that-stay-the-same-across-themes`, which adds syntax sets.
- `docs/specs/theme-frame-and-editor.spec.md`: the Frame and Editor color sets this builds on.
- `docs/DEVELOPMENT.md`, Theme library and Identity write shape.
