// Settings edits for applying a Palette Lab candidate to VS Code. Pure functions over
// setting values, so they are unit-tested without the extension host.
//
// Try in VS Code writes user settings only: the candidate's theme colors and token rules go
// under "[GigglyBits Dark (Lab)]", which VS Code applies only while that theme is active, so
// other themes are untouched. It never writes workspace settings; a workspace's own color is
// the identity feature's job (src/identity.ts).
import { LAB_THEME_LABEL } from '../scripts/theme-builder';

export const LAB_SCOPE = `[${LAB_THEME_LABEL}]`;

type Settings = Record<string, unknown>;

const isObject = (v: unknown): v is Settings => typeof v === 'object' && v !== null && !Array.isArray(v);

/** current with the Lab scope's block replaced by block; every other key kept. */
export function withLabScope(current: unknown, block: unknown): Settings {
  return { ...(isObject(current) ? current : {}), [LAB_SCOPE]: block };
}
