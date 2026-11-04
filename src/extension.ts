import * as vscode from 'vscode';
import { PaletteInspectorPanel } from './paletteInspectorPanel';
import { ThemeLabPanel } from './themeLabPanel';
import { ContributedTheme } from './themeList';
import { IdentityController } from './identityController';
import { ThemeLibraryController } from './themeLibraryController';

export function activate(context: vscode.ExtensionContext): void {
  const identity = new IdentityController(context);
  identity.register();
  // globalStorageUri locates the settings files each save builds on; the smoke test's stub context has none.
  const library = new ThemeLibraryController(identity, context.globalStorageUri?.fsPath);
  library.register(context);
  // Read when a Theme Lab opens, not at activation: scripts/smoke-bundle.js calls activate()
  // with a stub context that has no `extension` field, so an eager read would fail packaging.
  // ThemeLabPanel needs each theme's path as well as its label, to read its palette.
  const themes = (): ContributedTheme[] => context.extension.packageJSON?.contributes?.themes ?? [];
  context.subscriptions.push(
    vscode.commands.registerCommand('gigglybits.openThemeLab', () => ThemeLabPanel.show(context.extensionUri, identity, themes(), context.globalState, library)),
    vscode.commands.registerCommand('gigglybits.openPaletteInspector', () => PaletteInspectorPanel.show(context.extensionUri)),
    vscode.window.registerWebviewPanelSerializer(ThemeLabPanel.viewType, {
      async deserializeWebviewPanel(panel: vscode.WebviewPanel) {
        ThemeLabPanel.revive(panel, context.extensionUri, identity, themes(), context.globalState, library);
      },
    }),
    vscode.window.registerWebviewPanelSerializer(PaletteInspectorPanel.viewType, {
      async deserializeWebviewPanel(panel: vscode.WebviewPanel) {
        PaletteInspectorPanel.revive(panel, context.extensionUri);
      },
    }),
  );
}

export function deactivate(): void {}
