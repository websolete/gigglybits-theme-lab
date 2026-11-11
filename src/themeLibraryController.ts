// The VS Code side of the theme library: reading and writing gigglybits.library, keeping the
// generated extension GigglyBits Saved Themes in step with it (src/companionThemes.ts), the delete
// confirmation, Use in this project / Use everywhere, GigglyBits: Choose Theme, the syntax sets in
// gigglybits.syntaxSets, and the start-up migration of settings from the retired theme slots.
// Every decision is made in src/themeLibrary.ts, which jest tests without the extension host.
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { CompanionThemes } from './companionThemes';
import {
  deleteSyntaxSet, deleteTheme, Design, freshestSetting, parseLibrary, parseSyntaxSets, projectColors, projectFrame, projectFrameRefresh,
  SavedTheme, saveSyntaxSet, saveTheme, setDefaultSyntaxSet, settingsFilesFor, SyntaxSet, themeLabel, themesUsingSyntaxSet, userSlotMigration,
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
  /** The generated extension's keeper; undefined without a globalStorage path, as in the bundle smoke test. */
  private readonly companion: CompanionThemes | undefined;
  private log: vscode.LogOutputChannel | undefined;
  /** Settles when the start-up steps register() began have finished. */
  ready: Promise<void> = Promise.resolve();

  /**
   * `globalStoragePath` is context.globalStorageUri.fsPath, which locates the settings files and
   * holds the generated extension's VSIX and the slot-settings backup. Without it, writes build on
   * this window's configuration alone and nothing is generated, installed or migrated.
   */
  constructor(private readonly globalStoragePath?: string, companion?: CompanionThemes, iconPath?: string) {
    this.files = globalStoragePath ? settingsFilesFor(globalStoragePath) : undefined;
    this.companion = companion ?? (globalStoragePath ? new CompanionThemes(globalStoragePath, iconPath) : undefined);
  }

  register(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
      vscode.commands.registerCommand('gigglybits.chooseTheme', () => this.runSafely(() => this.chooseTheme())),
      // A theme saved or deleted in any window reaches this folder's frame.
      vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration(LIBRARY)) { void this.runSafely(() => this.refreshProjectFrame()); }
      }),
    );
    this.ready = this.runSafely(() => this.startUp());
  }

  /**
   * Start-up, in order: bring the generated extension in line with the library; move the user
   * settings off the retired slots (backup first); then this folder's frame and theme. When the
   * install fails, the user-settings migration is skipped, so user settings never name a theme that
   * is not there. A failed install also skips this window's folder step here, but the folder step
   * runs on every library change too (register) without waiting for an install, so a folder can
   * move to a 'GigglyBits: <name>' label before that theme is installed.
   */
  private async startUp(): Promise<void> {
    if (this.companion && this.globalStoragePath) {
      const library = await this.freshLibrary();
      await this.companion.sync(library, await this.freshSyntaxSets());
      await this.migrateUserSettings(library);
    }
    await this.refreshProjectFrame();
  }

  /** Removes the user slot blocks and moves a slot-label user theme to its saved theme, after writing a backup. */
  private async migrateUserSettings(library: SavedTheme[]): Promise<void> {
    const values = await this.slotValues();
    const theme = await this.fresh('workbench.colorTheme', 'colors');
    const result = userSlotMigration({ ...values, theme: typeof theme === 'string' ? theme : undefined }, library);
    if (!result || !this.globalStoragePath) { return; }
    const stamp = new Date().toISOString().replace(/:/g, '-');
    await fs.promises.mkdir(this.globalStoragePath, { recursive: true });
    await fs.promises.writeFile(path.join(this.globalStoragePath, `slot-blocks-backup-${stamp}.json`), JSON.stringify(result.removed, null, 2));
    await this.writeColorValues({ colors: result.colors, tokens: result.tokens });
    if (result.theme !== theme) {
      await this.config().update('workbench.colorTheme', result.theme, vscode.ConfigurationTarget.Global);
    }
  }

  /**
   * Keeps this folder's frame block and theme in step with the library (projectFrameRefresh): a
   * slot label moves to its saved theme, a changed frame is rewritten, a deleted theme's block goes.
   */
  private async refreshProjectFrame(): Promise<void> {
    if (!this.hasFolder()) { return; }
    const theme = this.config().inspect<string>('workbench.colorTheme')?.workspaceValue;
    const current = this.config().inspect('workbench.colorCustomizations')?.workspaceValue;
    const next = projectFrameRefresh(current, theme, this.library());
    if (next?.colors) {
      await this.config().update('workbench.colorCustomizations',
        Object.keys(next.colors).length ? next.colors : undefined, vscode.ConfigurationTarget.Workspace);
    }
    if (next?.theme) {
      await this.config().update('workbench.colorTheme', next.theme, vscode.ConfigurationTarget.Workspace);
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

  /** Saves a syntax set (saveSyntaxSet: updates id, else adds one), then rebuilds the generated extension. */
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
   * confirmed delete moves those themes to From this palette; then the generated extension is rebuilt.
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

  /** Saves design under name, then rebuilds the generated extension so the theme is in the picker. */
  async save(name: string, design: Design): Promise<void> {
    const now = new Date().toISOString();
    const result = saveTheme(await this.freshLibrary(), { name, design, now });
    await this.writeLibrary(result.library);
    await this.sync(result.library);
    vscode.window.setStatusBarMessage(`Saved theme "${result.theme.name}"`, 3000);
  }

  /** Puts the saved theme id on this folder or on every window, once the generated extension holds it. */
  async use(id: string, where: UseTarget): Promise<void> {
    if (where === 'project' && !this.hasFolder()) {
      vscode.window.showInformationMessage(NO_FOLDER);
      return;
    }
    const library = await this.freshLibrary();
    const theme = library.find(t => t.id === id);
    if (!theme) { return; }
    await this.sync(library);
    const label = themeLabel(theme);
    let oldColor: string | undefined;
    if (where === 'project') {
      // The frame belongs to the project: the folder's own block for the theme beats the theme file.
      // A color left from the retired per-folder feature would paint over it, so it goes too.
      const current = this.config().inspect('workbench.colorCustomizations')?.workspaceValue;
      oldColor = oldFolderColor(current, this.identitySetting<string>('pinnedColor'), this.identitySetting<number>('hue'));
      await this.config().update('workbench.colorCustomizations',
        projectColors(current, label, projectFrame(theme)), vscode.ConfigurationTarget.Workspace);
    }
    const target = where === 'project' ? vscode.ConfigurationTarget.Workspace : vscode.ConfigurationTarget.Global;
    await this.config().update('workbench.colorTheme', label, target);
    if (oldColor) {
      // No longer declared, so VS Code can refuse the write: clear only what is set, and leave an
      // inert leftover rather than fail Use in this project.
      for (const name of ['hue', 'pinnedColor'] as const) {
        if (this.identitySetting(name) === undefined) { continue; }
        await Promise.resolve(this.config().update(`gigglybits.identity.${name}`, undefined, vscode.ConfigurationTarget.Workspace)).catch(() => undefined);
      }
      vscode.window.setStatusBarMessage(`This folder's old color (${oldColor}) was replaced by ${theme.name}'s frame.`, 5000);
    }
  }

  /** A workspace value of the retired gigglybits.identity settings, or undefined. */
  private identitySetting<T>(name: 'hue' | 'pinnedColor'): T | undefined {
    return this.config().inspect<T>(`gigglybits.identity.${name}`)?.workspaceValue;
  }

  /**
   * Deletes the saved theme id after a modal confirmation, then rebuilds the generated extension.
   * The probe showed a window showing the deleted theme keeps its colors until it reloads.
   */
  async delete(id: string): Promise<void> {
    const theme = (await this.freshLibrary()).find(t => t.id === id);
    if (!theme) { return; }
    const choice = await vscode.window.showWarningMessage(
      `Delete the saved theme "${theme.name}"?`,
      { modal: true, detail: "Windows showing it keep its colors until they reload, then use VS Code's default theme." },
      'Delete',
    );
    if (choice !== 'Delete') { return; }
    // Read again: the modal may have stayed open while another window saved.
    const result = deleteTheme(await this.freshLibrary(), id);
    await this.writeLibrary(result.library);
    await this.sync(result.library);
  }

  /** GigglyBits: Choose Theme: pick a saved theme by name, then where to use it. */
  private async chooseTheme(): Promise<void> {
    const library = this.library();
    if (!library.length) {
      vscode.window.showInformationMessage('No saved themes yet. Save one from the Theme Lab with Save theme.');
      return;
    }
    const picked = await vscode.window.showQuickPick(
      library.map(t => ({ label: t.name, id: t.id })),
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

  /** Brings the generated extension in line with library and the current syntax sets. */
  private async sync(library: SavedTheme[]): Promise<void> {
    await this.companion?.sync(library, await this.freshSyntaxSets());
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

  /** Writes the sets, then rebuilds the generated extension with them. */
  private async writeSyntaxSets(sets: SyntaxSet[]): Promise<void> {
    await this.config().update(SYNTAX_SETS, sets, vscode.ConfigurationTarget.Global);
    await this.companion?.sync(await this.freshLibrary(), sets);
  }

  /** The user-level color and token settings as the settings file holds them now. */
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

  private async writeColorValues(next: { colors: unknown; tokens: unknown }): Promise<void> {
    const Global = vscode.ConfigurationTarget.Global;
    await this.config().update('workbench.colorCustomizations', next.colors, Global);
    await this.config().update('editor.tokenColorCustomizations', next.tokens, Global);
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
   * change every theme wherever the theme's own block does not set that key, after a modal naming
   * how many. Builds on the settings file, so a window open since before another window's save
   * cannot write back its colors.
   */
  async removeLeftovers(): Promise<void> {
    const current = await this.slotValues();
    const removal = leftoverRemoval(current.colors, current.tokens);
    if (!removal) { return; }
    const settings = `${removal.count} color setting${removal.count === 1 ? '' : 's'}`;
    const choice = await vscode.window.showWarningMessage(
      `Remove ${settings} from your user settings?`,
      { modal: true, detail: 'They are not tied to any theme, so they change every theme, though a theme\'s own blocks take priority. Theme blocks, GigglyBits ones included, are kept.' },
      'Remove',
    );
    if (choice !== 'Remove') { return; }
    // Read again: the modal may have stayed open while another window saved.
    const latest = await this.slotValues();
    const fresh = leftoverRemoval(latest.colors, latest.tokens);
    if (!fresh) { return; }
    await this.writeColorValues({ colors: fresh.colors, tokens: fresh.tokens });
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
