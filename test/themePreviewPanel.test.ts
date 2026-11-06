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
      setStatusBarMessage: () => disposable,
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
import { ThemePreviewPanel } from '../src/themePreviewPanel';
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
    expect(modernMessages(lab)).toEqual([{ type: 'modernUI', modernUI: { modern: true, uppercase: false, tabStyle: 'connected' } }]);

    settings['workbench.experimental.modernUIUppercaseViewHeaders'] = true;
    const event = { affectsConfiguration: (id: string) => id === 'workbench.experimental.modernUIUppercaseViewHeaders' };
    for (const listener of configListeners) { listener(event); }
    expect(modernMessages(lab)[1]).toEqual({ type: 'modernUI', modernUI: { modern: true, uppercase: true, tabStyle: 'connected' } });

    await lab.receive!({ type: 'openPreviewWindow' });
    // The window opened with the Lab, so it already had the change; its own ready sends them again.
    const window = panels.filter(p => p.viewType === 'gigglybits.themePreview').pop()!;
    window.posted.length = 0;
    await window.receive!({ type: 'ready' });
    expect(modernMessages(window)).toEqual([{ type: 'modernUI', modernUI: { modern: true, uppercase: true, tabStyle: 'connected' } }]);
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
});

describe('Theme Preview cleanup on reload and shutdown', () => {
  /** Fake tab groups: each tab is { label, input }, and close() records what it was given. */
  function tabGroups(tabs: Array<{ label: string; input: unknown }>) {
    const closed: string[] = [];
    const group: any = { tabs: [] };
    group.tabs = tabs.map(t => ({ ...t, group }));
    return {
      closed,
      groups: { all: [group], close: async (list: any[]) => { closed.push(...list.map(t => t.label)); return true; } },
    };
  }
  const TABS = [
    { label: 'Theme Preview', input: { viewType: 'mainThreadWebview-gigglybits.themePreview' } },
    { label: 'Theme Lab', input: { viewType: 'mainThreadWebview-gigglybits.themeLab' } },
    { label: 'extension.ts', input: { uri: { path: '/src/extension.ts' } } },
  ];

  it('{#leftover-closed} closes only the leftover Theme Preview tab, and its window with it', async () => {
    for (const p of [...panels]) { p.dispose(); }
    const t = tabGroups(TABS);
    expect(await ThemePreviewPanel.closeLeftovers(t.groups as any)).toBe(1);
    expect(t.closed).toEqual(['Theme Preview']);
  });

  it('leaves the tabs alone while this window has a live Theme Preview', async () => {
    for (const p of [...panels]) { p.dispose(); }
    await ThemePreviewPanel.open(extensionUri, undefined, () => undefined);
    const t = tabGroups(TABS);
    expect(await ThemePreviewPanel.closeLeftovers(t.groups as any)).toBe(0);
    expect(t.closed).toEqual([]);
    ThemePreviewPanel.close();
  });

  it('{#close-on-deactivate} deactivate closes the open Theme Preview', async () => {
    for (const p of [...panels]) { p.dispose(); }
    let closed = 0;
    await ThemePreviewPanel.open(extensionUri, undefined, () => undefined, () => { closed++; });
    expect(ThemePreviewPanel.isOpen()).toBe(true);
    deactivate();
    expect(ThemePreviewPanel.isOpen()).toBe(false);
    expect(closed).toBe(1);
  });
});
