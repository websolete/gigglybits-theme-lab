// The personal theme library: saved Theme Lab designs, kept in the user-only setting
// gigglybits.library, and the generated extension that lists them in the theme picker. Pure
// functions with no vscode import, so jest tests every decision; src/themeLibraryController.ts
// and src/companionThemes.ts do the VS Code side.
//
// VS Code lists only themes an installed extension declares, so each saved theme becomes a theme
// file in GigglyBits Saved Themes (companionPackage), labelled 'GigglyBits: <name>'. The library
// has no limit. Themes saved before 2026-11-10 may still carry the slot (1 to 12) they were bound
// to; userSlotMigration and projectFrameRefresh use it to move settings off the retired slots.
import { createHash, randomUUID } from 'crypto';
import * as path from 'path';
import { parse, ParseError } from 'jsonc-parser';
import {
  AccentGroups, baseColor, ChromeChoice, cleanChrome, FRAME_KEYS, LabSettings, labSettings, LEGACY_SLOT_COUNT, slotLabel, SyntaxColors, SYNTAX_SET_KEYS, TextLevel,
} from '../scripts/theme-builder';
import { parseTryRecord, TryFrame } from './labStart';
import { withoutIdentity } from './identity';

/** Everything the Lab holds about a design, so Load brings it back exactly. */
export interface Design {
  mode: 'generated' | 'pasted';
  rule?: string;
  hue?: number;
  lightness?: number;
  chroma?: number;
  pasted?: string[];
  /** The resolved palette colors, 1 to 10 '#rrggbb'. */
  colors: string[];
  chromeIndex: number;
  /** A custom editor accent (step 3), in place of palette color chromeIndex. */
  accentColor?: string;
  surfaces: string;
  frame: TryFrame;
  edits: { swatches: Record<string, string>; keys: Record<string, string> };
  /** The Roles step's settings, present only when changed from their defaults. */
  syntax?: number[];
  depth?: number;
  text?: TextLevel;
  /** Accent groups with their own color (step 3), present only when any has one. */
  accentGroups?: AccentGroups;
  /** The id of the syntax set the design's code colors come from; absent means From this palette. */
  syntaxSet?: string;
}

/**
 * The Roles step's settings and the accent groups of a design, for the chrome choice the builder
 * reads, with the colors of the syntax set it names when that set exists in `sets`.
 */
const roleChrome = (d: Design, sets: readonly SyntaxSet[] = []): Pick<ChromeChoice, 'color' | 'syntax' | 'depth' | 'text' | 'accentGroups' | 'syntaxColors'> => {
  const syntaxColors = syntaxColorsFor(d, sets);
  return {
    ...(d.accentColor ? { color: d.accentColor } : {}),
    ...(d.syntax ? { syntax: d.syntax } : {}),
    ...(d.depth !== undefined ? { depth: d.depth } : {}),
    ...(d.text ? { text: d.text } : {}),
    ...(d.accentGroups ? { accentGroups: d.accentGroups } : {}),
    ...(syntaxColors ? { syntaxColors } : {}),
  };
};

export interface SavedTheme {
  id: string;
  name: string;
  /** The retired slot the theme was bound to, 1 to LEGACY_SLOT_COUNT, or null; read only for migration. */
  slot: number | null;
  design: Design;
  savedAt: string;
}


const HEX6 = /^#[0-9a-f]{6}$/i;
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** value as a Design, or undefined. Reuses parseTryRecord for the settings a Try records. */
export function parseDesign(value: unknown): Design | undefined {
  const record = parseTryRecord(value);
  if (!record || !record.frame || !isObject(value)) {
    return undefined;
  }
  const colors = value.colors;
  if (!Array.isArray(colors) || colors.length < 1 || colors.length > 10 || !colors.every(c => typeof c === 'string' && HEX6.test(c))) {
    return undefined;
  }
  const design: Design = {
    mode: record.mode,
    colors: colors.map(c => (c as string).toLowerCase()),
    chromeIndex: record.chromeIndex,
    ...(record.accentColor ? { accentColor: record.accentColor } : {}),
    surfaces: record.surfaces,
    frame: record.frame,
    edits: record.edits ?? { swatches: {}, keys: {} },
    ...(record.syntax ? { syntax: record.syntax } : {}),
    ...(record.depth !== undefined ? { depth: record.depth } : {}),
    ...(record.text ? { text: record.text } : {}),
    ...(record.accentGroups ? { accentGroups: record.accentGroups } : {}),
    ...(typeof value.syntaxSet === 'string' && value.syntaxSet ? { syntaxSet: value.syntaxSet } : {}),
  };
  if (record.mode === 'generated') {
    Object.assign(design, { rule: record.rule, hue: record.hue, lightness: record.lightness, chroma: record.chroma });
  } else {
    design.pasted = record.pasted;
  }
  return design;
}

const isSlot = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= LEGACY_SLOT_COUNT;

/**
 * The valid saved themes in value, in order; anything else is dropped. A `groups` field, written
 * while style groups existed (retired 2026-11-07), is ignored.
 */
export function parseLibrary(value: unknown): SavedTheme[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const themes: SavedTheme[] = [];
  for (const item of value) {
    if (!isObject(item)) { continue; }
    const name = typeof item.name === 'string' ? item.name.trim() : '';
    if (typeof item.id !== 'string' || !item.id || !name) { continue; }
    if (item.slot !== null && !isSlot(item.slot)) { continue; }
    const design = parseDesign(item.design);
    if (!design) { continue; }
    themes.push({
      id: item.id,
      name,
      slot: item.slot as number | null,
      design,
      savedAt: typeof item.savedAt === 'string' ? item.savedAt : '',
    });
  }
  return themes;
}

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Saves design under name. An existing theme with the same name (trimmed, case-insensitive)
 * keeps its id, name and slot and takes the new design; a new theme gets no slot, since saved
 * themes now reach the picker through the generated extension (companionPackage) and the slot
 * field only records where an older theme was bound, for migration. A name containing [, ] or *
 * throws and changes nothing: those characters would make two names share a label (themeLabel).
 */
export function saveTheme(library: SavedTheme[], input: { name: string; design: Design; now: string }): { library: SavedTheme[]; theme: SavedTheme } {
  if (/[[\]*]/.test(input.name)) {
    throw new Error('A theme name cannot contain [, ] or *.');
  }
  const match = library.find(t => sameName(t.name, input.name));
  if (match) {
    const theme: SavedTheme = { id: match.id, name: match.name, slot: match.slot, design: input.design, savedAt: input.now };
    return { library: library.map(t => (t === match ? theme : t)), theme };
  }
  const theme: SavedTheme = { id: randomUUID(), name: input.name.trim(), slot: null, design: input.design, savedAt: input.now };
  return { library: [...library, theme], theme };
}

/** library without the theme id. */
export function deleteTheme(library: SavedTheme[], id: string): { library: SavedTheme[] } {
  return { library: library.filter(t => t.id !== id) };
}

/** A theme's full colors and token rules as the Lab builds them, its syntax set's colors included; projectFrame takes its frame keys from these. */
export function slotSettings(theme: SavedTheme, sets: readonly SyntaxSet[] = []): LabSettings {
  const d = theme.design;
  return labSettings({ name: theme.name, colors: d.colors, base: baseColor(d) }, { index: d.chromeIndex, surfaces: d.surfaces, frame: d.frame, ...roleChrome(d, sets) }, d.edits);
}

// ------------------------------------------------------------------ syntax sets
//
// A syntax set is a named set of fixed code colors (themeBuilder.js SYNTAX_SET_KEYS), kept in the
// user-only setting gigglybits.syntaxSets. A saved theme names the set it uses by id in its
// design; its theme file is built with that set's colors, so changing a set changes every theme on it.
// Style groups (gigglybits.groups) are retired: syntax sets replace their Editor text family.

/** A saved syntax set. At most one is the default for new designs. */
export interface SyntaxSet {
  id: string;
  name: string;
  colors: SyntaxColors;
  isDefault: boolean;
  savedAt: string;
}

/** The valid syntax sets in value, in order; anything else is dropped. Only the first set marked default stays default. */
export function parseSyntaxSets(value: unknown): SyntaxSet[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const sets: SyntaxSet[] = [];
  let sawDefault = false;
  for (const item of value) {
    if (!isObject(item)) { continue; }
    const name = typeof item.name === 'string' ? item.name.trim() : '';
    if (typeof item.id !== 'string' || !item.id || !name) { continue; }
    const colors = cleanChrome({ syntaxColors: item.colors }).syntaxColors;
    if (!colors) { continue; }
    const isDefault: boolean = item.isDefault === true && !sawDefault;
    sawDefault = sawDefault || isDefault;
    sets.push({ id: item.id, name, colors, isDefault, savedAt: typeof item.savedAt === 'string' ? item.savedAt : '' });
  }
  return sets;
}

/**
 * Saves a set: the set with input.id takes the new name and colors; without a matching id it is
 * added with a new id, not the default. Throws when colors lacks a SYNTAX_SET_KEYS color.
 */
export function saveSyntaxSet(
  sets: SyntaxSet[],
  input: { id?: string; name: string; colors: Record<string, string>; now: string },
): { sets: SyntaxSet[]; set: SyntaxSet } {
  const colors = cleanChrome({ syntaxColors: input.colors }).syntaxColors;
  if (!colors) {
    throw new Error(`A syntax set needs a #rrggbb color for each of ${SYNTAX_SET_KEYS.join(', ')}.`);
  }
  const match = input.id ? sets.find(s => s.id === input.id) : undefined;
  if (match) {
    const set: SyntaxSet = { ...match, name: input.name.trim() || match.name, colors, savedAt: input.now };
    return { sets: sets.map(s => (s === match ? set : s)), set };
  }
  const set: SyntaxSet = { id: randomUUID(), name: input.name.trim(), colors, isDefault: false, savedAt: input.now };
  return { sets: [...sets, set], set };
}

/** sets with id as the only default, or with no default when id is null or names no set. */
export function setDefaultSyntaxSet(sets: SyntaxSet[], id: string | null): SyntaxSet[] {
  return sets.map(s => ({ ...s, isDefault: id !== null && s.id === id }));
}

/** sets without id, library with syntaxSet removed from every theme that named it, and how many themes that was. */
export function deleteSyntaxSet(sets: SyntaxSet[], library: SavedTheme[], id: string): { sets: SyntaxSet[]; library: SavedTheme[]; cleared: number } {
  let cleared = 0;
  const next = library.map(t => {
    if (t.design.syntaxSet !== id) { return t; }
    cleared++;
    const design = { ...t.design };
    delete design.syntaxSet;
    return { ...t, design };
  });
  return { sets: sets.filter(s => s.id !== id), library: next, cleared };
}

/** How many themes in library name the set id. */
export function themesUsingSyntaxSet(library: SavedTheme[], id: string): number {
  return library.filter(t => t.design.syntaxSet === id).length;
}

/** The colors of the syntax set design names, or undefined when it names none or one not in sets. */
export function syntaxColorsFor(design: Design, sets: readonly SyntaxSet[]): SyntaxColors | undefined {
  return design.syntaxSet ? sets.find(s => s.id === design.syntaxSet)?.colors : undefined;
}

type Settings = Record<string, unknown>;

/** current with the '[label]' block replaced by block; every other key kept. */
export function withScope(current: unknown, label: string, block: unknown): Settings {
  return { ...(isObject(current) ? current : {}), [`[${label}]`]: block };
}

/** current without the '[label]' block; every other key kept. */
export function withoutScope(current: unknown, label: string): Settings {
  const next: Settings = { ...(isObject(current) ? current : {}) };
  delete next[`[${label}]`];
  return next;
}

// ------------------------------------------------------------------ frames belong to projects
//
// Decided 2026-11-04: Use everywhere applies a theme's Editor colors, not its frame, so windows
// on different projects stay distinct. The theme file in the generated extension carries the
// theme with a Dark frame (companionTheme); Use in this project also writes the theme's frame
// keys into the folder's own settings under its '[GigglyBits: <name>]' scope, which beats the
// theme file key by key (docs/DEVELOPMENT.md, Identity write shape).

const FRAME = new Set(FRAME_KEYS);
const SLOT_SCOPE = /^\[GigglyBits Theme \d+\]$/;
const NAMED_SCOPE = /^\[GigglyBits: [^\]]*\]$/;

/** edits without the frame's: frame swatch edits (the frame swatches are named frame*) and FRAME_KEYS edits. */
function editorEdits(edits: Design['edits']): Design['edits'] {
  return {
    swatches: Object.fromEntries(Object.entries(edits.swatches).filter(([name]) => !name.startsWith('frame'))),
    keys: Object.fromEntries(Object.entries(edits.keys).filter(([key]) => !FRAME.has(key))),
  };
}

/** The builder arguments for a theme's everywhere look: its Editor colors with a Dark frame following its accent. */
function everywhereArgs(theme: SavedTheme, sets: readonly SyntaxSet[]): Parameters<typeof labSettings> {
  const d = theme.design;
  return [
    { name: theme.name, colors: d.colors, base: baseColor(d) },
    { index: d.chromeIndex, surfaces: d.surfaces, frame: d.accentColor ? { color: d.accentColor, style: 'dark' } : { index: d.chromeIndex, style: 'dark' }, ...roleChrome(d, sets) },
    editorEdits(d.edits),
  ];
}

/**
 * What a theme carries for Use everywhere: its Editor colors, with a Dark frame following its
 * accent, and its syntax set's colors when it names one in `sets`.
 */
export function everywhereSettings(theme: SavedTheme, sets: readonly SyntaxSet[] = []): LabSettings {
  return labSettings(...everywhereArgs(theme, sets));
}

// ------------------------------------------------------------------ named themes
//
// Decided 2026-11-10 (work order wo-named-themes-...): every saved theme is a real theme in a
// generated extension, GigglyBits Saved Themes, that GigglyBits builds and installs at run time
// (src/companionThemes.ts). Its label, 'GigglyBits: <name>', is also its workbench.colorTheme
// value and its settings scope, which works because saved themes have no rename.

/** 'GigglyBits: ' and the theme's name without [, ] and *, which settings scopes treat specially. */
export function themeLabel(theme: Pick<SavedTheme, 'name'>): string {
  return 'GigglyBits: ' + theme.name.replace(/[[\]*]/g, '');
}

/** A theme file for theme: the everywhere colors and token rules, named by its label, with buildTheme's fixed fields. */
export function companionTheme(theme: SavedTheme, sets: readonly SyntaxSet[] = []): Record<string, unknown> {
  const built = everywhereSettings(theme, sets);
  return { $schema: 'vscode://schemas/color-theme', name: themeLabel(theme), type: 'dark', semanticHighlighting: true, colors: built.colors, tokenColors: built.tokenColors };
}

/** The generated extension's id. */
export const COMPANION_ID = 'EdgeInformation.gigglybits-saved-themes';

/** The generated extension's README, shown on its page in the Extensions view. */
const COMPANION_README = `# GigglyBits Saved Themes

Your saved GigglyBits themes, each listed in **Preferences: Color Theme** as \`GigglyBits: <name>\`.

GigglyBits Theme Lab builds this extension and rebuilds it whenever you save, change or delete a theme, so anything edited here is lost.

- To add or change a theme, use the Theme Lab.
- To remove a theme, delete it from the Saved list in the Theme Lab.
- To remove everything, uninstall GigglyBits Theme Lab. VS Code offers to uninstall this extension with it. Uninstalling only this one hides your themes until GigglyBits next starts and rebuilds it.
`;

/**
 * The generated extension for library: its package.json, one theme file per saved theme, a
 * README, the icon when given one (GigglyBits' own media/icon.png, so both read as one product in
 * the Extensions view), and a hash of every file, so a change to any of them reinstalls it.
 */
export function companionPackage(
  library: SavedTheme[],
  sets: readonly SyntaxSet[],
  options: { version: string; engines: string; dependency?: string; icon?: Buffer },
): { manifest: Record<string, unknown>; files: { name: string; data: string | Buffer }[]; hash: string } {
  const files: { name: string; data: string | Buffer }[] = [
    ...library.map((theme, n) => ({ name: `themes/${n}.json`, data: canonical(companionTheme(theme, sets)) })),
    { name: 'README.md', data: COMPANION_README },
    ...(options.icon ? [{ name: 'icon.png', data: options.icon }] : []),
  ];
  const digest = createHash('sha256');
  for (const f of files) { digest.update(f.name).update('\n').update(f.data).update('\n'); }
  const hash = digest.digest('hex');
  const manifest: Record<string, unknown> = {
    name: 'gigglybits-saved-themes',
    displayName: 'GigglyBits Saved Themes',
    publisher: 'EdgeInformation',
    version: options.version,
    engines: { vscode: options.engines },
    categories: ['Themes'],
    description: 'Your saved GigglyBits themes. GigglyBits Theme Lab generates and updates this extension; do not edit it.',
    gigglybits: { contentHash: hash },
    ...(options.icon ? { icon: 'icon.png' } : {}),
    ...(options.dependency ? { extensionDependencies: [options.dependency] } : {}),
    contributes: { themes: library.map((theme, n) => ({ label: themeLabel(theme), uiTheme: 'vs-dark', path: `./themes/${n}.json` })) },
  };
  return { manifest, files, hash };
}

/** The user color and token settings, and the user workbench.colorTheme, as migration reads them. */
export interface UserThemeValues {
  colors: unknown;
  tokens: unknown;
  theme: string | undefined;
}

/**
 * What the user settings become once slots are gone: undefined when the library is empty or there
 * is nothing to migrate; otherwise colors and tokens without their '[GigglyBits Theme <n>]' blocks,
 * the theme moved to the label of the saved theme holding slot n (any other value unchanged), and
 * the removed blocks keyed by setting and scope, for the backup.
 */
export function userSlotMigration(values: UserThemeValues, library: SavedTheme[]):
  { colors: Settings; tokens: Settings; theme: string | undefined; removed: Record<string, Settings> } | undefined {
  if (!library.length) {
    return undefined;
  }
  const colors: Settings = { ...(isObject(values.colors) ? values.colors : {}) };
  const tokens: Settings = { ...(isObject(values.tokens) ? values.tokens : {}) };
  const removed: Record<string, Settings> = { 'workbench.colorCustomizations': {}, 'editor.tokenColorCustomizations': {} };
  for (const [setting, value] of [['workbench.colorCustomizations', colors], ['editor.tokenColorCustomizations', tokens]] as const) {
    for (const key of Object.keys(value)) {
      if (SLOT_SCOPE.test(key)) {
        removed[setting][key] = value[key];
        delete value[key];
      }
    }
  }
  const slot = slotOfLabel(values.theme);
  const holder = slot === undefined ? undefined : library.find(t => t.slot === slot);
  const theme = holder ? themeLabel(holder) : values.theme;
  const removedAny = Object.values(removed).some(r => Object.keys(r).length);
  if (!removedAny && theme === values.theme) {
    return undefined;
  }
  return { colors, tokens, theme, removed };
}

/** The frame Use in this project gives the folder: the FRAME_KEYS of the theme's full colors. */
export function projectFrame(theme: SavedTheme): Record<string, string> {
  const colors = slotSettings(theme).colors;
  return Object.fromEntries(FRAME_KEYS.filter(key => key in colors).map(key => [key, colors[key]]));
}

/** A folder's workbench.colorCustomizations with only `label`'s frame block among the GigglyBits blocks; every other key kept. */
export function withProjectFrame(current: unknown, label: string, frame: Record<string, string>): Settings {
  return { ...withoutProjectFrames(current), [`[${label}]`]: frame };
}

/**
 * What Use in this project writes to a folder's workbench.colorCustomizations: any old folder
 * color removed (top level and '[GigglyBits*]'), then only `label`'s frame block among the GigglyBits blocks.
 */
export function projectColors(current: unknown, label: string, frame: Record<string, string>): Settings {
  return withProjectFrame(withoutIdentity(current), label, frame);
}

/** A folder's workbench.colorCustomizations without any slot's or saved theme's frame block. */
export function withoutProjectFrames(current: unknown): Settings {
  return Object.fromEntries(Object.entries(isObject(current) ? current : {}).filter(([key]) => !SLOT_SCOPE.test(key) && !NAMED_SCOPE.test(key)));
}

/** The slot number a theme label names, such as 2 for 'GigglyBits Theme 2', or undefined. */
export function slotOfLabel(label: string | undefined): number | undefined {
  for (let n = 1; n <= LEGACY_SLOT_COUNT; n++) {
    if (slotLabel(n) === label) { return n; }
  }
  return undefined;
}

/** JSON with object keys sorted, so two values compare equal whatever their key order. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    isObject(v) ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v);
}

/**
 * What a folder's workbench.colorCustomizations and workbench.colorTheme should become so its
 * frame follows the library, or undefined when nothing changes. `theme` is the folder's own
 * workbench.colorTheme. A slot label a saved theme holds moves to that theme's label with its
 * frame; a slot label no saved theme holds is left as it is, to migrate once the library holds
 * that slot; a saved theme's label gets its frame rewritten when it changed; a 'GigglyBits: '
 * label of no saved theme loses its frame block.
 */
export function projectFrameRefresh(current: unknown, theme: string | undefined, library: SavedTheme[]): { colors?: Settings; theme?: string } | undefined {
  const before = canonical(isObject(current) ? current : {});
  const slot = slotOfLabel(theme);
  if (slot !== undefined) {
    const holder = library.find(t => t.slot === slot);
    if (!holder) {
      return undefined;
    }
    return { colors: withProjectFrame(current, themeLabel(holder), projectFrame(holder)), theme: themeLabel(holder) };
  }
  if (theme === undefined || !theme.startsWith('GigglyBits: ')) {
    return undefined;
  }
  const saved = library.find(t => themeLabel(t) === theme);
  const next = saved ? withProjectFrame(current, theme, projectFrame(saved)) : withoutProjectFrames(current);
  return canonical(next) === before ? undefined : { colors: next };
}

/**
 * The settings files a save builds on, from the extension's globalStorage folder, which sits
 * at <profile folder>/globalStorage/<extension id>. The color settings live in that profile
 * folder's settings.json; gigglybits.library is application-scoped, so it always lives in the
 * default profile's User/settings.json, even in a window using a named profile
 * (User/profiles/<id>).
 */
export function settingsFilesFor(globalStoragePath: string): { library: string; colors: string } {
  const profileRoot = path.dirname(path.dirname(globalStoragePath));
  const named = path.basename(path.dirname(profileRoot)) === 'profiles';
  const userRoot = named ? path.dirname(path.dirname(profileRoot)) : profileRoot;
  return { library: path.join(userRoot, 'settings.json'), colors: path.join(profileRoot, 'settings.json') };
}

/**
 * The value to build a write of `key` on: the one in the settings file's text when the text
 * parses, since a window that was already open can hold an older copy of another window's
 * write in its configuration; otherwise configValue. `differs` says the two disagreed.
 * A file that parses but has no such key means the setting is unset.
 */
export function freshestSetting(text: string | undefined, key: string, configValue: unknown): { value: unknown; fromFile: boolean; differs: boolean } {
  if (text === undefined) {
    return { value: configValue, fromFile: false, differs: false };
  }
  const errors: ParseError[] = [];
  const parsed: unknown = parse(text, errors, { allowTrailingComma: true, disallowComments: false });
  if (errors.length || !isObject(parsed)) {
    return { value: configValue, fromFile: false, differs: false };
  }
  const value = parsed[key];
  return { value, fromFile: true, differs: JSON.stringify(value) !== JSON.stringify(configValue) };
}

