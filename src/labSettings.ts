// Settings edits for applying a Palette Lab candidate to VS Code. Pure functions over
// setting values, so they are unit-tested without the extension host.
//
// Try in VS Code writes the candidate's theme colors and token rules to user settings only,
// under "[GigglyBits Dark (Lab)]", which VS Code applies only while that theme is active, so
// other themes are untouched. The one workspace setting it may write is workbench.colorTheme,
// whenever a folder is open or the workspace has a theme of its own (src/themeLabPanel.ts
// tryThemeTarget). It also
// removes any workspace or folder copy of the Lab block, which would hide the Try (withoutLabScope).
import { LAB_THEME_LABEL, LEGACY_SLOT_COUNT, slotLabel } from '../scripts/theme-builder';

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
 * them to every theme, under each theme's own '[...]' blocks: every key not starting with '[' and
 * not in skip. [] for a non-object.
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

/**
 * Whether the theme name in a '[...]' settings key names settingsId. A '*' matches any run of
 * characters, so "[*Dark*]" names every theme whose id contains Dark (src/themeSource.ts
 * scopedBlocks uses it to find the blocks that apply to the active theme).
 */
export function themeNameMatches(pattern: string, settingsId: string): boolean {
  if (!pattern.includes('*')) {
    return pattern === settingsId;
  }
  const escaped = pattern.split('*').map(p => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(`^${escaped.join('.*')}$`).test(settingsId);
}

/** One level's values of the four settings colorOverrides reads. */
export interface Levels {
  /** workbench.colorCustomizations */
  colors?: unknown;
  /** editor.tokenColorCustomizations */
  tokens?: unknown;
  /** editor.semanticTokenColorCustomizations */
  semantic?: unknown;
  /** workbench.colorTheme */
  theme?: string;
}

export type OverrideSetting = 'workbench.colorCustomizations' | 'editor.tokenColorCustomizations' | 'editor.semanticTokenColorCustomizations';

/**
 * A setting that can change a GigglyBits theme's colors. kind 'one' is a block aimed at one
 * GigglyBits theme, 'several' a block whose key names more than one theme or a '*' pattern, and
 * 'every' semantic color rules not tied to any theme. count is how many colors or rules it sets.
 */
export interface ColorOverride {
  level: 'user' | 'workspace' | 'folder';
  folder?: string;
  setting: OverrideSetting;
  key: string;
  kind: 'one' | 'several' | 'every';
  count: number;
}

/** The GigglyBits theme labels colorOverrides knows: the Lab theme, the legacy slot labels, and each saved theme's label. */
export interface GigglyLabels {
  lab: string;
  legacy: string[];
  saved: string[];
}

/** LAB_THEME_LABEL and the twelve legacy slot labels, with no saved themes. */
export const defaultGigglyLabels = (): GigglyLabels => ({ lab: LAB_THEME_LABEL, legacy: Array.from({ length: LEGACY_SLOT_COUNT }, (_, i) => slotLabel(i + 1)), saved: [] });

/** How many colors or rules a block (or a semantic rules object) sets, by setting. */
function blockCount(setting: OverrideSetting, block: Settings): number {
  if (setting === 'workbench.colorCustomizations') {
    return Object.values(block).filter(v => typeof v === 'string').length;
  }
  if (setting === 'editor.tokenColorCustomizations') {
    const keys = Object.keys(block).filter(k => k !== 'textMateRules' && k !== 'semanticHighlighting').length;
    return keys + (Array.isArray(block.textMateRules) ? block.textMateRules.length : 0);
  }
  return isObject(block.rules) ? Object.keys(block.rules).length : 0;
}

/**
 * The settings that can change a GigglyBits theme's colors, from each level's values: every
 * '[...]' block naming a GigglyBits theme (under themeNameMatches) that GigglyBits did not write,
 * and every semantic `rules` object not tied to a theme. Skipped as GigglyBits' own: an exact Lab
 * or retired slot block in user colors or code colors (Try writes the Lab's; slot blocks written
 * before 2026-11-10 stay until the start-up migration removes them), and an exact retired slot or
 * saved-theme block in workspace colors (refreshProjectFrame owns those). Semantic highlighting
 * switched off (`enabled`) is never reported, and nothing with a count of 0 is returned. Order:
 * user, workspace, folders in input order; within a level colors, code colors, then semantic;
 * within a setting, key order.
 */
export function colorOverrides(input: { user: Levels; workspace: Levels; folders: { name: string; values: Levels }[]; labels: GigglyLabels }): ColorOverride[] {
  const labels = [input.labels.lab, ...input.labels.legacy, ...input.labels.saved];
  const userOwn = [input.labels.lab, ...input.labels.legacy];
  const folderOwn = [...input.labels.legacy, ...input.labels.saved];
  const out: ColorOverride[] = [];
  const levels: { level: ColorOverride['level']; folder?: string; values: Levels }[] = [
    { level: 'user', values: input.user },
    { level: 'workspace', values: input.workspace },
    ...input.folders.map(f => ({ level: 'folder' as const, folder: f.name, values: f.values })),
  ];
  for (const { level, folder, values } of levels) {
    const settings: [OverrideSetting, unknown][] = [
      ['workbench.colorCustomizations', values.colors],
      ['editor.tokenColorCustomizations', values.tokens],
      ['editor.semanticTokenColorCustomizations', values.semantic],
    ];
    for (const [setting, value] of settings) {
      if (!isObject(value)) { continue; }
      for (const [key, block] of Object.entries(value)) {
        let kind: ColorOverride['kind'];
        let count: number;
        if (key.startsWith('[')) {
          if (!isObject(block)) { continue; }
          const names = [...key.matchAll(/\[([^\]]+)\]/g)].map(m => m[1]);
          if (!names.some(n => labels.some(label => themeNameMatches(n, label)))) { continue; }
          kind = names.length > 1 || names.some(n => n.includes('*')) ? 'several' : 'one';
          if (kind === 'one') {
            const ours = level === 'user' && setting !== 'editor.semanticTokenColorCustomizations' && userOwn.includes(names[0])
              || level === 'workspace' && setting === 'workbench.colorCustomizations' && folderOwn.includes(names[0]);
            if (ours) { continue; }
          }
          count = blockCount(setting, block);
        } else if (setting === 'editor.semanticTokenColorCustomizations' && key === 'rules' && isObject(block)) {
          kind = 'every';
          count = Object.keys(block).length;
        } else {
          continue;
        }
        if (count > 0) {
          out.push({ level, ...(folder !== undefined ? { folder } : {}), setting, key, kind, count });
        }
      }
    }
  }
  return out;
}
