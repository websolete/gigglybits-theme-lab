import * as vscode from 'vscode';
import { PaletteInspectorPanel } from './paletteInspectorPanel';
import { parseFrameSeed, ThemeLabPanel } from './themeLabPanel';
import { ThemePreviewPanel } from './themePreviewPanel';
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
  );
  // A Theme Preview tab left over from before a reload has no page behind it (the panel has no
  // serializer), so close it, and its window with it. The smoke test's stub has no tabGroups.
  if (vscode.window.tabGroups) {
    void ThemePreviewPanel.closeLeftovers(vscode.window.tabGroups).catch(() => undefined);
  }
}

/** Closes the Theme Preview window when the extension stops, on a reload or a shutdown. */
export function deactivate(): void {
  ThemePreviewPanel.close();
}
