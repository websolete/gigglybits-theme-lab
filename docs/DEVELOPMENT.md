# Developing GigglyBits

How this extension is built, run, tested and shipped. Most of it follows practice already settled in the sibling extensions under `d:/Inetpub/vscode_extensions` (copirate, markdown-compass, json-dump, xml-dump, markdown-cfml-syntax). Where gigglybits departs from them, this file says so and why.

## Quick start

```bash
npm install
npm test          # type-check the tests, then run Jest
```

Then press **F5**. A second VS Code window opens (the Extension Development Host) running this working tree, with your installed extensions and themes still loaded. Run **GigglyBits: Open Theme Lab** or **GigglyBits: Open Palette Inspector** there.

## Two ways to run it, and which one you are looking at

| | F5 (Extension Development Host) | Installed build |
|---|---|---|
| Runs | The working tree, rebuilt on save by the `watch` task | The last `.vsix` you installed |
| Picks up an edit | Reload the dev host window (Ctrl+R in it) | Only after `Build: Quick Development` **and** a window reload |
| Use it for | Day-to-day iteration and debugging with breakpoints | Living with the theme in your everyday window |

The trap is assuming your everyday window runs your latest source. It runs the installed `.vsix`, so a fix that works under F5 does nothing there until you package, install and reload. (Copirate records the same gotcha for its own development.)

A window reload restarts the extension host. If an AI agent is driving a session in that window, the reload ends the session, so reload by hand rather than asking the agent to do it.

## npm scripts

| Script | What it does |
|---|---|
| `check-types` | `tsc --noEmit` over `src/` |
| `check-types:test` | The same over `src/` and `test/` (`tsconfig.test.json`) |
| `lint` | ESLint over `src/` and `test/` |
| `compile` | `check-types`, `lint`, then a development bundle to `dist/` |
| `watch:esbuild`, `watch:tsc` | Rebuild and type-check on save (the `watch` task runs both) |
| `package` | All checks including test types, `themes:check`, a minified production bundle, then `smoke:bundle` |
| `smoke:bundle` | Load `dist/extension.js` with a stub `vscode` module, call `activate()`, and fail unless every contributed command is registered, every webview asset is present and every `contributes.themes` file exists and parses |
| `themes` | Generate the Lab theme and the 12 slot themes from the base palette in `scripts/build-themes.js` (see [Building the theme itself](#building-the-theme-itself)) |
| `themes:check` | Fail when those 13 theme files or `contributes.themes` are out of date; writes nothing |
| `test` | Type-check the tests, then run Jest |
| `verify` | `check-types`, `lint`, `test`: run this before you commit |
| `clean` | Delete `dist/` and `out/` |
| `pack` | `vsce package`, which runs `package` first through `vscode:prepublish` |
| `build:pack` | `clean`, then `pack` |
| `install:local` | Install the `.vsix` for the current version into your everyday VS Code and confirm it is listed |
| `dev:quick` | `build:pack`, then `install:local` |
| `version:patch` | Bump the patch version without a git tag |
| `full:patch` | `version:patch`, then `dev:quick` |

`install:local` uses `code.cmd` on Windows. Set `VSCODE_CLI=code-insiders` to target Insiders.

## Tasks (Terminal > Run Task)

| Task | Use |
|---|---|
| `watch` | Started automatically by F5. Errors from both esbuild and tsc land in the Problems panel. |
| `Build: Quick Development` | Default build task (Ctrl+Shift+B). Package and install the current version. |
| `Build: Full Patch Release` | Bump the version, then package and install. |
| `Build: Production Package` | Build the `.vsix` without installing it. |
| `Check: Types, Lint and Tests` | The full gate. |
| `Clean` | Remove build output. |

The esbuild watch task uses an inline problem matcher keyed to the `[watch] build started` and `[watch] build finished` lines that `esbuild.js` prints. That keeps F5 working without the separate esbuild problem-matcher extension.

`.gitignore` currently excludes `.vscode/`, which means these task and launch files are not tracked. The sibling repos commit theirs. Remove that line if the tasks should travel with the repo.

## Build layout

- **esbuild bundles `src/extension.ts` into `dist/extension.js`**, the same shape as `markdown-compass/esbuild.js` and copirate. The small siblings compile with plain `tsc` to `out/`. Gigglybits bundles because it has a runtime dependency (`jsonc-parser`): bundling folds it into one file, so the package ships no `node_modules`.
- That is why `jsonc-parser` sits in `devDependencies` and `pack` passes `--no-dependencies`. Any new runtime library goes in `devDependencies` too; esbuild bundles it.
- esbuild only strips types. Type errors come from `check-types`, which every build path runs first.
- **`mainFields: ['module', 'main']` in `esbuild.js` is load-bearing.** Without it esbuild picks `jsonc-parser`'s UMD build, which loads its own files through a `require` esbuild cannot follow. The bundle then builds cleanly and fails at activation with `Cannot find module './impl/format'`, so the command shows in the palette but reports "command not found". Type checks, unit tests and a grep for `require("...")` all miss it, because the tests run on `src/` and minification renames `require`. `smoke:bundle` catches it, and `package` runs it on every build.
- When the installed extension misbehaves, the extension host log has the real error. Search `%APPDATA%/Code/logs/<newest>/window*/exthost/exthost.log` for the extension ID.
- `media/` (the webview scripts and styles) is shipped as-is, not bundled. `src/identity.ts` requires `../media/shared.js`, and `scripts/theme-builder.js` re-exports `media/themeBuilder.js`, which requires `./shared.js`; esbuild bundles those copies into the extension host.
- **The retired per-folder color** is `src/identity.ts` (the old overlay's shape, `drawnOldColor`, the old color VS Code still draws, which the Frame row's note names, `oldFolderColor`, which adds a pinned color for the offer, `withoutIdentity`, which removes it, and `shouldOfferMigration`; no `vscode` import, covered by `test/identity.test.ts`) and `src/identityController.ts`, which registers no command and writes no overlay. At activation, in a folder that still has an old color and has not been offered before, it sets `workspaceState` `gigglybits.frame.migrationOffered` and offers a project theme: **Make project theme** runs `gigglybits.openThemeLab` with `{ frame: { color, style: 'filled' }, name }`, **Remove the color** writes `withoutIdentity` and clears `gigglybits.identity.hue` and `pinnedColor` at the Workspace target, and **Not now** does nothing. `onStartupFinished` activates the extension so the offer can run when a folder opens.
- `esbuild.js` copies `codicon.css` and `codicon.ttf` from `@vscode/codicons` into `dist/codicons/` on every build, because `node_modules` is not packaged. `smoke:bundle` fails if they, or any `media/` file a webview loads, are missing.

## Release loop

This is copirate's `/copirate-bbi` loop scaled down. That prompt only deploys in the copirate workspace, so here it runs as tasks and scripts.

1. Bump: `npm run version:patch`, or `npm version minor --no-git-tag-version` for a feature drop.
2. Add a `## x.y.z` entry to `CHANGELOG.md` for user-visible changes. One short bullet per change, written for someone using the extension. Internal refactors, test changes and tooling get no entry. This is the json-dump format.
3. `npm run dev:quick` (or the `Build: Quick Development` task).
4. Reload your everyday window by hand.
5. Keep the last three `.vsix` files and delete older ones:

   ```powershell
   Get-ChildItem *.vsix | Sort-Object LastWriteTime -Descending | Select-Object -Skip 3 | Remove-Item
   ```

`full:patch` does steps 1 and 3 in one go, but skips the changelog. Use it only for builds with nothing user-visible to record.

## Webview rules

There are two editor-tab webviews, each with its own command and view type:

| Panel | Host | Page script | Holds |
|---|---|---|---|
| Theme Lab (`gigglybits.themeLab`) | `src/themeLabPanel.ts` | `media/themeLab.js` | The Palette Lab: steps 1 Start (with the installed-theme list and saved themes), 2 Palette, 3 Frame and Editor, 4 Roles, 5 the Edit dock, 6 Try and Save, the Preview card (whether the Theme Preview window is open, and Open Preview), and the Style groups mode. The page draws no preview of its own |
| Palette Inspector (`gigglybits.paletteInspector`) | `src/paletteInspectorPanel.ts` | `media/inspector.js` | The element gallery, the color breakdowns, Export as theme JSON |

The Theme Lab is the main interface; the inspector is a debugging view. Both follow the pattern copirate uses across its webview providers (`copirate/src/providers/ChangeWalkerWebviewProvider.ts` is a clean example):

- **Content Security Policy** as a meta tag: `default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}'`, with a fresh random nonce on every render.
- **Load files through `webview.asWebviewUri`**, and set `localResourceRoots` to `media/` and `dist/codicons/`.
- **No inline `style` attributes and no `<style>` blocks**, because the CSP blocks both. Set styles from script through the DOM (`el.style.color = ...`), which the CSP allows, or put them in a stylesheet. Both panels load `media/inspector.css` for the base text, button, badge, tab and toast styles; the Theme Lab adds `media/themeLab.css` and then `media/palette.css`, the inspector `media/gallery.css`.
- **Space with the shared tokens and build tabs with `GB.tabs`.** `media/inspector.css` opens with `--gb-space-1` to `--gb-space-6` (4, 8, 12, 16, 24 and 32px), `--gb-radius`, `--gb-border`, `--gb-text-sm` and `--gb-heading-size`, `themeLab.css` uses them for every nonzero gap, padding and margin, and new rules in the other stylesheets should too; older `palette.css` and `gallery.css` rules still use px. `GB.tabs` in `media/shared.js` builds a tab set by the ARIA tabs pattern: roving tabindex, arrow keys that wrap, Home and End, and inactive panels kept in the page with `hidden` so their inputs hold their values. The Theme Lab layout is the council's contract, `.copirate/working/prototypes/theme-lab-council/CONTRACT-v4.md`. The Lab root, `.gb-palette`, is a named inline-size container (`lab`), and every breakpoint is a container query on it. From 75rem `.gb-lab-grid` is two panes, `28rem minmax(0, 1fr)` at `100vh`, each `overflow: auto`, with the step 6 bar sticky at the task column's bottom and the second pane holding the Preview card, step 4 (Roles) and step 5 (Edit), scrolling through Roles while the dock is closed; narrower, one column with the bar sticky at the bottom, every step at full width. Only the Style groups mode still has a stage, which narrow is `position: sticky; top: 0` at `45vh`. `palette.js` renders each region into its slot in the order of the current width, from a `wide` flag a `ResizeObserver` on the root sets, so keyboard order follows what is seen; nothing is moved after render. The same observer publishes `--band-h` and `--bar-h` for the focus scroll margins. `fitToWidth` zooms the Workbench drawing to the frame's width, never above 1, zooms it down further when it is taller than its row, and stretches the window's middle row to fill the height left. The design rules behind these choices are in the `webview-ui-design` Copirate topic.
- **Give every disabled control its own style.** `media/inspector.css` styles every button alike and has no disabled rule, so a disabled button looks and hovers like an enabled one unless the panel's stylesheet dims it, as `.gb-pl-buttons button[disabled]` in `palette.css` does. A jsdom test can only read the `disabled` property, so check a new disabled state live as well: 0.0.9's blocked save passed its unit test while looking clickable.
- **Build DOM with `textContent`, never `innerHTML`.** Theme files and settings are user-controlled text.
- **Color everything with `--vscode-*` CSS variables.** A webview that hard-codes colors breaks the moment the theme changes, which here is the whole point. The one exception is a Palette Lab candidate: its colors are the subject being judged, so `palette.js` sets them as literal hex values.
- **Messages are a typed union** on each side (`FromWebview` in each panel). Add a case there and in that panel's page script together.
  - Theme Lab: the page posts `ready` and `copy`; the Palette Lab posts through `ctx.post`, which `themeLab.js` passes on to `vscode.postMessage`, so `applyPalette`, `saveTheme`, `useTheme`, `deleteTheme`, `saveGroup`, `setGroupOn` and `deleteGroup` need a case in `ThemeLabPanel` only. The host sends `library`, `start`, `identity`, `modernUI`, `previewDetached`, `frameSeed` and `pickPart`. The Start step's tabs are Wheel and Saved; a ui state whose `startTab` is anything else, such as a `paste` or `shipped` saved before those tabs were removed, opens on Wheel (`stateOf` in `media/palette.js`). The Palette Inspector opens from its command; the Lab has no button for it.
  - Theme Lab start-up: on `ready` the host posts, in order, `modernUI`, `previewDetached`, `library`, `start`, a pending `frameSeed` when there is one, and `identity` (with `changed: false`). `start` carries `startConfig()` from `src/labStart.ts`, decided from the active theme's label (`captureThemeSnapshot().label`): `{ lastTry }` (under GigglyBits Dark (Lab), the record Try stored), `{ saved }` (under a bound slot), `{ note }` (why the Lab starts from the defaults) or `{}` (no active theme known). `identity` carries `{ fill, regions }` from `IdentityController.current()`, or `null` with no folder or no identity, and is posted again whenever a `gigglybits.identity` setting changes (`changed: true`, including the controller's own writes) or the color theme changes (`changed: false`). `themeLab.js` applies them only on a fresh open, meaning `vscode.getState()` returned nothing: the first `start` calls `GBPalette.restoreTry` and picks the Wheel tab, for a Try of pasted colors too, or `GBPalette.loadSaved` and picks the Saved tab, and the first `changed: false` identity sets the palette's identity regions. After that, and on a revived tab, only `changed: true` touches the regions; every identity message updates the preview fill (`ctx.identityFill`, never saved to state). A note renders as `ctx.startNote` at the top of Start from.
  - Try in VS Code's `applyPalette` message also carries `settings` (mode, rule, hue, lightness, chroma, pasted colors, the editor accent index, surfaces, the frame `{ index | color, style }`, and color edits when there are any). `parseTryRecord` still keeps a `baseId` and `baseName` an older Try recorded, from when a Lab could start from a shipped theme, and `restoreTry` drops them from the ui state. After the theme settings are written, and before the information message (which resolves only when dismissed), `ThemeLabPanel` stores `parseTryRecord(settings)` in the extension's `globalState` under `gigglybits.themeLab.lastTry`; a record that fails the check is skipped and the Try goes ahead.
  - Theme Preview window: the Theme Lab page posts `previewState { palette, groups }` (its Palette Lab state and the library's style groups) after every `saveState` and every Palette Lab redraw, and `openPreviewWindow` from the Preview card's **Open Preview**. The window is the Lab's only preview. `ThemeLabPanel` keeps the latest `previewState`, passes each one to the open `ThemePreviewPanel` (`src/themePreviewPanel.ts`, view type `gigglybits.themePreview`), and opens that panel on `openPreviewWindow`, or reveals it when it is open. A Lab opened with `ThemeLabPanel.show` (not a revived one) also opens it on its first `ready`, before posting `previewDetached`, so the preview opens with the Lab; a later `ready` never reopens a window the user closed. On open it runs `workbench.action.moveEditorToNewWindow`, then `workbench.action.enableCompactAuxiliaryWindow`, in that order, because the second acts on the focused window. It does not run `workbench.action.enableWindowAlwaysOnTop`: the window is an ordinary one that VS Code can come in front of. The Theme Preview page (`media/themePreview.js`) posts `ready`, receives `state { palette, groups }` (the last state again on `ready`) and draws it with `GBPalette.renderPreview` as one scrolling page, a Workbench section then a Widgets section of the families in `widgets`, keeping its scroll position across redraws, and posts `pickPart { part }` for a clicked part, `part` being `describePart`'s plain values. The host reveals the Lab panel with `preserveFocus` false, so the Lab tab takes focus, then forwards it to the Lab page as `pickPart`, where `GBPalette.setPicked` opens it in the Edit dock. The dock's contrast info for the pick comes from drawing the picked card off the page (`pickedInfo`). The panel has no serializer, so it does not come back after a reload. `deactivate()` in `src/extension.ts` closes it (`ThemePreviewPanel.close`), and `activate()` runs `ThemePreviewPanel.closeLeftovers(vscode.window.tabGroups)`, which closes any tab whose webview view type ends with `gigglybits.themePreview` (VS Code adds a `mainThreadWebview-` prefix) while no live panel is open, so a tab restored without a page goes, with its window. Both panels build their page with `labPageHtml`, one CSP and stylesheet list.
  - Detached preview: `ThemeLabPanel` posts `previewDetached { detached }` on `ready`, after `openPreviewWindow`, and from the `onClose` callback `ThemePreviewPanel.open` takes, which runs whenever the window's panel is disposed; `detached` is `ThemePreviewPanel.isOpen()`. `themeLab.js` passes it to `GBPalette.render` as `ctx.detached` without saving it, and the Preview card's line says whether the window is open. The page has no preview band (`--band-h` is 0 outside the Style groups mode): narrow, one column of the Preview card, steps 1 to 5 and the bar; wide, the task column and a second pane holding the Preview card and steps 4 and 5.
  - Palette Inspector: the page posts `ready`, `refresh`, `copy`, `exportTheme` and `openThemeLab`; the host sends `snapshot`, and `modernUI` (below).
  - Modern UI: all three panels (`ThemeLabPanel`, `ThemePreviewPanel`, `PaletteInspectorPanel`) post `modernUI { modernUI: { modern, uppercase, tabStyle } }` when their page posts `ready`, and again on a configuration change where `affectsModernUI(event)` is true. `src/modernUI.ts` holds `modernUISettings()`, which reads `workbench.experimental.modernUI` (default true), `workbench.experimental.modernUIUppercaseViewHeaders` (default false) and `workbench.experimental.modernUIEditorTabStyle` (`'pill'`, otherwise `'connected'`), the list of those ids as `MODERN_UI_SETTINGS`, and `affectsModernUI`. Each page keeps the latest value without saving it to state and redraws: `themeLab.js` passes it as `ctx.modernUI` to `GBPalette.render`, `themePreview.js` to `GBPalette.renderPreview`, and `palette.js` puts it in every gallery context it builds. `inspector.js` returns it from `galleryContext()`. `gallery.js` draws the Workbench card from `context.modernUI`: absent, or `modern: false`, is the classic drawing; `modern: true` adds `wb-modern` (and `wb-pill` for the pill style) to `.wb`, paints the shell with `modernUI.shellBackground`, the side bar, chat view and editor area borders with `surface.border`, the panel's with `modernPanel.border`, and the active editor tab, activity item and panel tab with the `modernEditorTab.*`, `modernActivityBarItem.*` and `modernTab.*` keys in place of the classic ones. Labels are written in mixed case, and every drawn preview's root gets `gb-upper`, which `gallery.css` turns into capitals, under the classic UI or with the uppercase setting on.
  - Modern UI colors: GigglyBits themes set none of the modern keys, so `GB.modernUIDefaults(colors)` (`media/shared.js`) works out each one the colors leave unset from VS Code's dark default rules: `modernUI.shellBackground` = `titleBar.activeBackground`; `surface.background` = `sideBar.background`; `surface.border` = `foreground` at alpha 0.15 made opaque over `surface.background`, each channel `bg - a * (bg - fg)` truncated as VS Code's RGBA does; `modernPanel.border` = `surface.border`; `modernTab.activeBackground` = `list.inactiveSelectionBackground`; `modernTab.activeForeground` = `list.inactiveSelectionForeground`, else `foreground`; `modernEditorTab.active*` and `modernActivityBarItem.active*` = the matching `modernTab.active*`. A key the colors already hold is left out, as is one whose source is missing. The Palette Lab draws with the candidate's colors plus these (`galleryContext` and `scoped`), while the Edit dock reads the candidate's colors alone and shows a modern key the candidate leaves unset with its worked-out value and a note that VS Code works it out. The Inspector adds them only to the gallery's model, as `default` entries, and defines their variables on the gallery's node; the summary, the color list and Export keep the live colors alone.
  - `openThemeLab` makes the inspector's host run the Theme Lab's command, which opens or reveals it.
- **State**: the panels are created without `retainContextWhenHidden`, so a hidden tab is torn down and rebuilt. The inspector's filter choices and the Palette Lab's ui state, including the chosen Start from tab (`startTab`) and the step 1 source line (`sourceLabel`), survive through `vscode.setState`, and each host re-sends its data when the page posts `ready`: the inspector its snapshot, the Theme Lab the library. A state saved before the preview moved to its window drops `previewTab` and `previewPinned`, and one saved while the Lab chose widget families drops `widgets`; the preview window draws every family in the gallery's catalog order (media/gallery.js `CATALOG`). The pick, the Edit dock, the Roles step's open families and role editor, the step 6 result line and the Style groups mode live in `palette.js` and are never saved: a reload opens with the dock closed and the design steps showing. Copirate turns `retainContextWhenHidden` on in many places but has no recorded policy, so this repo keeps the cheaper default until a reason appears.
- **Scripts load in order**, each with the nonce. `shared.js` (DOM builder and color math, as `window.GB`) comes first in both, because the scripts after it read `window.GB` when they load. Theme Lab: `shared.js`, `themeBuilder.js` (the theme builder, as `window.GBBuilder`), `gallery.js` (the element gallery, as `window.GBGallery`, whose drawings the previews reuse), `palette.js` (the Palette Lab, as `window.GBPalette`), then `themeLab.js`. Palette Inspector: `shared.js`, `gallery.js` (the element gallery, as `window.GBGallery`), then `inspector.js`. The CSP adds `font-src ${webview.cspSource}` for the codicon font, which the Lab's previews and the gallery both draw with.
- **Gallery rules** (`media/gallery.js`):
  - Paint mock widgets only through `paint()` / `P()` with a key spec such as `{ bg: 'button.background', fg: 'button.foreground' }`. That records the keys in `data-keys`, which feeds the chips, the definitions table, hover linking and contrast pairs. A color set any other way is invisible to all four.
  - `gallery.css` sizes and arranges mock widgets and never names a theme color for a mock part.
  - A key with no value in the current theme is recorded but not painted, because VS Code draws nothing for it either.
  - Adding a widget means adding one `CATALOG` entry. `test/gallery.test.ts` then checks it draws.
- **Translucent colors** are drawn over the surface they normally sit on (`surfaceFor()` in `inspector.js`), with a strip of the bare surface beside them, never over a checkerboard.
- **Restoring after reload**: each panel has a `WebviewPanelSerializer` and an activation event (`onWebviewPanel:gigglybits.themeLab`, `onWebviewPanel:gigglybits.paletteInspector`), which bring both tabs back after a reload, which helps when iterating under F5. Copirate does this in only two panels; here it is deliberate.

## Testing

- **Jest with ts-jest** for unit tests under `test/`, as in copirate. `jest.config.js` maps the `vscode` import to `test/__mocks__/vscode.ts`, a small stub driven by `mockState`. Extend the stub only with the API slice the code under test reads. A test that drives a panel host, which needs fake webview panels and commands the shared stub does not have, supplies its own `jest.mock('vscode', ...)` factory in its file instead, as `test/themePreviewPanel.test.ts` does.
- **Fixtures** live in `test/fixtures/`. `theme-ext/` is a fake theme extension with an `include` chain, a `package.nls.json` label and a null color, so the theme reader is tested against real files.
- **Test types are part of the build.** `package` runs `check-types:test`, so a type error in a test fails packaging, the same gate copirate added.
- **Webview code**: `media/shared.js` exports itself under CommonJS too, so `test/shared.test.ts` covers the color math and the TextMate scope matcher directly, and `test/harmony.test.ts` covers OKLCH and the harmony rules. `test/gallery.test.ts` and `test/paletteLab.test.ts` run the real gallery and Palette Lab in jsdom (`@jest-environment jsdom`). `test/paletteLab.test.ts` covers the regions and their order at both widths through a stand-in `ResizeObserver` that reports the root's width, the step headings' states, the two Start tabs and the fallback from an old Paste or Shipped tab, the contrast table, the Roles step, the Edit dock, narrow folding, the step 6 bar, the Style groups mode, `restoreTry` and a saved theme of pasted colors; the saved-theme and Name tests sit late in the file, because Load leaves `palette.js`'s module-level draft name set. The pick, the dock and the result line belong to the ui state object `render` was given, so a render with a fresh `ctx.ui` starts without them. jsdom keeps a literal hex color set through `el.style` but reads it back as `rgb(...)`, so compare parsed values. `test/tabs.test.ts` covers `GB.tabs` (its ARIA wiring, the keys and kept panels), and `test/themeLab.test.ts` loads the whole Theme Lab page (`shared.js`, `palette.js`, `themeLab.js`) and drives it with host messages, including a reload whose saved state must bring back the chosen tabs, the `previewState` it posts and a `pickPart` from the Theme Preview window. `test/themePreview.test.ts` loads the Theme Preview page the same way and drives it with `state` messages. `test/themePreviewPanel.test.ts` runs `ThemeLabPanel` and `ThemePreviewPanel` against a `jest.mock('vscode')` of fake webview panels: the Lab's `ready` sequence and its order, the cleanup of a leftover Theme Preview tab and the close on `deactivate`, a freshly shown Lab opens the window on its first `ready` and a revived one does not, a window the user closed is not reopened by a later `ready` but is by Open Preview, the window runs its two window commands in order, never always-on-top, and a part clicked in the window reaches the Theme Lab open at the time, also after the Lab that opened the window was closed and another opened, revealing and focusing that Lab before the pick is posted. These jsdom tests cover structure and keyboard behavior, not layout: jsdom evaluates no CSS, so check the grid, the container query and visual states live under a dark, a light and a high-contrast theme.
- **The palette fixture**: `test/fixtures/palettes.json` holds nine palette entries in the format below, the palettes the extension used to ship as GigglyBits Dark themes. `test/themeBuilder.test.ts` and `test/shared.test.ts` build each one and compare it with `test/fixtures/frame-baseline/` and with `chromeColors()`; no test writes it. `test/buildThemes.test.ts` runs `scripts/build-themes.js --root` on a temp copy of `package.json`, never on the repository's `themes/`.
- **Layout is measured, not unit-tested.** The region sizes, scrolling and the contract's "Checks for the build" are measured on the real page through the prototype harness (`.copirate/working/prototypes/theme-lab-layout/harness/`: `server.js` serves the repository, `shoot.mjs` renders and screenshots `lab.html`).
- **jsdom drops `var()`** from most inline style properties (`background`, `color`, borders), so `el.style.background` reads `""` there even though Chromium applies it. Assert on `data-painted` (the keys `paint()` actually applied) instead of on `el.style`.
- **Not covered**: `media/inspector.js` and `media/themeLab.js` as a whole, the Palette Inspector's panel host, most of `ThemeLabPanel` (only its Theme Preview relay has a test), real rendering, and anything that needs a running VS Code. Copirate judged a webview UI driver not worth it. Move logic into `shared.js` when it needs a test.
- While working, run the affected test file (`npx jest test/themeSource.test.ts`). Run `npm run verify` before you commit. There is no CI.

## Palette entries

The theme builder takes one palette entry. The build's base palette (`BASE` in `scripts/build-themes.js`) is one, without an `id` or `name`, and `test/fixtures/palettes.json` holds nine in a list, format version 1:

```json
{
  "version": 1,
  "palettes": []
}
```

The Palette Lab measures every candidate against three dark reference backgrounds, `#121212`, `#1e1e1e` and `#252526` (`SEED_BACKGROUNDS` in `media/palette.js`), and the live `editor.background` as a final column labelled "your editor". Each entry in `palettes` has these fields:

| Field | Meaning |
|---|---|
| `id` | Stable id. Generated: `<rule>-h<hue>-l<lightness, 2 decimals>-c<chroma, 3 decimals>`, e.g. `triad-h210-l0.75-c0.130`. Pasted: `pasted-` plus the hex values without `#`, joined by `-`. `themeFileName` names a theme file after it. |
| `name` | Display name; `themeLabel` gives `GigglyBits Dark (<name>)`. |
| `source` | `generated` or `pasted`. |
| `rule` | Harmony rule id. Generated palettes only. |
| `baseHue` | Base hue in degrees, 0-359. Generated palettes only. |
| `lightness` | OKLCH lightness, 0.30-0.95. Generated palettes only. |
| `chroma` | OKLCH chroma, 0-0.30. Generated palettes only. |
| `colors` | 1-10 lowercase `#rrggbb` strings. |

Harmony rules (`HARMONY_RULES` in `media/shared.js`), in OKLCH. H is the base hue, L the lightness, C the chroma, and alt(x) means hue x with lightness L+0.08 and chroma C*0.8. Hues wrap modulo 360, lightness is clamped to 0.30-0.95, and a color outside sRGB loses chroma in 0.005 steps until it fits, which keeps its lightness and hue.

| Rule | Five colors |
|---|---|
| analogous | H-60, H-30, H, H+30, H+60 |
| monochromatic | hue H; lightness L-0.12, L-0.06, L, L+0.06, L+0.12; chroma C*0.6, C*0.8, C, C*0.8, C*0.6 |
| triad | H, H+120, H+240, alt(H), alt(H+120) |
| complementary | H, alt(H), H+180, alt(H+180), H with chroma C*0.5 |
| split-complementary | H, H+150, H+210, alt(H), alt(H+150) |
| square | H, H+90, H+180, H+270, alt(H) |
| compound | H, H+30, H+165, H+195, alt(H) |
| shades | hue H, chroma C; lightness L-0.16, L-0.08, L, L+0.08, L+0.16 |

Preview mapping, one panel per background: color 1 colors keywords, color 2 function names, color 3 strings, color 4 type names and color 5 numbers; plain text uses the live `editor.foreground` and comments the live `descriptionForeground`. Color 1 also fills the button (with black or white text, whichever contrasts more), is the focus ring, and at 30% opacity is the selection; color 2 fills the badge. A pasted palette with fewer than five colors repeats its colors from the start.

## Building the theme itself

The extension ships 13 themes: **GigglyBits Dark (Lab)** and the slots **GigglyBits Theme 1** to **12**. They are generated, never edited by hand, all from the base palette `BASE` in `scripts/build-themes.js` (the triad at hue 210, lightness 0.75 and chroma 0.13 that the Lab's defaults also start from), so each looks finished before scoped settings color it:

- `npm run themes` (`scripts/build-themes.js`) writes `themes/gigglybits-lab-color-theme.json` and the 12 slot files, deletes any `themes/gigglybits-dark-*-color-theme.json` an older build wrote, and rewrites `contributes.themes` in `package.json` to the Lab entry, then the 12 slots in order. Commit the result, so F5 and a reader of the repository see the real themes.
- `npm run themes:check` writes nothing. It exits 1 with `Themes out of date:` and the files that would change, or prints `Themes up to date: Lab theme and 12 slots`. `package` runs it, so a change to `BASE` or the builder made after the last `npm run themes` stops the build until you run `npm run themes` again.
- `media/themeBuilder.js` turns one palette into a theme, and `scripts/theme-builder.js` re-exports it for the build and the extension host. The Theme Lab loads the same file, so its previews draw exactly what Try in VS Code applies. It uses the color math in `media/shared.js`, and `test/themeBuilder.test.ts` pins its rules.
- The Lab theme is the target of the Palette Lab's **Try in VS Code** button (below).

**Try in VS Code** applies the current Lab candidate without a reload. The extension host bundles `scripts/theme-builder.js` (typed by `scripts/theme-builder.d.ts`) and calls `labSettings(entry, chrome, edits, groups)`, with the style groups the Lab's preview draws (Style groups, below), so the applied colors are the builder's, not a second implementation. `src/labSettings.ts` holds the settings edits:

- The theme colors and token rules go into user settings under `"[GigglyBits Dark (Lab)]"` in `workbench.colorCustomizations` and `editor.tokenColorCustomizations`, and `workbench.colorTheme` switches to the Lab theme. Theme-scoped blocks apply only while that theme is active, so other themes are untouched. The confirmation offers to switch back to the previous theme.
- Try in VS Code writes its colors only to user settings. It switches `workbench.colorTheme` in user settings, or in the workspace when the workspace already sets one (`tryThemeTarget` in `src/themeLabPanel.ts`), since a workspace theme beats a user one and the Try would not show; Back restores the theme at the same level. Saving a theme this folder uses needs nothing extra: `ThemeLibraryController.refreshProjectFrame` rewrites the folder's frame block whenever `gigglybits.library` changes. The Lab's previews draw the theme alone, never a folder's old color; with one present the Frame row says so. `gigglybits.openThemeLab` takes an optional `{ frame, name }` (`parseFrameSeed` in `src/themeLabPanel.ts`); the panel posts `frameSeed { frame, name }` after the ready sequence's `start`, or at once when the Lab is already open, and the page applies it through `seedFrame` in `media/palette.js`.
- The confirmation also says when something else wins: a workspace `workbench.colorTheme`, or `window.autoDetectColorScheme`.
- The builder's `chrome` option picks the editor accent (`index`) and surface tint (`surfaces`), and its `frame` (`{ index | color, style }`) the Frame: the keys in `FRAME_KEYS`, which no editor setting decides in a Filled frame. With no `frame` the Frame is Dark and follows the accent, which reproduces the themes built before the Frame existed apart from the brighter input outlines and a transparent `window.activeBorder`; `test/fixtures/frame-baseline/` holds those themes, one per entry of `test/fixtures/palettes.json`, and `test/shared.test.ts` checks that `chromeColors()` agrees with the builder's default build on every surface style and accent.
- The Roles step adds three optional `chrome` fields, cleaned by `cleanChrome` in `media/themeBuilder.js`: `syntax`, five palette indexes for Keywords, Functions, Strings, Types and Numbers, read modulo the palette's length (absent or invalid, `[0, 1, 2, 3, 4]`); `depth`, a multiplier on every surface's lightness offset from the editor background, clamped to 0.5 to 2 and rounded to 0.1 (default 1); and `text`, a `TEXT_LEVELS` id, `soft`, `standard` (default) or `high`, setting the four gray text lightnesses. With all three at their defaults the build is the one before they existed, which `test/themeLibrary.test.ts` checks against `test/fixtures/design-baseline-settings.json`. `ROLE_FAMILIES` lists the seven families the Roles step shows, Syntax, Accent, Surfaces, Text, Status, Terminal and Frame, each `{ id, name, how, roles }`, and every swatch belongs to exactly one. The Lab's `designOf`, its Try `settings` and its `themeOf` chrome carry each field only when it differs from its default (`roleSettingsOf` in `media/palette.js`), so a design made without touching them saves and tries exactly as before; `parseTryRecord` and `parseDesign` keep valid fields and drop invalid ones.

How a palette becomes a theme:

- **Background**: every theme draws the editor on `#1e1e1e`. Light and high-contrast themes are not built yet.
- **Syntax roles**, in the Palette Lab's preview order: color 1 colors keywords, color 2 functions, color 3 strings, color 4 types and color 5 numbers. A palette with fewer than five colors repeats from the start. Comments are a muted neutral in italic, and plain text keeps the editor foreground.
- **Readability lift**: a role color below 4.5:1 on `#1e1e1e` has its OKLCH lightness raised in 0.01 steps, keeping hue and chroma, until it reads at 4.5:1.
- **Separation**: then, in role order, a role closer than 0.05 in OKLab to an earlier role is raised in 0.02 steps until it is at least 0.05 from all of them. Roles that come from the same palette color (a short palette repeating) are left equal. Lightness never goes past 0.95. The Log Cabin palette in `test/fixtures/palettes.json` needs this: lifting lands both of its blues on `#378bd3`.
- **Surfaces**: a neutral ramp stepped from the background in OKLCH, at chroma 0.01 in color 1's hue: deep (-0.025) for the side bar, activity bar, panel, status bar, title bar and inactive tabs; line (+0.025) for the current line and tab hover; raised (+0.045) for widgets, menus, inputs and dropdowns; hover (+0.07); borders (+0.11). Text sits at lightness 0.87, muted text at 0.68 and faint text at 0.50.
- **Accent**: color 1, after lifting, for buttons, the focus border, badges, the progress bar, active borders and links. Button text is black or white, whichever contrasts more. Selections and highlights are color 1 at reduced alpha (30% for the selection), as in the Palette Lab preview; find matches use color 2.
- **Status colors** keep fixed hues (error 25, warning 85, success 145, info is color 1) at color 1's lightness and chroma (chroma at least 0.1, so a gray palette still gets a red that reads as red), lifted to 4.5:1 like the roles. Terminal ANSI colors use fixed hues too, so program output keeps its meaning.
- **No `include`**: every theme stands alone and inherits nothing from a built-in theme.

What the theme deliberately leaves alone, because specialized extensions own it:

- **Syntax is a baseline only.** The token rules use only these language-neutral root scopes (`GENERIC_SCOPES`): `keyword`, `storage.type`, `storage.modifier`, `entity.name.function`, `support.function`, `string`, `entity.name.type`, `entity.name.class`, `support.type`, `support.class`, `constant.numeric`, `constant.language`, `comment`. There are no `semanticTokenColors`. Token color settings and decorations from an extension or from your settings apply over a theme, so a theme with only broad rules gives every language a readable default and adds no opinion an extension has to fight. `semanticHighlighting` is `true` so semantic tokens from language extensions still show; without it they are off under the default `editor.semanticHighlighting.enabled` value.
- **Workbench colors are exactly the keys the element gallery draws** (374 when this was written), apart from `UNSET_KEYS`. No other key is set, so a theme never sets a color key a third-party extension registers. `test/themeBuilder.test.ts` renders the gallery and fails when its key set and the theme's differ, so a widget added to the gallery needs its key placed in `KEY_GROUPS` (or in `UNSET_KEYS`) before the tests pass.
- **`UNSET_KEYS`**, the gallery keys left unset on purpose (at most 10):

| Key | Why it stays unset |
|---|---|
| `contrastBorder` | A high-contrast border. In a dark theme it draws an extra border around nearly every part of the workbench. |
| `contrastActiveBorder` | The same for the active element: an extra border around every focused or active part. |
| `editor.selectionForeground` | Recolors selected text, replacing its syntax colors, an extension's included. VS Code leaves it unset outside high contrast. |
| `editor.findMatchForeground` | Recolors the text of the current find match, replacing its syntax colors. |
| `editor.findMatchHighlightForeground` | Recolors the text of the other find matches, replacing their syntax colors. |
| `terminal.selectionForeground` | Recolors selected terminal text, replacing the colors the program printed. |

Checking a theme:

- Put `"$schema": "vscode://schemas/color-theme"` at the top of a theme file (the generated ones have it) to get completion and validation for color keys.
- With a GigglyBits theme active, the Palette Inspector header names it, and its **Declared but not in effect** section should list nothing from the theme. Its **VS Code defaults** count is what the next theme work order brings to zero.
- Use the contrast badges and the "under 4.5:1" filter as the readability check. 4.5:1 is the WCAG AA minimum for body text.
- Built-in commands worth knowing:
  - **Developer: Inspect Editor Tokens and Scopes** shows which TextMate scope and semantic token style applies under the cursor.
  - **Developer: Generate Color Theme From Current Settings** writes VS Code's own snapshot of the current colors, a useful comparison against the inspector's export.
- F5 is the fastest loop for theme JSON too: edit the file, then reload the dev host window.

## Theme library

Saved themes live in the user setting `gigglybits.library` (scope `application`, so a workspace cannot override it and Settings Sync carries it). Each entry is a `SavedTheme`: `id`, `name`, `slot` (1 to 12 or null), `design` (the Lab's whole state: mode and rule settings or pasted colors, `colors`, `chromeIndex`, `surfaces`, `frame`, `edits`), `groups` (always `[]`, because groups a theme names for itself are deferred; the style groups that are on apply to every saved theme, below) and `savedAt`.

- `src/themeLibrary.ts` holds every decision, with no `vscode` import: `parseLibrary` (drops invalid entries, reusing `parseTryRecord` for the design), `saveTheme` (same name updates, a new name takes the lowest free slot, `needsSlot` when all 12 are bound), `bindTheme`, `deleteTheme`, `slotSettings` (the same `labSettings` Try in VS Code uses), `writeSlot` / `clearSlot`, which edit the `[GigglyBits Theme <n>]` blocks of the user `workbench.colorCustomizations` and `editor.tokenColorCustomizations`, and the style group functions `parseGroups`, `saveGroup`, `setGroupOn`, `deleteGroup`, `activeGroups` and `writeAllSlots` (Style groups, below).
- `src/themeLibraryController.ts` is the VS Code side: settings writes, the delete modal, the slot quick pick, Use in this project (`workbench.colorTheme` at the Workspace target; it writes `projectColors`, which removes an old folder color, and when one was found clears `gigglybits.identity.hue` and `pinnedColor` and says so in the status bar), Use everywhere (Global target) and the `gigglybits.chooseTheme` command.
- **The frame belongs to the project.** The user `[GigglyBits Theme <n>]` blocks come from `everywhereSettings`: the theme with a Dark frame and its frame edits left out. Use in this project also writes `projectFrame` (the `FRAME_KEYS` of the full theme, 31 keys: the bars, the window border and, since 2026-11-05, the six tab and split lines `tab.activeBorderTop`, `tab.activeBorder`, `editorGroup.border`, `sideBar.border`, `panel.border` and `sash.hoverBorder`, which a Filled frame draws in its color lifted to 3:1) into the folder's `workbench.colorCustomizations` under `[GigglyBits Theme <n>]`, removing any other slot's block; a workspace theme-scoped block beats the user block key by key (Identity write shape, below). Each window runs `projectFrameRefresh` at activation and whenever `gigglybits.library` changes, so a re-saved frame reaches open projects and a deleted theme's projects lose the block.
- **Saves build on the settings files, not the window's configuration.** A window that was already open held an older library in its configuration and its save wrote back an older theme (live check, 2026-11-04). Before every library or slot write the controller reads the values from disk: `settingsFilesFor(context.globalStorageUri)` names the default profile's `User/settings.json` for the application-scoped library and the window profile's `settings.json` for the color settings, and `freshestSetting` parses them with `jsonc-parser`, falling back to the configuration when a file is missing or does not parse. A disagreement is logged to the **GigglyBits** output channel.
- The slots are 12 theme files, `themes/gigglybits-theme-<n>-color-theme.json`, labelled `GigglyBits Theme <n>`. `npm run themes` writes them after the Lab theme, built like it from the base palette. `SLOT_COUNT`, `slotLabel` and `slotFile` live in `media/themeBuilder.js`.
- Webview messages: the page posts `saveTheme { name, design }`, `useTheme { id, where: 'project' | 'everywhere' }`, `deleteTheme { id }`, `saveGroup { name, family, roles }`, `setGroupOn { id, on }` and `deleteGroup { id }`, and its `applyPalette` carries `groups`, the `{ family, roles }` list the preview draws; the host sends `library { themes, groups, hasFolder }` on `ready` and whenever `gigglybits.library` or `gigglybits.groups` changes, and `start` may carry `saved { name, design }` when the active theme is a bound slot.

### Style groups

Style groups live in the user setting `gigglybits.groups` (scope `application`, read from and written to the same default-profile `User/settings.json` as the library, at the Global target). Each entry is a `StyleGroup`: `id`, `name`, `family` (`tabs`, `lists`, `buttons` or `editorText`), `roles` (a key or token rule name of the family mapped to an Editor swatch name, such as `raised`), `on` and `savedAt`.

- `GROUP_FAMILIES` in `media/themeBuilder.js` lists each family's label, its keys (every `SWATCH_OF` key starting `tab.`; `list.` or `tree.`; `button.`; for Editor text, `editor.foreground`) and its token rules (Editor text only: the six rule names `tokenColors` gives). `GROUP_FAMILIES` leaves out every `FRAME_KEYS` key and `groupValues` ignores an entry naming one, so a group never reaches the frame; the Tabs family lost `tab.activeBorderTop` and `tab.activeBorder` when they joined the frame. `buildColors`, `tokenColors`, `buildTheme` and `labSettings` take `groups` as a fourth parameter: a roles entry naming a key or token rule of its family and an Editor swatch sets that key, or that rule's foreground, to the theme's swatch value; every other entry is ignored. Groups apply after `KEY_GROUPS` and before `edits.keys`, so a theme's single-key edits win.
- `saveGroup` updates a group of the same family and name (trimmed, case-insensitive), keeping its `id` and `on`, or adds one that is off. `setGroupOn` switching a group on switches off every other group of its family. `slotSettings`, `everywhereSettings` and `writeSlot` take the active groups as a last parameter; `projectFrame` passes none. `writeAllSlots(values, library, groups)` rewrites every bound theme's slot block with the groups that are on.
- The controller rewrites every bound slot through `writeAllSlots` on fresh slot values after each group save, switch or delete (delete asks first in a modal), and saving or using a theme passes `activeGroups` to `writeSlot`. Like the library's own writes, a group change rewrites slot blocks only in the profile of the window that made it.
- The Lab's **Style groups** mode (`styleGroupsMode` and `buildGroupsMode` in `media/palette.js`, opened from the foot of Start from > Saved) keeps its draft in the Palette Lab state as `groupDraft { family, name, roles }`. The mode itself is a module flag, never saved, and its stage draws the draft family's card on the Lab page through `FAMILY_CARDS` without writing `widgets`, so Back to design restores them. The previews and Try in VS Code use `previewGroups`: every group that is on, with a draft that names at least one role taking the place of the on group of its family.

The retired per-folder color wrote a `[GigglyBits*]` block, which matches the slot labels too, so an old folder color covers a saved theme's frame. That is why Use in this project removes it.

## Identity write shape

History: nothing writes this overlay since the per-folder color was retired into project frames (2026-11-05). The shape stays recorded because `oldFolderColor` and `withoutIdentity` find and remove it in folders that still have it.

Settled live on 2026-11-03 against the installed 0.0.6. The question: which workspace `workbench.colorCustomizations` shape shows a workspace identity under a GigglyBits theme whose design lives in a user-level theme-scoped block, without erasing that design.

How it was measured: user settings held the Lab design under `[GigglyBits Dark (Lab)]` (`statusBar.background` `#131a1b`, `button.background` `#20c3d9`). Each shape replaced the workspace's color block in turn, and a Developer Tools console poller read `--vscode-statusBar-background` and `--vscode-button-background` from `.monaco-workbench` (that selector returned values, so `document.body` was not needed) every time either changed. Each shape used its own red, so every reading identifies the shape that produced it.

| Workspace shape | Theme | `--vscode-statusBar-background` | `--vscode-button-background` | Passes |
|---|---|---|---|---|
| A: unscoped plus `[GigglyBits*]` (`#ff0001`) | GigglyBits Dark (Lab) | `#ff0001` | `#20c3d9` (the user Lab block's value) | yes |
| B: unscoped plus each exact GigglyBits label (`#ff0002`) | GigglyBits Dark (Lab) | `#ff0002` | `#20c3d9` | yes |
| Unscoped only (`#ff0003`) | GigglyBits Dark (Lab) | `#131a1b` (the user Lab block wins) | `#20c3d9` | no |
| Unscoped only | GigglyBits Dark (Candy) | `#ff0003` | `#20c3d9` (Candy's own) | shows, no user block for Candy |
| Unscoped only | Dark Modern | `#ff0003` | `#0078d4` (Dark Modern's own) | shows |

**Chosen shape: A.** Write the overlay unscoped, so it shows under any theme, and again under `[GigglyBits*]`, so it beats the user-level theme-scoped design block without touching that block's other keys. The wildcard also matches theme labels added later, such as the design library's slots, so nothing needs to list them.

What the measurements also show:

- **An unscoped workspace key loses to a user-level theme-scoped key.** VS Code merges the levels first and then lets theme-scoped blocks override unscoped keys, so the scope wins over the level. That is why the identity is written twice.
- **A workspace theme-scoped block beats the user block for the same theme**, key by key. Before the test, the everyday window's workspace held an older full Lab design under `[GigglyBits Dark (Lab)]`, and its `button.background` (`#ba7922`) showed instead of the user block's `#20c3d9`. Any design keys left at workspace scope therefore override the user's Lab design.
- **"Workspace settings" means the `.code-workspace` file when the window was opened from one.** VS Code then ignores window-level settings such as `workbench.colorCustomizations` and `workbench.colorTheme` in a folder's `.vscode/settings.json`: a first run that edited only that file changed nothing. `ConfigurationTarget.Workspace` writes to the right file in both cases; that is VS Code's documented behavior, and the 0.0.7 live checks ran only in single-folder windows, so an identity write into a `.code-workspace` file has not been observed yet.
- **The extension does not run in Restricted Mode.** `package.json` declares no `capabilities.untrustedWorkspaces`, so VS Code disables it in an untrusted folder: no offer, no commands. Live checks need their scratch folders trusted (a folder under `%TEMP%` is not, by default).
- **Identity cannot tell its keys from anyone else's.** The retired Set, Next and Clear commands stripped every identity key, and Remove the color and Use in this project still strip every identity key (`IDENTITY_KEYS`) at the top level, under `"[GigglyBits*]"` and under `"[GigglyBits Dark (Lab)]"`, whoever set it, so in a Peacock folder they replace or remove Peacock's colors. Finding an old color no longer reads the top level: `drawnOldColor` reads only the `"[GigglyBits*]"` block, which only the old overlay wrote and which VS Code draws over every GigglyBits frame, and `oldFolderColor` adds a pinned color. So a Peacock folder is no longer offered a project theme in Peacock's color, and the Frame row's note no longer calls Peacock's color GigglyBits' old one.
- **Start-up repair (0.0.11).** `refresh()` rewrites a pinned color only when the regions setting changes, so a workspace whose `"[GigglyBits*]"` copy went missing kept an unscoped-only overlay, which loses to the user-level Lab block as measured above. Once at activation, `IdentityController.register()` checks `overlayIncomplete()` from `src/identity.ts`: with a folder open and an identity set, any key of the current regions' overlay missing from the top level or from a `"[GigglyBits*]"` block, or the block itself missing, rewrites the overlay with the identity's fill. It checks key presence only, never values, so a complete overlay whose border shade came from another theme's background is not rewritten on every start.

## Packaging details

- **Publisher** is `Websolete` from 0.0.8, so the extension ID is `websolete.gigglybits-vscode-theme`. Releases up to 0.0.7 were `EdgeInformation`, as in every sibling; VS Code treats the two IDs as different extensions, so uninstall `edgeinformation.gigglybits-vscode-theme` before installing a newer build. Settings are keyed by their own names and carry over. `context.workspaceState` does not: VS Code stores it under a row named after the extension ID, so the identity offer's `gigglybits.identity.declined` flag (written by Not here and by Clear Workspace Color, read in `src/identityController.ts`) starts empty under the new ID, and a declined folder is offered a color again whenever `shouldOffer()` in `src/identity.ts` would offer one to a folder that never declined.
- **`engines.vscode`** is `^1.90.0`. There is no family-wide policy: the siblings range from `^1.85.0` to `^1.101.0`. Raise it only when an API you use needs a newer release.
- **`.vscodeignore`** is a deny list. vsce keeps a file if any `!` negation line matches it, whatever the order (noted in copirate's `.vscodeignore`), so keep negations rare and narrow. Check what shipped with `npx vsce ls`.
- `pack` passes `--allow-missing-repository` and `--skip-license` because the repo has neither a remote nor a LICENSE file yet. Without them vsce stops to ask, which hangs a task. Drop each flag once the missing piece exists.

## Windows and tooling gotchas

These come from copirate's recorded experience on this machine.

- **Do not `sed -i` a repo file on Windows.** It strips carriage returns, and `git diff` hides the change.
- **Line-ending checks can mislead.** When it matters, count bytes rather than trusting a tool's CRLF report.
- **Never run `npm audit fix --force`.** It makes breaking major-version jumps across the dependency tree.
- **PowerShell 5.1 has no `&&`.** Chain commands inside npm scripts, which run under `cmd.exe`, rather than in task `command` strings.
- **A blank webview that survives a window reload** usually means a wedged renderer. Close the tab and reopen it; restarting VS Code is the fallback.
- npm 11 holds back install scripts for `@vscode/vsce-sign` and `keytar`. Packaging works without them. They matter only for `vsce publish`, which this repo does not use.
