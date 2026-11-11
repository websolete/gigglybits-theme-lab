// The host side of the floating Theme Preview window (src/themePreviewPanel.ts with
// src/themeLabPanel.ts): a fresh Lab opens the panel and floats it, Open Preview opens it
// again once closed, a part clicked in the window reaches the Theme Lab that is open at the
// time, and closing the Lab closes the window.

/* eslint-disable @typescript-eslint/no-explicit-any */

type Handler = (msg: any) => unknown;

interface FakePanel {
  viewType: string;
  posted: any[];
  /** reveal calls and posted messages, in the order they happened. */
  events: any[];
  receive: Handler | undefined;
  dispose(): void;
}

const panels: FakePanel[] = [];
const executed: string[] = [];
/** 'workbench.<key>' -> value, read by the stub's getConfiguration. */
const settings: Record<string, unknown> = {};
/** Every onDidChangeConfiguration listener a panel registered. */
const configListeners: Array<(e: any) => void> = [];
/** Full key -> what inspect() returns for it, and every update() made, in order. */
const inspected: Record<string, unknown> = {};
const updates: Array<{ key: string; value: unknown; target: unknown }> = [];
/** Every status bar message shown, in order. */
const statusMessages: string[] = [];
/** Every information message shown, in order, and the button the next one resolves to. */
const infoMessages: Array<{ text: string; buttons: string[] }> = [];
const infoAnswer: { next: string | undefined } = { next: undefined };
/** Every quick pick shown, and the item id the next one resolves to (none: dismissed). */
const quickPicks: Array<{ items: any[]; options: any }> = [];
const quickPickAnswer: { id: string | undefined } = { id: undefined };
/** What vscode.workspace.workspaceFolders returns. */
const workspaceState: { folders: Array<{ uri: unknown; name: string }> | undefined } = { folders: undefined };
/** What vscode.extensions.all returns, and every extensions.onDidChange listener; fireExtensionsChanged calls them. */
const installedExtensions: any[] = [];
const extensionListeners: Array<() => void> = [];
const fireExtensionsChanged = () => { for (const fn of extensionListeners) { fn(); } };
/** Every warning message shown, and the button the next one resolves to (none: dismissed). */
const warnings: Array<{ text: string; options: any; buttons: string[] }> = [];
const warningAnswer: { next: string | undefined } = { next: undefined };
/** vscode.window.activeColorTheme.kind, vscode.workspace.workspaceFile, and every showTextDocument call. */
const themeState: { kind: number } = { kind: 2 };
const workspaceFileState: { file: unknown } = { file: undefined };
const shownDocuments: unknown[] = [];

jest.mock('vscode', () => {
  const disposable = { dispose: () => undefined };
  const uri = (path: string) => ({ path, fsPath: path, toString: () => path });
  return {
    ColorThemeKind: { Light: 1, Dark: 2, HighContrast: 3, HighContrastLight: 4 },
    ViewColumn: { Active: -1, Beside: -2 },
    Uri: { joinPath: (base: any, ...parts: string[]) => uri([base.path ?? base.fsPath, ...parts].join('/')) },
    ConfigurationTarget: { Global: 1, Workspace: 2, WorkspaceFolder: 3 },
    RelativePattern: class {},
    window: {
      createWebviewPanel: (viewType: string) => {
        let onDispose: (() => void) | undefined;
        const panel: FakePanel & { webview: any; viewColumn: number; reveal: (...args: any[]) => void; onDidDispose: (fn: () => void) => any } = {
          viewType,
          posted: [],
          events: [],
          receive: undefined,
          viewColumn: 1,
          dispose: () => onDispose && onDispose(),
          reveal: (...args: any[]) => { panel.events.push({ reveal: args }); },
          onDidDispose: (fn: () => void) => { onDispose = fn; return disposable; },
          webview: {
            cspSource: 'vscode-resource:',
            options: {},
            html: '',
            asWebviewUri: (u: any) => u,
            postMessage: async (msg: any) => { panel.posted.push(msg); panel.events.push(msg); return true; },
            onDidReceiveMessage: (fn: Handler) => { panel.receive = fn; return disposable; },
          },
        };
        panels.push(panel);
        return panel;
      },
      onDidChangeActiveColorTheme: () => disposable,
      showWarningMessage: async (text: string, options: any, ...buttons: string[]) => {
        warnings.push({ text, options, buttons });
        const answer = warningAnswer.next;
        warningAnswer.next = undefined;
        return answer;
      },
      get activeColorTheme() { return { kind: themeState.kind }; },
      showTextDocument: async (doc: unknown) => { shownDocuments.push(doc); },
      showErrorMessage: () => undefined,
      showInformationMessage: async (text: string, ...buttons: string[]) => {
        infoMessages.push({ text, buttons });
        const answer = infoAnswer.next;
        infoAnswer.next = undefined;
        return answer;
      },
      setStatusBarMessage: (text: string) => { statusMessages.push(text); return disposable; },
      showQuickPick: async (items: any[], options: any) => {
        quickPicks.push({ items, options });
        const id = quickPickAnswer.id;
        quickPickAnswer.id = undefined;
        return items.find(i => i.id === id);
      },
    },
    workspace: {
      get workspaceFolders() { return workspaceState.folders; },
      get workspaceFile() { return workspaceFileState.file; },
      onDidChangeConfiguration: (fn: (e: any) => void) => { configListeners.push(fn); return disposable; },
      getConfiguration: (section?: string) => ({
        get: (key: string) => settings[section ? `${section}.${key}` : key],
        inspect: (key: string) => inspected[section ? `${section}.${key}` : key],
        update: async (key: string, value: unknown, target: unknown) => { updates.push({ key: section ? `${section}.${key}` : key, value, target }); },
      }),
    },
    commands: {
      executeCommand: async (command: string) => { executed.push(command); },
    },
    extensions: {
      get all() { return installedExtensions; },
      onDidChange: (fn: () => void) => { extensionListeners.push(fn); return disposable; },
    },
  };
});

// jest hoists the jest.mock call above, so this import already sees the mocked vscode.
import { ThemeLabPanel, tryThemeTarget } from '../src/themeLabPanel';
import { hasWebviewTab, ThemePreviewPanel } from '../src/themePreviewPanel';
import { deactivate } from '../src/extension';
import * as fs from 'fs';
import * as path from 'path';

const identity: any = { pin: async () => undefined, current: async () => undefined, onDidChange: () => ({ dispose: () => undefined }) };
const memento: any = { get: () => undefined, update: async () => undefined };
const library: any = { library: () => [], syntaxSets: () => [], hasFolder: () => false };
const extensionUri: any = { path: '/ext', fsPath: '/ext' };

const labs = () => panels.filter(p => p.viewType === 'gigglybits.themeLab');
/** The newest Theme Preview panel, the open one when one is open. */
const preview = () => panels.filter(p => p.viewType === 'gigglybits.themePreview').pop()!;

describe('Theme Preview window, host side', () => {
  it('Open Preview opens Theme Preview, floats it, and sends a pick to the Theme Lab open at the time', async () => {
    ThemeLabPanel.show(extensionUri, identity, memento, library);
    const first = labs()[0];
    await first.receive!({ type: 'previewState', palette: { hue: 12 }, syntaxSets: [] });
    await first.receive!({ type: 'openPreviewWindow' });
    // A compact window of its own, not kept on top.
    expect(executed).toEqual([
      'workbench.action.moveEditorToNewWindow',
      'workbench.action.enableCompactAuxiliaryWindow',
    ]);
    const window = preview();
    await window.receive!({ type: 'ready' });
    expect(window.posted.filter(m => m.type === 'state')).toEqual([{ type: 'state', palette: { hue: 12 }, syntaxSets: [] }]);

    const part = { card: 'workbench', index: 3, keys: ['button.background'], around: [], label: 'OK', region: null, fixed: null };
    await window.receive!({ type: 'pickPart', part });
    expect(first.posted.filter(m => m.type === 'pickPart')).toEqual([{ type: 'pickPart', part }]);

  });

  it('{#lab-close-closes-preview} closing the Theme Lab closes the Theme Preview window with it', async () => {
    for (const p of [...panels]) { p.dispose(); }
    ThemeLabPanel.show(extensionUri, identity, memento, library);
    const lab = labs()[labs().length - 1];
    await lab.receive!({ type: 'openPreviewWindow' });
    expect(ThemePreviewPanel.isOpen()).toBe(true);
    const disposed = jest.spyOn(preview(), 'dispose');
    lab.dispose();
    expect(disposed).toHaveBeenCalledTimes(1);
    expect(ThemePreviewPanel.isOpen()).toBe(false);
    expect(ThemeLabPanel.isOpen()).toBe(false);
  });

  it('closing the Theme Preview on its own leaves the Theme Lab open and tells it so', async () => {
    for (const p of [...panels]) { p.dispose(); }
    ThemeLabPanel.show(extensionUri, identity, memento, library);
    const lab = labs()[labs().length - 1];
    await lab.receive!({ type: 'openPreviewWindow' });
    preview().dispose();
    await Promise.resolve();
    expect(ThemeLabPanel.isOpen()).toBe(true);
    expect(lab.posted.filter(m => m.type === 'previewDetached').pop()).toEqual({ type: 'previewDetached', detached: false });
  });

  it('{#preview-gets-sets} passes the syntax sets in previewState on to the preview window', async () => {
    ThemeLabPanel.show(extensionUri, identity, memento, library);
    const lab = labs()[labs().length - 1];
    const sets = [{ id: 's1', name: 'Mine', colors: { keyword: '#c792ea' }, isDefault: true, savedAt: '' }];
    await lab.receive!({ type: 'openPreviewWindow' });
    const window = preview();
    await window.receive!({ type: 'ready' });
    await lab.receive!({ type: 'previewState', palette: { hue: 3 }, syntaxSets: sets });
    expect(window.posted[window.posted.length - 1]).toEqual({ type: 'state', palette: { hue: 3 }, syntaxSets: sets });
  });

  it('{#host-routes-sets} routes saveSyntaxSet, deleteSyntaxSet and setDefaultSyntaxSet to the library; a saveGroup message does nothing', async () => {
    const calls: string[] = [];
    const routed: any = {
      ...library,
      saveSyntaxSetSafely: async (input: unknown) => { calls.push('save ' + JSON.stringify(input)); },
      deleteSyntaxSetSafely: async (id: unknown) => { calls.push('delete ' + id); },
      setDefaultSyntaxSetSafely: async (id: unknown) => { calls.push('default ' + id); },
      saveGroupSafely: async () => { calls.push('group'); },
    };
    // A Lab already open is only revealed by show(), so close it to get one on this library.
    for (const open of labs()) { open.dispose(); }
    ThemeLabPanel.show(extensionUri, identity, memento, routed);
    const lab = labs()[labs().length - 1];
    await lab.receive!({ type: 'saveSyntaxSet', id: 's1', name: ' Mine ', colors: { keyword: '#c792ea' } });
    await lab.receive!({ type: 'deleteSyntaxSet', id: 's1' });
    await lab.receive!({ type: 'setDefaultSyntaxSet', id: null });
    await lab.receive!({ type: 'saveGroup', name: 'Old', family: 'tabs', roles: {} } as any);
    expect(calls).toEqual(['save {"id":"s1","name":"Mine","colors":{"keyword":"#c792ea"}}', 'delete s1', 'default null']);
  });

  it('{#opens-detached} a freshly opened Lab opens the floating window on ready, so its preview starts hidden', async () => {
    for (const p of [...panels]) { p.dispose(); }
    executed.length = 0;
    ThemeLabPanel.show(extensionUri, identity, memento, library);
    const lab = labs()[labs().length - 1];
    const windows = () => panels.filter(p => p.viewType === 'gigglybits.themePreview');
    const before = windows().length;
    await lab.receive!({ type: 'ready' });
    expect(windows()).toHaveLength(before + 1);
    expect(executed).toEqual([
      'workbench.action.moveEditorToNewWindow',
      'workbench.action.enableCompactAuxiliaryWindow',
    ]);
    expect(lab.posted.filter(m => m.type === 'previewDetached')).toEqual([{ type: 'previewDetached', detached: true }]);
  });

  it('a Lab whose window is closed is told so, a later ready does not reopen it, and Open Preview does', async () => {
    for (const p of [...panels]) { p.dispose(); }
    ThemeLabPanel.show(extensionUri, identity, memento, library);
    const lab = labs()[labs().length - 1];
    const detached = () => lab.posted.filter(m => m.type === 'previewDetached').map(m => m.detached);
    /** How many Theme Preview panels were ever created; disposed ones stay in `panels`. */
    const windows = () => panels.filter(p => p.viewType === 'gigglybits.themePreview').length;
    await lab.receive!({ type: 'ready' });
    expect(detached()).toEqual([true]);
    const count = windows();
    // The user closes the window: disposing its panel tells the Lab.
    preview().dispose();
    expect(detached()).toEqual([true, false]);
    // The page reloading sends ready again; the window stays closed.
    await lab.receive!({ type: 'ready' });
    expect(windows()).toBe(count);
    expect(detached()).toEqual([true, false, false]);
    // Open Preview on the Lab's Preview card opens it again.
    await lab.receive!({ type: 'openPreviewWindow' });
    expect(windows()).toBe(count + 1);
    expect(detached()).toEqual([true, false, false, true]);
  });

  it('a revived Lab\'s first ready opens no window and says the window is closed', async () => {
    for (const p of [...panels]) { p.dispose(); }
    const windows = () => panels.filter(p => p.viewType === 'gigglybits.themePreview').length;
    const count = windows();
    const revived = (await import('vscode') as any).window.createWebviewPanel('gigglybits.themeLab');
    ThemeLabPanel.revive(revived, extensionUri, identity, memento, library);
    await revived.receive({ type: 'ready' });
    expect(windows()).toBe(count);
    expect(revived.posted.filter((m: any) => m.type === 'previewDetached')).toEqual([{ type: 'previewDetached', detached: false }]);
  });

  it('{#ready-order} on ready the Lab posts modernUI, previewDetached, library, start, themeScope, leftovers, overrides, identity, then installedStarters, and no theme list', async () => {
    for (const p of [...panels]) { p.dispose(); }
    const revived = (await import('vscode') as any).window.createWebviewPanel('gigglybits.themeLab');
    ThemeLabPanel.revive(revived, extensionUri, identity, memento, library);
    await revived.receive({ type: 'ready' });
    const types = revived.posted.map((m: any) => m.type);
    expect(types).toEqual(['modernUI', 'previewDetached', 'library', 'start', 'themeScope', 'leftovers', 'overrides', 'identity', 'installedStarters']);
    expect(types).not.toContain('themes');
  });

  it('{#host-posts} sends the installed dark themes as starters on ready, and again when extensions change', async () => {
    const fixture = path.join(__dirname, 'fixtures', 'theme-ext');
    installedExtensions.length = 0;
    installedExtensions.push({ id: 'fixture.fixture-theme', extensionPath: fixture, packageJSON: JSON.parse(fs.readFileSync(path.join(fixture, 'package.json'), 'utf8')) });
    try {
      for (const p of [...panels]) { p.dispose(); }
      const revived = (await import('vscode') as any).window.createWebviewPanel('gigglybits.themeLab');
      ThemeLabPanel.revive(revived, extensionUri, identity, memento, library);
      const starters = () => revived.posted.filter((m: any) => m.type === 'installedStarters');
      await revived.receive({ type: 'ready' });
      expect(starters()).toHaveLength(1);
      expect(starters()[0].starters.map((s: any) => [s.label, s.colors.keyword])).toEqual([['Fixture Dark (localized)', '#ff8800']]);
      fireExtensionsChanged();
      // The listener reads the theme files without being awaited; wait up to 3 s for its post.
      for (let i = 0; i < 150 && starters().length < 2; i++) { await new Promise(resolve => setTimeout(resolve, 20)); }
      expect(starters()).toHaveLength(2);
      expect(starters()[1].starters.map((s: any) => s.label)).toEqual(['Fixture Dark (localized)']);
    } finally {
      installedExtensions.length = 0;
    }
  });

  it('{#reveal-pick} a pick from the Theme Preview brings the Lab forward and focuses it, before posting pickPart', async () => {
    for (const p of labs()) {p.dispose();}
    ThemeLabPanel.show(extensionUri, identity, memento, library);
    const lab = labs()[labs().length - 1];
    await lab.receive!({ type: 'openPreviewWindow' });
    lab.events.length = 0;
    const part = { card: 'workbench', index: 1, keys: ['tab.border'], around: [], label: '', region: 'tabs', fixed: null };
    await preview().receive!({ type: 'pickPart', part });
    expect(lab.events).toEqual([{ reveal: [1, false] }, { type: 'pickPart', part }]);
  });
});

describe('modern UI settings, host side', () => {
  const modernMessages = (p: FakePanel) => p.posted.filter(m => m.type === 'modernUI');

  it('the Theme Lab sends them on ready and again when one changes; the Theme Preview sends them on ready', async () => {
    // Start from a fresh Lab and window: close whatever the test above left open.
    for (const p of [...panels]) { p.dispose(); }
    ThemeLabPanel.show(extensionUri, identity, memento, library);
    const lab = labs()[labs().length - 1];
    await lab.receive!({ type: 'ready' });
    expect(modernMessages(lab)).toEqual([{ type: 'modernUI', modernUI: { modern: true, uppercase: false, tabStyle: 'connected', activityBar: 'default' } }]);

    settings['workbench.experimental.modernUIUppercaseViewHeaders'] = true;
    const event = { affectsConfiguration: (id: string) => id === 'workbench.experimental.modernUIUppercaseViewHeaders' };
    for (const listener of configListeners) { listener(event); }
    expect(modernMessages(lab)[1]).toEqual({ type: 'modernUI', modernUI: { modern: true, uppercase: true, tabStyle: 'connected', activityBar: 'default' } });

    await lab.receive!({ type: 'openPreviewWindow' });
    // The window opened with the Lab, so it already had the change; its own ready sends them again.
    const window = panels.filter(p => p.viewType === 'gigglybits.themePreview').pop()!;
    window.posted.length = 0;
    await window.receive!({ type: 'ready' });
    expect(modernMessages(window)).toEqual([{ type: 'modernUI', modernUI: { modern: true, uppercase: true, tabStyle: 'connected', activityBar: 'default' } }]);
  });
});

describe('theme scope and Change default, host side', () => {
  const scopes = (p: FakePanel) => p.posted.filter(m => m.type === 'themeScope');

  it('{#scope-message} posts this window\'s theme, its source and the default on ready, and again when workbench.colorTheme changes', async () => {
    inspected['workbench.colorTheme'] = { globalValue: 'Dark Modern', workspaceValue: 'GigglyBits Theme 2' };
    for (const p of [...panels]) { p.dispose(); }
    ThemeLabPanel.show(extensionUri, identity, memento, library);
    const lab = labs()[labs().length - 1];
    await lab.receive!({ type: 'ready' });
    expect(scopes(lab)).toEqual([{ type: 'themeScope', window: { label: 'GigglyBits Theme 2', source: 'project' }, defaultTheme: 'Dark Modern' }]);
    inspected['workbench.colorTheme'] = { globalValue: 'Dark Modern' };
    const event = { affectsConfiguration: (id: string) => id === 'workbench.colorTheme' };
    for (const listener of configListeners) { listener(event); }
    await new Promise(r => setTimeout(r, 0));
    delete inspected['workbench.colorTheme'];
    expect(scopes(lab)).toHaveLength(2);
    expect(scopes(lab)[1]).toEqual({ type: 'themeScope', window: { label: 'Dark Modern', source: 'default' }, defaultTheme: 'Dark Modern' });
  });

  it('{#change-default} Change default writes the picked theme to the user settings, marks the current default, and a dismissed pick writes nothing', async () => {
    installedExtensions.length = 0;
    installedExtensions.push({ id: 'vscode.theme-defaults', extensionPath: '/vs', packageJSON: { contributes: { themes: [
      { id: 'Dark Modern', label: 'Dark Modern', uiTheme: 'vs-dark', path: './dark.json' },
      { label: 'Light Modern', uiTheme: 'vs', path: './light.json' },
    ] } } });
    inspected['workbench.colorTheme'] = { globalValue: 'Light Modern', workspaceValue: 'GigglyBits Theme 2' };
    for (const p of [...panels]) { p.dispose(); }
    ThemeLabPanel.show(extensionUri, identity, memento, library);
    const lab = labs()[labs().length - 1];
    updates.length = 0;
    quickPicks.length = 0;
    quickPickAnswer.id = 'Dark Modern';
    await lab.receive!({ type: 'changeDefaultTheme' });
    expect(quickPicks[0].options).toEqual({ placeHolder: 'Pick the theme new windows use' });
    expect(quickPicks[0].items.map(i => [i.label, i.description])).toEqual([['Dark Modern', undefined], ['Light Modern', 'current default']]);
    expect(updates).toEqual([{ key: 'workbench.colorTheme', value: 'Dark Modern', target: 1 }]);
    updates.length = 0;
    await lab.receive!({ type: 'changeDefaultTheme' });
    delete inspected['workbench.colorTheme'];
    installedExtensions.length = 0;
    expect(updates).toEqual([]);
  });
});

describe('leftover colors, host side', () => {
  it('{#leftovers-message} posts the user-level color keys not tied to any theme on ready, and never the workspace ones', async () => {
    inspected['workbench.colorCustomizations'] = {
      globalValue: { 'statusBar.background': '#dd0531', '[GigglyBits Theme 1]': { 'button.background': '#000000' } },
      workspaceValue: { 'titleBar.activeBackground': '#81509e' },
    };
    inspected['editor.tokenColorCustomizations'] = { globalValue: { semanticHighlighting: true, '[X]': { textMateRules: [] } } };
    for (const p of [...panels]) { p.dispose(); }
    ThemeLabPanel.show(extensionUri, identity, memento, library);
    const lab = labs()[labs().length - 1];
    await lab.receive!({ type: 'ready' });
    delete inspected['workbench.colorCustomizations'];
    delete inspected['editor.tokenColorCustomizations'];
    expect(lab.posted.filter(m => m.type === 'leftovers')).toEqual([{ type: 'leftovers', colors: ['statusBar.background'], tokens: [] }]);
  });

  it('{#leftovers-route} a removeLeftovers message goes to the library controller once', async () => {
    const removeLeftoversSafely = jest.fn(async () => undefined);
    for (const p of [...panels]) { p.dispose(); }
    ThemeLabPanel.show(extensionUri, identity, memento, { ...library, removeLeftoversSafely });
    await labs()[labs().length - 1].receive!({ type: 'removeLeftovers' });
    expect(removeLeftoversSafely).toHaveBeenCalledTimes(1);
  });
});

describe('settings that can change a GigglyBits theme, host side', () => {
  const LAB = '[GigglyBits Dark (Lab)]';
  const frame = { 'titleBar.activeBackground': '#81509e' };
  const openLab = async () => {
    for (const p of [...panels]) { p.dispose(); }
    ThemeLabPanel.show(extensionUri, identity, memento, library);
    const lab = labs()[labs().length - 1];
    await lab.receive!({ type: 'ready' });
    return lab;
  };
  afterEach(() => {
    delete inspected['workbench.colorCustomizations'];
    warningAnswer.next = undefined;
  });

  it('{#overrides-message} posts a workspace Lab block as one kind one workspace item on ready', async () => {
    inspected['workbench.colorCustomizations'] = { workspaceValue: { [LAB]: { 'statusBar.background': '#ff0005' } } };
    const lab = await openLab();
    const overrides = lab.posted.filter(m => m.type === 'overrides');
    expect(overrides).toEqual([{ type: 'overrides', items: [
      { level: 'workspace', setting: 'workbench.colorCustomizations', key: LAB, kind: 'one', count: 1 },
    ] }]);
  });

  it('{#remove-workspace} Remove, confirmed, writes the workspace value without the block and keeps its other keys', async () => {
    inspected['workbench.colorCustomizations'] = { workspaceValue: { [LAB]: { 'statusBar.background': '#ff0005' }, '[GigglyBits Theme 7]': frame, 'editor.background': '#101010' } };
    const lab = await openLab();
    updates.length = 0;
    warnings.length = 0;
    statusMessages.length = 0;
    warningAnswer.next = 'Remove';
    await lab.receive!({ type: 'removeOverride', level: 'workspace', setting: 'workbench.colorCustomizations', key: LAB });
    expect(warnings).toEqual([{
      text: 'Remove "[GigglyBits Dark (Lab)]" from your workspace settings?',
      options: { modal: true, detail: 'This block applies only to GigglyBits Dark (Lab), so no other theme changes.' },
      buttons: ['Remove'],
    }]);
    expect(updates).toEqual([{ key: 'workbench.colorCustomizations', value: { '[GigglyBits Theme 7]': frame, 'editor.background': '#101010' }, target: 2 }]);
    expect(statusMessages).toEqual(['Removed "[GigglyBits Dark (Lab)]" from your workspace settings.']);
  });

  it('{#remove-declined} Remove with the modal dismissed writes nothing', async () => {
    inspected['workbench.colorCustomizations'] = { workspaceValue: { [LAB]: { 'statusBar.background': '#ff0005' } } };
    const lab = await openLab();
    updates.length = 0;
    warnings.length = 0;
    await lab.receive!({ type: 'removeOverride', level: 'workspace', setting: 'workbench.colorCustomizations', key: LAB });
    expect(warnings).toHaveLength(1);
    expect(updates).toEqual([]);
  });

  it('{#remove-several-refused} Remove naming a wildcard block shows no modal and writes nothing', async () => {
    inspected['workbench.colorCustomizations'] = { globalValue: { '[*Dark*]': { 'editor.background': '#ff0006' } } };
    const lab = await openLab();
    expect(lab.posted.filter(m => m.type === 'overrides')[0].items.map((i: any) => [i.key, i.kind])).toEqual([['[*Dark*]', 'several']]);
    updates.length = 0;
    warnings.length = 0;
    warningAnswer.next = 'Remove';
    await lab.receive!({ type: 'removeOverride', level: 'user', setting: 'workbench.colorCustomizations', key: '[*Dark*]' });
    expect(warnings).toEqual([]);
    expect(updates).toEqual([]);
  });

  it('removes a folder block at the folder level in a multi-root workspace', async () => {
    const folderUri = { fsPath: '/proj/app', path: '/proj/app' };
    workspaceState.folders = [{ uri: folderUri, name: 'app' }];
    workspaceFileState.file = { fsPath: '/proj/all.code-workspace' };
    inspected['workbench.colorCustomizations'] = { workspaceFolderValue: { [LAB]: { 'statusBar.background': '#ff0005' } } };
    try {
      const lab = await openLab();
      expect(lab.posted.filter(m => m.type === 'overrides')[0].items.map((i: any) => [i.level, i.folder])).toEqual([['folder', 'app']]);
      updates.length = 0;
      warnings.length = 0;
      warningAnswer.next = 'Remove';
      await lab.receive!({ type: 'removeOverride', level: 'folder', folder: 'app', setting: 'workbench.colorCustomizations', key: LAB });
      expect(warnings[0].text).toBe('Remove "[GigglyBits Dark (Lab)]" from the app folder settings?');
      expect(updates).toEqual([{ key: 'workbench.colorCustomizations', value: undefined, target: 3 }]);
      shownDocuments.length = 0;
      await lab.receive!({ type: 'openOverrideFile', level: 'folder', folder: 'app' });
      expect(shownDocuments.map((d: any) => d.path)).toEqual(['/proj/app/.vscode/settings.json']);
    } finally {
      workspaceState.folders = undefined;
      workspaceFileState.file = undefined;
    }
  });

  it('{#open-user-file} Open file runs the user and workspace settings JSON commands', async () => {
    const lab = await openLab();
    executed.length = 0;
    await lab.receive!({ type: 'openOverrideFile', level: 'user' });
    await lab.receive!({ type: 'openOverrideFile', level: 'workspace' });
    expect(executed).toEqual(['workbench.action.openSettingsJson', 'workbench.action.openWorkspaceSettingsFile']);
  });

  it('posts the list again when a semantic color setting changes', async () => {
    const lab = await openLab();
    const before = lab.posted.filter(m => m.type === 'overrides').length;
    const event = { affectsConfiguration: (id: string) => id === 'editor.semanticTokenColorCustomizations' };
    for (const listener of configListeners) { listener(event); }
    await new Promise(r => setTimeout(r, 0));
    expect(lab.posted.filter(m => m.type === 'overrides')).toHaveLength(before + 1);
  });
});

describe('Try in VS Code, where the theme switch goes', () => {
  const OCEAN = { type: 'applyPalette', entry: { name: 'Ocean', colors: ['#20c3d9', '#dc8fd5', '#ceaa3e', '#6cdaed', '#eeafe8'] }, chrome: { index: 0, surfaces: 'neutral' }, edits: {}, settings: null };
  /** Runs one Try with the given workbench.colorTheme layers and folder state; returns the theme writes. */
  async function tryWith(theme: unknown, folder: boolean, answer?: string) {
    if (theme) { inspected['workbench.colorTheme'] = theme; } else { delete inspected['workbench.colorTheme']; }
    workspaceState.folders = folder ? [{ uri: { fsPath: '/proj' }, name: 'proj' }] : undefined;
    infoAnswer.next = answer;
    updates.length = 0;
    infoMessages.length = 0;
    for (const p of [...panels]) { p.dispose(); }
    ThemeLabPanel.show(extensionUri, identity, memento, library);
    await labs()[labs().length - 1].receive!(OCEAN);
    delete inspected['workbench.colorTheme'];
    workspaceState.folders = undefined;
    return updates.filter(u => u.key === 'workbench.colorTheme');
  }

  it('{#try-workspace} switches this project whenever a folder is open, the user settings with no folder and no workspace theme, and leaves a per-folder theme alone', () => {
    expect(tryThemeTarget({ globalValue: 'Dark Modern', workspaceValue: 'GigglyBits Theme 1' }, true)).toEqual({ level: 'workspace', previous: 'GigglyBits Theme 1' });
    expect(tryThemeTarget({ globalValue: 'Dark Modern' }, true)).toEqual({ level: 'workspace', previous: undefined });
    expect(tryThemeTarget({ globalValue: 'Dark Modern' }, false)).toEqual({ level: 'user', previous: 'Dark Modern' });
    expect(tryThemeTarget(undefined, false)).toEqual({ level: 'user', previous: undefined });
    expect(tryThemeTarget({ globalValue: 'Dark Modern', workspaceValue: 'A', workspaceFolderValue: 'B' }, true)).toEqual({ level: 'user', previous: 'Dark Modern' });
  });

  it('{#try-folderless-workspace} a workspace with no folders that sets its own theme takes the Try there, so it shows, with Back to that theme', async () => {
    expect(tryThemeTarget({ globalValue: 'Dark Modern', workspaceValue: 'GigglyBits Theme 4' }, false)).toEqual({ level: 'workspace', previous: 'GigglyBits Theme 4' });
    const writes = await tryWith({ globalValue: 'Dark Modern', workspaceValue: 'GigglyBits Theme 4' }, false);
    expect(writes).toEqual([{ key: 'workbench.colorTheme', value: 'GigglyBits Dark (Lab)', target: 2 }]);
    expect(infoMessages[0].text).toBe('Applied Ocean as GigglyBits Dark (Lab) in this project only. Other windows keep their own theme.');
    expect(infoMessages[0].buttons).toEqual(['Back to GigglyBits Theme 4']);
  });

  it('a Try in a workspace with its own theme writes the Lab theme to the workspace and its colors to the user settings', async () => {
    const writes = await tryWith({ globalValue: 'Dark Modern', workspaceValue: 'GigglyBits Theme 1' }, true);
    expect(writes).toEqual([{ key: 'workbench.colorTheme', value: 'GigglyBits Dark (Lab)', target: 2 }]);
    expect(updates.find(u => u.key === 'workbench.colorCustomizations')!.target).toBe(1);
    expect(infoMessages[0].buttons).toEqual(['Back to GigglyBits Theme 1']);
  });

  it('{#try-project} a Try with a folder open and no project theme writes the Lab theme to the project and says so', async () => {
    const writes = await tryWith({ globalValue: 'Dark Modern' }, true);
    expect(writes).toEqual([{ key: 'workbench.colorTheme', value: 'GigglyBits Dark (Lab)', target: 2 }]);
    expect(infoMessages[0].text).toBe('Applied Ocean as GigglyBits Dark (Lab) in this project only. Other windows keep their own theme.');
  });

  it("{#try-no-folder} a Try with no folder open and no workspace theme writes the Lab theme to the user settings and says it reaches every window without a theme of its own", async () => {
    const writes = await tryWith({ globalValue: 'Dark Modern' }, false);
    expect(writes).toEqual([{ key: 'workbench.colorTheme', value: 'GigglyBits Dark (Lab)', target: 1 }]);
    expect(infoMessages[0].text).toContain("in every window that doesn't set its own theme");
    expect(infoMessages[0].buttons).toEqual(['Back to Dark Modern']);
  });

  it('{#try-back-default} Back to your default removes the project theme a Try set in a project that had none', async () => {
    const writes = await tryWith({ globalValue: 'Dark Modern' }, true, 'Back to your default');
    expect(infoMessages[0].buttons).toEqual(['Back to your default']);
    expect(writes).toEqual([
      { key: 'workbench.colorTheme', value: 'GigglyBits Dark (Lab)', target: 2 },
      { key: 'workbench.colorTheme', value: undefined, target: 2 },
    ]);
  });

  it('{#hc-note} a Try names high contrast when window.autoDetectHighContrast is on and a high contrast theme shows, and not under a dark theme', async () => {
    settings['window.autoDetectHighContrast'] = true;
    try {
      themeState.kind = 3;
      await tryWith({ globalValue: 'Dark Modern' }, false);
      expect(infoMessages[0].text).toContain('A high contrast theme is showing and window.autoDetectHighContrast is on, so while your system is in high contrast mode VS Code keeps a high contrast theme on screen instead.');
      themeState.kind = 2;
      await tryWith({ globalValue: 'Dark Modern' }, false);
      expect(infoMessages[0].text).not.toContain('high contrast');
    } finally {
      themeState.kind = 2;
      delete settings['window.autoDetectHighContrast'];
    }
  });

  it('{#try-removes-shadow} a Try removes a workspace copy of the Lab block, which would hide it, keeps the rest, and says so', async () => {
    const frame = { 'titleBar.activeBackground': '#81509e' };
    inspected['workbench.colorCustomizations'] = { globalValue: {}, workspaceValue: { '[GigglyBits Dark (Lab)]': { 'button.background': '#b27934' }, '[GigglyBits Theme 7]': frame } };
    inspected['editor.tokenColorCustomizations'] = { globalValue: {}, workspaceValue: { '[GigglyBits Dark (Lab)]': { textMateRules: [] } } };
    updates.length = 0;
    statusMessages.length = 0;
    for (const p of [...panels]) { p.dispose(); }
    ThemeLabPanel.show(extensionUri, identity, memento, library);
    const lab = labs()[labs().length - 1];
    await lab.receive!({ type: 'applyPalette', entry: { name: 'Ocean', colors: ['#20c3d9', '#dc8fd5', '#ceaa3e', '#6cdaed', '#eeafe8'] }, chrome: { index: 0, surfaces: 'neutral' }, edits: {}, settings: null });
    delete inspected['workbench.colorCustomizations'];
    delete inspected['editor.tokenColorCustomizations'];
    const workspaceWrites = updates.filter(u => u.target === 2 && u.key !== 'workbench.colorTheme');
    expect(workspaceWrites).toEqual([
      { key: 'workbench.colorCustomizations', value: { '[GigglyBits Theme 7]': frame }, target: 2 },
      { key: 'editor.tokenColorCustomizations', value: undefined, target: 2 },
    ]);
    expect(statusMessages).toEqual(["Removed an old copy of the Lab theme's colors from .vscode/settings.json; it was hiding your Try."]);
    // The user settings still get the Try's colors.
    expect(updates.filter(u => u.target === 1).map(u => u.key)).toEqual(['workbench.colorCustomizations', 'editor.tokenColorCustomizations', 'workbench.colorTheme']);
  });
});

describe('Theme Preview across a reload', () => {
  /** Fake tab groups holding tabs of the given webview view types. */
  const tabGroups = (...viewTypes: string[]) => ({ all: [{ tabs: viewTypes.map(viewType => ({ input: { viewType } })) }] }) as any;
  /** A panel as VS Code hands a serializer one, recording whether it was disposed. */
  const restored = async () => {
    const panel = (await import('vscode') as any).window.createWebviewPanel('gigglybits.themePreview');
    const dispose = panel.dispose;
    panel.disposed = false;
    panel.dispose = () => { panel.disposed = true; dispose(); };
    return panel;
  };
  const closeAll = () => { for (const p of [...panels]) { p.dispose(); } };

  it('{#lab-tab} finds a Theme Lab tab by the end of its webview view type, and nothing else', () => {
    expect(hasWebviewTab(tabGroups('mainThreadWebview-gigglybits.themeLab'), ThemeLabPanel.viewType)).toBe(true);
    expect(hasWebviewTab(tabGroups('mainThreadWebview-gigglybits.themePreview'), ThemeLabPanel.viewType)).toBe(false);
    expect(hasWebviewTab(undefined, ThemeLabPanel.viewType)).toBe(false);
  });

  it('{#revive-keep} with a Lab, a restored preview is the live preview again, in its window as it was, and its picks reach the Lab', async () => {
    closeAll();
    executed.length = 0;
    ThemeLabPanel.show(extensionUri, identity, memento, library);
    const lab = labs()[labs().length - 1];
    const panel = await restored();
    ThemePreviewPanel.revive(panel, extensionUri, true, { palette: { hue: 7 }, syntaxSets: [] }, ThemeLabPanel.pickFromPreview, ThemeLabPanel.previewClosed);
    expect([panel.disposed, ThemePreviewPanel.isOpen()]).toEqual([false, true]);
    // Already in its own window: no move, no compact command.
    expect(executed).toEqual([]);
    await panel.receive!({ type: 'ready' });
    expect(panel.posted.filter((m: any) => m.type === 'state')).toEqual([{ type: 'state', palette: { hue: 7 }, syntaxSets: [] }]);
    const part = { card: 'workbench', index: 1, keys: ['button.background'], around: [], label: 'OK', region: null, fixed: null };
    await panel.receive!({ type: 'pickPart', part });
    expect(lab.posted.filter(m => m.type === 'pickPart')).toEqual([{ type: 'pickPart', part }]);
    closeAll();
  });

  it('{#revive-close} without a Lab, or with a preview already open, a restored preview is closed', async () => {
    closeAll();
    const alone = await restored();
    ThemePreviewPanel.revive(alone, extensionUri, false, undefined, () => undefined);
    expect([alone.disposed, ThemePreviewPanel.isOpen()]).toEqual([true, false]);
    await ThemePreviewPanel.open(extensionUri, undefined, () => undefined);
    const second = await restored();
    ThemePreviewPanel.revive(second, extensionUri, true, undefined, () => undefined);
    expect(second.disposed).toBe(true);
    expect(ThemePreviewPanel.isOpen()).toBe(true);
    closeAll();
  });

  it('{#deactivate-keeps} deactivate leaves the Theme Preview open, for its serializer to bring back or close', async () => {
    closeAll();
    await ThemePreviewPanel.open(extensionUri, undefined, () => undefined);
    deactivate();
    expect(ThemePreviewPanel.isOpen()).toBe(true);
    closeAll();
  });
});

describe('Show where, host side', () => {
  it('{#show-where} opens the Theme Preview when closed, and outlines the keys there, also once its page loads', async () => {
    for (const p of [...panels]) { p.dispose(); }
    ThemeLabPanel.show(extensionUri, identity, memento, library);
    const lab = labs()[labs().length - 1];
    expect(ThemePreviewPanel.isOpen()).toBe(false);
    await lab.receive!({ type: 'showWhere', keys: ['editorWidget.border', 42] });
    expect(ThemePreviewPanel.isOpen()).toBe(true);
    const window = panels.filter(p => p.viewType === 'gigglybits.themePreview').pop()!;
    expect(window.posted.filter(m => m.type === 'highlight')).toEqual([{ type: 'highlight', keys: ['editorWidget.border'], scroll: true }]);
    // The page may still be loading: its ready gets the outline again, still scrolling to it.
    await window.receive!({ type: 'ready' });
    expect(window.posted.filter(m => m.type === 'highlight')).toEqual([
      { type: 'highlight', keys: ['editorWidget.border'], scroll: true },
      { type: 'highlight', keys: ['editorWidget.border'], scroll: true },
    ]);
    // Opening a role in the Lab outlines its parts without scrolling the window.
    await lab.receive!({ type: 'previewHighlight', keys: ['sideBar.background'] });
    expect(window.posted.filter(m => m.type === 'highlight').pop()).toEqual({ type: 'highlight', keys: ['sideBar.background'], scroll: false });
    for (const p of [...panels]) { p.dispose(); }
  });
});
