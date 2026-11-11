import * as vscode from 'vscode';
import { labPageHtml, labWebviewOptions, PreviewState, ThemePreviewPanel } from './themePreviewPanel';
import { colorOverrides, ColorOverride, defaultGigglyLabels, Levels, OverrideSetting, TOKEN_KEYS_KEPT, unscopedKeys, withLabScope, withoutLabScope } from './labSettings';
import { captureThemeSnapshot, InstalledSyntaxStarter, InstalledTheme, listInstalledSyntaxStarters, listInstalledThemes } from './themeSource';
import { BuilderEntry, ChromeChoice, cleanEdits, LAB_THEME_LABEL, labSettings } from '../scripts/theme-builder';
import { parseTryRecord, startConfig } from './labStart';
import { parseDesign, themeLabel } from './themeLibrary';
import { ThemeLibraryController, UseTarget } from './themeLibraryController';
import { affectsModernUI, modernUISettings } from './modernUI';

type FromWebview =
  | { type: 'ready' }
  | { type: 'copy'; text: string }
  | { type: 'applyPalette'; entry: BuilderEntry; chrome: ChromeChoice; edits?: unknown; settings?: unknown }
  | { type: 'saveTheme'; name: string; design: unknown }
  | { type: 'useTheme'; id: string; where: UseTarget }
  | { type: 'deleteTheme'; id: string }
  | { type: 'saveSyntaxSet'; id?: unknown; name: unknown; colors: unknown }
  | { type: 'deleteSyntaxSet'; id: unknown }
  | { type: 'setDefaultSyntaxSet'; id: unknown }
  | { type: 'previewState'; palette: unknown; syntaxSets: unknown }
  | { type: 'previewHighlight'; keys: unknown }
  | { type: 'showWhere'; keys: unknown }
  | { type: 'openPreviewWindow' }
  | { type: 'changeDefaultTheme' }
  | { type: 'removeLeftovers' }
  | { type: 'removeOverride'; level: unknown; folder?: unknown; setting: unknown; key: unknown }
  | { type: 'openOverrideFile'; level: unknown; folder?: unknown };

/** The settings colorOverrides reads, by its Levels field. */
const OVERRIDE_SETTINGS: Record<'colors' | 'tokens' | 'semantic', OverrideSetting> = {
  colors: 'workbench.colorCustomizations',
  tokens: 'editor.tokenColorCustomizations',
  semantic: 'editor.semanticTokenColorCustomizations',
};

/** How a modal or status message names a level: 'your user settings', 'the app folder settings'. */
const whereText = (level: ColorOverride['level'], folder?: string): string =>
  level === 'user' ? 'your user settings' : level === 'workspace' ? 'your workspace settings' : `the ${folder} folder settings`;

/** Which theme this window shows and where that comes from, and the user default theme. */
export interface ThemeScope {
  window: { label: string | null; source: 'project' | 'default' | 'vscode' };
  defaultTheme: string | null;
}

/**
 * The step 1 theme-scope line's facts from workbench.colorTheme's layers: a folder or workspace
 * value is this project's theme, else the user value is the default every new window follows,
 * else VS Code's own default applies (label null).
 */
export function themeScopeOf(theme: { globalValue?: string; workspaceValue?: string; workspaceFolderValue?: string } | undefined): ThemeScope {
  const defaultTheme = theme?.globalValue ?? null;
  const project = theme?.workspaceFolderValue ?? theme?.workspaceValue;
  if (project) { return { window: { label: project, source: 'project' }, defaultTheme }; }
  if (defaultTheme) { return { window: { label: defaultTheme, source: 'default' }, defaultTheme }; }
  return { window: { label: null, source: 'vscode' }, defaultTheme: null };
}

/** The string-valued entries of colors, or undefined when colors is not an object. */
function colorMap(colors: unknown): Record<string, string> | undefined {
  if (typeof colors !== 'object' || colors === null || Array.isArray(colors)) { return undefined; }
  return Object.fromEntries(Object.entries(colors).filter(([, v]) => typeof v === 'string')) as Record<string, string>;
}

/**
 * The identity controller as the Theme Lab sees it: it says whether this folder still has an
 * old per-folder color, and fires when that or the active theme changes.
 */
export interface IdentityTarget {
  current(): Promise<{ fill: string } | undefined>;
  onDidChange: vscode.Event<'identity' | 'theme'>;
}

/** Make project theme's starting point: a frame and a name for the Lab (media/palette.js seedFrame). */
export interface FrameSeed {
  frame: { color: string; style: 'filled' | 'dark' };
  name: string;
}

/** A message's key list: its strings only, at most 1000. */
const keyList = (keys: unknown): string[] => (Array.isArray(keys) ? keys.filter((k): k is string => typeof k === 'string').slice(0, 1000) : []);

/** A FrameSeed from the gigglybits.openThemeLab argument, or undefined when it is not one. */
export function parseFrameSeed(value: unknown): FrameSeed | undefined {
  if (typeof value !== 'object' || value === null) { return undefined; }
  const v = value as { frame?: { color?: unknown; style?: unknown }; name?: unknown };
  const color = v.frame?.color;
  if (typeof color !== 'string' || !/^#[0-9a-f]{6}$/i.test(color)) { return undefined; }
  const style = v.frame?.style === 'dark' ? 'dark' : 'filled';
  return { frame: { color: color.toLowerCase(), style }, name: typeof v.name === 'string' ? v.name : '' };
}

/** globalState key holding the last Try in VS Code's settings (src/labStart.ts TryRecord). */
const LAST_TRY_KEY = 'gigglybits.themeLab.lastTry';

/**
 * Where Try in VS Code switches workbench.colorTheme: this project whenever a folder is open,
 * or when a workspace with no folders has a theme of its own, so a Try changes only this
 * window's project; otherwise the user settings, which every window without a theme of its own
 * follows. `previous` is the theme at that level, which Back restores; undefined at the project
 * level means the project had no theme, and Back removes the project's setting. A folder-level
 * value keeps the user level, as it did before project-level Try.
 */
export function tryThemeTarget(theme: { globalValue?: string; workspaceValue?: string; workspaceFolderValue?: string } | undefined,
  hasFolder: boolean): { level: 'workspace' | 'user'; previous: string | undefined } {
  if ((hasFolder || theme?.workspaceValue) && !theme?.workspaceFolderValue) { return { level: 'workspace', previous: theme?.workspaceValue }; }
  return { level: 'user', previous: theme?.globalValue };
}

/**
 * Why setting workbench.colorTheme to `label` in user settings may not show it: a workspace
 * theme setting wins over the user one, and auto-detect picks the theme from the OS instead.
 * Try in VS Code uses this.
 */
function themeOverrideNotes(theme: { workspaceValue?: string; workspaceFolderValue?: string } | undefined, label: string): string[] {
  const notes: string[] = [];
  const override = theme?.workspaceFolderValue ?? theme?.workspaceValue;
  if (override && override !== label) {
    notes.push(`This workspace sets its own theme (${override}), which wins over the user setting.`);
  }
  if (vscode.workspace.getConfiguration().get<boolean>('window.autoDetectColorScheme')) {
    notes.push('window.autoDetectColorScheme is on, so VS Code picks the theme from the OS setting instead.');
  }
  const kind = vscode.window.activeColorTheme.kind;
  if (vscode.workspace.getConfiguration().get<boolean>('window.autoDetectHighContrast')
    && (kind === vscode.ColorThemeKind.HighContrast || kind === vscode.ColorThemeKind.HighContrastLight)) {
    notes.push('A high contrast theme is showing and window.autoDetectHighContrast is on, so while your system is in high contrast mode VS Code keeps a high contrast theme on screen instead.');
  }
  return notes;
}

/**
 * An editor-tab webview for building, trying and picking a GigglyBits theme. It holds the
 * Palette Lab (media/palette.js), whose preview is drawn in the Theme Preview window.
 */
export class ThemeLabPanel {
  static readonly viewType = 'gigglybits.themeLab';
  private static current: ThemeLabPanel | undefined;

  private readonly disposables: vscode.Disposable[] = [];
  /** The page's latest 'previewState', which the Theme Preview opens with. */
  private previewState: PreviewState | undefined;
  /** A Make project theme seed, posted once after the ready sequence's 'start'. */
  private pendingSeed: FrameSeed | undefined;
  /**
   * Set on a fresh open: the first 'ready' opens the Theme Preview window, the Lab's only
   * preview. A later 'ready' (the page reloading) or a revived panel leaves it closed if the
   * user closed it; the Lab's Open Preview opens it again.
   */
  private openWindowOnReady = false;

  /** `globalState` is the extension's, where Try in VS Code records the tried settings. */
  static show(extensionUri: vscode.Uri, identity: IdentityTarget, globalState: vscode.Memento, library: ThemeLibraryController, seed?: FrameSeed): void {
    if (ThemeLabPanel.current) {
      ThemeLabPanel.current.panel.reveal();
      if (seed) { void ThemeLabPanel.current.panel.webview.postMessage({ type: 'frameSeed', ...seed }); }
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      ThemeLabPanel.viewType,
      'Theme Lab',
      vscode.ViewColumn.Active,
      ThemeLabPanel.webviewOptions(extensionUri),
    );
    ThemeLabPanel.current = new ThemeLabPanel(panel, extensionUri, identity, globalState, library);
    ThemeLabPanel.current.pendingSeed = seed;
    ThemeLabPanel.current.openWindowOnReady = true;
  }

  /** Restores a panel that was open when the window reloaded. */
  static revive(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, identity: IdentityTarget, globalState: vscode.Memento, library: ThemeLibraryController): void {
    panel.webview.options = ThemeLabPanel.webviewOptions(extensionUri);
    ThemeLabPanel.current = new ThemeLabPanel(panel, extensionUri, identity, globalState, library);
  }

  private static webviewOptions(extensionUri: vscode.Uri): vscode.WebviewOptions {
    return labWebviewOptions(extensionUri);
  }

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    private readonly extensionUri: vscode.Uri,
    private readonly identity: IdentityTarget,
    private readonly globalState: vscode.Memento,
    private readonly library: ThemeLibraryController,
  ) {
    panel.webview.html = this.html(panel.webview);

    this.disposables.push(
      panel.onDidDispose(() => this.dispose()),
      panel.webview.onDidReceiveMessage((msg: FromWebview) => this.onMessage(msg)),
      // A change to this folder's colors (an old color added or removed) or to the active theme.
      identity.onDidChange(kind => void this.postIdentity(kind === 'identity')),
      vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('gigglybits.library') || e.affectsConfiguration('gigglybits.syntaxSets')) {
          void this.postLibrary();
        }
        if (affectsModernUI(e)) {
          void this.postModernUI();
        }
        if (e.affectsConfiguration('workbench.colorTheme')) {
          void this.postThemeScope();
        }
        if (e.affectsConfiguration('workbench.colorCustomizations') || e.affectsConfiguration('editor.tokenColorCustomizations')) {
          void this.postLeftovers();
        }
        if (e.affectsConfiguration('workbench.colorCustomizations') || e.affectsConfiguration('editor.tokenColorCustomizations')
          || e.affectsConfiguration('editor.semanticTokenColorCustomizations') || e.affectsConfiguration('workbench.colorTheme')) {
          void this.postOverrides();
        }
      }),
      // An extension installed, removed or updated can add or drop dark themes.
      vscode.extensions.onDidChange(() => void this.postInstalledStarters()),
    );
  }

  /** The installed dark themes' syntax set starters (src/themeSource.ts), or none when reading them fails. */
  private async postInstalledStarters(): Promise<void> {
    let starters: InstalledSyntaxStarter[];
    try {
      starters = await listInstalledSyntaxStarters();
    } catch {
      starters = [];
    }
    await this.panel.webview.postMessage({ type: 'installedStarters', starters });
  }

  /** The saved themes, the syntax sets, and whether a folder is open, which decides whether Use in this project is offered. */
  private async postLibrary(): Promise<void> {
    await this.panel.webview.postMessage({
      type: 'library', themes: this.library.library(), syntaxSets: this.library.syntaxSets(), hasFolder: this.library.hasFolder(),
    });
  }

  /**
   * The active theme's label, from captureThemeSnapshot(); 'ready' decides the start palette
   * from it. Undefined when the
   * snapshot fails.
   */
  private async activeTheme(): Promise<string | undefined> {
    try {
      return (await captureThemeSnapshot()).label;
    } catch {
      return undefined;
    }
  }

  /** This folder's old color, or null with none; `changed` marks a settings change. */
  private async postIdentity(changed: boolean): Promise<void> {
    let identity: { fill: string } | null;
    try {
      identity = (await this.identity.current()) ?? null;
    } catch {
      identity = null;
    }
    await this.panel.webview.postMessage({ type: 'identity', identity, changed });
  }

  /** Step 1's theme-scope line: this window's theme, where it is set, and the default (themeScopeOf). */
  private async postThemeScope(): Promise<void> {
    const theme = vscode.workspace.getConfiguration().inspect<string>('workbench.colorTheme');
    await this.panel.webview.postMessage({ type: 'themeScope', ...themeScopeOf(theme) });
  }

  /**
   * Step 1's leftover-color note: the user-level color and token keys not tied to any theme,
   * which VS Code applies over every theme (unscopedKeys). Workspace values are not read.
   */
  private async postLeftovers(): Promise<void> {
    const cfg = vscode.workspace.getConfiguration();
    await this.panel.webview.postMessage({
      type: 'leftovers',
      colors: unscopedKeys(cfg.inspect('workbench.colorCustomizations')?.globalValue),
      tokens: unscopedKeys(cfg.inspect('editor.tokenColorCustomizations')?.globalValue, TOKEN_KEYS_KEPT),
    });
  }

  /**
   * The settings that can change a GigglyBits theme's colors (colorOverrides), from each level's
   * values: user, workspace, and, in a multi-root workspace, each folder's own settings file, as
   * removeShadowingLabColors reads them. VS Code 1.145 returns no folder value for these window
   * settings in a multi-root workspace (live check 2026-11-09, docs/DEVELOPMENT.md), so in practice
   * no folder item appears.
   */
  private overrideItems(): ColorOverride[] {
    const levelsOf = (cfg: vscode.WorkspaceConfiguration, prop: 'globalValue' | 'workspaceValue' | 'workspaceFolderValue'): Levels => ({
      colors: cfg.inspect(OVERRIDE_SETTINGS.colors)?.[prop],
      tokens: cfg.inspect(OVERRIDE_SETTINGS.tokens)?.[prop],
      semantic: cfg.inspect(OVERRIDE_SETTINGS.semantic)?.[prop],
      theme: cfg.inspect<string>('workbench.colorTheme')?.[prop],
    });
    const root = vscode.workspace.getConfiguration();
    const folders = vscode.workspace.workspaceFile
      ? (vscode.workspace.workspaceFolders ?? []).map(f => ({ name: f.name, values: levelsOf(vscode.workspace.getConfiguration(undefined, f.uri), 'workspaceFolderValue') }))
      : [];
    const labels = { ...defaultGigglyLabels(), saved: this.library.library().map(themeLabel) };
    return colorOverrides({ user: levelsOf(root, 'globalValue'), workspace: levelsOf(root, 'workspaceValue'), folders, labels });
  }

  /** Step 1's overrides note: the settings that can change a GigglyBits theme's colors. */
  private async postOverrides(): Promise<void> {
    await this.panel.webview.postMessage({ type: 'overrides', items: this.overrideItems() });
  }

  /**
   * Remove on a listed block aimed at one GigglyBits theme: after a modal, writes that level's
   * value without the block (undefined when nothing is left). A message naming anything other
   * than a current kind 'one' item does nothing, so a wildcard block or every-theme rules are
   * never removed from here.
   */
  private async removeOverride(msg: { level: unknown; folder?: unknown; setting: unknown; key: unknown }): Promise<void> {
    const item = this.overrideItems().find(i => i.kind === 'one' && i.level === msg.level && i.setting === msg.setting
      && i.key === msg.key && (i.level !== 'folder' || i.folder === msg.folder));
    if (!item) { return; }
    const where = whereText(item.level, item.folder);
    const label = item.key.slice(1, -1);
    const choice = await vscode.window.showWarningMessage(`Remove "${item.key}" from ${where}?`,
      { modal: true, detail: `This block applies only to ${label}, so no other theme changes.` }, 'Remove');
    if (choice !== 'Remove') { return; }
    let cfg = vscode.workspace.getConfiguration();
    let prop: 'globalValue' | 'workspaceValue' | 'workspaceFolderValue' = 'globalValue';
    let target = vscode.ConfigurationTarget.Global;
    if (item.level === 'workspace') {
      prop = 'workspaceValue';
      target = vscode.ConfigurationTarget.Workspace;
    } else if (item.level === 'folder') {
      const folder = (vscode.workspace.workspaceFolders ?? []).find(f => f.name === item.folder);
      if (!folder) { return; }
      cfg = vscode.workspace.getConfiguration(undefined, folder.uri);
      prop = 'workspaceFolderValue';
      target = vscode.ConfigurationTarget.WorkspaceFolder;
    }
    // Read again: the modal may have stayed open while the value changed.
    const current = cfg.inspect(item.setting)?.[prop];
    if (typeof current !== 'object' || current === null || Array.isArray(current) || !(item.key in current)) { return; }
    const next = Object.fromEntries(Object.entries(current).filter(([key]) => key !== item.key));
    await cfg.update(item.setting, Object.keys(next).length ? next : undefined, target);
    vscode.window.setStatusBarMessage(`Removed "${item.key}" from ${where}.`, 5000);
  }

  /**
   * Open file on a listed setting: the user or workspace settings JSON through VS Code's own
   * commands (both present in VS Code 1.145, docs/DEVELOPMENT.md), or the folder's
   * .vscode/settings.json.
   */
  private async openOverrideFile(msg: { level: unknown; folder?: unknown }): Promise<void> {
    if (msg.level === 'user') {
      await vscode.commands.executeCommand('workbench.action.openSettingsJson');
    } else if (msg.level === 'workspace') {
      await vscode.commands.executeCommand('workbench.action.openWorkspaceSettingsFile');
    } else if (msg.level === 'folder') {
      const folder = (vscode.workspace.workspaceFolders ?? []).find(f => f.name === msg.folder);
      if (folder) { await vscode.window.showTextDocument(vscode.Uri.joinPath(folder.uri, '.vscode', 'settings.json')); }
    }
  }

  /**
   * Change default: a quick pick of every installed theme (listInstalledThemes), the current
   * default marked; a pick becomes the user-level workbench.colorTheme, a dismissal writes nothing.
   */
  private async changeDefaultTheme(): Promise<void> {
    let themes: InstalledTheme[];
    try {
      themes = await listInstalledThemes();
    } catch {
      themes = [];
    }
    const cfg = vscode.workspace.getConfiguration();
    const current = cfg.inspect<string>('workbench.colorTheme')?.globalValue;
    const items = themes.map(t => ({ label: t.label, description: t.id === current ? 'current default' : undefined, id: t.id }));
    const pick = await vscode.window.showQuickPick(items, { placeHolder: 'Pick the theme new windows use' });
    if (pick) {
      await cfg.update('workbench.colorTheme', pick.id, vscode.ConfigurationTarget.Global);
    }
  }

  /** VS Code's modern UI settings, which the Workbench preview draws with (src/modernUI.ts). */
  private async postModernUI(): Promise<void> {
    await this.panel.webview.postMessage({ type: 'modernUI', modernUI: modernUISettings() });
  }

  private async onMessage(msg: FromWebview): Promise<void> {
    switch (msg.type) {
      case 'ready': {
        await this.postModernUI();
        // A freshly opened Lab opens the Theme Preview window, where its preview is drawn.
        if (this.openWindowOnReady) {
          this.openWindowOnReady = false;
          if (!ThemePreviewPanel.isOpen()) { await this.openPreviewWindow(); }
        }
        // The page's Preview card says whether the window is open.
        await this.postDetached();
        // The page applies 'start' and the first 'identity' only on a fresh open, not a revive.
        const start = startConfig(await this.activeTheme(), this.globalState.get(LAST_TRY_KEY), this.library.library());
        await this.postLibrary();
        await this.panel.webview.postMessage({ type: 'start', start });
        await this.postThemeScope();
        await this.postLeftovers();
        await this.postOverrides();
        if (this.pendingSeed) {
          await this.panel.webview.postMessage({ type: 'frameSeed', ...this.pendingSeed });
          this.pendingSeed = undefined;
        }
        await this.postIdentity(false);
        await this.postInstalledStarters();
        break;
      }
      case 'saveTheme': {
        const design = parseDesign(msg.design);
        const name = typeof msg.name === 'string' ? msg.name.trim() : '';
        if (!design || !name) {
          vscode.window.showErrorMessage('Could not save the theme: it needs a name and a complete design.');
          break;
        }
        await this.library.saveSafely(name, design);
        break;
      }
      case 'useTheme':
        if (msg.where === 'project' || msg.where === 'everywhere') {
          await this.library.useSafely(msg.id, msg.where);
        }
        break;
      case 'deleteTheme':
        await this.library.deleteSafely(msg.id);
        break;
      case 'saveSyntaxSet': {
        const name = typeof msg.name === 'string' ? msg.name.trim() : '';
        const colors = colorMap(msg.colors);
        if (!name || !colors) {
          vscode.window.showErrorMessage('Could not save the syntax set: it needs a name and its colors.');
          break;
        }
        await this.library.saveSyntaxSetSafely({ ...(typeof msg.id === 'string' && msg.id ? { id: msg.id } : {}), name, colors });
        break;
      }
      case 'deleteSyntaxSet':
        if (typeof msg.id === 'string') {
          await this.library.deleteSyntaxSetSafely(msg.id);
        }
        break;
      case 'setDefaultSyntaxSet':
        if (typeof msg.id === 'string' || msg.id === null) {
          await this.library.setDefaultSyntaxSetSafely(msg.id);
        }
        break;
      case 'copy':
        await vscode.env.clipboard.writeText(msg.text);
        vscode.window.setStatusBarMessage(`Copied ${msg.text}`, 2500);
        break;
      case 'applyPalette':
        await this.applyPalette(msg.entry, msg.chrome, msg.edits, msg.settings);
        break;
      case 'previewState':
        this.previewState = { palette: msg.palette, syntaxSets: msg.syntaxSets };
        ThemePreviewPanel.update(this.previewState);
        break;
      case 'previewHighlight':
        // The Roles step's open role: outline its parts in the preview, leaving its scroll alone.
        ThemePreviewPanel.highlight(keyList(msg.keys));
        break;
      case 'showWhere':
        // A role's Show where: bring the preview window forward, opening it if it is closed, then
        // outline the role's parts there; the page scrolls to the first.
        await this.openPreviewWindow();
        await this.postDetached();
        ThemePreviewPanel.highlight(keyList(msg.keys), true);
        break;
      case 'openPreviewWindow':
        await this.openPreviewWindow();
        await this.postDetached();
        break;
      case 'changeDefaultTheme':
        await this.changeDefaultTheme();
        break;
      case 'removeLeftovers':
        await this.library.removeLeftoversSafely();
        break;
      case 'removeOverride':
        try {
          await this.removeOverride(msg);
        } catch (err) {
          vscode.window.showErrorMessage(`Could not remove the setting: ${(err as Error).message}`);
        }
        break;
      case 'openOverrideFile':
        try {
          await this.openOverrideFile(msg);
        } catch (err) {
          vscode.window.showErrorMessage(`Could not open the settings file: ${(err as Error).message}`);
        }
        break;
    }
  }

  /**
   * Opens the Theme Preview window, or reveals the open one. Picks go to whichever Theme Lab is
   * open when the part is clicked, which after a reload is the revived one rather than this one.
   * Closing the Lab closes the window (dispose). When the window closes on its own, the page's
   * Preview card says so and offers Open Preview.
   */
  private async openPreviewWindow(): Promise<void> {
    await ThemePreviewPanel.open(this.extensionUri, this.previewState, ThemeLabPanel.pickFromPreview, ThemeLabPanel.previewClosed);
  }

  /** Whether a Theme Lab is open. */
  static isOpen(): boolean {
    return ThemeLabPanel.current !== undefined;
  }

  /** A part clicked in the Theme Preview, for whichever Theme Lab is open when it is clicked. */
  static pickFromPreview(this: void, part: unknown): void {
    ThemeLabPanel.current?.postPick(part);
  }

  /** The Theme Preview closed: the open Lab's Preview card says so and offers Open Preview. */
  static previewClosed(this: void): void {
    void ThemeLabPanel.current?.postDetached();
  }

  /** The open Lab's latest 'previewState', for a Theme Preview restored after a reload. */
  static latestPreviewState(): PreviewState | undefined {
    return ThemeLabPanel.current?.previewState;
  }

  /** Whether the Theme Preview window is open, which the page's Preview card says. */
  private async postDetached(): Promise<void> {
    await this.panel.webview.postMessage({ type: 'previewDetached', detached: ThemePreviewPanel.isOpen() });
  }

  /**
   * A part clicked in the Theme Preview window, for the page's Edit dock. The Lab tab comes to
   * the front and takes focus first, so the dock that opens is in view and ready to edit.
   */
  private postPick(part: unknown): void {
    this.panel.reveal(this.panel.viewColumn, false);
    void this.panel.webview.postMessage({ type: 'pickPart', part });
  }

  /**
   * Shows a Palette Lab candidate in VS Code without a reload: its theme colors go into
   * user settings scoped to the GigglyBits Dark (Lab) theme, and the Lab theme becomes the
   * active theme, with the color edits made in the Lab. The colors go only to user settings
   * (src/labSettings.ts); the theme switch goes to this project when a folder is open or the
   * workspace has a theme of its own, else to user settings (tryThemeTarget), and Back restores
   * it there. The page's
   * `settings` are recorded in globalState, so a Theme Lab opened later under the Lab theme
   * restores them; a record that fails parseTryRecord is skipped and the Try goes ahead. The
   * chrome carries the syntax set's colors (syntaxColors) when the design is on a set.
   */
  private async applyPalette(entry: BuilderEntry, chrome: ChromeChoice, edits: unknown, settings: unknown): Promise<void> {
    const cfg = () => vscode.workspace.getConfiguration();
    const Global = vscode.ConfigurationTarget.Global;
    try {
      const lab = labSettings(entry, chrome, cleanEdits(edits));

      await cfg().update('workbench.colorCustomizations',
        withLabScope(cfg().inspect('workbench.colorCustomizations')?.globalValue, lab.colors), Global);
      await cfg().update('editor.tokenColorCustomizations',
        withLabScope(cfg().inspect('editor.tokenColorCustomizations')?.globalValue, { textMateRules: lab.tokenColors }), Global);
      // A workspace or folder copy of the Lab block would hide these colors; it goes, and the
      // status bar names where it was.
      const cleaned = await this.removeShadowingLabColors();
      if (cleaned.length) {
        vscode.window.setStatusBarMessage(`Removed an old copy of the Lab theme's colors from ${cleaned.join(' and ')}; it was hiding your Try.`, 10000);
      }

      // The theme switch goes to this project when a folder is open or the workspace has a theme
      // of its own, else the user settings (tryThemeTarget). The colors stay in user settings.
      const theme = cfg().inspect<string>('workbench.colorTheme');
      const where = tryThemeTarget(theme, !!vscode.workspace.workspaceFolders?.length);
      const target = where.level === 'workspace' ? vscode.ConfigurationTarget.Workspace : Global;
      const previous = where.previous;
      await cfg().update('workbench.colorTheme', LAB_THEME_LABEL, target);
      // Before the information message: it resolves only when dismissed, so a later store may never run.
      const record = parseTryRecord(settings);
      if (record) {
        await this.globalState.update(LAST_TRY_KEY, record);
      }
      const notes = themeOverrideNotes(where.level === 'workspace' ? { workspaceValue: LAB_THEME_LABEL } : theme, LAB_THEME_LABEL);

      const name = entry.name || 'the candidate';
      // At the project level, no earlier project theme means Back removes the project's setting.
      const back = where.level === 'workspace' && previous === undefined ? 'Back to your default'
        : previous && previous !== LAB_THEME_LABEL ? `Back to ${previous}` : undefined;
      const scope = where.level === 'workspace'
        ? ' in this project only. Other windows keep their own theme.'
        : " in every window that doesn't set its own theme.";
      const choice = await vscode.window.showInformationMessage(
        [`Applied ${name} as ${LAB_THEME_LABEL}${scope}`, ...notes].join(' '), ...(back ? [back] : []));
      if (back && choice === back) {
        await cfg().update('workbench.colorTheme', previous, target);
      }
    } catch (err) {
      vscode.window.showErrorMessage(`Could not apply the palette: ${(err as Error).message}`);
    }
  }

  /**
   * Removes the Lab scope block from the workspace's and each folder's color and token settings.
   * The Lab theme's colors belong in user settings only, so a copy at either level is stale and,
   * outranking the user block key by key, hides every Try. Something outside this extension has
   * written such a copy into a .code-workspace file more than once. Returns the files cleaned.
   */
  private async removeShadowingLabColors(): Promise<string[]> {
    const KEYS = ['workbench.colorCustomizations', 'editor.tokenColorCustomizations'];
    const cleaned = new Set<string>();
    const workspaceFile = vscode.workspace.workspaceFile;
    const workspaceName = workspaceFile ? workspaceFile.fsPath.split(/[\\/]/).pop() ?? 'the workspace file' : '.vscode/settings.json';
    const root = vscode.workspace.getConfiguration();
    for (const key of KEYS) {
      const next = withoutLabScope(root.inspect(key)?.workspaceValue);
      if (next) {
        await root.update(key, Object.keys(next).length ? next : undefined, vscode.ConfigurationTarget.Workspace);
        cleaned.add(workspaceName);
      }
    }
    // In a multi-root workspace each folder's .vscode/settings.json is a layer of its own. VS Code
    // 1.145 ignores these window settings there and reports no folder value (live check
    // 2026-11-09, docs/DEVELOPMENT.md), so this loop finds nothing in practice.
    if (workspaceFile) {
      for (const folder of vscode.workspace.workspaceFolders ?? []) {
        const scoped = vscode.workspace.getConfiguration(undefined, folder.uri);
        for (const key of KEYS) {
          const next = withoutLabScope(scoped.inspect(key)?.workspaceFolderValue);
          if (next) {
            await scoped.update(key, Object.keys(next).length ? next : undefined, vscode.ConfigurationTarget.WorkspaceFolder);
            cleaned.add(`${folder.name}/.vscode/settings.json`);
          }
        }
      }
    }
    return [...cleaned];
  }

  private html(webview: vscode.Webview): string {
    // Order matters: shared.js defines window.GB, which the rest read when they load.
    // themeBuilder.js (window.GBBuilder) computes the candidate theme and gallery.js
    // (window.GBGallery) draws it; colorPicker.js (window.GBColorPicker) is the color picker;
    // palette.js uses them, then the app.
    return labPageHtml(webview, this.extensionUri, 'Theme Lab',
      ['shared.js', 'themeBuilder.js', 'gallery.js', 'colorPicker.js', 'palette.js', 'themeLab.js']);
  }

  private dispose(): void {
    ThemeLabPanel.current = undefined;
    // The Theme Preview belongs to the Lab: closing the Lab tab closes the window too. A reload
    // disposes neither, so both still come back together through their serializers.
    ThemePreviewPanel.close();
    this.disposables.forEach(d => d.dispose());
  }
}
