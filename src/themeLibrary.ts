// The personal theme library: saved Theme Lab designs, kept in the user-only setting
// gigglybits.library, and the theme slots they bind to. Pure functions with no vscode
// import, so jest tests every decision; src/themeLibraryController.ts does the VS Code side.
//
// VS Code lists only themes an extension ships as files, so the build ships SLOT_COUNT
// placeholder themes (GigglyBits Theme 1 to 12). A saved theme binds to one slot, and its
// colors go into user settings scoped to that slot's label, the way Try in VS Code scopes
// the Lab theme (src/labSettings.ts).
import { randomUUID } from 'crypto';
import * as path from 'path';
import { parse, ParseError } from 'jsonc-parser';
import {
  ChromeChoice, FRAME_KEYS, GROUP_FAMILIES, GroupFamily, LabSettings, labSettings, SLOT_COUNT, slotLabel, StyleGroup as BuilderGroup, TextLevel,
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
  surfaces: string;
  frame: TryFrame;
  edits: { swatches: Record<string, string>; keys: Record<string, string> };
  /** The Roles step's settings, present only when changed from their defaults. */
  syntax?: number[];
  depth?: number;
  text?: TextLevel;
}

/** The Roles step's settings of a design, for the chrome choice the builder reads. */
const roleChrome = (d: Design): Pick<ChromeChoice, 'syntax' | 'depth' | 'text'> => ({
  ...(d.syntax ? { syntax: d.syntax } : {}),
  ...(d.depth !== undefined ? { depth: d.depth } : {}),
  ...(d.text ? { text: d.text } : {}),
});

export interface SavedTheme {
  id: string;
  name: string;
  /** The bound slot, 1 to SLOT_COUNT, or null when the theme has none. */
  slot: number | null;
  design: Design;
  /**
   * Style groups this theme names for itself; always [], because per-theme groups are
   * deferred. The groups that are on apply to every saved theme (gigglybits.groups).
   */
  groups: string[];
  savedAt: string;
}

/** saveTheme and bindTheme found every slot bound; the caller picks a theme to unbind. */
export interface NeedsSlot {
  needsSlot: true;
}

export type LibraryResult = { library: SavedTheme[]; theme: SavedTheme } | NeedsSlot;

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
    surfaces: record.surfaces,
    frame: record.frame,
    edits: record.edits ?? { swatches: {}, keys: {} },
    ...(record.syntax ? { syntax: record.syntax } : {}),
    ...(record.depth !== undefined ? { depth: record.depth } : {}),
    ...(record.text ? { text: record.text } : {}),
  };
  if (record.mode === 'generated') {
    Object.assign(design, { rule: record.rule, hue: record.hue, lightness: record.lightness, chroma: record.chroma });
  } else {
    design.pasted = record.pasted;
  }
  return design;
}

const isSlot = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= SLOT_COUNT;

/** The valid saved themes in value, in order; anything else is dropped. A missing groups becomes []. */
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
    let groups: string[] = [];
    if (item.groups !== undefined) {
      if (!Array.isArray(item.groups) || !item.groups.every(g => typeof g === 'string')) { continue; }
      groups = item.groups.slice() as string[];
    }
    themes.push({
      id: item.id,
      name,
      slot: item.slot as number | null,
      design,
      groups,
      savedAt: typeof item.savedAt === 'string' ? item.savedAt : '',
    });
  }
  return themes;
}

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** The lowest slot no theme in library is bound to, or null when all are bound. */
function freeSlot(library: SavedTheme[]): number | null {
  const used = new Set(library.map(t => t.slot));
  for (let n = 1; n <= SLOT_COUNT; n++) {
    if (!used.has(n)) { return n; }
  }
  return null;
}

/**
 * The slot for a theme that needs one, and the library with unbindId's theme unbound when
 * that was needed to free it. Null when every slot is bound and unbindId names no bound theme.
 */
function claimSlot(library: SavedTheme[], unbindId?: string): { library: SavedTheme[]; slot: number } | null {
  const slot = freeSlot(library);
  if (slot !== null) {
    return { library, slot };
  }
  const victim = library.find(t => t.id === unbindId && t.slot !== null);
  if (!victim) {
    return null;
  }
  return { library: library.map(t => (t === victim ? { ...t, slot: null } : t)), slot: victim.slot as number };
}

/**
 * Saves design under name. An existing theme with the same name (trimmed, case-insensitive)
 * keeps its id, name and slot and takes the new design; a new name gets the lowest free slot.
 * With every slot bound and no usable unbindId it returns needsSlot and changes nothing.
 */
export function saveTheme(library: SavedTheme[], input: { name: string; design: Design; now: string }, unbindId?: string): LibraryResult {
  const match = library.find(t => sameName(t.name, input.name));
  if (match) {
    const theme: SavedTheme = { ...match, design: input.design, savedAt: input.now, groups: match.groups ?? [] };
    return { library: library.map(t => (t === match ? theme : t)), theme };
  }
  const claim = claimSlot(library, unbindId);
  if (!claim) {
    return { needsSlot: true };
  }
  const theme: SavedTheme = { id: randomUUID(), name: input.name.trim(), slot: claim.slot, design: input.design, groups: [], savedAt: input.now };
  return { library: [...claim.library, theme], theme };
}

/** Gives the theme id the lowest free slot when it has none, with saveTheme's needsSlot and unbindId behavior. */
export function bindTheme(library: SavedTheme[], id: string, unbindId?: string): LibraryResult {
  const theme = library.find(t => t.id === id);
  if (!theme) {
    throw new Error(`No saved theme with id ${id}.`);
  }
  if (theme.slot !== null) {
    return { library, theme };
  }
  const claim = claimSlot(library, unbindId);
  if (!claim) {
    return { needsSlot: true };
  }
  const bound: SavedTheme = { ...theme, slot: claim.slot };
  return { library: claim.library.map(t => (t.id === id ? bound : t)), theme: bound };
}

/** library without the theme id, and the slot that freed, or null. */
export function deleteTheme(library: SavedTheme[], id: string): { library: SavedTheme[]; freedSlot: number | null } {
  const theme = library.find(t => t.id === id);
  return { library: library.filter(t => t.id !== id), freedSlot: theme?.slot ?? null };
}

/** The settings a theme's slot carries: the same colors and token rules the Lab builds, with groups applied. */
export function slotSettings(theme: SavedTheme, groups: readonly BuilderGroup[] = []): LabSettings {
  const d = theme.design;
  return labSettings({ name: theme.name, colors: d.colors }, { index: d.chromeIndex, surfaces: d.surfaces, frame: d.frame, ...roleChrome(d) }, d.edits, groups);
}

// ------------------------------------------------------------------ style groups
//
// A style group maps a widget family's colors to Editor roles of the theme builder. Groups live
// in the user-only setting gigglybits.groups; one that is on applies to every saved theme's slot,
// drawn from that theme's own swatches. At most one group per family is on.

/** A saved style group: the builder's { family, roles } with its name and whether it is on. */
export interface StyleGroup extends BuilderGroup {
  id: string;
  name: string;
  on: boolean;
  savedAt: string;
}

const isFamily = (v: unknown): v is GroupFamily => typeof v === 'string' && Object.prototype.hasOwnProperty.call(GROUP_FAMILIES, v);

/** The valid groups in value, in order; anything else is dropped. */
export function parseGroups(value: unknown): StyleGroup[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const groups: StyleGroup[] = [];
  for (const item of value) {
    if (!isObject(item)) { continue; }
    const name = typeof item.name === 'string' ? item.name.trim() : '';
    if (typeof item.id !== 'string' || !item.id || !name || !isFamily(item.family) || typeof item.on !== 'boolean') { continue; }
    const roles = item.roles;
    if (!isObject(roles) || !Object.values(roles).every(v => typeof v === 'string')) { continue; }
    groups.push({
      id: item.id,
      name,
      family: item.family,
      roles: { ...(roles as Record<string, string>) },
      on: item.on,
      savedAt: typeof item.savedAt === 'string' ? item.savedAt : '',
    });
  }
  return groups;
}

/**
 * Saves a group. One of the same family with the same name (trimmed, case-insensitive) keeps
 * its id and on and takes the new roles; any other name is added as a new group that is off.
 */
export function saveGroup(
  groups: StyleGroup[],
  input: { name: string; family: GroupFamily; roles: Record<string, string>; now: string },
): { groups: StyleGroup[]; group: StyleGroup } {
  const roles = { ...input.roles };
  const match = groups.find(g => g.family === input.family && sameName(g.name, input.name));
  if (match) {
    const group: StyleGroup = { ...match, roles, savedAt: input.now };
    return { groups: groups.map(g => (g === match ? group : g)), group };
  }
  const group: StyleGroup = { id: randomUUID(), name: input.name.trim(), family: input.family, roles, on: false, savedAt: input.now };
  return { groups: [...groups, group], group };
}

/** groups with id switched on or off; switching one on switches off every other group of its family. */
export function setGroupOn(groups: StyleGroup[], id: string, on: boolean): StyleGroup[] {
  const target = groups.find(g => g.id === id);
  if (!target) {
    return groups;
  }
  return groups.map(g => {
    if (g.id === id) { return { ...g, on }; }
    return on && g.family === target.family && g.on ? { ...g, on: false } : g;
  });
}

/** groups without id. */
export function deleteGroup(groups: StyleGroup[], id: string): StyleGroup[] {
  return groups.filter(g => g.id !== id);
}

/** The groups that are on. */
export function activeGroups(groups: readonly StyleGroup[]): StyleGroup[] {
  return groups.filter(g => g.on);
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

/**
 * The two user settings a slot's colors live in: workbench.colorCustomizations and
 * editor.tokenColorCustomizations, as their current user-level values.
 */
export interface SlotSettingValues {
  colors: unknown;
  tokens: unknown;
}

/**
 * values with theme's slot block written into both settings: its colors, and its token rules as
 * textMateRules, with the active groups applied.
 */
export function writeSlot(values: SlotSettingValues, theme: SavedTheme, groups: readonly BuilderGroup[] = []): { colors: Settings; tokens: Settings } {
  if (theme.slot === null) {
    throw new Error(`${theme.name} has no slot.`);
  }
  const label = slotLabel(theme.slot);
  const settings = everywhereSettings(theme, groups);
  return {
    colors: withScope(values.colors, label, settings.colors),
    tokens: withScope(values.tokens, label, { textMateRules: settings.tokenColors }),
  };
}

/** values with every bound theme's slot block rewritten through writeSlot, with the groups of `groups` that are on. */
export function writeAllSlots(values: SlotSettingValues, library: SavedTheme[], groups: readonly StyleGroup[]): { colors: Settings; tokens: Settings } {
  const active = activeGroups(groups);
  let next = { colors: { ...(isObject(values.colors) ? values.colors : {}) }, tokens: { ...(isObject(values.tokens) ? values.tokens : {}) } };
  for (const theme of library) {
    if (theme.slot !== null) {
      next = writeSlot(next, theme, active);
    }
  }
  return next;
}

// ------------------------------------------------------------------ frames belong to projects
//
// Decided 2026-11-04: Use everywhere applies a theme's Editor colors, not its frame, so windows
// on different projects stay distinct. The user slot blocks carry the theme with a Dark frame;
// Use in this project also writes the theme's frame keys into the folder's own settings under
// the slot's scope, which beats the user block key by key (docs/DEVELOPMENT.md, Identity write
// shape).

const FRAME = new Set(FRAME_KEYS);
const SLOT_SCOPE = /^\[GigglyBits Theme \d+\]$/;

/** edits without the frame's: frame swatch edits (the frame swatches are named frame*) and FRAME_KEYS edits. */
function editorEdits(edits: Design['edits']): Design['edits'] {
  return {
    swatches: Object.fromEntries(Object.entries(edits.swatches).filter(([name]) => !name.startsWith('frame'))),
    keys: Object.fromEntries(Object.entries(edits.keys).filter(([key]) => !FRAME.has(key))),
  };
}

/**
 * What a theme's slot carries in user settings, for Use everywhere: its Editor colors, with a
 * Dark frame following its accent, and the active groups applied.
 */
export function everywhereSettings(theme: SavedTheme, groups: readonly BuilderGroup[] = []): LabSettings {
  const d = theme.design;
  return labSettings(
    { name: theme.name, colors: d.colors },
    { index: d.chromeIndex, surfaces: d.surfaces, frame: { index: d.chromeIndex, style: 'dark' }, ...roleChrome(d) },
    editorEdits(d.edits),
    groups);
}

/** The frame Use in this project gives the folder: the FRAME_KEYS of the theme's full colors. */
export function projectFrame(theme: SavedTheme): Record<string, string> {
  const colors = slotSettings(theme).colors;
  return Object.fromEntries(FRAME_KEYS.filter(key => key in colors).map(key => [key, colors[key]]));
}

/** A folder's workbench.colorCustomizations with only `slot`'s frame block among the slot blocks; every other key kept. */
export function withProjectFrame(current: unknown, slot: number, frame: Record<string, string>): Settings {
  return { ...withoutProjectFrames(current), [`[${slotLabel(slot)}]`]: frame };
}

/**
 * What Use in this project writes to a folder's workbench.colorCustomizations: any old folder
 * color removed (top level and '[GigglyBits*]'), then only `slot`'s frame block among the slot blocks.
 */
export function projectColors(current: unknown, slot: number, frame: Record<string, string>): Settings {
  return withProjectFrame(withoutIdentity(current), slot, frame);
}

/** A folder's workbench.colorCustomizations without any slot's frame block. */
export function withoutProjectFrames(current: unknown): Settings {
  return Object.fromEntries(Object.entries(isObject(current) ? current : {}).filter(([key]) => !SLOT_SCOPE.test(key)));
}

/** The slot number a theme label names, such as 2 for 'GigglyBits Theme 2', or undefined. */
export function slotOfLabel(label: string | undefined): number | undefined {
  for (let n = 1; n <= SLOT_COUNT; n++) {
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
 * What a folder's workbench.colorCustomizations should become so its frame follows the
 * library, or undefined when it already does. `theme` is the folder's own workbench.colorTheme.
 * A slot holding a saved theme gets that theme's frame; an empty slot loses its frame block.
 */
export function projectFrameRefresh(current: unknown, theme: string | undefined, library: SavedTheme[]): Settings | undefined {
  const slot = slotOfLabel(theme);
  if (slot === undefined) {
    return undefined;
  }
  const saved = library.find(t => t.slot === slot);
  const next = saved ? withProjectFrame(current, slot, projectFrame(saved)) : withoutProjectFrames(current);
  return canonical(next) === canonical(isObject(current) ? current : {}) ? undefined : next;
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

/** values with slot's block removed from both settings. */
export function clearSlot(values: SlotSettingValues, slot: number): { colors: Settings; tokens: Settings } {
  const label = slotLabel(slot);
  return { colors: withoutScope(values.colors, label), tokens: withoutScope(values.tokens, label) };
}
