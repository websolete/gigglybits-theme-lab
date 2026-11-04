# Changelog

All notable changes to GigglyBits Theme Lab are documented in this file.

## Unreleased

- **Save theme** keeps the design you are working on as a named theme: its palette, Frame and Editor choices and color edits. Saved themes live in your user settings (`gigglybits.library`), so every VS Code window sees them and Settings Sync carries them to your other machines. Saving under a name you already used updates that theme, and every project using it changes with it. A save in one window no longer undoes a save made in another.
- **Start from > Saved** now lists your saved themes, with **Load** to bring one back exactly, **Use in this project** (with a folder open) to make it this folder's theme, frame included, **Use everywhere** to apply its Editor colors in every window with plain dark bars, so each project's frame stays its own, and **Delete**, which asks first and says projects still using it fall back to the slot's default look. Use in this project offers to remove the folder's own color when it has one, because that color covers the theme's frame.
- **GigglyBits: Choose Theme** lists your saved themes by name and asks where to use the one you pick.
- VS Code's theme picker lists 12 new themes, **GigglyBits Theme 1** to **12**. Each saved theme takes one of these slots, and a slot shows its saved theme's colors once it is used. With all 12 taken, saving or using a new theme asks which one to give up its slot.
- Include, Maybe and Exclude, with the note and the list of decided palettes, moved into a **Catalog** box under the palette's actions. It shows only with this repository open, where `palettes/catalog.json` lives.
- The Theme Lab reads top to bottom: Start from, then the palette, then Previews, each in its own bordered box, so the previews use the whole width of the tab. In the Wheel tab the base color now comes first, then the rule.
- A theme now has two sets of colors, chosen in two boxes above the preview. **Frame** colors the title bar, activity bar, status bar and window border: pick any palette color or your own, and a style. **Filled** gives solid colored bars with black or white text, and new designs start with it; **Dark** gives the dark bars the shipped themes have. **Editor** colors everything else: an accent color and Neutral, Tinted or Rich surfaces. Changing the Frame never moves an editor color, and in a Filled frame changing the Editor never moves the bars. Frame text reads at least 4.5:1.
- The preview is a full VS Code window, the Workbench tab, drawn with every color Try in VS Code applies, with a split editor and a chat view whose input shows its focus ring. The Code tab and its four small panels are gone.
- A Widgets tab draws the Palette Inspector's widget families (chat, buttons, inputs, lists, Command Palette, notifications, editor selection and diagnostics, and more) in the palette's colors. Pick which families to show.
- Click any part of either preview to edit the colors that draw it. Each color belongs to a role, such as Frame, Accent, Raised surface or Error. Editing a role changes every color in it and the shades made from it; This key only changes one color. **Every role** lists the Frame roles, then the Editor roles. Try in VS Code applies your Frame, Editor and color edits, and a new Theme Lab tab under the Lab theme brings them back. Include, Maybe and Exclude save the palette's colors only, and the Lab says so beside those buttons when you have edits.
- The Lab no longer previews this folder's own color or offers to copy it. **Use the frame color for this folder** sets it, and when the folder has one, the Frame box says VS Code draws it over any theme's frame.
- Input, dropdown, checkbox, panel filter and chat input outlines are brighter in every shipped theme, reading at least 3:1 against the editor and the side bar.
- The shipped themes now set the chat colors: the chat input border and background, its focus border, chat request bubbles, the slash command chip and edited-file line counts. Claude Code's chat input border follows the theme's input outline. When the input is focused, its border comes from the permission mode: the theme's error color in auto and bypass modes, its focus border in plan mode, and Claude Code's own fixed orange in default mode, which no theme can change.
- The shipped themes now color the line between split editors.
- The Palette Inspector's workbench overview gains the same split editor and chat view, and the inspector has a new Chat views card.

## 0.0.11

- A new Theme Lab tab now opens on the theme you are using. Under a shipped GigglyBits Dark theme, the palette starts as that theme's, exactly as if you had clicked Use, so you begin from what the window shows. Opening the Theme Lab changes no setting.
- Under GigglyBits Dark (Lab), a new Theme Lab tab reopens on your last Try in VS Code, including the chrome color and surfaces you picked. Try now records those choices in the extension's own storage; what it writes to your settings is unchanged. The palette name you typed is not restored.
- Under any other theme, or under the Lab theme before a Try has been recorded, the Theme Lab starts from the default palette and says why in a line at the top of Start from.
- In the IDE chrome preview, the workspace identity boxes now start ticked for the parts this workspace's color fills, and unticked when it has none. The preview fills them with the workspace color when there is one, instead of the chosen chrome color, and follows Use as this workspace's identity and the Set, Next and Clear Workspace Color commands while the tab is open.
- A Theme Lab tab restored by a window reload keeps the edits you had made, rather than switching to the current theme's palette.
- On start-up, a workspace color that is missing its `"[GigglyBits*]"` copy, or one of its colors, is written again, so it shows under GigglyBits themes, including the Lab theme. A complete workspace color is left alone.

## 0.0.10

- The Theme Lab is reorganized around the palette you are working on. Its colors, its lowest contrast and Try in VS Code now sit at the top, instead of below the theme list and a long column of previews.
- A new Start from column holds the four ways to begin a palette as tabs: Wheel (the harmony rule and sliders), Paste, Shipped (the installed GigglyBits Dark themes, where Use still switches the theme and loads its palette) and Saved (your decided palettes, with Load). On a narrow editor tab the column stacks above the palette instead of sitting beside it.
- The code previews, the IDE chrome preview and the full contrast table are now tabs under the palette, one at a time. The contrast table gains a legend naming the grades: 7:1 AAA, 4.5:1 AA, 3:1 large text only and under 3:1 fails.
- The tabs you choose are remembered when the Theme Lab tab reloads, and every tab set works from the keyboard with the arrow keys, Home and End.
- Try in VS Code is the only highlighted button; Include, Maybe, Exclude and Judge pasted colors are plain buttons now.
- Start from, the palette and the previews each sit in a bordered box, and the labels in each box line up in one column. In the IDE chrome tab, the workspace identity choices have their own box marked preview only, because Try in VS Code never applies them; Use as this workspace's identity does.

## 0.0.9

- Clicking Use beside a shipped GigglyBits Dark theme in the Theme Lab now also loads its palette into the Palette Lab, with the chrome color and surfaces it ships with, so you can start a new design from it. It replaces whatever candidate the Palette Lab held.
- An unchanged copy of a shipped palette cannot be saved: Include, Maybe and Exclude stay disabled with a note until you change a setting, so the shipped palette's catalog entry is never renamed by accident. A changed copy saves under the name you type, to `palettes/catalog.json`, which needs this repository's folder open.

## 0.0.8

- Added the Theme Lab, its own editor tab and the main place to build, try and pick a theme. Open it with GigglyBits: Open Theme Lab. The Palette Lab, Try in VS Code, the IDE chrome preview, Use as this workspace's identity and the saved palettes all moved there from the Palette Inspector and work as before.
- Added a theme list at the top of the Theme Lab: the installed GigglyBits Dark themes, with the active one marked. Click Use beside one to switch VS Code to it. GigglyBits Dark (Lab) is left out because it only holds what Try in VS Code last applied. When a workspace theme setting or `window.autoDetectColorScheme` overrides the switch, a notification says so.
- The Palette Inspector is now a debugging view only: the element gallery, the color breakdowns and Export as theme JSON. Each tab has a button that opens the other, and both tabs come back after a window reload.
- The publisher is now Websolete, so the extension ID changes from `edgeinformation.gigglybits-vscode-theme` to `websolete.gigglybits-vscode-theme`. VS Code sees them as two extensions: uninstall the EdgeInformation one when you install this. Your `gigglybits.*` settings carry over, since their names are unchanged, but VS Code stores the Not here choice per extension ID, so a folder where you chose Not here, or ran Clear Workspace Color, can be offered a color again: it is treated like any folder that never declined, and gets the offer if it has no workspace color of its own.

## 0.0.7

- Added workspace identity. The first time you open a trusted folder with no color of its own, a notification offers it one, derived from the folder's name: Accept colors the title bar, activity bar, status bar and tab borders, and Not here stops asking for that folder. A folder that already colors those parts, with Peacock or your own settings, gets no offer.
- Added GigglyBits: Set Workspace Color (eight suggestions or a custom hex), Next Workspace Color and Clear Workspace Color, plus the `gigglybits.identity.*` settings for the hue, a pinned color, the regions to fill and the first-open offer.
- A suggested workspace color follows the active theme: switching GigglyBits variants re-tunes its brightness and intensity and keeps its hue. A custom hex stays as entered. It shows under any theme, including Dark Modern and the Lab theme, without erasing a Lab design.
- The Palette Lab's IDE chrome preview has a Use as this workspace's identity button that sets the previewed color as the workspace color. Try in VS Code no longer writes workspace settings: the identity checkboxes only preview. A folder where 0.0.6's Try wrote identity colors keeps them and gets no offer; run Clear Workspace Color or Set Workspace Color there once.
- Fixed the Palette Inspector naming your preferred dark theme (such as Dark 2026) instead of the theme on screen. It read the high-contrast auto-detect setting, which is on by default, as if it applied to every theme.

## 0.0.6

- Added an IDE chrome preview to the Palette Lab, below the code previews: a miniature VS Code window (title bar, activity bar, side bar, tabs, editor, panel, status bar) drawn from one palette color you pick. The Neutral surfaces match what the GigglyBits Dark variants ship; Tinted and Rich carry the color's hue into the bars, side bar and tabs.
- Tick Title bar and window border, Activity bar, Status bar, or Tabs and borders to try a per-workspace identity color, the way Peacock does, with black or white text chosen for contrast and readouts for each bar. Copy workspace overlay copies the matching `workbench.colorCustomizations` block for a workspace's `.vscode/settings.json`.
- Added Try in VS Code to the Palette Lab. It applies the current candidate, with its chrome color, surfaces and identity regions, as the new GigglyBits Dark (Lab) theme without a reload. The colors go into your user settings scoped to that theme, so other themes are untouched, and the identity regions go into the workspace settings in place of Peacock's colors. The confirmation offers to switch back to your previous theme.

## 0.0.5

- Renamed the extension from GigglyBits Theme to GigglyBits Theme Lab. Its ID, commands and theme names are unchanged.
- Added the GigglyBits Dark color themes: one per palette marked Include in the Palette Lab, named after the palette, such as GigglyBits Dark (Candy). Pick one with Preferences: Color Theme.
- Every variant draws the editor on #1e1e1e. Palette colors too dark to read as text are lightened, keeping their hue, until they read at 4.5:1, and colors that end up too alike are pushed apart.
- The variants give code only broad baseline colors and set no semantic token rules, so coloring from your specialized extensions still wins.
- Every part of VS Code the element gallery draws gets its color from the theme, apart from six keys left unset on purpose, such as the high-contrast borders.
- Added a base color picker beside the Palette Lab sliders: pick a color and its hue, lightness and chroma fill the sliders; move a slider and the picker follows.
- Added the GigglyBits logo as the extension's Marketplace and Extensions view icon.

## 0.0.4

- Added the Palette Lab to the Palette Inspector, below the element gallery: build five-color candidate palettes from a base hue with eight color-wheel harmony rules (Analogous, Monochromatic, Triad, Complementary, Split Complementary, Square, Compound, Shades), computed in OKLCH and kept inside sRGB without shifting lightness or hue.
- Paste a list of hex values, for example from Adobe Color, to judge a palette from elsewhere. Tokens that are not colors are named rather than dropped silently.
- Each candidate shows its contrast against three dark reference backgrounds and your current editor background, and a preview of it on code, a button, a badge, a focus ring and a selection on each of those backgrounds.
- Mark a candidate Include, Maybe or Exclude, with a name and a note. Decisions are saved to `palettes/catalog.json` in the first open folder, replacing any earlier decision on the same palette, and the saved list can load one back. Without an open folder the decision buttons are disabled and say why.

## 0.0.3

- Added an element gallery at the top of the Palette Inspector: buttons, inputs, lists, tabs, the editor, widgets, menus, notifications, the status bar, the terminal and more, drawn with the colors in effect and with each state side by side. Hover a part to see the color keys that draw it; open Definitions for each key's value, source, contributing extension and contrast.
- Added a list of the color keys installed extensions register, with their descriptions.
- Translucent colors are now shown over the surface they sit on instead of a checkerboard.
- The color breakdowns, token rules and other sections now start collapsed and remember whether you opened them.

## 0.0.2

- Fixed `GigglyBits: Open Palette Inspector` failing with "command not found" in the installed extension.

## 0.0.1

- Added `GigglyBits: Open Palette Inspector`, an editor tab that lists every workbench color in effect, grouped by area, with the source of each one (theme, user override or VS Code default) and a contrast ratio for text colors.
- The inspector also lists the theme's syntax and semantic token rules on sample text, flags color keys that are declared but have no effect, and can export everything in effect as a starting theme file.
