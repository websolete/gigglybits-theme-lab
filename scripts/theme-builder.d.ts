// Types for scripts/theme-builder.js, which the extension host bundles to apply Palette
// Lab candidates. Only the members the TypeScript side uses are declared.

export interface BuilderEntry {
  name?: string;
  id?: string;
  colors: string[];
}

/** The Palette Lab's IDE chrome choices. */
export interface ChromeChoice {
  /** Palette color index the UI accent comes from; default 0. */
  index?: number;
  /** A CHROME_SURFACES id from media/shared.js: neutral, tinted or rich. */
  surfaces?: string;
  /**
   * The Frame (title bar, command center, activity bar, status bar, window border): a '#rrggbb'
   * color, or a palette color index, and a style. Missing, it follows `index` in style 'dark'.
   */
  frame?: { index?: number; color?: string; style?: 'dark' | 'filled' };
  /** Palette indexes for Keywords, Functions, Strings, Types and Numbers; each wraps around the palette. */
  syntax?: number[];
  /** Multiplier on the surface steps, 0.5 to 2; 1 is the steps themes have always had. */
  depth?: number;
  /** Text contrast; 'standard' is the levels themes have always had. */
  text?: TextLevel;
}

export type TextLevel = 'soft' | 'standard' | 'high';

/** Lightness of bright, text, muted and faint for each text contrast level. */
export const TEXT_LEVELS: Readonly<Record<TextLevel, readonly [number, number, number, number]>>;

/** The Roles step's settings in a chrome choice, cleaned; syntax is null for the default order. */
export function cleanChrome(chrome?: unknown): { syntax: number[] | null; depth: number; text: TextLevel };

/** The Roles step's families, in order; each swatch belongs to exactly one. */
export const ROLE_FAMILIES: readonly { id: string; name: string; how: string; roles: readonly string[] }[];

/**
 * A group of colors the theme leaves to VS Code, with the reason. It covers its keys and every id
 * under one of its prefixes (prefix, then a dot), apart from the ids in except.
 */
export interface LeftToVSCodeGroup {
  area: string;
  reason: string;
  keys: readonly string[];
  prefixes: readonly string[];
  except: readonly string[];
}

/** Every color the theme leaves to VS Code's defaults, by group. */
export const LEFT_TO_VSCODE: readonly LeftToVSCodeGroup[];

/** True when LEFT_TO_VSCODE holds the id. */
export function leftToVSCode(id: string): boolean;

/** Gallery keys the theme leaves unset on purpose, each with the reason. */
export const UNSET_KEYS: Readonly<Record<string, string>>;

/** Every gallery key, grouped by the swatch it takes. */
export const KEY_GROUPS: Readonly<Record<string, readonly string[]>>;

/** The keys the frame settings decide; every other key follows the editor settings. */
export const FRAME_KEYS: readonly string[];

export interface TokenRule {
  name: string;
  scope: string[];
  settings: { foreground: string; fontStyle?: string };
}

export interface LabSettings {
  colors: Record<string, string>;
  tokenColors: TokenRule[];
}

/** The Lab's color edits: a swatch (role) replaced, or one key replaced. Values are '#rrggbb' or '#rrggbbaa'. */
export interface ColorEdits {
  swatches?: Record<string, string>;
  keys?: Record<string, string>;
}

/** A widget family a style group can restyle. */
export type GroupFamily = 'tabs' | 'lists' | 'buttons' | 'editorText';

/** Each family's label, the color keys in it, and the token rule names in it (editorText only). */
export const GROUP_FAMILIES: Readonly<Record<GroupFamily, { label: string; keys: readonly string[]; tokens: readonly string[] }>>;

/**
 * A style group as the builder applies it: roles maps a key or token rule name of the family
 * to an Editor swatch name, such as 'accent' or 'raised'. Entries outside the family are ignored.
 */
export interface StyleGroup {
  family: GroupFamily;
  roles: Record<string, string>;
}

export const LAB_THEME_LABEL: string;
export const LAB_THEME_FILE: string;
/** How many theme slots the build ships for saved library themes. */
export const SLOT_COUNT: number;
/** 'GigglyBits Theme <n>', the label of slot n (1 to SLOT_COUNT). */
export function slotLabel(n: number): string;
/** 'gigglybits-theme-<n>-color-theme.json', the theme file of slot n. */
export function slotFile(n: number): string;
/** The theme's colors and token rules with the style groups applied; a key edit wins over a group. */
export function labSettings(entry: BuilderEntry, chrome?: ChromeChoice, edits?: ColorEdits, groups?: readonly StyleGroup[]): LabSettings;
/** A key edit value that leaves the key to VS Code's default ('default', as colorCustomizations reads it). */
export const DEFAULT_COLOR: 'default';
/** edits with every value that is not a hex color dropped; a key edit may also be DEFAULT_COLOR. */
export function cleanEdits(edits: unknown): { swatches: Record<string, string>; keys: Record<string, string> };
