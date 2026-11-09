# Changelog

All notable changes to GigglyBits Theme Lab are documented in this file.

## 0.1.3

- **Installing opens the Theme Lab.** A new install now opens the Theme Lab straight away, instead of VS Code's list of GigglyBits Dark (Lab) and twelve empty theme slots. Get Started moves to the Welcome page from your next window. An update opens nothing if you have tried or saved a theme, or are using a GigglyBits theme.
- **Facets is the color picker's default.** Pickers open in Facets mode, with flat tiles that land on round values, until you choose Smooth. If you chose Smooth before, it stays.
- **See settings that can change a GigglyBits theme.** The Lab's first step now lists blocks in your user or workspace settings aimed at a GigglyBits theme that GigglyBits didn't write, wildcard blocks such as `[*Dark*]` included, and semantic color rules for every theme. A block for one GigglyBits theme has **Remove**, which takes it out after you confirm; anything else has **Open file**, since removing it would change your other themes too.
- **High contrast note on Try.** A Try made while a high contrast theme is showing says that VS Code follows your system's high contrast mode, so a theme that doesn't appear is explained.
- **Clearer note on colors not tied to a theme.** A check in VS Code showed that a GigglyBits theme's own colors take priority over them, so the Lab, its Remove prompt and Get Started now say they change every theme wherever the theme doesn't set that color itself.

## 0.1.2

- **Get Started walkthrough.** Installing the extension from inside VS Code opens Get Started on GigglyBits Theme Lab, with an Open Theme Lab button and short pages on trying a design and choosing your default theme.
- **Try in this project.** With a folder open, Try in VS Code sets the theme for that project alone and says so; other windows keep their theme. With no folder open it changes every window that doesn't set its own theme, and the message says that too. **Back to your default** undoes a Try in a project that had no theme of its own.
- **See and change your default theme.** The Lab's first step says which theme this window shows, whether this project sets it, and which theme new windows get. **Change default** lists your installed themes and makes the one you pick the default.
- **Find color settings not tied to any theme.** Colors in your user settings that aren't tied to a theme, such as ones another color extension left behind, override every theme. The Lab now names them, and **Remove them** deletes them after you confirm, keeping every theme's own colors.
- **Step 1 makes a complete theme.** Step 1 now says that a base color and a rule are all a theme needs, and steps 2 to 5 are marked Optional.
- **Rich surfaces by default.** A new design starts with Rich surfaces instead of Neutral, alongside the Filled frame it already had. Saved themes and designs you already have keep their own surface choice.

## 0.1.1

The first Marketplace release.

- **Theme Lab.** **GigglyBits: Open Theme Lab** opens a six-step workspace for building dark themes: pick your colors, check readability, set the frame and accent, color by purpose, fine-tune a part, then try and save.
- **Themes from a palette.** A base color and one of eight color-wheel harmony rules give five colors, worked out in OKLCH, and every color in the theme is made from them. Code colors and the accent are lifted until they read at 4.5:1 and input outlines to 3:1.
- **Readability table.** Each palette color is rated as text against four dark backgrounds, including your own editor background, with AAA, AA, Large and Fail grades.
- **Frame and accent.** A frame color and a Filled or Dark frame style color the title bar, activity bar and status bar; an accent colors buttons, links, badges and focus; Neutral, Tinted or Rich surfaces tint the side bar, tabs and panels. Each style choice draws a small window so you can compare before you pick. Buttons, badges, links, selection, focus outlines and the cursor can each take their own color.
- **Color by purpose.** All 84 roles in seven families, each shown as a sample against what it sits on, with a color picker, Reset and Show where.
- **Theme Preview window.** A live drawing of a whole VS Code window and every widget family in your colors, following each change as you drag, drawn with your own modern UI, tab style and activity bar settings. Click any part to edit its colors, one key or a whole role at a time. The window comes back with the Lab after a reload.
- **Color picker.** An OKLCH hue ring and lightness and chroma panel that marks colors your screen cannot show, typed fields, lightness blocks for quick shades, and a Facets mode that lands on round values.
- **Syntax sets.** Named sets of thirteen code colors, including tags and attributes for HTML, CFML and JSX, that any saved theme can use, so code reads the same in every project.
- **Start set from.** Start a syntax set from one of your installed dark themes, a bundled well-known scheme (Dracula, Nord, Solarized Dark, Gruvbox, One Dark, Tokyo Night, Catppuccin Mocha) or the Quiet and Harmony recipes from your palette. Each starter is a chip drawing a few lines of code in its colors, and a pick is an unsaved draft until Save New Set.
- **Try in VS Code.** Applies a design at once as GigglyBits Dark (Lab), with no reload, and offers to switch back.
- **Saved themes and project frames.** Save designs to twelve theme slots kept in your user settings and carried by Settings Sync. **Use in this project** gives a folder the theme with its frame, so each project's window is easy to tell apart; **Use everywhere** applies the editor colors with plain dark bars. **GigglyBits: Choose Theme** picks a saved theme from the Command Palette.
