# GigglyBits Theme Lab

An easy-to-read dark theme for VS Code, built so every color is set on purpose instead of falling through to whatever another theme or a VS Code default supplies.

You build your themes in the Theme Lab. The Palette Inspector is an optional tool for debugging colors.

## The themes this extension adds

**Preferences: Color Theme** lists 13 themes from this extension: **GigglyBits Dark (Lab)**, which **Try in VS Code** applies a design to, and **GigglyBits Theme 1** to **GigglyBits Theme 12**, the slots your [saved themes](#saved-themes) bind to. Until a design colors them, all 13 look the same, a dark theme built from the Lab's default palette.

- Every GigglyBits theme draws the editor on `#1e1e1e`. The palette's colors color keywords, functions, strings, types and numbers, in that order, and the first color is the accent for buttons, focus borders and badges.
- A palette color too dark to read as text is lightened, keeping its hue, until it reads at 4.5:1, and colors that end up too alike are pushed apart.
- Input, dropdown, checkbox, panel filter and chat input outlines read at least 3:1 against the editor and the side bar, so you can see where a box is.
- Code coloring from your specialized extensions stays in charge. The theme gives only broad baseline colors for code, sets no semantic token rules, and sets no color key another extension registers.
- Every part of VS Code the Palette Inspector's element gallery draws gets its color from the theme, apart from six keys left unset on purpose (listed in the development guide).

## Project frames

A project's color lives in its saved theme's frame. Save a design in the Theme Lab with a Filled frame in the color you want, then click **Use in this project**: the folder's title bar, activity bar and status bar, the active tab's lines, the line between split editors and the side bar, panel and resize borders take that color, so windows on different projects are easy to tell apart. With VS Code's modern UI on, the background between the cards carries the frame color too, and the active tab's top line and the side bar and panel borders are not drawn.

The per-folder color from earlier versions is retired, and the Set, Next and Clear Workspace Color commands are gone.

- A folder that still has its old color offers you, once, a project theme in that color. **Make project theme** opens the Theme Lab with that color as a Filled frame and the folder's name as the theme's name; save it and use it in the project. **Remove the color** removes the old color from the folder's settings. **Not now** leaves it, and the offer does not come back.
- **Use in this project** replaces a folder's old color with the theme's frame, without asking, and the status bar says so.
- The old color only showed under GigglyBits themes and the theme you were using when you set it; a project theme is a GigglyBits theme, so a project's color no longer follows you into other themes.
- It runs only in trusted folders. In Restricted Mode VS Code turns the extension off, so an untrusted folder gets no offer.

Settings:

| Setting | What it does |
|---|---|
| `gigglybits.identity.hue` | Deprecated. The old per-folder color as a hue; read only to find and remove an old color. |
| `gigglybits.identity.pinnedColor` | Deprecated. The old per-folder color as a hex value; read only to find and remove an old color. |

## Theme Lab

Run **GigglyBits: Open Theme Lab** from the Command Palette. It opens an editor tab where you pick a theme and build new ones, and a **Theme Preview** window of its own. The Lab tab holds a Preview card and six numbered steps, each its own bordered card:

- On a tab at least 75rem wide (1200 px at the default font size) the Lab is two panes, each the height of the tab: steps 1, 2, 3 and the step 6 bar on the left, and the Preview card, step 4 and step 5 on the right.
- On a narrower tab it is one column, the Preview card first, with the step 6 bar stuck to the bottom. Every step takes the full width.

Each step's heading carries its state on one line, such as `Wheel, Triad 210°`, `weakest contrast 6.5:1 (AA), #dc8fd5 on #252526` or `Frame 1 Filled · Accent 1 Neutral`. The tab comes back after a window reload, on the tabs and palette you had. The Palette Inspector, the debugging view, opens with **GigglyBits: Open Palette Inspector**.

A new Theme Lab tab opens on the theme you are using: under GigglyBits Dark (Lab) it starts from your last **Try in VS Code**, with its Frame and Editor choices, and under a GigglyBits Theme slot it loads the saved theme bound to it. Under any other theme, or before your first Try, it starts from the default palette with a line at the top of step 1 saying why.

Every tab set in the Theme Lab works from the keyboard: Tab to it, then the arrow keys, Home and End.

### Previews and VS Code's modern UI

The Workbench preview draws the window the way your VS Code draws it. With the modern UI on (`workbench.experimental.modernUI`, on by default), the side bars, editor and panel are separate rounded cards with gaps between them, and headers and panel tabs are in mixed case. Turn on `workbench.experimental.modernUIUppercaseViewHeaders`, or turn the modern UI off, and they are in capitals, as in the classic layout. `workbench.experimental.modernUIEditorTabStyle` picks connected or pill editor tabs. The floating preview window and the Palette Inspector's Workbench overview follow the same three settings, and every open preview redraws when you change one. GigglyBits themes do not set the modern UI's own colors, such as the shell behind the cards, so the previews work them out from the theme's colors the way VS Code does.

### 1 Start

Two tabs: start a new palette, or pick up one you kept.

- **Wheel**: a base color first, then one of eight color-wheel harmony rules (Analogous, Monochromatic, Triad, Complementary, Split Complementary, Square, Compound, Shades, the rule set Adobe Color uses), and hue, lightness and chroma sliders. The five colors are computed in OKLCH, so equal lightness looks equally light across hues.
- **Saved**: your saved themes, one line each with their colors, name and slot, and **Load**, which brings one back exactly; Enter on a line loads it too. The arrow beside Load shows **Use in this project**, **Use everywhere** and **Delete**, which do what [Saved themes](#saved-themes) describes. The foot of the tab opens [Style groups](#style-groups).

#### The color picker

Every color swatch in the Lab opens the same picker in place, under the swatch: the base color in step 1, the custom frame color in step 3, a role's color in step 4 and a key's color in step 5.

- The **ring** sets the hue. Inside it, the **panel** shows that hue at every lightness, from 1 (white) at the top to 0 (black) at the bottom, and every chroma, from 0 (gray) at the left to 0.33 at the right. The striped, dimmed area is colors your screen cannot show at that hue, so you can see where the hue runs out of color. Drag either one, or focus it and use the arrow keys: on the ring Left and Right move the hue by 1 degree, or 10 with Shift; on the panel Up and Down move lightness by 0.01, and Left and Right move chroma by 0.005.
- **Before** and **now** show the color the picker opened on and the color it has now.
- The **Hex**, **Lightness**, **Chroma** and **Hue** fields show the color and take a typed value. Hover one to see what it measures and which way is more. When you type a chroma the screen cannot show at that lightness and hue, a note says it was reduced to fit the screen.
- The five **lightness blocks** under it are your color two steps and one step darker, itself, and one step and two steps lighter, at the same chroma and hue. The step is 0.02, 0.05 (where it starts) or 0.10. Click a block to take that shade. A block that would be darker than black or lighter than white is striped and disabled.
- The Theme Preview follows every change while the picker is open. **Enter**, or clicking anywhere outside the picker, keeps the color. **Esc** closes it and puts the design back exactly as it was before the picker opened.

The base color's picker stays within the ranges of the Lightness and Chroma sliders.

### 2 Palette

A line opens the step: the table shows how readable each color is as text on four dark backgrounds, as a contrast ratio from 1 (invisible) to 21 (black on white), higher being easier to read. The table has one line per palette color: a swatch (click it to copy the hex), the hex over its L C H values, and its contrast ratio and grade on a near-black background (`#121212`), VS Code's Dark+ editor and side bar (`#1e1e1e`, `#252526`) and your own editor background. Each column heading names its background, and hovering a ratio says what was measured and what its grade means. The weakest cell is outlined, and the step's heading names it with its grade. Past five colors the table scrolls. Under it, a legend says what each grade means: AAA (7:1 or more) is easy to read at any size, AA (4.5:1 or more) is fine for normal text, Large (3:1 or more) suits only large or bold text, icons and borders, and Fail (under 3:1) is hard to read. A last line says what the theme builder adjusts on its own: code text colors to at least 4.5:1 and the input outline to 3:1, which is why the drawing can differ from the table's numbers.

### 3 Frame and Editor

Two rows, each a palette color choice and a select. Hover a row's name to see what it colors.

- **Frame** colors the title bar, activity bar, status bar and window border: one palette color or a custom color, and a style. **Filled** gives solid colored bars with black or white text, which a new design starts with; **Dark** gives dark bars with accent lines in the frame color. In a Filled frame the active tab's lines, the line between split editors and the side bar, panel and resize borders take the frame color too. When the folder still has an old per-folder color, a note says it is drawn over any theme's frame and that **Use in this project** with a saved theme replaces it.
- **Editor** colors everything else: an accent color (buttons, focus, links, selection) and Neutral, Tinted or Rich surfaces. In a Filled frame, changing the Editor choices never moves the bars, and changing the Frame never moves an editor color.

### 4 Roles

Every color in the theme belongs to a role, and step 4 shows all 84 of them in the seven families the theme builder makes them in: Syntax, Accent, Surfaces, Text, Status, Terminal and Frame. Each family has a line saying how it is made from your palette, its own setting where it has one, and its roles as buttons. Status, Terminal and Frame start folded to a strip of their colors, and **Show** opens them.

- **Syntax: Colors** picks the palette color each of Keywords, Functions, Strings, Types and Numbers uses, numbered from 1. They start as colors 1 to 5 in order, and a palette with fewer colors wraps around.
- **Surfaces: Depth** sets how far apart the surfaces step in lightness from the editor background, from 0.5x to 2x in steps of 0.1; Standard is 1x. **Tint** is step 3's Neutral, Tinted or Rich choice, shown here too.
- **Text: Contrast** sets the four gray text levels: **Soft**, **Standard** (where a design starts) or **High**.
- **Accent** and **Frame** show their step 3 choice, with a link to change it there. Status and Terminal use fixed hues and have no setting.

Each role button shows its color, its name and how many VS Code colors use it; Keywords shows **code**, since only code highlighting uses it. Click one to open its editor under its family: a color picker that changes every color in the role, **Reset** once it is edited, and **Show where**, which opens the role's first color in the Edit panel as a click in the preview would. Esc closes the editor and returns to the role. On a wide tab Roles sits above Edit and folds to its heading while the Edit panel is open; on a narrow tab it folds with steps 1 to 3. Try in VS Code and Save theme carry the three settings, and a design that leaves them where they start saves and builds exactly as before.

### The preview window and 5 Edit

The preview is drawn only in the **Theme Preview** window, which opens with the Theme Lab in a compact window of its own. It is an ordinary window, not kept on top, so VS Code can come in front of it. It is one scrolling page of two sections:

- **Workbench**: a whole VS Code window drawn with every color Try in VS Code applies, with a split editor and a chat view, scaled to the window's width and never drawn larger than full size. Under it, the contrast of the title bar text, activity icons, status bar text, active tab line and chat input border.
- **Widgets**: the Palette Inspector's widgets (chat, buttons, inputs, lists, Command Palette, notifications and more) in the palette's colors, one card per widget family.

The window follows every change you make in the Lab, while you drag a color too. The Lab's Preview card says whether it is open. **Open Preview** opens it again after you close it, or brings the open one forward. The window draws all 23 widget families, most important first: chat, buttons and inputs lead, and the terminal, text and borders close the list. The window does not come back after a window reload; use Open Preview.

Click any part of the preview window and the **Edit** panel opens in step 5:

- The part's color keys are listed under **This part**, and the keys of the box around it under **Around it**. Each key is one line: its color, name, hex, contrast and role.
- Click a line to open its color editor. One editor is open at a time. **Change** picks **This key only** or the key's **Whole role**, which changes every key in the role and the shades made from it. **Color** is a color picker and a hex field that also takes `#rrggbbaa`, and **Opacity** sets the key's transparency.
- **Transparent** sets the key to its color at 0% opacity. **Use VS Code default** leaves the key out of the theme, so VS Code draws it in its own default color; the preview draws it unset. **Reset** undoes the edit. A role's color is always opaque, so Opacity, Transparent and Use VS Code default change the key alone.
- With nothing picked, the panel says to pick a part in the preview window or open a role in Roles. Step 4 is the keyboard path to any color, and the way to reach the drawn parts that are too small to click comfortably.
- **Edits (n)** lists your edits, each with **Reset**, and **Reset all** undoes them all.
- Esc or the close button closes the panel and puts focus on the **Roles** button on step 5's line, which moves to step 4 and focuses its first role. While you have edits, it stays as one line you can open again.
- A pick brings the Lab tab forward and focuses it, ready to edit.
- On a narrow tab, a pick folds steps 1 to 4 to their heading lines, which keep their state. Click a heading to open that step; the panel shrinks to one line, and opening it again brings back the line you had open, scrolled where it was. A pick in the title bar, activity bar or status bar puts the Frame row at the top of the panel, and a pick in the editor tabs or the second editor group puts the Editor row there.

### 6 Try and Save

The last step is a card stuck to the bottom of the steps. Its heading says what it last did, which is announced to screen readers. Under it are **Name**, **Try in VS Code** and **Save theme**, then the palette: each color with its weakest grade (hover one for its weakest pair), and a sentence on how readable the palette is, naming any color that suits only large text or is hard to read, with the weakest contrast.

On a narrow tab, while the Edit panel is open, the open step and the Edit panel have a highlighted border and heading, so you can tell them from the folded steps.

- **Try in VS Code**, the one highlighted button, applies the palette, with its Frame and Editor choices and your color edits, as the GigglyBits Dark (Lab) theme straight away, with no reload, and offers to switch back. It is a scratch test: nothing is named, and the next Try replaces it. The colors go to your user settings. When the workspace sets its own theme, which would hide a user-level switch, Try switches this workspace to the Lab theme instead, and **Back** puts the workspace's theme back. The line then says **Tried in VS Code**, and the first change you make after it says **Changed since your last Try**, so you can tell whether VS Code shows your latest version.
- **Save theme** saves the design, with its name, Frame and Editor choices and color edits, to your saved themes. See [Saved themes](#saved-themes). The line says **Saved as** the name once the save lands, and **Unsaved changes** after your next change. Save theme stays off while Name is empty.
- When Name is another saved theme's name, in any letter case, the line warns **Overwrites** that theme before you click Save.
- Loading a saved theme says **Loaded** and its name. A saved theme made from pasted colors in an earlier version still loads, saves and tries as before.

## Saved themes

Name a design in the Theme Lab and click **Save theme**. It joins your saved themes, which live in your user settings (`gigglybits.library`), so every VS Code window sees them and Settings Sync carries them to your other machines. Saving again under the same name, in any letter case, updates that theme instead of adding a second one.

VS Code only lists themes an extension ships as files, so this extension ships 12 slots, **GigglyBits Theme 1** to **GigglyBits Theme 12**, in VS Code's theme picker. Each saved theme takes a slot, and its colors are written to your user settings for that slot only. With all 12 slots taken, saving or using another theme asks which saved theme gives up its slot; projects using that slot then show the new theme.

The frame belongs to the project. **Use everywhere** applies a theme's Editor colors (text, buttons, surfaces) with plain dark bars, so windows on different projects stay easy to tell apart; **Use in this project** applies the whole theme, frame included.

- **Use in this project** makes the theme this folder's theme: it sets `workbench.colorTheme` in the folder's settings and writes the theme's frame colors there too, so a folder using "copirate" shows copirate's bars while another window shows its own. It is offered only with a folder open. When the folder still has an old per-folder color, it removes that color and the status bar says so.
- **Use everywhere** makes the theme your theme in every window, with its Editor colors and plain dark bars.
- **Delete** asks first, then removes the theme and frees its slot. Projects still using the slot fall back to the slot's default look and lose the theme's frame.

Saving a theme again updates every window using it, and an open project's frame follows within a moment; a project that is not open picks up the new frame the next time it opens.
- **GigglyBits: Choose Theme** in the Command Palette lists your saved themes by name and asks where to use the one you pick.

A new Theme Lab tab opened while a slot is your theme starts from the saved theme it holds.

## Style groups

A style group sets how one kind of widget looks, once, for every saved theme. In the Theme Lab, the foot of **Start from > Saved** names your style groups; **Edit style groups** opens them in place of the design steps, and **Back to design** brings the steps back.

- The saved groups come first, one line each with **On**, the name and the family. Click a line for **Load** and **Delete**; Load opens it under **New group**.
- **New group** holds the family: **Tabs**, **Lists and trees**, **Buttons** or **Editor text** (the editor's text color and the keyword, function, string, type, number and comment colors). For each color in the family, choose the theme role that draws it, such as **Raised surface**, **Deep surface** or **Functions**, or leave it at **Theme's own**.
- The Lab tab draws that family's widgets alone, in the design's colors, as you go. Changing the family changes the drawing.
- The bar at the bottom holds the group's name, **Save group** and **Try in VS Code**, which applies the design with the group. Saving under a name the family already has updates that group.

A group that is on applies to every saved theme you use, in every window, drawn from that theme's own palette: the style is the same and the colors still differ. Only one group per family is on at a time, so switching on a second Tabs group switches the first one off. Changing a group updates every saved theme at once, and switching it off gives each theme its own style back.

A single color you edited by hand in a theme still wins over a group, and no group changes a project's frame. Groups apply to your saved themes. They live in your user settings (`gigglybits.groups`), so Settings Sync carries them with your saved themes. A group change rewrites the saved themes' colors in the profile of the window that made it.

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
