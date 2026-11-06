// What a freshly opened Theme Lab starts from, decided without VS Code so jest tests it
// directly. src/themeLabPanel.ts sends the result as the 'start' message on 'ready'.
import { cleanEdits, LAB_THEME_LABEL, SLOT_COUNT, slotLabel } from '../scripts/theme-builder';
import type { TextLevel } from '../scripts/theme-builder';
import type { Design, SavedTheme } from './themeLibrary';

/** What Try in VS Code records about the tried candidate, stored in globalState. */
export interface TryRecord {
  mode: 'generated' | 'pasted';
  rule?: string;
  hue?: number;
  lightness?: number;
  chroma?: number;
  pasted?: string[];
  chromeIndex: number;
  surfaces: string;
  /** Recorded by a Try from when a Lab could start from a shipped theme; kept when read back. */
  baseId?: string;
  baseName?: string;
  /** The Lab's color edits, present when any were made. */
  edits?: { swatches: Record<string, string>; keys: Record<string, string> };
  /** The Frame choices: a palette index or a '#rrggbb' color, and a style. */
  frame?: TryFrame;
  /** The Roles step's settings, present only when changed from their defaults. */
  syntax?: number[];
  depth?: number;
  text?: TextLevel;
}

const TEXT_IDS: readonly TextLevel[] = ['soft', 'standard', 'high'];

/**
 * The Roles step's settings in value, each kept only when valid: syntax as five non-negative
 * integers, depth as a finite number, text as a level id. The builder cleans the values further.
 */
export function parseRoleSettings(value: Record<string, unknown>): Pick<TryRecord, 'syntax' | 'depth' | 'text'> {
  const out: Pick<TryRecord, 'syntax' | 'depth' | 'text'> = {};
  const syntax = value.syntax;
  if (Array.isArray(syntax) && syntax.length === 5 && syntax.every(i => Number.isInteger(i) && (i as number) >= 0)) {
    out.syntax = (syntax as number[]).slice();
  }
  if (isFiniteNumber(value.depth)) { out.depth = value.depth; }
  if (typeof value.text === 'string' && (TEXT_IDS as readonly string[]).includes(value.text)) { out.text = value.text as TextLevel; }
  return out;
}

export interface TryFrame {
  index?: number;
  color?: string;
  style: 'dark' | 'filled';
}

/** value as a TryFrame: a known style and a non-negative integer index or a '#rrggbb' color. */
function parseFrame(value: unknown): TryFrame | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined;
  }
  const f = value as Record<string, unknown>;
  if (f.style !== 'dark' && f.style !== 'filled') {
    return undefined;
  }
  if (typeof f.color === 'string' && HEX6.test(f.color)) {
    return { style: f.style, color: f.color.toLowerCase() };
  }
  if (Number.isInteger(f.index) && (f.index as number) >= 0) {
    return { style: f.style, index: f.index as number };
  }
  return undefined;
}

const HEX6 = /^#[0-9a-f]{6}$/i;
const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** value as a TryRecord, or undefined when it is not a usable one. */
export function parseTryRecord(value: unknown): TryRecord | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined;
  }
  const v = value as Record<string, unknown>;
  if (v.mode !== 'generated' && v.mode !== 'pasted') {
    return undefined;
  }
  if (v.mode === 'generated'
    && (typeof v.rule !== 'string' || !isFiniteNumber(v.hue) || !isFiniteNumber(v.lightness) || !isFiniteNumber(v.chroma))) {
    return undefined;
  }
  if (v.mode === 'pasted'
    && (!Array.isArray(v.pasted) || !v.pasted.length || !v.pasted.every(c => typeof c === 'string' && HEX6.test(c)))) {
    return undefined;
  }
  if (!Number.isInteger(v.chromeIndex) || (v.chromeIndex as number) < 0) {
    return undefined;
  }
  if (typeof v.surfaces !== 'string') {
    return undefined;
  }
  const record: TryRecord = { mode: v.mode, chromeIndex: v.chromeIndex as number, surfaces: v.surfaces };
  if (v.mode === 'generated') {
    Object.assign(record, { rule: v.rule, hue: v.hue, lightness: v.lightness, chroma: v.chroma });
  } else {
    record.pasted = (v.pasted as string[]).slice();
  }
  if (typeof v.baseId === 'string') { record.baseId = v.baseId; }
  if (typeof v.baseName === 'string') { record.baseName = v.baseName; }
  const edits = cleanEdits(v.edits);
  if (Object.keys(edits.swatches).length || Object.keys(edits.keys).length) { record.edits = edits; }
  const frame = parseFrame(v.frame);
  if (frame) { record.frame = frame; }
  Object.assign(record, parseRoleSettings(v));
  return record;
}

/** The 'start' message's payload: the last Try, a saved theme, or a note on why none. */
export interface StartConfig {
  lastTry?: TryRecord;
  /** The saved theme bound to the active slot. */
  saved?: { name: string; design: Design };
  note?: string;
}

/** The slot number of a slot label such as 'GigglyBits Theme 2', or undefined. */
function slotNumber(label: string): number | undefined {
  for (let n = 1; n <= SLOT_COUNT; n++) {
    if (slotLabel(n) === label) { return n; }
  }
  return undefined;
}

/**
 * What a fresh Theme Lab starts from under the active theme `active`: the last Try under the
 * Lab theme, the saved theme bound to the active slot, otherwise a note. An unknown active
 * theme (undefined) starts from the defaults with no note. `library` is the saved themes
 * (src/themeLibrary.ts parseLibrary).
 */
export function startConfig(active: string | undefined, lastTry: unknown, library: SavedTheme[] = []): StartConfig {
  if (active === undefined) {
    return {};
  }
  if (active === LAB_THEME_LABEL) {
    const record = parseTryRecord(lastTry);
    return record
      ? { lastTry: record }
      : { note: 'No record of the last Try in VS Code, so the Lab starts from the default palette.' };
  }
  const slot = slotNumber(active);
  if (slot !== undefined) {
    const theme = library.find(t => t.slot === slot);
    return theme
      ? { saved: { name: theme.name, design: theme.design } }
      : { note: `${active} holds no saved theme, so the Lab starts from the default palette.` };
  }
  return { note: `${active} has no Theme Lab palette, so the Lab starts from the default palette.` };
}
