import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { captureThemeSnapshot, ThemeSnapshot } from './themeSource';
import { affectsModernUI, modernUISettings } from './modernUI';

type FromWebview =
  | { type: 'ready' }
  | { type: 'refresh' }
  | { type: 'copy'; text: string }
  | { type: 'exportTheme'; colors: Record<string, string> }
  | { type: 'openThemeLab' };

/** Settings whose change alters what the inspector shows. */
export const WATCHED_SETTINGS = [
  'workbench.colorTheme',
  'workbench.colorCustomizations',
  'workbench.preferredDarkColorTheme',
  'workbench.preferredLightColorTheme',
  'workbench.preferredHighContrastColorTheme',
  'workbench.preferredHighContrastLightColorTheme',
  'editor.tokenColorCustomizations',
  'editor.semanticTokenColorCustomizations',
  'editor.semanticHighlighting',
];

const THEME_TYPE: Record<vscode.ColorThemeKind, string> = {
  [vscode.ColorThemeKind.Light]: 'light',
  [vscode.ColorThemeKind.Dark]: 'dark',
  [vscode.ColorThemeKind.HighContrast]: 'hcDark',
  [vscode.ColorThemeKind.HighContrastLight]: 'hcLight',
};

/**
 * An editor-tab webview listing every color the workbench currently resolves, with its
 * source. It is a debugging view; building and picking themes happens in the Theme Lab.
 */
export class PaletteInspectorPanel {
  static readonly viewType = 'gigglybits.paletteInspector';
  private static current: PaletteInspectorPanel | undefined;

  private readonly disposables: vscode.Disposable[] = [];
  private refreshTimer: NodeJS.Timeout | undefined;
  private snapshot: ThemeSnapshot | undefined;

  static show(extensionUri: vscode.Uri): void {
    if (PaletteInspectorPanel.current) {
      PaletteInspectorPanel.current.panel.reveal();
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      PaletteInspectorPanel.viewType,
      'Palette Inspector',
      vscode.ViewColumn.Active,
      PaletteInspectorPanel.webviewOptions(extensionUri),
    );
    PaletteInspectorPanel.current = new PaletteInspectorPanel(panel, extensionUri);
  }

  /** Restores a panel that was open when the window reloaded. */
  static revive(panel: vscode.WebviewPanel, extensionUri: vscode.Uri): void {
    panel.webview.options = PaletteInspectorPanel.webviewOptions(extensionUri);
    PaletteInspectorPanel.current = new PaletteInspectorPanel(panel, extensionUri);
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
  ) {
    panel.webview.html = this.html(panel.webview);

    this.disposables.push(
      panel.onDidDispose(() => this.dispose()),
      panel.webview.onDidReceiveMessage((msg: FromWebview) => this.onMessage(msg)),
      vscode.window.onDidChangeActiveColorTheme(() => this.scheduleRefresh()),
      vscode.workspace.onDidChangeConfiguration(e => {
        if (WATCHED_SETTINGS.some(s => e.affectsConfiguration(s))) {
          this.scheduleRefresh();
        }
        if (affectsModernUI(e)) {
          void this.postModernUI();
        }
      }),
    );
  }

  private async onMessage(msg: FromWebview): Promise<void> {
    switch (msg.type) {
      case 'ready':
        await this.postModernUI();
        await this.refresh();
        break;
      case 'refresh':
        await this.refresh();
        break;
      case 'copy':
        await vscode.env.clipboard.writeText(msg.text);
        vscode.window.setStatusBarMessage(`Copied ${msg.text}`, 2500);
        break;
      case 'exportTheme':
        await this.exportTheme(msg.colors);
        break;
      case 'openThemeLab':
        await vscode.commands.executeCommand('gigglybits.openThemeLab');
        break;
    }
  }

  /** VS Code's modern UI settings, which the Workbench overview draws with (src/modernUI.ts). */
  private async postModernUI(): Promise<void> {
    await this.panel.webview.postMessage({ type: 'modernUI', modernUI: modernUISettings() });
  }

  private scheduleRefresh(): void {
    clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => void this.refresh(), 150);
  }

  private async refresh(): Promise<void> {
    try {
      this.snapshot = await captureThemeSnapshot();
      await this.panel.webview.postMessage({ type: 'snapshot', snapshot: this.snapshot });
    } catch (err) {
      vscode.window.showErrorMessage(`Palette Inspector could not read the active theme: ${(err as Error).message}`);
    }
  }

  /**
   * Opens every color in effect as an untitled theme file. Pinning all of them explicitly
   * is the starting point for a theme that does not depend on VS Code defaults.
   */
  private async exportTheme(colors: Record<string, string>): Promise<void> {
    const snap = this.snapshot ?? (await captureThemeSnapshot());
    const sortedColors = Object.fromEntries(Object.entries(colors).sort(([a], [b]) => a.localeCompare(b)));

    const tokenColors = snap.tokenRules.map(rule => {
      const settings: Record<string, string> = {};
      if (rule.foreground) { settings.foreground = rule.foreground; }
      if (rule.background) { settings.background = rule.background; }
      if (rule.fontStyle !== undefined) { settings.fontStyle = rule.fontStyle; }
      return {
        ...(rule.name ? { name: rule.name } : {}),
        ...(rule.scope === '(editor default)' ? {} : { scope: rule.scope }),
        settings,
      };
    });

    const semanticTokenColors: Record<string, unknown> = {};
    for (const rule of snap.semanticRules) {
      semanticTokenColors[rule.selector] = rule.fontStyle
        ? { ...(rule.foreground ? { foreground: rule.foreground } : {}), fontStyle: rule.fontStyle }
        : rule.foreground;
    }

    const theme = {
      $schema: 'vscode://schemas/color-theme',
      name: `GigglyBits (snapshot of ${snap.label ?? 'current theme'})`,
      type: THEME_TYPE[vscode.window.activeColorTheme.kind],
      semanticHighlighting: snap.semanticHighlighting.effective,
      colors: sortedColors,
      tokenColors,
      semanticTokenColors,
    };

    const doc = await vscode.workspace.openTextDocument({ language: 'jsonc', content: JSON.stringify(theme, null, 2) });
    await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
  }

  private html(webview: vscode.Webview): string {
    const nonce = crypto.randomBytes(16).toString('base64');
    const media = (file: string) => webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', file));
    const codicons = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'dist', 'codicons', 'codicon.css'));
    // Order matters: shared.js defines window.GB, gallery.js window.GBGallery, then the app.
    const scripts = ['shared.js', 'gallery.js', 'inspector.js']
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
  <title>Palette Inspector</title>
</head>
<body>
  <div id="app"></div>
  ${scripts}
</body>
</html>`;
  }

  private dispose(): void {
    PaletteInspectorPanel.current = undefined;
    clearTimeout(this.refreshTimer);
    this.disposables.forEach(d => d.dispose());
  }
}
