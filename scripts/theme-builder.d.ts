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
}

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

export const LAB_THEME_LABEL: string;
export const LAB_THEME_FILE: string;
/** How many theme slots the build ships for saved library themes. */
export const SLOT_COUNT: number;
/** 'GigglyBits Theme <n>', the label of slot n (1 to SLOT_COUNT). */
export function slotLabel(n: number): string;
/** 'gigglybits-theme-<n>-color-theme.json', the theme file of slot n. */
export function slotFile(n: number): string;
export function labSettings(entry: BuilderEntry, chrome?: ChromeChoice, edits?: ColorEdits): LabSettings;
/** edits with every value that is not a hex color dropped. */
export function cleanEdits(edits: unknown): { swatches: Record<string, string>; keys: Record<string, string> };
