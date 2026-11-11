import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import { readFileSync } from 'fs';
import * as path from 'path';
import { parse, ParseError, printParseErrorCode } from 'jsonc-parser';
import { starterFromRules, SyntaxColors } from '../scripts/theme-builder';
import { themeNameMatches } from './labSettings';
import { COMPANION_ID } from './themeLibrary';

/**
 * Where a declared value came from. Colors that VS Code resolves on its own
 * (registry defaults) are not declared anywhere, so the webview labels them
 * "default" when neither the theme nor the user settings mention the key.
 */
export type DeclaredSource = 'theme' | 'user';

export interface ColorEntry {
  value: string;
  /** Theme file (relative to its extension) or settings layer that declared it. */
  origin: string;
}

export interface TokenRule {
  scope: string;
  name?: string;
  foreground?: string;
  background?: string;
  fontStyle?: string;
  source: DeclaredSource;
  origin: string;
}

export interface SemanticRule {
  selector: string;
  foreground?: string;
  fontStyle?: string;
  source: DeclaredSource;
  origin: string;
}

/** A color key registered by an extension through contributes.colors. */
export interface ColorContribution {
  extensionId: string;
  extensionName: string;
  builtIn: boolean;
  description?: string;
  defaults?: Record<string, string | null>;
}

export interface ThemeSnapshot {
  /** Color keys registered by extensions. Keys absent here belong to VS Code itself. */
  contributions: Record<string, ColorContribution>;
  settingsId?: string;
  label?: string;
  uiTheme?: string;
  extensionId?: string;
  extensionName?: string;
  /** Theme files in load order: included base files first. */
  files: string[];
  themeColors: Record<string, ColorEntry>;
  userColors: Record<string, ColorEntry>;
  /** Theme rules first, then user rules. Later rules win. */
  tokenRules: TokenRule[];
  semanticRules: SemanticRule[];
  semanticHighlighting: {
    theme?: boolean;
    user?: boolean;
    setting: unknown;
    effective: boolean;
  };
  warnings: string[];
}

interface ThemeContribution {
  id?: string;
  label?: string;
  uiTheme?: string;
  path?: string;
}

interface FoundTheme {
  ext: vscode.Extension<unknown>;
  theme: ThemeContribution;
  settingsId: string;
  label: string;
}

const UI_THEME_KIND: Record<string, vscode.ColorThemeKind> = {
  'vs': vscode.ColorThemeKind.Light,
  'vs-dark': vscode.ColorThemeKind.Dark,
  'hc-black': vscode.ColorThemeKind.HighContrast,
  'hc-light': vscode.ColorThemeKind.HighContrastLight,
};

const PREFERRED_SETTING: Record<vscode.ColorThemeKind, string> = {
  [vscode.ColorThemeKind.Light]: 'preferredLightColorTheme',
  [vscode.ColorThemeKind.Dark]: 'preferredDarkColorTheme',
  [vscode.ColorThemeKind.HighContrast]: 'preferredHighContrastColorTheme',
  [vscode.ColorThemeKind.HighContrastLight]: 'preferredHighContrastLightColorTheme',
};

/** The shorthand keys of editor.tokenColorCustomizations, mapped the way VS Code maps them. */
const TOKEN_GROUP_SCOPES: Record<string, string[]> = {
  comments: ['comment', 'punctuation.definition.comment'],
  strings: ['string', 'meta.embedded.assembly'],
  keywords: ['keyword - keyword.operator', 'keyword.control', 'storage', 'storage.type'],
  numbers: ['constant.numeric'],
  types: ['entity.name.type', 'entity.name.class', 'support.type', 'support.class'],
  functions: ['entity.name.function', 'support.function'],
  variables: ['variable', 'entity.name.variable'],
};

/** Settings layers in increasing precedence. Folder-level values need a resource and are not read. */
const SETTING_LAYERS = [
  ['globalValue', 'User settings'],
  ['workspaceValue', 'Workspace settings'],
] as const;

type Json = Record<string, unknown>;

const isObject = (v: unknown): v is Json => !!v && typeof v === 'object' && !Array.isArray(v);

export async function captureThemeSnapshot(): Promise<ThemeSnapshot> {
  const snap: ThemeSnapshot = {
    contributions: await collectColorContributions(),
    files: [],
    themeColors: {},
    userColors: {},
    tokenRules: [],
    semanticRules: [],
    semanticHighlighting: { setting: undefined, effective: false },
    warnings: [],
  };

  const found = await findActiveTheme();
  if (found) {
    snap.settingsId = found.settingsId;
    snap.label = found.label;
    snap.uiTheme = found.theme.uiTheme;
    snap.extensionId = found.ext.id;
    const pkg = found.ext.packageJSON as Json;
    snap.extensionName = typeof pkg.displayName === 'string' ? await localize(pkg.displayName, found.ext.extensionPath) : found.ext.id;
    if (found.theme.path) {
      await loadThemeFile(path.join(found.ext.extensionPath, found.theme.path), found.ext.extensionPath, snap, 0);
    }
  } else {
    snap.warnings.push('Could not find the extension that contributes the active theme. Every color is shown as a VS Code default or user override.');
  }

  applyColorCustomizations(snap);
  applyTokenCustomizations(snap);
  applySemanticCustomizations(snap);
  resolveSemanticHighlighting(snap);
  return snap;
}

// ---------------------------------------------------------------------------
// Installed dark themes as syntax set starters
// ---------------------------------------------------------------------------

/** An installed dark theme's code colors, offered by the Theme Lab under Start set from. */
export interface InstalledSyntaxStarter {
  /** The theme id, else its label. */
  id: string;
  label: string;
  /** The contributing extension's display name, localized, else its id. */
  extension: string;
  colors: SyntaxColors;
}

let ownId: string | undefined;
/**
 * This extension's id ('<publisher>.<name>', lower case), read from its own package.json so it
 * follows the manifest; its own themes are never offered as starters. The bundle runs from
 * dist/ and the tests from src/, so the manifest is one folder up in both. '' when unreadable.
 */
export function ownExtensionId(): string {
  if (ownId === undefined) {
    try {
      const pkg = JSON.parse(readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')) as Json;
      ownId = typeof pkg.publisher === 'string' && typeof pkg.name === 'string' ? `${pkg.publisher}.${pkg.name}`.toLowerCase() : '';
    } catch {
      ownId = '';
    }
  }
  return ownId;
}

/**
 * Every vs-dark theme contributed by another extension, with the 13 syntax set colors read from
 * its token rules (theme-builder starterFromRules, include chain followed as loadThemeFile does).
 * A theme with no token rules is left out.
 */
export async function listInstalledSyntaxStarters(): Promise<InstalledSyntaxStarter[]> {
  const out: InstalledSyntaxStarter[] = [];
  for (const ext of vscode.extensions.all) {
    // GigglyBits' own themes, and the saved themes in its generated extension, are never starters.
    if (ext.id.toLowerCase() === ownExtensionId() || ext.id.toLowerCase() === COMPANION_ID.toLowerCase()) {
      continue;
    }
    const pkg = ext.packageJSON as Json;
    const contributes = pkg?.contributes;
    const themes = isObject(contributes) && Array.isArray(contributes.themes) ? (contributes.themes as ThemeContribution[]) : [];
    const darkThemes = themes.filter(t => t && t.uiTheme === 'vs-dark' && typeof t.path === 'string');
    if (!darkThemes.length) {
      continue;
    }
    const extension = (typeof pkg.displayName === 'string' ? await localize(pkg.displayName, ext.extensionPath) : undefined) ?? ext.id;
    for (const theme of darkThemes) {
      const label = (await localize(theme.label, ext.extensionPath)) ?? path.basename(theme.path as string);
      const snap: ThemeSnapshot = {
        contributions: {}, files: [], themeColors: {}, userColors: {}, tokenRules: [], semanticRules: [],
        semanticHighlighting: { setting: undefined, effective: false }, warnings: [],
      };
      await loadThemeFile(path.join(ext.extensionPath, theme.path as string), ext.extensionPath, snap, 0);
      if (!snap.tokenRules.length) {
        continue;
      }
      out.push({ id: theme.id ?? label, label, extension, colors: starterFromRules(snap.tokenRules, snap.themeColors['editor.foreground']?.value) });
    }
  }
  return out;
}

/** A color theme some installed extension contributes, as Change default lists it. */
export interface InstalledTheme {
  /** What workbench.colorTheme holds for it: the theme's id, else its label (findContribution). */
  id: string;
  label: string;
  /** The contributing extension's display name, localized, else its id. */
  extension: string;
}

/**
 * Every color theme every installed extension contributes, light, dark and high contrast, this
 * extension's own included, for the Theme Lab's Change default.
 */
export async function listInstalledThemes(): Promise<InstalledTheme[]> {
  const out: InstalledTheme[] = [];
  for (const ext of vscode.extensions.all) {
    const pkg = ext.packageJSON as Json;
    const contributes = pkg?.contributes;
    const themes = isObject(contributes) && Array.isArray(contributes.themes) ? (contributes.themes as ThemeContribution[]) : [];
    if (!themes.length) {
      continue;
    }
    const extension = (typeof pkg.displayName === 'string' ? await localize(pkg.displayName, ext.extensionPath) : undefined) ?? ext.id;
    for (const theme of themes) {
      if (!theme) { continue; }
      const label = (await localize(theme.label, ext.extensionPath)) ?? (theme.path ? path.basename(theme.path) : '');
      const id = theme.id ?? label;
      if (id) { out.push({ id, label: label || id, extension }); }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Color keys registered by extensions
// ---------------------------------------------------------------------------

async function collectColorContributions(): Promise<Record<string, ColorContribution>> {
  const out: Record<string, ColorContribution> = {};
  for (const ext of vscode.extensions.all) {
    const pkg = ext.packageJSON as Json;
    const contributes = pkg?.contributes;
    const colors = isObject(contributes) && Array.isArray(contributes.colors) ? contributes.colors : [];
    if (!colors.length) {
      continue;
    }
    const extensionName = (typeof pkg.displayName === 'string' ? await localize(pkg.displayName, ext.extensionPath) : undefined) ?? ext.id;
    for (const color of colors) {
      if (!isObject(color) || typeof color.id !== 'string') {
        continue;
      }
      out[color.id] = {
        extensionId: ext.id,
        extensionName,
        builtIn: ext.id.startsWith('vscode.'),
        description: typeof color.description === 'string' ? await localize(color.description, ext.extensionPath) : undefined,
        defaults: isObject(color.defaults) ? (color.defaults as Record<string, string | null>) : undefined,
      };
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Locating the active theme
// ---------------------------------------------------------------------------

async function findActiveTheme(): Promise<FoundTheme | undefined> {
  const wb = vscode.workspace.getConfiguration('workbench');
  const win = vscode.workspace.getConfiguration('window');
  const kind = vscode.window.activeColorTheme.kind;

  const selected = wb.get<string>('colorTheme');
  const preferred = wb.get<string>(PREFERRED_SETTING[kind]);
  // autoDetectHighContrast defaults to true but only matters while the OS is in high contrast,
  // which the active kind reflects; outside that, only autoDetectColorScheme picks the preferred theme.
  const highContrast = kind === vscode.ColorThemeKind.HighContrast || kind === vscode.ColorThemeKind.HighContrastLight;
  const autoDetect = highContrast ? win.get<boolean>('autoDetectHighContrast') : win.get<boolean>('autoDetectColorScheme');
  const candidates = (autoDetect ? [preferred, selected] : [selected, preferred]).filter((c): c is string => !!c);

  const matches: FoundTheme[] = [];
  for (const id of candidates) {
    const hit = await findContribution(id);
    if (hit) {
      matches.push(hit);
    }
  }
  // The setting can name a theme that is not the one on screen (for example when the OS
  // switched to high contrast), so prefer the candidate whose kind matches what is active.
  return matches.find(m => m.theme.uiTheme && UI_THEME_KIND[m.theme.uiTheme] === kind) ?? matches[0];
}

/**
 * Older settings name built-in themes "Default Dark Modern" where current builds use
 * "Dark Modern", so a second pass compares ids with that prefix and letter case ignored.
 */
const looseId = (s: string) => s.toLowerCase().replace(/^default /, '');

async function findContribution(settingsId: string): Promise<FoundTheme | undefined> {
  const all: FoundTheme[] = [];
  for (const ext of vscode.extensions.all) {
    const contributes = (ext.packageJSON as Json)?.contributes;
    const themes = isObject(contributes) && Array.isArray(contributes.themes) ? (contributes.themes as ThemeContribution[]) : [];
    for (const theme of themes) {
      const label = (await localize(theme.label, ext.extensionPath)) ?? (theme.path ? path.basename(theme.path) : '');
      const id = theme.id ?? label;
      if (id === settingsId || label === settingsId) {
        return { ext, theme, settingsId: id, label };
      }
      all.push({ ext, theme, settingsId: id, label });
    }
  }
  const wanted = looseId(settingsId);
  return all.find(t => looseId(t.settingsId) === wanted || looseId(t.label) === wanted);
}

const nlsCache = new Map<string, Json | null>();

/** Resolves a %placeholder% from the extension's package.nls.json, if the manifest was not already localized. */
async function localize(value: string | undefined, extPath: string): Promise<string | undefined> {
  const m = value ? /^%(.+)%$/.exec(value) : null;
  if (!m) {
    return value;
  }
  let bundle = nlsCache.get(extPath);
  if (bundle === undefined) {
    bundle = await readJsonc(path.join(extPath, 'package.nls.json'))
      .then(r => (isObject(r.data) ? r.data : null))
      .catch(() => null);
    nlsCache.set(extPath, bundle);
  }
  const entry = bundle?.[m[1]];
  if (typeof entry === 'string') {
    return entry;
  }
  if (isObject(entry) && typeof entry.message === 'string') {
    return entry.message;
  }
  return value;
}

// ---------------------------------------------------------------------------
// Reading theme files
// ---------------------------------------------------------------------------

async function readJsonc(file: string): Promise<{ data: unknown; errors: ParseError[] }> {
  const text = await fs.readFile(file, 'utf8');
  const errors: ParseError[] = [];
  const data = parse(text, errors, { allowTrailingComma: true });
  return { data, errors };
}

async function loadThemeFile(file: string, root: string, snap: ThemeSnapshot, depth: number): Promise<void> {
  const rel = path.relative(root, file).replace(/\\/g, '/');
  if (depth > 8) {
    snap.warnings.push(`Stopped following "include" at ${rel}: the chain is deeper than 8 files.`);
    return;
  }

  let parsed: { data: unknown; errors: ParseError[] };
  try {
    parsed = await readJsonc(file);
  } catch (err) {
    snap.warnings.push(`Could not read ${rel}: ${(err as Error).message}`);
    return;
  }
  if (parsed.errors.length) {
    snap.warnings.push(`${rel} has ${parsed.errors.length} JSON problem(s), first: ${printParseErrorCode(parsed.errors[0].error)} at offset ${parsed.errors[0].offset}.`);
  }
  const data = isObject(parsed.data) ? parsed.data : {};

  // Included files are the base layer, so they load first and this file overrides them.
  if (typeof data.include === 'string') {
    await loadThemeFile(path.join(path.dirname(file), data.include), root, snap, depth + 1);
  }
  snap.files.push(rel);

  if (isObject(data.colors)) {
    for (const [key, value] of Object.entries(data.colors)) {
      if (typeof value === 'string') {
        snap.themeColors[key] = { value, origin: rel };
      } else if (value === null) {
        delete snap.themeColors[key];
      }
    }
  }

  if (Array.isArray(data.tokenColors)) {
    addTokenRules(data.tokenColors, 'theme', rel, snap.tokenRules);
  } else if (typeof data.tokenColors === 'string') {
    snap.warnings.push(`${rel} loads token colors from "${data.tokenColors}" (a .tmTheme file), which this extension does not parse.`);
  }

  if (isObject(data.semanticTokenColors)) {
    addSemanticRules(data.semanticTokenColors, 'theme', rel, snap.semanticRules);
  }
  if (typeof data.semanticHighlighting === 'boolean') {
    snap.semanticHighlighting.theme = data.semanticHighlighting;
  }
}

function addTokenRules(rules: unknown[], source: DeclaredSource, origin: string, out: TokenRule[]): void {
  for (const rule of rules) {
    if (!isObject(rule)) {
      continue;
    }
    const settings = isObject(rule.settings) ? rule.settings : {};
    const scope = Array.isArray(rule.scope)
      ? rule.scope.join(', ')
      : typeof rule.scope === 'string'
        ? rule.scope
        : '(editor default)';
    out.push({
      scope,
      name: typeof rule.name === 'string' ? rule.name : undefined,
      foreground: str(settings.foreground),
      background: str(settings.background),
      fontStyle: str(settings.fontStyle),
      source,
      origin,
    });
  }
}

function addSemanticRules(rules: Json, source: DeclaredSource, origin: string, out: SemanticRule[]): void {
  for (const [selector, value] of Object.entries(rules)) {
    if (typeof value === 'string') {
      out.push({ selector, foreground: value, source, origin });
    } else if (isObject(value)) {
      const styles: string[] = [];
      if (typeof value.fontStyle === 'string' && value.fontStyle) {
        styles.push(value.fontStyle);
      }
      for (const flag of ['bold', 'italic', 'underline', 'strikethrough']) {
        if (value[flag] === true) {
          styles.push(flag);
        }
      }
      out.push({ selector, foreground: str(value.foreground), fontStyle: styles.join(' ') || undefined, source, origin });
    }
  }
}

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

// ---------------------------------------------------------------------------
// User settings layered on top of the theme
// ---------------------------------------------------------------------------

function settingLayers(section: string, key: string): { value: Json; label: string }[] {
  const info = vscode.workspace.getConfiguration(section).inspect<Json>(key);
  const layers: { value: Json; label: string }[] = [];
  for (const [prop, label] of SETTING_LAYERS) {
    const value = info?.[prop];
    if (isObject(value)) {
      layers.push({ value, label });
    }
  }
  return layers;
}

/** Theme-scoped blocks such as "[Default Dark Modern]" or "[*Dark*]" that apply to the active theme. */
function scopedBlocks(obj: Json, settingsId: string | undefined): { key: string; value: Json }[] {
  if (!settingsId) {
    return [];
  }
  const blocks: { key: string; value: Json }[] = [];
  for (const [key, value] of Object.entries(obj)) {
    if (!key.startsWith('[') || !isObject(value)) {
      continue;
    }
    const names = [...key.matchAll(/\[([^\]]+)\]/g)].map(m => m[1]);
    if (names.some(n => themeNameMatches(n, settingsId))) {
      blocks.push({ key, value });
    }
  }
  return blocks;
}

function applyColorCustomizations(snap: ThemeSnapshot): void {
  const layers = settingLayers('workbench', 'colorCustomizations');
  // VS Code applies the generic entries first, then the theme-scoped ones.
  for (const { value, label } of layers) {
    for (const [key, color] of Object.entries(value)) {
      if (!key.startsWith('[') && typeof color === 'string') {
        snap.userColors[key] = { value: color, origin: label };
      }
    }
  }
  for (const { value, label } of layers) {
    for (const block of scopedBlocks(value, snap.settingsId)) {
      for (const [key, color] of Object.entries(block.value)) {
        if (typeof color === 'string') {
          snap.userColors[key] = { value: color, origin: `${label} ${block.key}` };
        }
      }
    }
  }
}

function applyTokenCustomizations(snap: ThemeSnapshot): void {
  const layers = settingLayers('editor', 'tokenColorCustomizations');
  const applyBlock = (block: Json, origin: string) => {
    for (const [group, scopes] of Object.entries(TOKEN_GROUP_SCOPES)) {
      const v = block[group];
      if (typeof v === 'string') {
        snap.tokenRules.push({ scope: scopes.join(', '), name: group, foreground: v, source: 'user', origin });
      } else if (isObject(v)) {
        snap.tokenRules.push({ scope: scopes.join(', '), name: group, foreground: str(v.foreground), fontStyle: str(v.fontStyle), source: 'user', origin });
      }
    }
    if (Array.isArray(block.textMateRules)) {
      addTokenRules(block.textMateRules, 'user', origin, snap.tokenRules);
    }
  };
  for (const { value, label } of layers) {
    applyBlock(value, label);
  }
  for (const { value, label } of layers) {
    for (const block of scopedBlocks(value, snap.settingsId)) {
      applyBlock(block.value, `${label} ${block.key}`);
    }
  }
}

function applySemanticCustomizations(snap: ThemeSnapshot): void {
  const layers = settingLayers('editor', 'semanticTokenColorCustomizations');
  const applyBlock = (block: Json, origin: string) => {
    if (typeof block.enabled === 'boolean') {
      snap.semanticHighlighting.user = block.enabled;
    }
    if (isObject(block.rules)) {
      addSemanticRules(block.rules, 'user', origin, snap.semanticRules);
    }
  };
  for (const { value, label } of layers) {
    applyBlock(value, label);
  }
  for (const { value, label } of layers) {
    for (const block of scopedBlocks(value, snap.settingsId)) {
      applyBlock(block.value, `${label} ${block.key}`);
    }
  }
}

function resolveSemanticHighlighting(snap: ThemeSnapshot): void {
  const setting = vscode.workspace.getConfiguration('editor').get<unknown>('semanticHighlighting.enabled');
  const sh = snap.semanticHighlighting;
  sh.setting = setting;
  if (setting === true || setting === false) {
    sh.effective = setting;
  } else {
    sh.effective = sh.user ?? sh.theme ?? false;
  }
}
