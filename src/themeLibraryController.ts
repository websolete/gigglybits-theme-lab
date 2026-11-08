// The VS Code side of the theme library: reading and writing gigglybits.library, writing each
// bound theme's colors into user settings scoped to its slot, the delete confirmation, the
// slot quick pick, Use in this project / Use everywhere, GigglyBits: Choose Theme, and the syntax
// sets in gigglybits.syntaxSets, whose every change rewrites every bound slot.
// Every decision is made in src/themeLibrary.ts, which jest tests without the extension host.
import * as fs from 'fs';
import * as vscode from 'vscode';
import { slotLabel } from '../scripts/theme-builder';
import {
  bindTheme, clearSlot, deleteSyntaxSet, deleteTheme, Design, freshestSetting, LibraryResult, parseLibrary, parseSyntaxSets,
  projectColors, projectFrame, projectFrameRefresh, SavedTheme, saveSyntaxSet, saveTheme, setDefaultSyntaxSet, settingsFilesFor, SyntaxSet,
  themesUsingSyntaxSet, writeAllSlots, writeSlot,
} from './themeLibrary';
import { oldFolderColor } from './identity';
import { leftoverRemoval } from './labSettings';

const LIBRARY = 'gigglybits.library';
const SYNTAX_SETS = 'gigglybits.syntaxSets';
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

  /** The syntax sets, from the user-level gigglybits.syntaxSets. */
  syntaxSets(): SyntaxSet[] {
    return parseSyntaxSets(this.config().inspect(SYNTAX_SETS)?.globalValue);
  }

  hasFolder(): boolean {
    return !!vscode.workspace.workspaceFolders?.length;
  }

  /** Saves a syntax set (saveSyntaxSet: updates id, else adds one), then rewrites every bound slot. */
  async saveSyntaxSet(input: { id?: string; name: string; colors: Record<string, string> }): Promise<void> {
    const result = saveSyntaxSet(await this.freshSyntaxSets(), { ...input, now: new Date().toISOString() });
    await this.writeSyntaxSets(result.sets);
    vscode.window.setStatusBarMessage(`Saved syntax set "${result.set.name}"`, 3000);
  }

  /** Makes the set id the default for new designs, or clears the default when id is null. */
  async setDefaultSyntaxSet(id: string | null): Promise<void> {
    await this.writeSyntaxSets(setDefaultSyntaxSet(await this.freshSyntaxSets(), id));
  }

  /**
   * Deletes the set id. When saved themes use it, a modal names the set and how many, and the
   * confirmed delete moves those themes to From this palette; then every bound slot is rewritten.
   */
  async deleteSyntaxSet(id: string): Promise<void> {
    const set = (await this.freshSyntaxSets()).find(s => s.id === id);
    if (!set) { return; }
    const using = themesUsingSyntaxSet(await this.freshLibrary(), id);
    if (using) {
      const choice = await vscode.window.showWarningMessage(
        `Delete the syntax set "${set.name}"?`,
        { modal: true, detail: `${using} saved theme${using === 1 ? ' uses' : 's use'} it and will take their code colors from their palette again.` },
        'Delete',
      );
      if (choice !== 'Delete') { return; }
    }
    // Read again: the modal may have stayed open while another window saved.
    const result = deleteSyntaxSet(await this.freshSyntaxSets(), await this.freshLibrary(), id);
    if (result.cleared) { await this.writeLibrary(result.library); }
    await this.writeSyntaxSets(result.sets);
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
      // No longer declared, so VS Code can refuse the write: clear only what is set, and leave an
      // inert leftover rather than fail Use in this project.
      for (const name of ['hue', 'pinnedColor'] as const) {
        if (this.identitySetting(name) === undefined) { continue; }
        await Promise.resolve(this.config().update(`gigglybits.identity.${name}`, undefined, vscode.ConfigurationTarget.Workspace)).catch(() => undefined);
      }
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

  /** The syntax sets as the settings file holds them now; application scope, like the library. */
  private async freshSyntaxSets(): Promise<SyntaxSet[]> {
    return parseSyntaxSets(await this.fresh(SYNTAX_SETS, 'library'));
  }

  /** Writes the sets, then every bound slot through writeAllSlots on fresh slot values. */
  private async writeSyntaxSets(sets: SyntaxSet[]): Promise<void> {
    await this.config().update(SYNTAX_SETS, sets, vscode.ConfigurationTarget.Global);
    await this.writeSlotValues(writeAllSlots(await this.slotValues(), await this.freshLibrary(), sets));
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

  /** Writes theme's slot block, with its syntax set's colors when it names one. */
  private async writeSlotSettings(theme: SavedTheme): Promise<void> {
    await this.writeSlotValues(writeSlot(await this.slotValues(), theme, await this.freshSyntaxSets()));
  }

  private async runSafely(action: () => Promise<void>): Promise<void> {
    try {
      await action();
    } catch (err) {
      vscode.window.showErrorMessage(`Theme library: ${(err as Error).message}`);
    }
  }

  /**
   * Removes the user-level color and token keys not tied to any theme (leftoverRemoval), which
   * override every theme, after a modal naming how many. Builds on the settings file, as slot
   * writes do, so a window open since before another window's save cannot write back its colors.
   */
  async removeLeftovers(): Promise<void> {
    const current = await this.slotValues();
    const removal = leftoverRemoval(current.colors, current.tokens);
    if (!removal) { return; }
    const settings = `${removal.count} color setting${removal.count === 1 ? '' : 's'}`;
    const choice = await vscode.window.showWarningMessage(
      `Remove ${settings} from your user settings?`,
      { modal: true, detail: 'They are not tied to any theme, so they override every theme. Theme blocks, GigglyBits ones included, are kept.' },
      'Remove',
    );
    if (choice !== 'Remove') { return; }
    // Read again: the modal may have stayed open while another window saved.
    const latest = await this.slotValues();
    const fresh = leftoverRemoval(latest.colors, latest.tokens);
    if (!fresh) { return; }
    await this.writeSlotValues({ colors: fresh.colors, tokens: fresh.tokens });
    vscode.window.setStatusBarMessage(`Removed ${fresh.count} color setting${fresh.count === 1 ? '' : 's'} not tied to any theme.`, 5000);
  }

  /** The panel's entry points, each reporting a failure instead of throwing into the message loop. */
  saveSafely(name: string, design: Design): Promise<void> { return this.runSafely(() => this.save(name, design)); }
  useSafely(id: string, where: UseTarget): Promise<void> { return this.runSafely(() => this.use(id, where)); }
  deleteSafely(id: string): Promise<void> { return this.runSafely(() => this.delete(id)); }
  saveSyntaxSetSafely(input: { id?: string; name: string; colors: Record<string, string> }): Promise<void> {
    return this.runSafely(() => this.saveSyntaxSet(input));
  }
  setDefaultSyntaxSetSafely(id: string | null): Promise<void> { return this.runSafely(() => this.setDefaultSyntaxSet(id)); }
  deleteSyntaxSetSafely(id: string): Promise<void> { return this.runSafely(() => this.deleteSyntaxSet(id)); }
  removeLeftoversSafely(): Promise<void> { return this.runSafely(() => this.removeLeftovers()); }
}
