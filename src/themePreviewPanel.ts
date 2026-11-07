import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { affectsModernUI, modernUISettings } from './modernUI';

/** What the Theme Lab page posts as 'previewState': its Palette Lab state and the style groups. */
export interface PreviewState {
  palette: unknown;
  groups: unknown;
}

type FromPreview =
  | { type: 'ready' }
  | { type: 'pickPart'; part: unknown };

/**
 * The page skeleton the Theme Lab and the Theme Preview share: the Lab's stylesheets, a CSP
 * that lets only nonce-tagged scripts run, and `scripts` from media/ in order (shared.js first,
 * since it defines window.GB, which the rest read when they load).
 */
export function labPageHtml(webview: vscode.Webview, extensionUri: vscode.Uri, title: string, scripts: string[]): string {
  const nonce = crypto.randomBytes(16).toString('base64');
  const media = (file: string) => webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', file));
  const codicons = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'dist', 'codicons', 'codicon.css'));
  const tags = scripts
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
  <title>${title}</title>
</head>
<body>
  <div id="app"></div>
  ${tags}
</body>
</html>`;
}

/**
 * Whether `tabGroups` hold a webview tab of `viewType`, such as a Theme Lab tab VS Code is
 * restoring. VS Code reports a webview tab's view type with a `mainThreadWebview-` prefix, so the
 * match is on the end.
 */
export function hasWebviewTab(tabGroups: Pick<vscode.TabGroups, 'all'> | undefined, viewType: string): boolean {
  return Boolean(tabGroups && tabGroups.all.some(group => group.tabs.some(tab => {
    const type = (tab.input as { viewType?: unknown } | undefined)?.viewType;
    return typeof type === 'string' && type.endsWith(viewType);
  })));
}

/** The webview options both pages use: scripts on, and only media/ and the codicons readable. */
export function labWebviewOptions(extensionUri: vscode.Uri): vscode.WebviewOptions {
  return {
    enableScripts: true,
    localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media'), vscode.Uri.joinPath(extensionUri, 'dist', 'codicons')],
  };
}

/**
 * The Theme Preview: the Theme Lab's only preview, the Workbench and the chosen widget families
 * on one scrolling page (media/themePreview.js), in a webview that opens in a compact window of
 * its own, so it can sit beside the editor while the Lab's controls are used. It is not kept on
 * top. The Theme Lab hands it each 'previewState'; a part clicked in it goes back through
 * `onPick`, which brings the Lab forward and focuses it. `onClose` runs whenever it closes, so the Lab's Preview card can
 * say so. After a reload it comes back with the Theme Lab (revive).
 */
export class ThemePreviewPanel {
  static readonly viewType = 'gigglybits.themePreview';
  private static current: ThemePreviewPanel | undefined;

  private readonly disposables: vscode.Disposable[] = [];
  private state: PreviewState | undefined;

  /**
   * Opens the Theme Preview with `state` and floats it, or reveals the open one. `onPick`
   * receives each part clicked in it; `onClose` runs once it has closed.
   */
  static async open(extensionUri: vscode.Uri, state: PreviewState | undefined, onPick: (part: unknown) => void, onClose: () => void = () => undefined): Promise<void> {
    const open = ThemePreviewPanel.current;
    if (open) {
      open.onPick = onPick;
      open.onClose = onClose;
      if (state) { open.update(state); }
      open.panel.reveal();
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      ThemePreviewPanel.viewType,
      'Theme Preview',
      { viewColumn: vscode.ViewColumn.Active, preserveFocus: false },
      labWebviewOptions(extensionUri),
    );
    ThemePreviewPanel.current = new ThemePreviewPanel(panel, extensionUri, state, onPick, onClose);
    await ThemePreviewPanel.float();
  }

  /** Whether the Theme Preview is open. */
  static isOpen(): boolean {
    return ThemePreviewPanel.current !== undefined;
  }

  /** Closes the open Theme Preview, if there is one; its window closes with it. */
  static close(): void {
    ThemePreviewPanel.current?.panel.dispose();
  }

  /**
   * Takes a Theme Preview VS Code restored after a reload or a restart, through the panel
   * serializer src/extension.ts registers. Without a serializer VS Code dropped the page but
   * reopened its window, which stayed empty. Decided 2026-11-06: the preview comes back with the
   * Theme Lab. `keep` says whether a Lab is open or being restored; kept, the panel is the live
   * preview again, in the window and at the size it had, drawn from `state` now or from the Lab's
   * next 'previewState'. Otherwise, or when a preview is already open, the panel is disposed,
   * and its window closes with its last tab.
   */
  static revive(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, keep: boolean, state: PreviewState | undefined,
    onPick: (part: unknown) => void, onClose: () => void = () => undefined): void {
    if (!keep || ThemePreviewPanel.current) {
      panel.dispose();
      return;
    }
    panel.webview.options = labWebviewOptions(extensionUri);
    ThemePreviewPanel.current = new ThemePreviewPanel(panel, extensionUri, state, onPick, onClose);
  }

  /** Passes a later 'previewState' to the open Theme Preview, if there is one. */
  static update(state: PreviewState): void {
    ThemePreviewPanel.current?.update(state);
  }

  /**
   * Moves the active editor, the new panel, into a window of its own, then makes that window
   * compact. The second acts on the focused window, so it runs only after the move has finished.
   * The window is an ordinary one, not kept on top: VS Code can come in front of it, and a pick
   * in it brings the Theme Lab forward. A command that fails stops the rest with a warning,
   * leaving the panel as the earlier commands left it: in the editor if the move failed,
   * otherwise in its window.
   */
  private static async float(): Promise<void> {
    const steps = [
      'workbench.action.moveEditorToNewWindow',
      'workbench.action.enableCompactAuxiliaryWindow',
    ];
    for (const command of steps) {
      try {
        await vscode.commands.executeCommand(command);
      } catch (err) {
        vscode.window.showWarningMessage(`The Theme Preview could not run ${command}: ${(err as Error).message}`);
        return;
      }
    }
  }

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    state: PreviewState | undefined,
    private onPick: (part: unknown) => void,
    private onClose: () => void,
  ) {
    this.state = state;
    panel.webview.html = labPageHtml(panel.webview, extensionUri, 'Theme Preview',
      ['shared.js', 'themeBuilder.js', 'gallery.js', 'palette.js', 'themePreview.js']);
    this.disposables.push(
      panel.onDidDispose(() => this.dispose()),
      panel.webview.onDidReceiveMessage((msg: FromPreview) => this.onMessage(msg)),
      vscode.workspace.onDidChangeConfiguration(e => {
        if (affectsModernUI(e)) { this.postModernUI(); }
      }),
    );
  }

  /** VS Code's modern UI settings, which the Workbench preview draws with (src/modernUI.ts). */
  private postModernUI(): void {
    void this.panel.webview.postMessage({ type: 'modernUI', modernUI: modernUISettings() });
  }

  /**
   * Outlines the drawn parts that use any of `keys` in the open Theme Preview, if there is one;
   * an empty list clears the outlines. The Roles step sends the keys of the role under the
   * pointer or open. Not kept: a page that loads later starts with no outlines.
   */
  static highlight(keys: string[]): void {
    void ThemePreviewPanel.current?.panel.webview.postMessage({ type: 'highlight', keys });
  }

  /** Keeps the state, for a page that loads later, and sends it to the page. */
  private update(state: PreviewState): void {
    this.state = state;
    void this.panel.webview.postMessage({ type: 'state', palette: state.palette, groups: state.groups });
  }

  private onMessage(msg: FromPreview): void {
    if (msg.type === 'ready') {
      this.postModernUI();
      if (this.state) { this.update(this.state); }
    } else if (msg.type === 'pickPart') {
      this.onPick(msg.part);
    }
  }

  /** `onClose` runs after `current` is cleared, so isOpen() already reads false. */
  private dispose(): void {
    ThemePreviewPanel.current = undefined;
    this.disposables.forEach(d => d.dispose());
    this.onClose();
  }
}
