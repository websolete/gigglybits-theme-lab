# GigglyBits Theme Lab

An easy-to-read dark theme for VS Code, built so every color is set on purpose instead of falling through to whatever another theme or a VS Code default supplies.

The GigglyBits Dark theme variants ship alongside the Theme Lab, where they are built and picked, and the Palette Inspector, an optional tool for debugging colors.

## GigglyBits Dark variants

There is one GigglyBits Dark theme for each palette marked Include in the Palette Lab, named after the palette, such as **GigglyBits Dark (Candy)** or **GigglyBits Dark (Log Cabin)**. To switch to one, click **Use** beside it under **Start from > Shipped** in the Theme Lab, or run **Preferences: Color Theme** from the Command Palette and pick it from the list.

- Every variant draws the editor on `#1e1e1e`. The palette's colors color keywords, functions, strings, types and numbers, in that order, and the first color is the accent for buttons, focus borders and badges.
- A palette color too dark to read as text is lightened, keeping its hue, until it reads at 4.5:1, and colors that end up too alike are pushed apart.
- Input, dropdown, checkbox, panel filter and chat input outlines read at least 3:1 against the editor and the side bar, so you can see where a box is.
- Code coloring from your specialized extensions stays in charge. The theme gives only broad baseline colors for code, sets no semantic token rules, and sets no color key another extension registers.
- Every part of VS Code the Palette Inspector's element gallery draws gets its color from the theme, apart from six keys left unset on purpose (listed in the development guide).

## Workspace identity

Gives each folder its own color, so you can tell windows apart at a glance, the way Peacock does.

- The first time you open a folder that has no color, a notification offers one, derived from the folder's name. **Accept** colors the title bar, activity bar, status bar and tab borders, **Pick another** opens the color picker, and **Not here** stops asking for that folder.
- A folder that already colors any of those parts, through Peacock or your own settings, gets no offer, so opening it leaves those colors alone. Running Set, Next or Clear in that folder does replace or remove the ones set at the top level or in the `"[GigglyBits*]"` and `"[GigglyBits Dark (Lab)]"` blocks, Peacock's included.
- **GigglyBits: Set Workspace Color** shows eight suggestions, or choose **Custom color...** and enter a hex value.
- **GigglyBits: Next Workspace Color** jumps to a clearly different color.
- **GigglyBits: Clear Workspace Color** removes `gigglybits.identity.hue` and `gigglybits.identity.pinnedColor`, and removes the title bar, activity bar, status bar and border colors the identity uses from the workspace's top-level colors and its `"[GigglyBits*]"` and `"[GigglyBits Dark (Lab)]"` blocks, including those colors when Peacock or you set them there. It stops the offer for that folder. Colors in any other block, such as `"[Dark Modern]"` or `"[GigglyBits Dark (Candy)]"`, are kept.
- A suggested color follows the active theme: switch GigglyBits variants and it re-tunes its brightness and intensity while keeping its hue. A custom hex stays exactly as you entered it.
- It works under any theme, Dark Modern included, and does not erase a design you are trying in the Palette Lab.
- The color is written to the workspace's `workbench.colorCustomizations`, which VS Code keeps in the folder's `.vscode/settings.json`, or in the `.code-workspace` file when the window was opened from one. An identity write into a `.code-workspace` file has not been checked in a live run yet.
- Upgrading from 0.0.6: a folder where Try in VS Code wrote identity colors keeps them and gets no offer. Run **Clear Workspace Color** or **Set Workspace Color** there once.
- Upgrading from 0.0.7: the extension's ID changed with its publisher, and VS Code keeps the **Not here** choice per extension ID, so the offer can come back in a folder where you chose **Not here** or ran **Clear Workspace Color**: it appears when that folder next opens if it still meets the offer's usual conditions, with no workspace color of its own and `gigglybits.identity.offerOnOpen` on. Choose **Not here** once more to stop it. Workspace colors and settings are unaffected.
- It runs only in trusted folders. In Restricted Mode VS Code turns the extension off, so an untrusted folder gets no offer and the commands are unavailable until you trust it.
- One exception: a block in your user settings scoped to one specific theme, such as `"[Dark Modern]"`, that sets a title bar, activity bar, status bar or border color still wins over the workspace color under that theme.

Settings:

| Setting | What it does |
|---|---|
| `gigglybits.identity.hue` | The folder's color as a hue (0-359). Set by the commands. |
| `gigglybits.identity.pinnedColor` | A fixed hex color used in place of the hue, under every theme. |
| `gigglybits.identity.regions` | Which parts the color fills: `titleBar`, `activityBar`, `statusBar`, `borders`. All four by default. |
| `gigglybits.identity.offerOnOpen` | Offer a color when a folder with none opens. On by default. |

## Theme Lab

Run **GigglyBits: Open Theme Lab** from the Command Palette. It opens an editor tab where you pick a theme and build new ones, with its Palette Lab. The page reads top to bottom: **Start from**, then the palette you are working on, then **Previews**, each in its own box, so the previews get the full width of the tab. The header names the active theme, and **Open Palette Inspector** opens the debugging view. The tab comes back after a window reload, on the tabs and palette you had.

A new Theme Lab tab opens on the theme you are using: under a shipped GigglyBits Dark theme it starts from that theme's palette, and under GigglyBits Dark (Lab) it starts from your last **Try in VS Code**, with its Frame and Editor choices. Under any other theme, or before your first Try, it starts from the default palette with a line at the top of **Start from** saying why.

Every tab set in the Theme Lab works from the keyboard: Tab to it, then the arrow keys, Home and End.

### Start from

Four tabs, one for each way to begin a palette:

- **Wheel**: a base color first, then one of eight color-wheel harmony rules (Analogous, Monochromatic, Triad, Complementary, Split Complementary, Square, Compound, Shades, the rule set Adobe Color uses), and hue, lightness and chroma sliders. The five colors are computed in OKLCH, so equal lightness looks equally light across hues.
- **Paste**: a list of hex values, from Adobe Color or anywhere else, and **Judge pasted colors** to judge it the same way. Tokens that are not colors are named.
- **Shipped**: the GigglyBits Dark variants this extension installs, with the active one marked **Active**. GigglyBits Dark (Lab) is not listed, because it only holds whatever you last applied with Try in VS Code.
- **Saved**: your saved themes, with their count on the tab and the slot each one holds. **Load** brings one back exactly, and **Use in this project**, **Use everywhere** and **Delete** do what [Saved themes](#saved-themes) describes.

Click **Use** beside a shipped theme to make it your VS Code theme; the **Active** mark moves with it. The switch is written to your user settings. When the workspace sets its own theme, or `window.autoDetectColorScheme` is on, that setting wins and a notification says so.

Use also loads that theme's palette, with the Editor choices and Dark frame it ships with, so you can start a new design from it. An unchanged copy cannot be saved: Include, Maybe and Exclude stay disabled, with a note, until you change a setting, because saving it would rename the shipped palette's own entry. Change the rule, hue, lightness, chroma or colors, type a new name and decide, and it saves under that name to `palettes/catalog.json`, which needs this repository's folder open. Using a theme replaces whatever palette you were working on.

### The palette you are working on

Below **Start from**: its name, its five colors (click one to copy it), the lowest contrast any of them reaches on the reference backgrounds, a name and a note, and the actions.

- **Try in VS Code**, the one highlighted button, applies the palette, with its Frame and Editor choices and your color edits, as the GigglyBits Dark (Lab) theme straight away, with no reload, and offers to switch back. It writes nothing to the workspace.
- **Save theme** saves the design, with its name, Frame and Editor choices and color edits, to your saved themes. See [Saved themes](#saved-themes).
- The **Catalog** box, shown only with this repository open, holds **Include**, **Maybe** and **Exclude**, which save the decision, with the name and a note, to `palettes/catalog.json`, and the list of decided palettes, each with **Load**. They save the palette's colors only, not its Frame and Editor choices or color edits; a note beside them says so when you have edits.

Below them, the **Previews** box has three tabs:

- **Workbench**: a whole VS Code window drawn with every color Try in VS Code applies, with a split editor and a chat view, and two boxes of choices above it.
  - **Frame** colors the title bar, activity bar, status bar and window border: one palette color or a custom color, and a style. **Filled** gives solid colored bars with black or white text, which a new design starts with; **Dark** gives the dark bars the shipped themes have, with accent lines in the frame color. **Use the frame color for this folder** sets that color as this folder's color. When the folder already has one, a note says VS Code draws it over any theme's frame.
  - **Editor** colors everything else: an accent color (buttons, focus, links, selection) and Neutral, Tinted or Rich surfaces. In a Filled frame, changing the Editor choices never moves the bars, and changing the Frame never moves an editor color.
  - Click any part of the window to edit the colors that draw it, by role or one color at a time. **Every role** lists the Frame roles, then the Editor roles.
- **Widgets**: the Palette Inspector's widgets (chat, buttons, inputs, lists, Command Palette, notifications and more) in the palette's colors, editable the same way.
- **Contrast**: every color against each of those backgrounds, with a legend naming the grades: 7:1 AAA, 4.5:1 AA, 3:1 large text only, and under 3:1 fails.

## Saved themes

Name a design in the Theme Lab and click **Save theme**. It joins your saved themes, which live in your user settings (`gigglybits.library`), so every VS Code window sees them and Settings Sync carries them to your other machines. Saving again under the same name, in any letter case, updates that theme instead of adding a second one.

VS Code only lists themes an extension ships as files, so this extension ships 12 slots, **GigglyBits Theme 1** to **GigglyBits Theme 12**, in VS Code's theme picker. Each saved theme takes a slot, and its colors are written to your user settings for that slot only. With all 12 slots taken, saving or using another theme asks which saved theme gives up its slot; projects using that slot then show the new theme.

The frame belongs to the project. **Use everywhere** applies a theme's Editor colors (text, buttons, surfaces) with plain dark bars, so windows on different projects stay easy to tell apart; **Use in this project** applies the whole theme, frame included.

- **Use in this project** makes the theme this folder's theme: it sets `workbench.colorTheme` in the folder's settings and writes the theme's frame colors there too, so a folder using "copirate" shows copirate's bars while another window shows its own. It is offered only with a folder open. When the folder has its own color, which covers the theme's frame, it asks whether to remove that color.
- **Use everywhere** makes the theme your theme in every window, with its Editor colors and plain dark bars.
- **Delete** asks first, then removes the theme and frees its slot. Projects still using the slot fall back to the slot's default look and lose the theme's frame.

Saving a theme again updates every window using it, and an open project's frame follows within a moment; a project that is not open picks up the new frame the next time it opens.
- **GigglyBits: Choose Theme** in the Command Palette lists your saved themes by name and asks where to use the one you pick.

A new Theme Lab tab opened while a slot is your theme starts from the saved theme it holds.

## Palette Inspector

An optional debugging tool: it shows what every color in the active theme is, where it came from and what it draws, for any theme. Run **GigglyBits: Open Palette Inspector** from the Command Palette, or click **Open Palette Inspector** in the Theme Lab. It opens an editor tab with two parts, the element gallery and the color breakdowns. **Open Theme Lab** in its controls brings the Theme Lab forward, and the tab comes back after a window reload.

### Element gallery

Mock VS Code widgets drawn with the colors in effect: buttons, inputs, lists and trees, tabs, the editor and its widgets, menus, notifications, the status bar, the terminal and more, each state side by side. Hover a part to see the color keys that draw it, and open Definitions for each key's value, where it came from, the extension that contributes it and its contrast.

### Color breakdowns

- every workbench color currently in effect, grouped by area, with a swatch and its hex value
- where each color came from: the active theme (and which file in it), your user or workspace settings, or a VS Code default
- the contrast ratio of each text color against the background it is drawn on, with a filter for anything under 4.5:1
- the theme's syntax token rules and semantic token rules, drawn on sample text
- color keys the theme or your settings declare that VS Code ignored, which usually means a typo or a retired key

Click any color to copy it as a `"key": "#hex"` line. **Export as theme JSON** opens every color in effect, plus the token rules, as a new theme file.

The inspector follows theme switches and settings changes as they happen.

## Development

See `docs/DEVELOPMENT.md` in the source repository. It is not included in the installed extension.
