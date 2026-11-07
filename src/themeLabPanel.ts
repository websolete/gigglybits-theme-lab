import * as vscode from 'vscode';
import { labPageHtml, labWebviewOptions, PreviewState, ThemePreviewPanel } from './themePreviewPanel';
import { withLabScope, withoutLabScope } from './labSettings';
import { captureThemeSnapshot } from './themeSource';
import { BuilderEntry, ChromeChoice, cleanEdits, GROUP_FAMILIES, GroupFamily, LAB_THEME_LABEL, labSettings, StyleGroup } from '../scripts/theme-builder';
import { parseTryRecord, startConfig } from './labStart';
import { parseDesign } from './themeLibrary';
import { ThemeLibraryController, UseTarget } from './themeLibraryController';
import { affectsModernUI, modernUISettings } from './modernUI';

type FromWebview =
  | { type: 'ready' }
  | { type: 'copy'; text: string }
  | { type: 'applyPalette'; entry: BuilderEntry; chrome: ChromeChoice; edits?: unknown; settings?: unknown; groups?: unknown }
  | { type: 'openPaletteInspector' }
  | { type: 'saveTheme'; name: string; design: unknown }
  | { type: 'useTheme'; id: string; where: UseTarget }
  | { type: 'deleteTheme'; id: string }
  | { type: 'saveGroup'; name: string; family: string; roles: unknown }
  | { type: 'setGroupOn'; id: string; on: boolean }
  | { type: 'deleteGroup'; id: string }
  | { type: 'previewState'; palette: unknown; groups: unknown }
  | { type: 'previewHighlight'; keys: unknown }
  | { type: 'openPreviewWindow' };

const isGroupFamily = (v: unknown): v is GroupFamily => typeof v === 'string' && Object.prototype.hasOwnProperty.call(GROUP_FAMILIES, v);

/** The string-valued entries of roles, or undefined when roles is not an object. */
function groupRoles(roles: unknown): Record<string, string> | undefined {
  if (typeof roles !== 'object' || roles === null || Array.isArray(roles)) { return undefined; }
  return Object.fromEntries(Object.entries(roles).filter(([, v]) => typeof v === 'string')) as Record<string, string>;
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
 * Where Try in VS Code switches workbench.colorTheme: this workspace, when the workspace sets
 * its own theme (which would win over a user setting, so a user-level Try would not show here),
 * else the user settings. `previous` is the theme at that level, which Back restores. A theme
 * set per folder in a multi-root workspace is left alone, and a user-level Try says why.
 */
export function tryThemeTarget(theme: { globalValue?: string; workspaceValue?: string; workspaceFolderValue?: string } | undefined):
  { level: 'workspace' | 'user'; previous: string | undefined } {
  if (theme?.workspaceValue && !theme.workspaceFolderValue) { return { level: 'workspace', previous: theme.workspaceValue }; }
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
  return notes;
}

/**
 * An editor-tab webview for building, trying and picking a GigglyBits theme. It holds the
 * Palette Lab (media/palette.js); the Palette Inspector is the separate debugging view.
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
        if (e.affectsConfiguration('gigglybits.library') || e.affectsConfiguration('gigglybits.groups')) {
          void this.postLibrary();
        }
        if (affectsModernUI(e)) {
          void this.postModernUI();
        }
      }),
    );
  }

  /** The saved themes, the style groups, and whether a folder is open, which decides whether Use in this project is offered. */
  private async postLibrary(): Promise<void> {
    await this.panel.webview.postMessage({
      type: 'library', themes: this.library.library(), groups: this.library.groups(), hasFolder: this.library.hasFolder(),
    });
  }

  /**
   * The active theme's label, from captureThemeSnapshot(), the same value the Palette
   * Inspector header shows; 'ready' decides the start palette from it. Undefined when the
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
        if (this.pendingSeed) {
          await this.panel.webview.postMessage({ type: 'frameSeed', ...this.pendingSeed });
          this.pendingSeed = undefined;
        }
        await this.postIdentity(false);
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
      case 'saveGroup': {
        const name = typeof msg.name === 'string' ? msg.name.trim() : '';
        const roles = groupRoles(msg.roles);
        if (!name || !isGroupFamily(msg.family) || !roles) {
          vscode.window.showErrorMessage('Could not save the style group: it needs a name, a family and its roles.');
          break;
        }
        await this.library.saveGroupSafely(name, msg.family, roles);
        break;
      }
      case 'setGroupOn':
        if (typeof msg.id === 'string' && typeof msg.on === 'boolean') {
          await this.library.setGroupOnSafely(msg.id, msg.on);
        }
        break;
      case 'deleteGroup':
        if (typeof msg.id === 'string') {
          await this.library.deleteGroupSafely(msg.id);
        }
        break;
      case 'copy':
        await vscode.env.clipboard.writeText(msg.text);
        vscode.window.setStatusBarMessage(`Copied ${msg.text}`, 2500);
        break;
      case 'applyPalette':
        await this.applyPalette(msg.entry, msg.chrome, msg.edits, msg.settings, msg.groups);
        break;
      case 'openPaletteInspector':
        await vscode.commands.executeCommand('gigglybits.openPaletteInspector');
        break;
      case 'previewState':
        this.previewState = { palette: msg.palette, groups: msg.groups };
        ThemePreviewPanel.update(this.previewState);
        break;
      case 'previewHighlight':
        // The Roles step's role under the pointer or open: outline its parts in the preview.
        ThemePreviewPanel.highlight(Array.isArray(msg.keys) ? msg.keys.filter((k): k is string => typeof k === 'string').slice(0, 1000) : []);
        break;
      case 'openPreviewWindow':
        await this.openPreviewWindow();
        await this.postDetached();
        break;
    }
  }

  /**
   * Opens the Theme Preview window, or reveals the open one. Picks go to whichever Theme Lab is
   * open when the part is clicked, not to this one: the window outlives a Lab tab that is closed
   * and opened again. When the window closes, the page's Preview card says so and offers Open
   * Preview.
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
   * (src/labSettings.ts); the theme switch goes to this workspace when the workspace sets its
   * own theme, else to user settings (tryThemeTarget), and Back restores it there. The page's
   * `settings` are recorded in globalState, so a Theme Lab opened later under the Lab theme
   * restores them; a record that fails parseTryRecord is skipped and the Try goes ahead.
   * `groups` are the style groups the Lab's preview draws, { family, roles } each; the builder
   * ignores any entry it cannot apply, and a value that is not an array applies none.
   */
  private async applyPalette(entry: BuilderEntry, chrome: ChromeChoice, edits: unknown, settings: unknown, groups: unknown): Promise<void> {
    const cfg = () => vscode.workspace.getConfiguration();
    const Global = vscode.ConfigurationTarget.Global;
    try {
      const lab = labSettings(entry, chrome, cleanEdits(edits), Array.isArray(groups) ? (groups as StyleGroup[]) : []);

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

      // The theme switch goes where it shows in this window: the workspace when it sets its own
      // theme, else the user settings (tryThemeTarget). The colors stay in user settings.
      const theme = cfg().inspect<string>('workbench.colorTheme');
      const where = tryThemeTarget(theme);
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
      const back = previous && previous !== LAB_THEME_LABEL ? `Back to ${previous}` : undefined;
      const scope = where.level === 'workspace' ? ' in this workspace' : '';
      const choice = await vscode.window.showInformationMessage(
        [`Applied ${name} as ${LAB_THEME_LABEL}${scope}.`, ...notes].join(' '), ...(back ? [back] : []));
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
    // In a multi-root workspace each folder's .vscode/settings.json is a layer of its own.
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
    this.disposables.forEach(d => d.dispose());
  }
}
