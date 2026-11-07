import * as vscode from 'vscode';
import { PaletteInspectorPanel } from './paletteInspectorPanel';
import { parseFrameSeed, ThemeLabPanel } from './themeLabPanel';
import { hasWebviewTab, ThemePreviewPanel } from './themePreviewPanel';
import { IdentityController } from './identityController';
import { ThemeLibraryController } from './themeLibraryController';

export function activate(context: vscode.ExtensionContext): void {
  const identity = new IdentityController(context);
  identity.register();
  // globalStorageUri locates the settings files each save builds on; the smoke test's stub context has none.
  const library = new ThemeLibraryController(context.globalStorageUri?.fsPath);
  library.register(context);
  context.subscriptions.push(
    // An optional { frame, name } starts a project theme from a folder's old color (src/identityController.ts).
    vscode.commands.registerCommand('gigglybits.openThemeLab', (seed?: unknown) =>
      ThemeLabPanel.show(context.extensionUri, identity, context.globalState, library, parseFrameSeed(seed))),
    vscode.commands.registerCommand('gigglybits.openPaletteInspector', () => PaletteInspectorPanel.show(context.extensionUri)),
    vscode.window.registerWebviewPanelSerializer(ThemeLabPanel.viewType, {
      async deserializeWebviewPanel(panel: vscode.WebviewPanel) {
        ThemeLabPanel.revive(panel, context.extensionUri, identity, context.globalState, library);
      },
    }),
    vscode.window.registerWebviewPanelSerializer(PaletteInspectorPanel.viewType, {
      async deserializeWebviewPanel(panel: vscode.WebviewPanel) {
        PaletteInspectorPanel.revive(panel, context.extensionUri);
      },
    }),
    // A Theme Preview from before a reload comes back only with a Theme Lab, open or being
    // restored (its tab is already in the tab groups); otherwise it closes, window and all.
    vscode.window.registerWebviewPanelSerializer(ThemePreviewPanel.viewType, {
      async deserializeWebviewPanel(panel: vscode.WebviewPanel) {
        const keep = ThemeLabPanel.isOpen() || hasWebviewTab(vscode.window.tabGroups, ThemeLabPanel.viewType);
        ThemePreviewPanel.revive(panel, context.extensionUri, keep, ThemeLabPanel.latestPreviewState(),
          ThemeLabPanel.pickFromPreview, ThemeLabPanel.previewClosed);
      },
    }),
  );
}

/**
 * Nothing to stop. The Theme Preview is left open on purpose: VS Code saves the window layout
 * before this runs, and the preview's serializer brings it back with the Theme Lab, or closes it.
 */
export function deactivate(): void {
  // Intentionally empty.
}
