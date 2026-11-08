// Settings edits for applying a Palette Lab candidate to VS Code. Pure functions over
// setting values, so they are unit-tested without the extension host.
//
// Try in VS Code writes the candidate's theme colors and token rules to user settings only,
// under "[GigglyBits Dark (Lab)]", which VS Code applies only while that theme is active, so
// other themes are untouched. The one workspace setting it may write is workbench.colorTheme,
// whenever a folder is open or the workspace has a theme of its own (src/themeLabPanel.ts
// tryThemeTarget). It also
// removes any workspace or folder copy of the Lab block, which would hide the Try (withoutLabScope).
import { LAB_THEME_LABEL } from '../scripts/theme-builder';

export const LAB_SCOPE = `[${LAB_THEME_LABEL}]`;

type Settings = Record<string, unknown>;

const isObject = (v: unknown): v is Settings => typeof v === 'object' && v !== null && !Array.isArray(v);

/** current with the Lab scope's block replaced by block; every other key kept. */
export function withLabScope(current: unknown, block: unknown): Settings {
  return { ...(isObject(current) ? current : {}), [LAB_SCOPE]: block };
}

/**
 * A workspace or folder value without its Lab scope block, or undefined when it has none.
 * The Lab theme's colors belong in user settings only; a copy at the workspace or folder level
 * outranks the user block key by key, so it hides every Try (Try removes it, themeLabPanel.ts).
 */
export function withoutLabScope(current: unknown): Settings | undefined {
  if (!isObject(current) || !Object.prototype.hasOwnProperty.call(current, LAB_SCOPE)) { return undefined; }
  return Object.fromEntries(Object.entries(current).filter(([key]) => key !== LAB_SCOPE));
}

/**
 * editor.tokenColorCustomizations keys left alone by the leftover check: semanticHighlighting is
 * an on/off switch, not a color.
 */
export const TOKEN_KEYS_KEPT = ['semanticHighlighting'];

/**
 * The keys of a color or token setting value that are not tied to any theme, so VS Code applies
 * them over every theme: every key not starting with '[' and not in skip. [] for a non-object.
 */
export function unscopedKeys(value: unknown, skip: string[] = []): string[] {
  if (!isObject(value)) { return []; }
  return Object.keys(value).filter(key => !key.startsWith('[') && !skip.includes(key));
}

/** value keeping only its theme blocks and the keep keys; undefined when nothing is left. */
function keptValue(value: unknown, keep: string[]): Settings | undefined {
  if (!isObject(value)) { return undefined; }
  const kept = Object.fromEntries(Object.entries(value).filter(([key]) => key.startsWith('[') || keep.includes(key)));
  return Object.keys(kept).length ? kept : undefined;
}

/**
 * What removing the user-level colors not tied to any theme leaves behind: undefined when
 * neither value has any; else how many there are, their keys (colors first), and the two values
 * with only their theme blocks (and, for tokens, TOKEN_KEYS_KEPT) kept, each undefined when
 * nothing is left.
 */
export function leftoverRemoval(colors: unknown, tokens: unknown):
  { count: number; keys: string[]; colors: Settings | undefined; tokens: Settings | undefined } | undefined {
  const keys = [...unscopedKeys(colors), ...unscopedKeys(tokens, TOKEN_KEYS_KEPT)];
  if (!keys.length) { return undefined; }
  return { count: keys.length, keys, colors: keptValue(colors, []), tokens: keptValue(tokens, TOKEN_KEYS_KEPT) };
}
