// The VS Code side of the theme library: reading and writing gigglybits.library, writing each
// bound theme's colors into user settings scoped to its slot, the delete confirmation, the
// slot quick pick, Use in this project / Use everywhere, and GigglyBits: Choose Theme.
// Every decision is made in src/themeLibrary.ts, which jest tests without the extension host.
import * as fs from 'fs';
import * as vscode from 'vscode';
import { slotLabel } from '../scripts/theme-builder';
import {
  bindTheme, clearSlot, deleteTheme, Design, freshestSetting, LibraryResult, parseLibrary, projectFrame, projectFrameRefresh,
  SavedTheme, saveTheme, settingsFilesFor, withProjectFrame, writeSlot,
} from './themeLibrary';

const LIBRARY = 'gigglybits.library';
const NO_FOLDER = 'Open a folder to use a theme in this project.';

/** Where Use puts a saved theme: this folder's workbench.colorTheme, or the user one. */
export type UseTarget = 'project' | 'everywhere';

/** The part of the identity controller the library needs: whether this folder has its own color. */
export interface FolderColor {
  current(): Promise<{ fill: string; regions: string[] } | undefined>;
}

export class ThemeLibraryController {
  /** The settings files every write builds on (settingsFilesFor); undefined without a globalStorage path. */
  private readonly files: { library: string; colors: string } | undefined;
  private log: vscode.LogOutputChannel | undefined;

  /**
   * `globalStoragePath` is context.globalStorageUri.fsPath, which locates the settings files.
   * Without it, writes build on this window's configuration alone.
   */
  constructor(private readonly folderColor: FolderColor, globalStoragePath?: string) {
    this.files = globalStoragePath ? settingsFilesFor(globalStoragePath) : undefined;
  }

  register(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
      vscode.commands.registerCommand('gigglybits.chooseTheme', () => this.runSafely(() => this.chooseTheme())),
      // A theme saved or deleted in any window reaches this folder's frame.
      vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration(LIBRARY)) { void this.runSafely(() => this.refreshProjectFrame()); }
      }),
    );
    void this.runSafely(() => this.refreshProjectFrame());
  }

  /**
   * Keeps this folder's frame block in step with the saved theme its slot holds: rewritten when
   * the theme's frame changed, removed when the slot holds no saved theme (projectFrameRefresh).
   */
  private async refreshProjectFrame(): Promise<void> {
    if (!this.hasFolder()) { return; }
    const theme = this.config().inspect<string>('workbench.colorTheme')?.workspaceValue;
    const current = this.config().inspect('workbench.colorCustomizations')?.workspaceValue;
    const next = projectFrameRefresh(current, theme, this.library());
    if (next) {
      await this.config().update('workbench.colorCustomizations',
        Object.keys(next).length ? next : undefined, vscode.ConfigurationTarget.Workspace);
    }
  }

  /** The saved themes, from the user-level gigglybits.library. */
  library(): SavedTheme[] {
    return parseLibrary(this.config().inspect(LIBRARY)?.globalValue);
  }

  hasFolder(): boolean {
    return !!vscode.workspace.workspaceFolders?.length;
  }

  /** Saves design under name, binding a new theme to a slot and writing its slot's colors. */
  async save(name: string, design: Design): Promise<void> {
    const now = new Date().toISOString();
    const library = await this.freshLibrary();
    const result = await this.withSlot(library, (current, unbindId) => saveTheme(current, { name, design, now }, unbindId));
    if (!result) { return; }
    await this.writeLibrary(result.library);
    if (result.theme.slot !== null) {
      await this.writeSlotSettings(result.theme);
    }
    vscode.window.setStatusBarMessage(`Saved theme "${result.theme.name}"` + (result.theme.slot ? ` in ${slotLabel(result.theme.slot)}` : ''), 3000);
  }

  /** Puts the saved theme id on this folder or on every window, binding it to a slot first when it has none. */
  async use(id: string, where: UseTarget): Promise<void> {
    if (where === 'project' && !this.hasFolder()) {
      vscode.window.showInformationMessage(NO_FOLDER);
      return;
    }
    const library = await this.freshLibrary();
    const theme = library.find(t => t.id === id);
    if (!theme) { return; }
    let bound = theme;
    if (theme.slot === null) {
      const result = await this.withSlot(library, (current, unbindId) => bindTheme(current, id, unbindId));
      if (!result) { return; }
      await this.writeLibrary(result.library);
      bound = result.theme;
    }
    // Rewritten on every use, so a slot always carries the colors of the theme it holds.
    await this.writeSlotSettings(bound);
    const slot = bound.slot as number;
    if (where === 'project') {
      // The frame belongs to the project: the folder's own block for the slot beats the user one.
      const current = this.config().inspect('workbench.colorCustomizations')?.workspaceValue;
      await this.config().update('workbench.colorCustomizations',
        withProjectFrame(current, slot, projectFrame(bound)), vscode.ConfigurationTarget.Workspace);
    }
    const target = where === 'project' ? vscode.ConfigurationTarget.Workspace : vscode.ConfigurationTarget.Global;
    await this.config().update('workbench.colorTheme', slotLabel(slot), target);
    if (where === 'project') {
      await this.offerToRemoveFolderColor(bound.name);
    }
  }

  /** Deletes the saved theme id after a modal confirmation, removing its slot's colors. */
  async delete(id: string): Promise<void> {
    const theme = (await this.freshLibrary()).find(t => t.id === id);
    if (!theme) { return; }
    const choice = await vscode.window.showWarningMessage(
      `Delete the saved theme "${theme.name}"?`,
      { modal: true, detail: "Projects still using it fall back to the slot's default look." },
      'Delete',
    );
    if (choice !== 'Delete') { return; }
    // Read again: the modal may have stayed open while another window saved.
    const result = deleteTheme(await this.freshLibrary(), id);
    await this.writeLibrary(result.library);
    if (result.freedSlot !== null) {
      const next = clearSlot(await this.slotValues(), result.freedSlot);
      await this.writeSlotValues(next);
    }
  }

  /** GigglyBits: Choose Theme: pick a saved theme by name, then where to use it. */
  private async chooseTheme(): Promise<void> {
    const library = this.library();
    if (!library.length) {
      vscode.window.showInformationMessage('No saved themes yet. Save one from the Theme Lab with Save theme.');
      return;
    }
    const picked = await vscode.window.showQuickPick(
      library.map(t => ({ label: t.name, description: t.slot ? slotLabel(t.slot) : 'No slot', id: t.id })),
      { placeHolder: 'Choose a saved theme' },
    );
    if (!picked) { return; }
    const places: (vscode.QuickPickItem & { where: UseTarget })[] = [
      ...(this.hasFolder() ? [{ label: 'Use in this project', where: 'project' as const }] : []),
      { label: 'Use everywhere', where: 'everywhere' },
    ];
    const place = await vscode.window.showQuickPick(places, { placeHolder: `Use ${picked.label} where?` });
    if (place) {
      await this.use(picked.id, place.where);
    }
  }

  /**
   * Runs attempt; when every slot is bound, asks which bound theme to unbind and runs it again
   * with that theme's id. Undefined when the user dismisses the pick.
   */
  private async withSlot(
    library: SavedTheme[],
    attempt: (current: SavedTheme[], unbindId?: string) => LibraryResult,
  ): Promise<{ library: SavedTheme[]; theme: SavedTheme } | undefined> {
    const first = attempt(library);
    if (!('needsSlot' in first)) { return first; }
    const bound = library.filter(t => t.slot !== null);
    const picked = await vscode.window.showQuickPick(
      bound.map(t => ({ label: t.name, description: slotLabel(t.slot as number), id: t.id })),
      { placeHolder: 'All 12 theme slots are in use. Pick a theme to unbind; projects using it will show the new theme.' },
    );
    if (!picked) { return undefined; }
    // Read again: the pick may have stayed open while another window saved.
    const second = attempt(await this.freshLibrary(), picked.id);
    return 'needsSlot' in second ? undefined : second;
  }

  /** When this folder has its own color, which covers the theme's frame, offers to remove it. */
  private async offerToRemoveFolderColor(themeName: string): Promise<void> {
    let color: { fill: string } | undefined;
    try {
      color = await this.folderColor.current();
    } catch {
      color = undefined;
    }
    if (!color) { return; }
    const choice = await vscode.window.showInformationMessage(
      `This folder has its own color (${color.fill}), which covers ${themeName}'s frame. Remove the folder color?`,
      { modal: true },
      'Remove', 'Keep',
    );
    if (choice === 'Remove') {
      await vscode.commands.executeCommand('gigglybits.identity.clear');
    }
  }

  private config(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration();
  }

  private async writeLibrary(library: SavedTheme[]): Promise<void> {
    await this.config().update(LIBRARY, library, vscode.ConfigurationTarget.Global);
  }

  /**
   * key's user-level value to build a write on: the settings file's, so a window that was
   * already open cannot write back an older copy of another window's save, or this window's
   * configuration when the file cannot be read.
   */
  private async fresh(key: string, file: 'library' | 'colors'): Promise<unknown> {
    const configValue = this.config().inspect(key)?.globalValue;
    if (!this.files) { return configValue; }
    let text: string | undefined;
    try {
      text = await fs.promises.readFile(this.files[file], 'utf8');
    } catch {
      text = undefined;
    }
    const fresh = freshestSetting(text, key, configValue);
    if (fresh.differs) {
      this.logLine(`${key}: ${this.files[file]} differs from this window's configuration; the save builds on the file.`);
    }
    return fresh.value;
  }

  /** The saved themes as the settings file holds them now. */
  private async freshLibrary(): Promise<SavedTheme[]> {
    return parseLibrary(await this.fresh(LIBRARY, 'library'));
  }

  private async slotValues(): Promise<{ colors: unknown; tokens: unknown }> {
    return {
      colors: await this.fresh('workbench.colorCustomizations', 'colors'),
      tokens: await this.fresh('editor.tokenColorCustomizations', 'colors'),
    };
  }

  private logLine(line: string): void {
    this.log ??= vscode.window.createOutputChannel('GigglyBits', { log: true });
    this.log.info(line);
  }

  private async writeSlotValues(next: { colors: unknown; tokens: unknown }): Promise<void> {
    const Global = vscode.ConfigurationTarget.Global;
    await this.config().update('workbench.colorCustomizations', next.colors, Global);
    await this.config().update('editor.tokenColorCustomizations', next.tokens, Global);
  }

  private async writeSlotSettings(theme: SavedTheme): Promise<void> {
    await this.writeSlotValues(writeSlot(await this.slotValues(), theme));
  }

  private async runSafely(action: () => Promise<void>): Promise<void> {
    try {
      await action();
    } catch (err) {
      vscode.window.showErrorMessage(`Theme library: ${(err as Error).message}`);
    }
  }

  /** The panel's entry points, each reporting a failure instead of throwing into the message loop. */
  saveSafely(name: string, design: Design): Promise<void> { return this.runSafely(() => this.save(name, design)); }
  useSafely(id: string, where: UseTarget): Promise<void> { return this.runSafely(() => this.use(id, where)); }
  deleteSafely(id: string): Promise<void> { return this.runSafely(() => this.delete(id)); }
}
