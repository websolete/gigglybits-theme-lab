// The host side of the floating Theme Preview window (src/themePreviewPanel.ts with
// src/themeLabPanel.ts): a fresh Lab opens the panel and floats it, Open Preview opens it
// again once closed, and a part clicked in the window reaches the Theme Lab that is open at the
// time, including one opened after the Lab that opened the window was closed.

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

jest.mock('vscode', () => {
  const disposable = { dispose: () => undefined };
  const uri = (path: string) => ({ path, fsPath: path, toString: () => path });
  return {
    ColorThemeKind: { Light: 1, Dark: 2, HighContrast: 3, HighContrastLight: 4 },
    ViewColumn: { Active: -1, Beside: -2 },
    Uri: { joinPath: (base: any, ...parts: string[]) => uri([base.path, ...parts].join('/')) },
    ConfigurationTarget: { Global: 1, Workspace: 2 },
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
      showWarningMessage: () => undefined,
      showErrorMessage: () => undefined,
      showInformationMessage: async () => undefined,
      setStatusBarMessage: (text: string) => { statusMessages.push(text); return disposable; },
    },
    workspace: {
      workspaceFolders: undefined,
      onDidChangeConfiguration: (fn: (e: any) => void) => { configListeners.push(fn); return disposable; },
      getConfiguration: (section?: string) => ({
        get: (key: string) => settings[`${section}.${key}`],
        inspect: (key: string) => inspected[section ? `${section}.${key}` : key],
        update: async (key: string, value: unknown, target: unknown) => { updates.push({ key: section ? `${section}.${key}` : key, value, target }); },
      }),
    },
    commands: {
      executeCommand: async (command: string) => { executed.push(command); },
    },
  };
});

// jest hoists the jest.mock call above, so this import already sees the mocked vscode.
import { ThemeLabPanel, tryThemeTarget } from '../src/themeLabPanel';
import { hasWebviewTab, ThemePreviewPanel } from '../src/themePreviewPanel';
import { deactivate } from '../src/extension';

const identity: any = { pin: async () => undefined, current: async () => undefined, onDidChange: () => ({ dispose: () => undefined }) };
const memento: any = { get: () => undefined, update: async () => undefined };
const library: any = { library: () => [], groups: () => [], hasFolder: () => false };
const extensionUri: any = { path: '/ext', fsPath: '/ext' };

const labs = () => panels.filter(p => p.viewType === 'gigglybits.themeLab');
const preview = () => panels.find(p => p.viewType === 'gigglybits.themePreview')!;

describe('Theme Preview window, host side', () => {
  it('Open Preview opens Theme Preview, floats it, and sends a pick to the Theme Lab open at the time', async () => {
    ThemeLabPanel.show(extensionUri, identity, memento, library);
    const first = labs()[0];
    await first.receive!({ type: 'previewState', palette: { hue: 12 }, groups: [] });
    await first.receive!({ type: 'openPreviewWindow' });
    // A compact window of its own, not kept on top.
    expect(executed).toEqual([
      'workbench.action.moveEditorToNewWindow',
      'workbench.action.enableCompactAuxiliaryWindow',
    ]);
    const window = preview();
    await window.receive!({ type: 'ready' });
    expect(window.posted.filter(m => m.type === 'state')).toEqual([{ type: 'state', palette: { hue: 12 }, groups: [] }]);

    const part = { card: 'workbench', index: 3, keys: ['button.background'], around: [], label: 'OK', region: null, fixed: null };
    await window.receive!({ type: 'pickPart', part });
    expect(first.posted.filter(m => m.type === 'pickPart')).toEqual([{ type: 'pickPart', part }]);

    // The Lab tab that opened the window closes, and a new one opens; the window stays.
    first.dispose();
    ThemeLabPanel.show(extensionUri, identity, memento, library);
    const second = labs()[1];
    expect(second).toBeDefined();
    await second.receive!({ type: 'previewState', palette: { hue: 40 }, groups: [] });
    expect(window.posted[window.posted.length - 1]).toEqual({ type: 'state', palette: { hue: 40 }, groups: [] });
    await window.receive!({ type: 'pickPart', part });
    expect(second.posted.filter(m => m.type === 'pickPart')).toEqual([{ type: 'pickPart', part }]);
    expect(first.posted.filter(m => m.type === 'pickPart')).toHaveLength(1);
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
    panels.filter(p => p.viewType === 'gigglybits.themePreview').pop()!.dispose();
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

  it('{#ready-order} on ready the Lab posts modernUI, previewDetached, library, start, then identity, and no theme list', async () => {
    for (const p of [...panels]) { p.dispose(); }
    const revived = (await import('vscode') as any).window.createWebviewPanel('gigglybits.themeLab');
    ThemeLabPanel.revive(revived, extensionUri, identity, memento, library);
    await revived.receive({ type: 'ready' });
    const types = revived.posted.map((m: any) => m.type);
    expect(types).toEqual(['modernUI', 'previewDetached', 'library', 'start', 'identity']);
    expect(types).not.toContain('themes');
  });

  it('a Lab opened while the window is open starts with its preview hidden', async () => {
    for (const p of [...panels]) { p.dispose(); }
    ThemeLabPanel.show(extensionUri, identity, memento, library);
    await labs()[labs().length - 1].receive!({ type: 'openPreviewWindow' });
    labs()[labs().length - 1].dispose();
    ThemeLabPanel.show(extensionUri, identity, memento, library);
    const lab = labs()[labs().length - 1];
    await lab.receive!({ type: 'ready' });
    expect(lab.posted.filter(m => m.type === 'previewDetached')).toEqual([{ type: 'previewDetached', detached: true }]);
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

describe('Try in VS Code, where the theme switch goes', () => {
  it('{#try-workspace} switches the workspace when it sets its own theme, else the user settings, and leaves a per-folder theme alone', () => {
    expect(tryThemeTarget({ globalValue: 'Dark Modern', workspaceValue: 'GigglyBits Theme 1' })).toEqual({ level: 'workspace', previous: 'GigglyBits Theme 1' });
    expect(tryThemeTarget({ globalValue: 'Dark Modern' })).toEqual({ level: 'user', previous: 'Dark Modern' });
    expect(tryThemeTarget(undefined)).toEqual({ level: 'user', previous: undefined });
    expect(tryThemeTarget({ globalValue: 'Dark Modern', workspaceValue: 'A', workspaceFolderValue: 'B' })).toEqual({ level: 'user', previous: 'Dark Modern' });
  });

  it('a Try in a workspace with its own theme writes the Lab theme to the workspace and its colors to the user settings', async () => {
    inspected['workbench.colorTheme'] = { globalValue: 'Dark Modern', workspaceValue: 'GigglyBits Theme 1' };
    updates.length = 0;
    for (const p of [...panels]) { p.dispose(); }
    ThemeLabPanel.show(extensionUri, identity, memento, library);
    const lab = labs()[labs().length - 1];
    await lab.receive!({ type: 'applyPalette', entry: { name: 'Ocean', colors: ['#20c3d9', '#dc8fd5', '#ceaa3e', '#6cdaed', '#eeafe8'] }, chrome: { index: 0, surfaces: 'neutral' }, edits: {}, settings: null, groups: [] });
    delete inspected['workbench.colorTheme'];
    expect(updates.filter(u => u.key === 'workbench.colorTheme')).toEqual([{ key: 'workbench.colorTheme', value: 'GigglyBits Dark (Lab)', target: 2 }]);
    expect(updates.find(u => u.key === 'workbench.colorCustomizations')!.target).toBe(1);
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
    await lab.receive!({ type: 'applyPalette', entry: { name: 'Ocean', colors: ['#20c3d9', '#dc8fd5', '#ceaa3e', '#6cdaed', '#eeafe8'] }, chrome: { index: 0, surfaces: 'neutral' }, edits: {}, settings: null, groups: [] });
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
    ThemePreviewPanel.revive(panel, extensionUri, true, { palette: { hue: 7 }, groups: [] }, ThemeLabPanel.pickFromPreview, ThemeLabPanel.previewClosed);
    expect([panel.disposed, ThemePreviewPanel.isOpen()]).toEqual([false, true]);
    // Already in its own window: no move, no compact command.
    expect(executed).toEqual([]);
    await panel.receive!({ type: 'ready' });
    expect(panel.posted.filter((m: any) => m.type === 'state')).toEqual([{ type: 'state', palette: { hue: 7 }, groups: [] }]);
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
