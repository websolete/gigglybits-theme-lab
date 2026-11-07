// Settings edits for applying a Palette Lab candidate to VS Code. Pure functions over
// setting values, so they are unit-tested without the extension host.
//
// Try in VS Code writes the candidate's theme colors and token rules to user settings only,
// under "[GigglyBits Dark (Lab)]", which VS Code applies only while that theme is active, so
// other themes are untouched. The one workspace setting it may write is workbench.colorTheme,
// when the workspace already sets its own theme (src/themeLabPanel.ts tryThemeTarget). It also
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
