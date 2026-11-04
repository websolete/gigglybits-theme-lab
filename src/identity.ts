// Workspace identity: one color per folder, Peacock style, that follows the active theme.
// Pure functions over names, colors and setting values, so they are unit-tested without the
// extension host; src/identityController.ts does the VS Code side.
//
// The overlay is written to the workspace's workbench.colorCustomizations twice: unscoped, so
// it shows under any theme, and under "[GigglyBits*]", because a user-level theme-scoped block
// (the Palette Lab's design) overrides unscoped keys. docs/DEVELOPMENT.md, Identity write shape,
// has the live measurements behind that choice.

// Color math comes from media/shared.js, the same code the Palette Lab previews with.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const GB = require('../media/shared.js') as SharedColorMath;

interface Oklch { l: number; c: number; h: number }
interface SharedColorMath {
  hexToOklch(hex: string): Oklch | null;
  oklchToHex(color: Oklch): string;
  CHROME_REGIONS: Record<string, string>;
  chromeColors(options: { color: string; background?: string; regions?: string[] }): { overlay: Record<string, string> };
}

type Settings = Record<string, unknown>;

/** The regions an identity can fill, in the order Peacock users expect. */
export const IDENTITY_REGIONS: readonly string[] = Object.keys(GB.CHROME_REGIONS);

/** Every key the overlay can write, across all four regions. */
export const IDENTITY_KEYS: readonly string[] = Object.keys(GB.chromeColors({ color: '#808080', regions: [...IDENTITY_REGIONS] }).overlay);

/** The theme scopes the overlay is repeated under (Task 1's shape A). */
export const IDENTITY_SCOPES: readonly string[] = ['[GigglyBits*]'];

/** Where 0.0.6's Try in VS Code wrote identity; cleaned on every write. */
export const LEGACY_SCOPE = '[GigglyBits Dark (Lab)]';

/** The accent used when the active theme names no focusBorder: VS Code's default. */
export const DEFAULT_ACCENT = '#0078d4';

/** FNV-1a 32-bit hash of the UTF-8 name, mod 360. */
export function workspaceHue(name: string): number {
  let hash = 0x811c9dc5;
  for (const byte of Buffer.from(name, 'utf8')) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash % 360;
}

/** The golden-angle step: far from the last hue, and never back to it for a long while. */
export function nextHue(hue: number): number {
  return Math.round(hue + 137.5) % 360;
}

/** Eight hues: the given one, then each nextHue of the one before. */
export function suggestionHues(hue: number): number[] {
  const out = [hue];
  while (out.length < 8) { out.push(nextHue(out[out.length - 1])); }
  return out;
}

/**
 * The identity fill for a hue under a theme whose accent is accentHex: the accent's OKLCH
 * lightness clamped to 0.45-0.75 and its chroma raised to at least 0.08, at the given hue.
 */
export function harmonizedFill(hue: number, accentHex: string): string {
  const accent = GB.hexToOklch(accentHex) ?? GB.hexToOklch(DEFAULT_ACCENT)!;
  return GB.oklchToHex({ l: Math.min(0.75, Math.max(0.45, accent.l)), c: Math.max(accent.c, 0.08), h: hue });
}

/** The colorCustomizations keys for the fill over the chosen regions, Peacock style. */
export function identityOverlay(fill: string, regions: readonly string[], background?: string): Record<string, string> {
  return GB.chromeColors({ color: fill, background, regions: [...regions] }).overlay;
}

const isObject = (v: unknown): v is Settings => typeof v === 'object' && v !== null && !Array.isArray(v);
const isScope = (key: string) => key.startsWith('[') && key.endsWith(']');
const IDENTITY = new Set(IDENTITY_KEYS);

/** current with every identity key removed from the top level and the given scope blocks; a block left empty is dropped. */
function strip(current: unknown, scopes: readonly string[]): Settings {
  const keep = (obj: Settings) => Object.fromEntries(Object.entries(obj).filter(([k]) => !IDENTITY.has(k)));
  const out = keep(isObject(current) ? current : {});
  for (const scope of new Set([...scopes, LEGACY_SCOPE])) {
    const block = out[scope];
    if (!isObject(block)) { continue; }
    const kept = keep(block);
    if (Object.keys(kept).length) { out[scope] = kept; } else { delete out[scope]; }
  }
  return out;
}

/**
 * workbench.colorCustomizations with any earlier identity removed (top level, each scope and
 * the 0.0.6 Lab scope), then the overlay added at the top level and under each scope.
 * Other keys and blocks are kept.
 */
export function withIdentity(current: unknown, overlay: Record<string, string>, scopes: readonly string[] = IDENTITY_SCOPES): Settings {
  const out = strip(current, scopes);
  if (!Object.keys(overlay).length) { return out; }
  Object.assign(out, overlay);
  for (const scope of scopes) {
    out[scope] = { ...(isObject(out[scope]) ? out[scope] as Settings : {}), ...overlay };
  }
  return out;
}

/**
 * Whether current lacks part of the overlay for these regions: a key missing from the top level
 * or from a scope block, or a scope block absent. Presence only, never values, so a pinned
 * overlay whose border shades came from another theme's background still counts as complete.
 */
export function overlayIncomplete(current: unknown, regions: readonly string[], scopes: readonly string[] = IDENTITY_SCOPES): boolean {
  const keys = Object.keys(identityOverlay('#808080', regions));
  const settings = isObject(current) ? current : {};
  const blocks: unknown[] = [settings, ...scopes.map(scope => settings[scope])];
  return blocks.some(block => !isObject(block) || keys.some(key => !(key in block)));
}

/** workbench.colorCustomizations with everything identity wrote removed. */
export function withoutIdentity(current: unknown, scopes: readonly string[] = IDENTITY_SCOPES): Settings {
  return strip(current, scopes);
}

export interface OfferState {
  /** The workspace's own workbench.colorCustomizations value. */
  colorCustomizations: unknown;
  hue?: number;
  pinnedColor?: string;
  declined: boolean;
  offerOnOpen: boolean;
}

/**
 * Whether opening this folder should offer it a color: only when offers are on, the folder was
 * never declined, it has no identity yet, and nothing else (Peacock, the user) already colors
 * an identity key at the top level or in any theme scope.
 */
export function shouldOffer({ colorCustomizations, hue, pinnedColor, declined, offerOnOpen }: OfferState): boolean {
  if (!offerOnOpen || declined || typeof hue === 'number' || pinnedColor) { return false; }
  const settings = isObject(colorCustomizations) ? colorCustomizations : {};
  const blocks = [settings, ...Object.entries(settings).filter(([k, v]) => isScope(k) && isObject(v)).map(([, v]) => v as Settings)];
  return !blocks.some(block => Object.keys(block).some(k => IDENTITY.has(k)));
}
