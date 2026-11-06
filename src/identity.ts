// The old per-folder color (gigglybits.identity.*), retired into project frames: a project's
// color now lives in its theme's frame. Pure functions over setting values, so they are
// unit-tested without the extension host; src/identityController.ts does the VS Code side.
//
// Earlier versions wrote the color to the workspace's workbench.colorCustomizations twice:
// unscoped, so it showed under any theme, and under "[GigglyBits*]", because a user-level
// theme-scoped block overrides unscoped keys. Nothing writes that overlay any more; these
// functions find it and remove it. docs/DEVELOPMENT.md, Identity write shape, records the shape.

// Color math comes from media/shared.js, the same code the Theme Lab previews with.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const GB = require('../media/shared.js') as SharedColorMath;

interface SharedColorMath {
  CHROME_REGIONS: Record<string, string>;
  chromeColors(options: { color: string; background?: string; regions?: string[] }): { overlay: Record<string, string> };
}

type Settings = Record<string, unknown>;

/** The regions the old overlay could fill. */
export const IDENTITY_REGIONS: readonly string[] = Object.keys(GB.CHROME_REGIONS);

/** Every key the old overlay could write, across all four regions. */
export const IDENTITY_KEYS: readonly string[] = Object.keys(GB.chromeColors({ color: '#808080', regions: [...IDENTITY_REGIONS] }).overlay);

/** The theme scopes the old overlay was repeated under. */
export const IDENTITY_SCOPES: readonly string[] = ['[GigglyBits*]'];

/** Where 0.0.6's Try in VS Code wrote identity; cleaned with the rest. */
export const LEGACY_SCOPE = '[GigglyBits Dark (Lab)]';

/** The colorCustomizations keys the old overlay wrote for a fill over the chosen regions. */
export function identityOverlay(fill: string, regions: readonly string[], background?: string): Record<string, string> {
  return GB.chromeColors({ color: fill, background, regions: [...regions] }).overlay;
}

const isObject = (v: unknown): v is Settings => typeof v === 'object' && v !== null && !Array.isArray(v);
const IDENTITY = new Set(IDENTITY_KEYS);
const HEX6 = /^#[0-9a-f]{6}$/i;

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
 * workbench.colorCustomizations as the old overlay wrote it: any earlier identity removed, then
 * the overlay at the top level and under each scope. Kept so tests can build the settings a
 * folder still holds from an earlier version.
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

/** workbench.colorCustomizations with everything the old overlay wrote removed. */
export function withoutIdentity(current: unknown, scopes: readonly string[] = IDENTITY_SCOPES): Settings {
  return strip(current, scopes);
}

/** The bar keys an old color is read from, in order. */
const OLD_COLOR_KEYS = ['titleBar.activeBackground', 'statusBar.background', 'activityBar.background'];

/**
 * The old color VS Code still draws in this folder: the first of the title bar, status bar and
 * activity bar backgrounds in the "[GigglyBits*]" block, which applies over every GigglyBits
 * theme's frame; else undefined. Top-level keys are not read: the old overlay wrote them too,
 * but so do other extensions such as Peacock, and a project theme's own "[GigglyBits Theme N]"
 * block beats them, so a top-level bar color is neither ours to claim nor drawn over the frame.
 */
export function drawnOldColor(colorCustomizations: unknown): string | undefined {
  const settings = isObject(colorCustomizations) ? colorCustomizations : {};
  const block = settings[IDENTITY_SCOPES[0]];
  if (!isObject(block)) { return undefined; }
  for (const key of OLD_COLOR_KEYS) {
    const value = block[key];
    if (typeof value === 'string' && HEX6.test(value)) { return value.toLowerCase(); }
  }
  return undefined;
}

/**
 * The folder's old color, for the one-time offer and its cleanup: a hex pinnedColor, which
 * nothing draws any more; else drawnOldColor. A hue identity is found through the overlay it
 * wrote, because its color depended on the theme active when it was written, so the hue itself
 * is not needed.
 */
export function oldFolderColor(colorCustomizations: unknown, pinnedColor?: string, _hue?: number): string | undefined {
  if (typeof pinnedColor === 'string' && HEX6.test(pinnedColor)) { return pinnedColor.toLowerCase(); }
  return drawnOldColor(colorCustomizations);
}

/** Whether to offer this folder a project theme in its old color: a folder, a color, not offered before. */
export function shouldOfferMigration({ hasFolder, color, offered }: { hasFolder: boolean; color: string | undefined; offered: boolean }): boolean {
  return hasFolder && typeof color === 'string' && !offered;
}
