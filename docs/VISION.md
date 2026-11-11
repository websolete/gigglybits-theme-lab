# GigglyBits Theme Lab: vision

GigglyBits Theme Lab is a VS Code extension for people who care how their editor looks and how readable it is. It ships a small family of dark themes where every visible color was chosen on purpose. It includes a lab for designing your own themes and keeping them in a personal library that follows you between workspaces and machines. And it gives each workspace window its own identity color, so you can tell windows apart at a glance.

Written 2026-11-03, at version 0.0.6. Plan new work against this document, and update it when a decision here changes.

## Who it's for

Anyone on the VS Code Marketplace. It is built and lived with by its author first, but every feature is designed for a stranger who installs it with no context: no repo checkout, no build scripts, nothing to configure before it works.

## The four pillars

The theme family and the lab carry equal weight; neither exists only to serve the other. Project frames, each project's own color, are the fourth pillar. The third, the inspector, was removed on 2026-11-07 (see its section below).

### 1. The theme family

- Three to five dark variants at the public launch, each a clearly different mood and each fully polished. The nine variants built so far are candidates, and the launch set comes from narrowing them. Since 2026-11-05, by the user's decision, none of them ships: the extension contributes only GigglyBits Dark (Lab), saved themes come from the generated extension GigglyBits Saved Themes, and the nine palettes are kept in `test/fixtures/palettes.json`.
- Light versions of the family follow in a later release. High-contrast variants are not planned.
- Text reads at 4.5:1 or better. A palette color too dark to read is lightened, keeping its hue, and colors that land too close together are pushed apart.
- Every color in the parts of VS Code people actually see is set on purpose. Coverage of the long tail of rarely seen keys grows over time and never blocks a release.
- A theme is defined by its four or five main palette colors, and everything else is calculated from them. Each main color drives a group of the workbench, such as buttons, dialogs and notifications, lists, or inputs. Within a group, the variants (hover, active, pressed, disabled, borders, backgrounds, foregrounds) radiate out from that group's color. The result is a richer set of colors that still reads as one theme. Coverage grows by assigning a key to a group and a role in it, rather than by picking another color.
- Code gets broad baseline colors only. Language extensions own the detail of their own languages, and the themes set no semantic token rules.

### 2. The lab and the design library

- The Theme Laboratory is its own editor tab with its own command. It's the main thing a user interacts with to make a theme, and it holds only the authoring interface, with none of the inspector's inventories.
- Design a theme by picking a palette (color-wheel harmonies computed in OKLCH), judging it against contrast and live previews, and trying it in the real window without a reload. The Lab took pasted hex values until 2026-11-05, when the user removed the Paste tab; a saved theme made from pasted colors still loads.
- Designs are saved to a personal library in user settings. You can keep several designs, each workspace picks the one it uses, and a design made in one workspace is ready in every other. Settings Sync carries the library to other machines.
- A shipped family variant can be copied into the library as a starting point, then tweaked and saved as your own design. While no variant ships (since 2026-11-05), the Lab starts from the wheel or a saved theme.
- Designs live in settings rather than as files or extensions. There is nothing to package, install or manage.

### 3. The inspector (removed)

- Removed on 2026-11-07, before the first Marketplace release. The Theme Lab's readability table, its roles with their samples, and the Theme Preview window with its Edit dock cover what a user building a theme needs; inspecting third-party themes was a debugging aid outside that.

### 4. Project frames

- A project's color lives in its saved theme's frame: Use in this project gives the folder that theme and its frame, so windows on different projects are distinct.
- In a Filled frame the bars and the tab and split lines all take the frame color, with text and lines kept readable.
- The per-folder color of earlier versions is retired; a folder that still has one is offered, once, a project theme in that color, and Use in this project replaces it.

## Voice

Variant names stay playful (Candy, Rat Poison, Fashion Army). The README, the docs and the UI text stay plain and clear.

## What 1.0 means

1.0 is the first public Marketplace release. It ships when all of these hold:

- The design library works end to end: create a design, save it, use it in another workspace, and find it on a second machine after Settings Sync.
- Project frames have replaced Peacock in daily use, and their author has uninstalled Peacock without missing it.
- The family is narrowed to three to five variants.

Full coverage of every workbench key is not a 1.0 condition.

## After 1.0

- Light versions of the family.
- Wider key coverage, prioritized by what people see most.

## Not planned

- Rich syntax or semantic token coloring. That belongs to language extensions.
- High-contrast variants.
- Importing colors from an existing Peacock setup.
- Exporting user designs as standalone theme extensions.
- Making full key coverage a release gate.

## Settled decisions

- **A theme has two color sets: Frame and Editor.** Decided 2026-11-04. Frame is the title bar, command center, activity bar, status bar (its no-folder colors and hovered items included) and the window border; Editor is everything else. Each takes one palette color, or for Frame a custom color, and has its own contrast floors: frame text at least 4.5:1, inactive frame icons at least 3:1, input outlines at least 3:1. The Frame is Filled (solid bars with black or white text) or Dark (the look the variants had before the Frame existed). A new design starts Filled; the Lab theme is Dark, and so is a saved theme used everywhere.

- **The design library lives in the user setting `gigglybits.library`, with 12 slots.** Decided 2026-11-04. A saved theme is a named record of everything the Lab holds (palette, the rule settings that made it, Editor and Frame choices, color edits). The setting is application-scoped, so every window reads it and Settings Sync carries it. A saved theme may name the syntax set its code colors come from (below). Superseded 2026-11-10: saved themes are named themes in a generated extension (docs/specs/theme-library.spec.md).
- **Use everywhere applies a theme's Editor colors; the frame belongs to the project.** Decided 2026-11-04 by the user during the library live check: a frame applied to every window would defeat having differently colored workspaces. The user-level slot settings carry the theme with plain dark bars, and Use in this project writes the theme's frame into the folder's own settings for that slot. Code colors that stay the same across themes come from syntax sets (below), not from Use everywhere. Superseded 2026-11-10: saved themes are named themes in a generated extension (docs/specs/theme-library.spec.md).
- **Style groups are a preference applied everywhere.** Decided 2026-11-04 by the user at framing; superseded 2026-11-07 by syntax sets (next). A style group maps one widget family's colors (Tabs, Lists and trees, Buttons or Editor text) to Editor roles of the theme builder, and lives in the user setting `gigglybits.groups`. A group that is on applies to every saved theme, drawn from that theme's own swatches, so the style is shared and the colors stay each theme's; at most one group per family is on. Groups carry colors only, since a color theme carries nothing else. A theme's own single-color edits win over a group, and no group sets a frame key. Groups a single theme names for itself, groups on the shipped variants and sharing groups with other people are deferred.
- **Syntax sets replace style groups.** Decided 2026-11-07 by the user. Code colors should be a personal constant the user carries between workspaces, so keywords, strings and tags look the same whatever the palette or frame. Style groups could not do that: a group mapped a family's colors to theme roles, and those roles are drawn from each theme's own palette, so the colors still changed from theme to theme. A syntax set is a named set of fixed code colors (keywords, functions, strings, types, numbers, comments, tags, attributes, variables, properties, constants, operators and regex) in the user setting `gigglybits.syntaxSets`. Each saved theme chooses From this palette or a set; a theme stays linked to its set, so changing the set changes every theme on it; a set color under 4.5:1 is lightened keeping its hue; new designs start on the default set. Step 1's palette stays the pivot for everything else, since edits and custom colors are stored as offsets from it. All four style group families retired; steps 3 to 5 cover tabs, lists and buttons per theme.
- **Designs reach the theme picker through fixed slots.** VS Code only lists themes an extension ships as files, so the extension ships a set number of placeholder themes (GigglyBits Theme 1 through 12). Each library design is bound to a slot, and its colors live in user settings under that slot's name, so they sync and never touch a repo. A workspace records only which theme it uses, the one `workbench.colorTheme` line VS Code already writes. Windows showing different designs don't conflict. The native theme picker shows slot names, so GigglyBits has its own picker that lists designs by their real names. The cost is a cap of N designs bound at once. Designs beyond that stay in the library and can be swapped into a slot. Superseded 2026-11-10: saved themes are named themes in a generated extension (docs/specs/theme-library.spec.md).
- **One design format, two homes.** Shipped variants and user designs use the same format. Shipped variants are read-only and come with the extension, and user designs live in the library. Copying a shipped variant into the library is a plain copy. The lab saves to the library, not to a file in the open folder. The repo's shipped set, and the build that made one theme per palette in it, were removed on 2026-11-05 when the user stopped shipping the nine variants; shipping a variant again means bringing that build back. The palette catalog, with its include, maybe and exclude curation, was retired on 2026-11-05 by the user's decision: saved themes took its place.
- **The Laboratory and the inspector are separate tabs.** Shipped in 0.0.8. The Theme Lab (**GigglyBits: Open Theme Lab**) holds the Palette Lab, Try in VS Code, the Workbench and Widgets previews, the Frame and Editor choices, and a Start step whose tabs are Wheel and Saved (the Paste tab and the list of installed GigglyBits Dark themes were removed on 2026-11-05). Since 2026-11-05 it is laid out to the design council's contract, with an Edit dock for the part picked in the preview; since 2026-11-07, by the user's decision, it is one column of steps at every width. The Palette Inspector keeps the element gallery and the color breakdowns. The element gallery's inventory (chips, definitions, sources) stays in the inspector. Its drawings are shared: since 2026-11-04 the Theme Lab's Workbench and Widgets previews draw a candidate with the same gallery code, because the old IDE preview proved too small to judge one. The Lab and the build share one theme builder (media/themeBuilder.js), so a preview always shows what Try in VS Code applies.
- **The per-folder color retires into project frames.** Decided 2026-11-04 by the user at framing: the Set, Next and Clear Workspace Color commands are removed rather than reworded; a folder that still has an old color is offered a project theme in it once; a project's color shows under GigglyBits themes only; and all six tab and split lines (the active tab's two lines, the split editor line, and the side bar, panel and resize borders) take the frame color in a Filled frame.
- **License: MIT.**
- **Publisher: a personal publisher**, not EdgeInformation.

## Open questions

- **How many slots.** Answered 2026-11-04: 12, enough for a theme per active project without crowding the theme picker much. Themes beyond 12 stay in the library and can be swapped into a slot. Superseded 2026-11-10: saved themes are named themes in a generated extension (docs/specs/theme-library.spec.md).
- **Personal publisher ID.** The Marketplace publisher name to register.
- **Group-driven colors (for the next Palette Lab work).** Two groups are settled (see Settled decisions): Frame and Editor, each taking one palette color. Within the Editor, every UI part still takes its color from that one accent, and the other palette colors color only syntax. Settle four things: which groups exist and which main color drives each (a fixed mapping, or chosen per design in the lab); the variant ramp inside a group (steps of OKLCH lightness and chroma at the group's hue); whether error, warning and success keep the fixed hues they use now so they mean the same thing in every theme; and how the Lab previews a group's whole ramp.
- **(Closed 2026-11-07: the inspector was removed.) How the inspector's fix-in-place reaches a design.** The Laboratory and the inspector are separate tabs (see Settled decisions). Settle how a color fixed in the inspector is saved into a design in the Laboratory's library.
