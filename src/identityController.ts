// The VS Code side of the retired per-folder color. It registers no command and writes no
// overlay. It reports a folder's old color to the Theme Lab and the library, and once per
// folder offers to turn that color into a project theme. The settings math lives in
// src/identity.ts.
import * as vscode from 'vscode';
import { drawnOldColor, oldFolderColor, shouldOfferMigration, withoutIdentity } from './identity';

const SECTION = 'gigglybits.identity';
/** workspaceState key: the one-time project-theme offer has been shown in this folder. */
const OFFERED_KEY = 'gigglybits.frame.migrationOffered';
const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

type Settings = Record<string, unknown>;
/** What onDidChange reports: the folder's colors changed, or the active color theme did. */
type IdentityChange = 'identity' | 'theme';

/** '#abc' or 'abc' to '#aabbcc', or undefined when the text is not a hex color. */
function normalizeHex(text: string): string | undefined {
  const m = HEX.exec(text.trim());
  if (!m) { return undefined; }
  const hex = m[1].length === 3 ? m[1].split('').map(c => c + c).join('') : m[1];
  return '#' + hex.toLowerCase();
}

export class IdentityController {
  /**
   * onDidChange's listeners. A plain set rather than vscode.EventEmitter: scripts/smoke-bundle.js
   * activates the bundle against a stub vscode module that has no EventEmitter.
   */
  private readonly listeners = new Set<(kind: IdentityChange) => void>();

  constructor(private readonly context: vscode.ExtensionContext) {}

  /** Fires 'identity' when the workspace colors or a gigglybits.identity setting change, and 'theme' on a theme change. */
  readonly onDidChange: vscode.Event<IdentityChange> = (listener, thisArgs?, disposables?) => {
    const bound = (kind: IdentityChange) => listener.call(thisArgs, kind);
    this.listeners.add(bound);
    const disposable = { dispose: () => { this.listeners.delete(bound); } };
    disposables?.push(disposable);
    return disposable;
  };

  private fire(kind: IdentityChange): void {
    for (const listener of [...this.listeners]) { listener(kind); }
  }

  register(): void {
    this.context.subscriptions.push(
      vscode.window.onDidChangeActiveColorTheme(() => this.fire('theme')),
      vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('workbench.colorCustomizations') || e.affectsConfiguration(SECTION)) { this.fire('identity'); }
      }),
    );
    void this.runSafely(() => this.offer());
  }

  /**
   * The old color VS Code still draws over this folder's GigglyBits frame (drawnOldColor), or
   * undefined. A pinnedColor setting alone is not returned: nothing draws it any more.
   */
  async current(): Promise<{ fill: string } | undefined> {
    const fill = this.hasFolder() ? drawnOldColor(this.colorCustomizations()) : undefined;
    return fill ? { fill } : undefined;
  }

  private async runSafely(action: () => Promise<void>): Promise<void> {
    try {
      await action();
    } catch (err) {
      vscode.window.showErrorMessage(`GigglyBits project color: ${(err as Error).message}`);
    }
  }

  private hasFolder(): boolean {
    return !!vscode.workspace.workspaceFolders?.length;
  }

  private config(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration(SECTION);
  }

  private hue(): number | undefined {
    const v = this.config().inspect<number>('hue')?.workspaceValue;
    return typeof v === 'number' ? v : undefined;
  }

  private pinnedColor(): string | undefined {
    const v = this.config().inspect<string>('pinnedColor')?.workspaceValue;
    return typeof v === 'string' ? normalizeHex(v) : undefined;
  }

  private colorCustomizations(): unknown {
    return vscode.workspace.getConfiguration('workbench').inspect<Settings>('colorCustomizations')?.workspaceValue;
  }

  private oldColor(): string | undefined {
    if (!this.hasFolder()) { return undefined; }
    return oldFolderColor(this.colorCustomizations(), this.pinnedColor(), this.hue());
  }

  /** Once per folder with an old color: make a project theme in it, remove it, or leave it. */
  private async offer(): Promise<void> {
    const color = this.oldColor();
    const offered = this.context.workspaceState.get<boolean>(OFFERED_KEY) === true;
    if (!shouldOfferMigration({ hasFolder: this.hasFolder(), color, offered })) { return; }
    await this.context.workspaceState.update(OFFERED_KEY, true);
    const choice = await vscode.window.showInformationMessage(
      `This folder has its own color, ${color}. GigglyBits now keeps a project's color in its theme's frame. Make a project theme in this color?`,
      'Make project theme', 'Remove the color', 'Not now',
    );
    if (choice === 'Make project theme') {
      await vscode.commands.executeCommand('gigglybits.openThemeLab', { frame: { color, style: 'filled' }, name: vscode.workspace.name });
    } else if (choice === 'Remove the color') {
      await this.removeOldColor();
    }
  }

  /** Clears the old overlay and the hue and pinnedColor settings in this folder. */
  private async removeOldColor(): Promise<void> {
    const current = this.colorCustomizations();
    const next = withoutIdentity(current);
    if (JSON.stringify(current ?? {}) !== JSON.stringify(next)) {
      await vscode.workspace.getConfiguration('workbench').update('colorCustomizations', Object.keys(next).length ? next : undefined, vscode.ConfigurationTarget.Workspace);
    }
    // The hue and pinnedColor settings are no longer declared, and VS Code can refuse to write an
    // undeclared setting. Clear each only when it is set, and leave it if VS Code refuses:
    // nothing draws it any more.
    for (const key of ['hue', 'pinnedColor']) {
      if (this.config().inspect(key)?.workspaceValue === undefined) { continue; }
      await Promise.resolve(this.config().update(key, undefined, vscode.ConfigurationTarget.Workspace)).catch(() => undefined);
    }
  }
}
