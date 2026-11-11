// Keeps the generated extension, GigglyBits Saved Themes, in step with the saved-theme library:
// it builds the extension's VSIX (src/vsix.ts) from companionPackage (src/themeLibrary.ts) and
// installs it with workbench.extensions.installExtension, skips the install when the installed
// copy already has the same content, uninstalls it when the library is empty, and repaints the
// window that installed. Measured on VS Code 1.145.3 (.copirate/working/research/named-themes-probe.md):
// an install lists its themes without a reload, but the theme a window shows keeps its old colors
// until workbench.colorTheme changes, so the repaint sets it to another theme and back.
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { COMPANION_ID, companionPackage, SavedTheme, SyntaxSet, themeLabel } from './themeLibrary';
import { vsix, VsixManifest } from './vsix';

/** GigglyBits' own id. The generated extension depends on it, so uninstalling GigglyBits offers to uninstall it too (probe Q6). */
export const PARENT_ID = 'EdgeInformation.gigglybits-theme-lab';
const FLIP_THEME = 'Default Dark Modern';

/** The installed generated extension's version with its patch number plus one, or 1.0.0 when none is installed. */
export function nextVersion(installed: string | undefined): string {
  const m = installed && /^(\d+)\.(\d+)\.(\d+)/.exec(installed);
  return m ? `${m[1]}.${m[2]}.${Number(m[3]) + 1}` : '1.0.0';
}

interface Pending { library: SavedTheme[]; sets: readonly SyntaxSet[]; settle: { resolve: () => void; reject: (e: unknown) => void }[] }

export class CompanionThemes {
  private running: Promise<void> | undefined;
  private pending: Pending | undefined;

  /**
   * `storagePath` is the extension's globalStorage folder, where the VSIX is written. `iconPath` is
   * GigglyBits' own icon, packed into the generated extension so the two look alike in the
   * Extensions view; when it cannot be read, the extension is built without an icon.
   */
  constructor(private readonly storagePath: string, private readonly iconPath?: string) {}

  /**
   * Brings the installed generated extension in line with library and sets. Calls run one at a
   * time: a call made while one runs waits, only the latest waiting call runs, and every waiting
   * call resolves when that run finishes, so a caller can rely on its library being installed.
   */
  sync(library: SavedTheme[], sets: readonly SyntaxSet[]): Promise<void> {
    if (!this.running) {
      this.running = this.run(library, sets).finally(() => this.next());
      return this.running;
    }
    return new Promise<void>((resolve, reject) => {
      const settle = [...(this.pending?.settle ?? []), { resolve, reject }];
      this.pending = { library, sets, settle };
    });
  }

  private next(): void {
    const pending = this.pending;
    this.pending = undefined;
    if (!pending) {
      this.running = undefined;
      return;
    }
    this.running = this.run(pending.library, pending.sets)
      .then(() => pending.settle.forEach(s => s.resolve()), e => pending.settle.forEach(s => s.reject(e)))
      .finally(() => this.next());
  }

  private async run(library: SavedTheme[], sets: readonly SyntaxSet[]): Promise<void> {
    const installed = vscode.extensions.getExtension(COMPANION_ID);
    if (!library.length) {
      if (installed) {
        await vscode.commands.executeCommand('workbench.extensions.uninstallExtension', COMPANION_ID);
      }
      return;
    }
    const pkgJson = installed?.packageJSON as { version?: string; gigglybits?: { contentHash?: string } } | undefined;
    const icon = this.iconPath ? await fs.promises.readFile(this.iconPath).catch(() => undefined) : undefined;
    const pkg = companionPackage(library, sets, { version: nextVersion(pkgJson?.version), engines: '^' + vscode.version, dependency: PARENT_ID, icon });
    if (pkgJson?.gigglybits?.contentHash === pkg.hash) {
      return;
    }
    await fs.promises.mkdir(this.storagePath, { recursive: true });
    const file = path.join(this.storagePath, 'gigglybits-saved-themes.vsix');
    await fs.promises.writeFile(file, vsix(pkg.manifest as unknown as VsixManifest, pkg.files));
    await vscode.commands.executeCommand('workbench.extensions.installExtension', vscode.Uri.file(file));
    await this.repaint(library.map(themeLabel));
  }

  /**
   * Sets the level that chooses this window's theme to another theme and back when it names one of
   * labels: the workspace value (a single folder's .vscode/settings.json, or a .code-workspace file),
   * else the user value. workbench.colorTheme is window-scoped, so there is no folder level to
   * write: in a single-folder window VS Code reports the folder's value as workspaceFolderValue too,
   * and refuses a WorkspaceFolder write (live check 2026-11-11, named-themes run 5).
   */
  private async repaint(labels: string[]): Promise<void> {
    const config = vscode.workspace.getConfiguration();
    const inspect = config.inspect<string>('workbench.colorTheme');
    const levels: [string | undefined, vscode.ConfigurationTarget][] = [
      [inspect?.workspaceValue, vscode.ConfigurationTarget.Workspace],
      [inspect?.globalValue, vscode.ConfigurationTarget.Global],
    ];
    const level = levels.find(([value]) => value !== undefined);
    if (!level || !labels.includes(level[0] as string)) {
      return;
    }
    const [value, target] = level;
    await config.update('workbench.colorTheme', FLIP_THEME, target);
    await config.update('workbench.colorTheme', value, target);
  }
}
