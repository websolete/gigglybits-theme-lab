import * as vscode from 'vscode';
import { parseFrameSeed, ThemeLabPanel } from './themeLabPanel';
import { hasWebviewTab, ThemePreviewPanel } from './themePreviewPanel';
import { IdentityController } from './identityController';
import { ThemeLibraryController } from './themeLibraryController';
import { firstRunAction, WALKTHROUGH_CONTEXT, WELCOMED_KEY } from './firstRun';

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
    vscode.window.registerWebviewPanelSerializer(ThemeLabPanel.viewType, {
      async deserializeWebviewPanel(panel: vscode.WebviewPanel) {
        ThemeLabPanel.revive(panel, context.extensionUri, identity, context.globalState, library);
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
  welcome(context, library);
}

/**
 * Opens the Theme Lab on a new install's first activation (src/firstRun.ts), and shows the Get
 * Started walkthrough from the next window session on. The `onLanguage:plaintext` activation event
 * in package.json is what stops VS Code's own theme list from opening over the Lab: VS Code skips
 * that list after an install for an extension with any `onLanguage` activation event.
 */
function welcome(context: vscode.ExtensionContext, library: ThemeLibraryController): void {
  // The smoke test's stub context has no globalState.
  const state = context.globalState;
  if (!state) { return; }
  const welcomed = state.get<boolean>(WELCOMED_KEY) === true;
  void vscode.commands.executeCommand('setContext', WALKTHROUGH_CONTEXT, welcomed);
  if (welcomed) { return; }
  const theme = vscode.workspace.getConfiguration('workbench').get<string>('colorTheme') ?? '';
  const usedBefore = state.keys().some(k => k !== WELCOMED_KEY)
    || library.library().length > 0 || library.syntaxSets().length > 0
    || theme.startsWith('GigglyBits');
  const action = firstRunAction({ welcomed, focused: vscode.window.state.focused, usedBefore });
  if (action === 'none') { return; }
  void state.update(WELCOMED_KEY, true);
  if (action === 'openLab') {
    void vscode.commands.executeCommand('gigglybits.openThemeLab');
  }
}

/**
 * Nothing to stop. The Theme Preview is left open on purpose: VS Code saves the window layout
 * before this runs, and the preview's serializer brings it back with the Theme Lab, or closes it.
 */
export function deactivate(): void {
  // Intentionally empty.
}
