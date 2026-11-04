import { LAB_THEME_LABEL, SLOT_COUNT, slotLabel } from '../scripts/theme-builder';

/** A contributed theme as package.json lists it: the fields the Theme Lab reads. */
export interface ContributedTheme {
  label: string;
  path: string;
}

/** The palette a shipped theme was built from, as its file name encodes it. */
export type BuiltInPalette =
  | { id: string; source: 'generated'; rule: string; baseHue: number; lightness: number; chroma: number }
  | { id: string; source: 'pasted'; colors: string[] };

/** Labels the Shipped list leaves out: the Lab theme and the saved-theme slots. */
const UNLISTED = new Set([LAB_THEME_LABEL, ...Array.from({ length: SLOT_COUNT }, (_, i) => slotLabel(i + 1))]);

/**
 * The theme labels the Theme Lab lists, in their contributed order. GigglyBits Dark (Lab)
 * is left out: it exists only for Try in VS Code and holds whatever candidate was tried last.
 * So are the slots GigglyBits Theme 1 to 12, which hold saved themes (src/themeLibrary.ts).
 */
export function listedThemes(contributed: { label: string }[]): string[] {
  return contributed.map(t => t.label).filter(label => !UNLISTED.has(label));
}

const THEME_FILE = /(?:^|[\\/])gigglybits-dark-(.+)-color-theme\.json$/;
const GENERATED_ID = /^(.+)-h(\d+(?:\.\d+)?)-l(\d+(?:\.\d+)?)-c(\d+(?:\.\d+)?)$/;
const PASTED_ID = /^pasted-((?:[0-9a-f]{6}-)*[0-9a-f]{6})$/i;

/**
 * The palette a contributed theme's file name encodes, from its `path` in package.json.
 * themeFileName in scripts/theme-builder.js names each theme `gigglybits-dark-<paletteId>-color-theme.json`,
 * so this needs no catalog. Returns undefined for any other file name, such as the Lab theme.
 */
export function builtInPalette(themePath: string): BuiltInPalette | undefined {
  const file = THEME_FILE.exec(themePath);
  if (!file) {
    return undefined;
  }
  const id = file[1];
  const pasted = PASTED_ID.exec(id);
  if (pasted) {
    return { id, source: 'pasted', colors: pasted[1].split('-').map(hex => `#${hex.toLowerCase()}`) };
  }
  const generated = GENERATED_ID.exec(id);
  if (generated) {
    const [, rule, hue, lightness, chroma] = generated;
    return { id, source: 'generated', rule, baseHue: Number(hue), lightness: Number(lightness), chroma: Number(chroma) };
  }
  return undefined;
}

/** What the Theme Lab sends per listed theme in its `themes` message: the palette plus its name. */
export type ThemeBase = BuiltInPalette & { name: string };

/**
 * The `bases` object of the Theme Lab's `themes` message: keyed by listed label, each the
 * theme's builtInPalette plus `name`, the label's text inside the parentheses. A listed
 * theme whose file name encodes no palette gets no entry.
 */
export function themeBases(contributed: ContributedTheme[]): Record<string, ThemeBase> {
  const listed = new Set(listedThemes(contributed));
  const bases: Record<string, ThemeBase> = {};
  for (const theme of contributed) {
    if (!listed.has(theme.label)) {
      continue;
    }
    const palette = builtInPalette(theme.path);
    if (palette) {
      bases[theme.label] = { ...palette, name: /\(([^)]*)\)/.exec(theme.label)?.[1] ?? theme.label };
    }
  }
  return bases;
}
