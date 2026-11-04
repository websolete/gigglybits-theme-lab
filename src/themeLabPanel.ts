import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { catalogPathFor, PaletteEntry, readCatalog, upsertPalette } from './paletteCatalog';
import { withLabScope } from './labSettings';
import { captureThemeSnapshot } from './themeSource';
import { WATCHED_SETTINGS } from './paletteInspectorPanel';
import { BuilderEntry, ChromeChoice, cleanEdits, LAB_THEME_LABEL, labSettings } from '../scripts/theme-builder';
import { ContributedTheme, listedThemes, ThemeBase, themeBases } from './themeList';
import { parseTryRecord, startConfig } from './labStart';
import { parseDesign } from './themeLibrary';
import { ThemeLibraryController, UseTarget } from './themeLibraryController';

type FromWebview =
  | { type: 'ready' }
  | { type: 'copy'; text: string }
  | { type: 'paletteDecision'; entry: PaletteEntry }
  | { type: 'applyPalette'; entry: BuilderEntry; chrome: ChromeChoice; edits?: unknown; settings?: unknown }
  | { type: 'useAsIdentity'; color: string }
  | { type: 'selectTheme'; label: string }
  | { type: 'openPaletteInspector' }
  | { type: 'saveTheme'; name: string; design: unknown }
  | { type: 'useTheme'; id: string; where: UseTarget }
  | { type: 'deleteTheme'; id: string };

/**
 * The identity controller as the Theme Lab sees it: it pins a chosen color, says what this
 * workspace's identity currently is, and fires when that or the active theme changes.
 */
export interface IdentityTarget {
  pin(color: string): Promise<void>;
  current(): Promise<{ fill: string; regions: string[] } | undefined>;
  onDidChange: vscode.Event<'identity' | 'theme'>;
}

/** globalState key holding the last Try in VS Code's settings (src/labStart.ts TryRecord). */
const LAST_TRY_KEY = 'gigglybits.themeLab.lastTry';

const NO_FOLDER_REASON = 'Open the gigglybits-vscode-theme folder to save palette decisions.';

/** Settings whose change can alter which theme is active, so the theme list re-marks it. */
const THEME_PICKING_SETTINGS = [...WATCHED_SETTINGS, 'window.autoDetectColorScheme', 'window.autoDetectHighContrast'];

/**
 * Why setting workbench.colorTheme to `label` in user settings may not show it: a workspace
 * theme setting wins over the user one, and auto-detect picks the theme from the OS instead.
 * Try in VS Code and the theme list both use this, so they word it the same way.
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
  private themesTimer: NodeJS.Timeout | undefined;
  /** listedThemes() of the contributed themes: the labels the theme list shows. */
  private readonly themes: string[];
  /** themeBases() of the contributed themes: each listed theme's palette, sent as `bases`. */
  private readonly bases: Record<string, ThemeBase>;

  /**
   * `contributed` is this extension's package.json contributes.themes; `globalState` is the
   * extension's, where Try in VS Code records the tried settings.
   */
  static show(extensionUri: vscode.Uri, identity: IdentityTarget, contributed: ContributedTheme[], globalState: vscode.Memento, library: ThemeLibraryController): void {
    if (ThemeLabPanel.current) {
      ThemeLabPanel.current.panel.reveal();
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      ThemeLabPanel.viewType,
      'Theme Lab',
      vscode.ViewColumn.Active,
      ThemeLabPanel.webviewOptions(extensionUri),
    );
    ThemeLabPanel.current = new ThemeLabPanel(panel, extensionUri, identity, contributed, globalState, library);
  }

  /** Restores a panel that was open when the window reloaded. */
  static revive(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, identity: IdentityTarget, contributed: ContributedTheme[], globalState: vscode.Memento, library: ThemeLibraryController): void {
    panel.webview.options = ThemeLabPanel.webviewOptions(extensionUri);
    ThemeLabPanel.current = new ThemeLabPanel(panel, extensionUri, identity, contributed, globalState, library);
  }

  private static webviewOptions(extensionUri: vscode.Uri): vscode.WebviewOptions {
    return {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media'), vscode.Uri.joinPath(extensionUri, 'dist', 'codicons')],
    };
  }

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    private readonly extensionUri: vscode.Uri,
    private readonly identity: IdentityTarget,
    contributed: ContributedTheme[],
    private readonly globalState: vscode.Memento,
    private readonly library: ThemeLibraryController,
  ) {
    this.themes = listedThemes(contributed);
    this.bases = themeBases(contributed);
    panel.webview.html = this.html(panel.webview);

    this.disposables.push(
      panel.onDidDispose(() => this.dispose()),
      panel.webview.onDidReceiveMessage((msg: FromWebview) => this.onMessage(msg)),
      // An identity setting change (Use as this workspace's identity, Set, Next, Clear) or a
      // theme change, which moves a hue identity's fill; the page re-ticks regions only on the first.
      identity.onDidChange(kind => void this.postIdentity(kind === 'identity')),
      vscode.window.onDidChangeActiveColorTheme(() => this.scheduleThemes()),
      vscode.workspace.onDidChangeConfiguration(e => {
        if (THEME_PICKING_SETTINGS.some(s => e.affectsConfiguration(s))) {
          this.scheduleThemes();
        }
        if (e.affectsConfiguration('gigglybits.library')) {
          void this.postLibrary();
        }
      }),
    );

    // Re-send the catalog when it changes on disk: a git checkout, a hand edit, or our own write.
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (folder) {
      const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(folder, 'palettes/catalog.json'));
      const resend = () => void this.postCatalog();
      this.disposables.push(watcher, watcher.onDidChange(resend), watcher.onDidCreate(resend), watcher.onDidDelete(resend));
    }
  }

  /** palettes/catalog.json in the first workspace folder, or undefined with no folder open. */
  private catalogPath(): string | undefined {
    return catalogPathFor((vscode.workspace.workspaceFolders ?? []).map(f => f.uri.fsPath));
  }

  private async postCatalog(): Promise<void> {
    const file = this.catalogPath();
    if (!file) {
      await this.panel.webview.postMessage({ type: 'catalog', catalog: null, path: null, reason: NO_FOLDER_REASON });
      return;
    }
    try {
      await this.panel.webview.postMessage({ type: 'catalog', catalog: await readCatalog(file), path: file });
    } catch (err) {
      await this.catalogError(err);
    }
  }

  private async savePalette(entry: PaletteEntry): Promise<void> {
    const file = this.catalogPath();
    if (!file) {
      await this.catalogError(new Error(NO_FOLDER_REASON));
      return;
    }
    try {
      const catalog = await upsertPalette(file, entry);
      await this.panel.webview.postMessage({ type: 'catalog', catalog, path: file });
      vscode.window.setStatusBarMessage(`Saved "${entry.name}" as ${entry.status}`, 2500);
    } catch (err) {
      await this.catalogError(err);
    }
  }

  /** The saved themes, and whether a folder is open, which decides whether Use in this project is offered. */
  private async postLibrary(): Promise<void> {
    await this.panel.webview.postMessage({ type: 'library', themes: this.library.library(), hasFolder: this.library.hasFolder() });
  }

  /** Same debounce as the Palette Inspector's snapshot refresh. */
  private scheduleThemes(): void {
    clearTimeout(this.themesTimer);
    this.themesTimer = setTimeout(() => void this.postThemes(), 150);
  }

  /**
   * Sends the theme list, the active theme, and `bases`: each listed theme's palette, which
   * the Palette Lab loads when that theme's Use is clicked. The active label comes from
   * captureThemeSnapshot(), the same value the Palette Inspector header shows. Returns it, so
   * 'ready' decides the start palette from the label the page was just told is active.
   */
  private async postThemes(): Promise<string | undefined> {
    let active: string | undefined;
    try {
      active = (await captureThemeSnapshot()).label;
    } catch {
      active = undefined;
    }
    await this.panel.webview.postMessage({ type: 'themes', themes: this.themes, active: active ?? null, bases: this.bases });
    return active;
  }

  /** This workspace's identity fill and regions, or null with none; `changed` marks a settings change. */
  private async postIdentity(changed: boolean): Promise<void> {
    let identity: { fill: string; regions: string[] } | null;
    try {
      identity = (await this.identity.current()) ?? null;
    } catch {
      identity = null;
    }
    await this.panel.webview.postMessage({ type: 'identity', identity, changed });
  }

  /** Switches VS Code to one of the listed themes through the user setting. */
  private async selectTheme(label: string): Promise<void> {
    if (!this.themes.includes(label)) {
      return;
    }
    const cfg = () => vscode.workspace.getConfiguration();
    try {
      const theme = cfg().inspect<string>('workbench.colorTheme');
      await cfg().update('workbench.colorTheme', label, vscode.ConfigurationTarget.Global);
      const notes = themeOverrideNotes(theme, label);
      if (notes.length) {
        vscode.window.showInformationMessage([`Set ${label} as your theme.`, ...notes].join(' '));
      }
    } catch (err) {
      vscode.window.showErrorMessage(`Could not switch to ${label}: ${(err as Error).message}`);
    }
  }

  private async catalogError(err: unknown): Promise<void> {
    const message = err instanceof Error ? err.message : String(err);
    await this.panel.webview.postMessage({ type: 'catalogError', message });
    vscode.window.showErrorMessage(message);
  }

  private async onMessage(msg: FromWebview): Promise<void> {
    switch (msg.type) {
      case 'ready': {
        // The page applies 'start' and the first 'identity' only on a fresh open, not a revive.
        const active = await this.postThemes();
        const start = startConfig(active, this.bases, this.globalState.get(LAST_TRY_KEY), this.library.library());
        await this.postLibrary();
        await this.panel.webview.postMessage({ type: 'start', start });
        await this.postIdentity(false);
        await this.postCatalog();
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
      case 'selectTheme':
        await this.selectTheme(msg.label);
        break;
      case 'paletteDecision':
        await this.savePalette(msg.entry);
        break;
      case 'copy':
        await vscode.env.clipboard.writeText(msg.text);
        vscode.window.setStatusBarMessage(`Copied ${msg.text}`, 2500);
        break;
      case 'applyPalette':
        await this.applyPalette(msg.entry, msg.chrome, msg.edits, msg.settings);
        break;
      case 'useAsIdentity':
        try {
          await this.identity.pin(msg.color);
        } catch (err) {
          vscode.window.showErrorMessage(`Could not set the workspace color: ${(err as Error).message}`);
        }
        break;
      case 'openPaletteInspector':
        await vscode.commands.executeCommand('gigglybits.openPaletteInspector');
        break;
    }
  }

  /**
   * Shows a Palette Lab candidate in VS Code without a reload: its theme colors go into
   * user settings scoped to the GigglyBits Dark (Lab) theme, and the Lab theme becomes the
   * active theme, with the color edits made in the Lab. It writes no workspace settings. See src/labSettings.ts. The page's
   * `settings` are recorded in globalState, so a Theme Lab opened later under the Lab theme
   * restores them; a record that fails parseTryRecord is skipped and the Try goes ahead.
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

      const theme = cfg().inspect<string>('workbench.colorTheme');
      const previous = theme?.globalValue;
      await cfg().update('workbench.colorTheme', LAB_THEME_LABEL, Global);
      // Before the information message: it resolves only when dismissed, so a later store may never run.
      const record = parseTryRecord(settings);
      if (record) {
        await this.globalState.update(LAST_TRY_KEY, record);
      }
      const notes = themeOverrideNotes(theme, LAB_THEME_LABEL);

      const name = entry.name || 'the candidate';
      const back = previous && previous !== LAB_THEME_LABEL ? `Back to ${previous}` : undefined;
      const choice = await vscode.window.showInformationMessage(
        [`Applied ${name} as ${LAB_THEME_LABEL}.`, ...notes].join(' '), ...(back ? [back] : []));
      if (back && choice === back) {
        await cfg().update('workbench.colorTheme', previous, Global);
      }
    } catch (err) {
      vscode.window.showErrorMessage(`Could not apply the palette: ${(err as Error).message}`);
    }
  }

  private html(webview: vscode.Webview): string {
    const nonce = crypto.randomBytes(16).toString('base64');
    const media = (file: string) => webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', file));
    const codicons = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'dist', 'codicons', 'codicon.css'));
    // Order matters: shared.js defines window.GB, which the rest read when they load.
    // themeBuilder.js (window.GBBuilder) computes the candidate theme and gallery.js
    // (window.GBGallery) draws it; palette.js and themeList.js use them, then the app.
    const scripts = ['shared.js', 'themeBuilder.js', 'gallery.js', 'palette.js', 'themeList.js', 'themeLab.js']
      .map(file => `<script nonce="${nonce}" src="${media(file)}"></script>`)
      .join('\n  ');
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; font-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="${codicons}">
  <link rel="stylesheet" href="${media('inspector.css')}">
  <link rel="stylesheet" href="${media('gallery.css')}">
  <link rel="stylesheet" href="${media('themeLab.css')}">
  <link rel="stylesheet" href="${media('palette.css')}">
  <title>Theme Lab</title>
</head>
<body>
  <div id="app"></div>
  ${scripts}
</body>
</html>`;
  }

  private dispose(): void {
    ThemeLabPanel.current = undefined;
    clearTimeout(this.themesTimer);
    this.disposables.forEach(d => d.dispose());
  }
}
