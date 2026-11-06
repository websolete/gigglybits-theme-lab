// The VS Code side of the theme library: reading and writing gigglybits.library, writing each
// bound theme's colors into user settings scoped to its slot, the delete confirmation, the
// slot quick pick, Use in this project / Use everywhere, GigglyBits: Choose Theme, and the style
// groups in gigglybits.groups, whose every change rewrites every bound slot.
// Every decision is made in src/themeLibrary.ts, which jest tests without the extension host.
import * as fs from 'fs';
import * as vscode from 'vscode';
import { GroupFamily, slotLabel } from '../scripts/theme-builder';
import {
  activeGroups, bindTheme, clearSlot, deleteGroup, deleteTheme, Design, freshestSetting, LibraryResult, parseGroups, parseLibrary,
  projectColors, projectFrame, projectFrameRefresh, SavedTheme, saveGroup, saveTheme, setGroupOn, settingsFilesFor, StyleGroup,
  writeAllSlots, writeSlot,
} from './themeLibrary';
import { oldFolderColor } from './identity';

const LIBRARY = 'gigglybits.library';
const GROUPS = 'gigglybits.groups';
const NO_FOLDER = 'Open a folder to use a theme in this project.';

/** Where Use puts a saved theme: this folder's workbench.colorTheme, or the user one. */
export type UseTarget = 'project' | 'everywhere';

export class ThemeLibraryController {
  /** The settings files every write builds on (settingsFilesFor); undefined without a globalStorage path. */
  private readonly files: { library: string; colors: string } | undefined;
  private log: vscode.LogOutputChannel | undefined;

  /**
   * `globalStoragePath` is context.globalStorageUri.fsPath, which locates the settings files.
   * Without it, writes build on this window's configuration alone.
   */
  constructor(globalStoragePath?: string) {
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

  /** The style groups, from the user-level gigglybits.groups. */
  groups(): StyleGroup[] {
    return parseGroups(this.config().inspect(GROUPS)?.globalValue);
  }

  hasFolder(): boolean {
    return !!vscode.workspace.workspaceFolders?.length;
  }

  /** Saves a style group under name (saveGroup), then rewrites every bound slot. */
  async saveGroup(name: string, family: GroupFamily, roles: Record<string, string>): Promise<void> {
    const result = saveGroup(await this.freshGroups(), { name, family, roles, now: new Date().toISOString() });
    await this.writeGroups(result.groups);
    vscode.window.setStatusBarMessage(`Saved style group "${result.group.name}"`, 3000);
  }

  /** Switches the group id on or off (one on per family), then rewrites every bound slot. */
  async setGroupOn(id: string, on: boolean): Promise<void> {
    const groups = await this.freshGroups();
    if (!groups.some(g => g.id === id)) { return; }
    await this.writeGroups(setGroupOn(groups, id, on));
  }

  /** Deletes the group id after a modal confirmation, then rewrites every bound slot. */
  async deleteGroup(id: string): Promise<void> {
    const group = (await this.freshGroups()).find(g => g.id === id);
    if (!group) { return; }
    const choice = await vscode.window.showWarningMessage(
      `Delete the style group "${group.name}"?`,
      { modal: true, detail: group.on ? 'It is on, so every saved theme goes back to its own style for these colors.' : undefined },
      'Delete',
    );
    if (choice !== 'Delete') { return; }
    // Read again: the modal may have stayed open while another window saved.
    await this.writeGroups(deleteGroup(await this.freshGroups(), id));
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
    let oldColor: string | undefined;
    if (where === 'project') {
      // The frame belongs to the project: the folder's own block for the slot beats the user one.
      // A color left from the retired per-folder feature would paint over it, so it goes too.
      const current = this.config().inspect('workbench.colorCustomizations')?.workspaceValue;
      oldColor = oldFolderColor(current, this.identitySetting<string>('pinnedColor'), this.identitySetting<number>('hue'));
      await this.config().update('workbench.colorCustomizations',
        projectColors(current, slot, projectFrame(bound)), vscode.ConfigurationTarget.Workspace);
    }
    const target = where === 'project' ? vscode.ConfigurationTarget.Workspace : vscode.ConfigurationTarget.Global;
    await this.config().update('workbench.colorTheme', slotLabel(slot), target);
    if (oldColor) {
      await this.config().update('gigglybits.identity.hue', undefined, vscode.ConfigurationTarget.Workspace);
      await this.config().update('gigglybits.identity.pinnedColor', undefined, vscode.ConfigurationTarget.Workspace);
      vscode.window.setStatusBarMessage(`This folder's old color (${oldColor}) was replaced by ${bound.name}'s frame.`, 5000);
    }
  }

  /** A workspace value of the retired gigglybits.identity settings, or undefined. */
  private identitySetting<T>(name: 'hue' | 'pinnedColor'): T | undefined {
    return this.config().inspect<T>(`gigglybits.identity.${name}`)?.workspaceValue;
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

  /** The style groups as the settings file holds them now; application scope, like the library. */
  private async freshGroups(): Promise<StyleGroup[]> {
    return parseGroups(await this.fresh(GROUPS, 'library'));
  }

  /** Writes the groups, then every bound slot through writeAllSlots on fresh slot values. */
  private async writeGroups(groups: StyleGroup[]): Promise<void> {
    await this.config().update(GROUPS, groups, vscode.ConfigurationTarget.Global);
    await this.writeSlotValues(writeAllSlots(await this.slotValues(), await this.freshLibrary(), groups));
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

  /** Writes theme's slot block with the groups that are on. */
  private async writeSlotSettings(theme: SavedTheme): Promise<void> {
    await this.writeSlotValues(writeSlot(await this.slotValues(), theme, activeGroups(await this.freshGroups())));
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
  saveGroupSafely(name: string, family: GroupFamily, roles: Record<string, string>): Promise<void> {
    return this.runSafely(() => this.saveGroup(name, family, roles));
  }
  setGroupOnSafely(id: string, on: boolean): Promise<void> { return this.runSafely(() => this.setGroupOn(id, on)); }
  deleteGroupSafely(id: string): Promise<void> { return this.runSafely(() => this.deleteGroup(id)); }
}
