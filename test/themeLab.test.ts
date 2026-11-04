/**
 * @jest-environment jsdom
 */
// The whole Theme Lab page (media/themeLab.js with palette.js and themeList.js) in jsdom:
// the header's active theme, the theme list inside Start from > Shipped, Use loading a
// palette, tab choices surviving new data and a reload, and a single primary button.
import * as fs from 'fs';
import * as path from 'path';
import { themeBases } from '../src/themeList';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const GB = require('../media/shared.js');

/* eslint-disable @typescript-eslint/no-explicit-any */

const CONTRIBUTED = [
  { label: 'GigglyBits Dark (Candy)', path: './themes/gigglybits-dark-triad-h210-l0.75-c0.130-color-theme.json' },
  { label: 'GigglyBits Dark (Log Cabin)', path: './themes/gigglybits-dark-complementary-h68-l0.51-c0.170-color-theme.json' },
];
const THEMES = CONTRIBUTED.map(t => t.label);
const BASES = themeBases(CONTRIBUTED);
const CATALOG = { version: 1, backgrounds: ['#121212', '#1e1e1e', '#252526'], palettes: [] as any[] };
const SCRIPTS = ['themeBuilder.js', 'gallery.js', 'palette.js', 'themeList.js', 'themeLab.js'].map(f =>
  fs.readFileSync(path.join(__dirname, '..', 'media', f), 'utf8'));

let postMessage: jest.Mock;
/** The page's vscode.setState, so a test can read the state it saved last. */
let setState: jest.Mock;
let listeners: Array<[string, EventListenerOrEventListenerObject]> = [];
/** What vscode.getState() returns on load: undefined for a first open, set to simulate a reload. */
let savedState: any;

/** Loads the page the way the webview does: shared.js first, then the three scripts in order. */
function load() {
  document.body.innerHTML = '<div id="app"></div>';
  postMessage = jest.fn();
  setState = jest.fn();
  (window as any).acquireVsCodeApi = () => ({ postMessage, getState: () => savedState, setState });
  (window as any).GB = GB;
  const add = window.addEventListener.bind(window);
  jest.spyOn(window, 'addEventListener').mockImplementation((type: string, fn: any, opts?: any) => {
    listeners.push([type, fn]);
    add(type, fn, opts);
  });
  for (const src of SCRIPTS) {new Function(src)();}
}

const send = (data: any) => window.dispatchEvent(new MessageEvent('message', { data }));
const sendThemes = (active = 'GigglyBits Dark (Candy)') => send({ type: 'themes', themes: THEMES, active, bases: BASES });
const sendCatalog = () => send({ type: 'catalog', catalog: CATALOG, path: '/repo/palettes/catalog.json' });

const startTab = (id: string) =>
  document.querySelector<HTMLButtonElement>(`[role="tablist"][aria-label="Start from"] [data-tab="${id}"]`)!;
const startPanel = (id: string) => document.getElementById(startTab(id).getAttribute('aria-controls') as string)!;
const selectedStart = () =>
  document.querySelector('[role="tablist"][aria-label="Start from"] [aria-selected="true"]')?.getAttribute('data-tab');

/** Removes the page's window listeners so a second load() does not answer messages twice. */
function unload() {
  for (const [type, fn] of listeners) {window.removeEventListener(type, fn);}
  listeners = [];
  jest.restoreAllMocks();
}

beforeEach(load);
afterEach(() => {
  unload();
  savedState = undefined;
});

describe('Theme Lab page', () => {
  it('names the active theme in the header once the theme list arrives', () => {
    expect(document.querySelector('.gb-lab-active')).toBeNull();
    sendThemes();
    expect(document.querySelector('.gb-lab-active')?.textContent).toBe('Active: GigglyBits Dark (Candy)');
  });

  it('shows the installed themes inside Start from > Shipped, with no separate Themes section', () => {
    sendThemes();
    sendCatalog();
    expect(startTab('shipped').textContent).toBe('Shipped');
    const list = startPanel('shipped').querySelector('.gb-tl')!;
    expect(list).not.toBeNull();
    expect(list.querySelectorAll('.gb-tl-row')).toHaveLength(THEMES.length);
    expect(document.getElementById('section-themes')).toBeNull();
  });

  it('Use on a theme that is not active switches to it and loads its palette, staying on Shipped', () => {
    sendThemes();
    sendCatalog();
    startTab('shipped').click();
    const label = 'GigglyBits Dark (Log Cabin)';
    const base = BASES[label] as any;
    expect(base.baseHue).not.toBe(210);
    const row = [...startPanel('shipped').querySelectorAll('.gb-tl-row')].find(r => r.textContent?.includes(label))!;
    [...row.querySelectorAll('button')].find(b => b.textContent === 'Use')!.click();
    expect(postMessage).toHaveBeenCalledWith({ type: 'selectTheme', label });
    expect(document.querySelector<HTMLInputElement>('.gb-pl-hue-number')!.value).toBe(String(base.baseHue));
    expect(selectedStart()).toBe('shipped');
  });

  it('keeps the chosen Start from tab when a new catalog and theme list arrive', () => {
    sendThemes();
    sendCatalog();
    startTab('paste').click();
    sendCatalog();
    expect(selectedStart()).toBe('paste');
    sendThemes();
    expect(selectedStart()).toBe('paste');
  });

  it('has Try in VS Code as the only primary button on the page', () => {
    sendThemes();
    sendCatalog();
    const primary = [...document.querySelectorAll('#app button')]
      .filter(b => !b.classList.contains('secondary') && b.getAttribute('role') !== 'tab')
      .map(b => b.textContent);
    expect(primary).toEqual(['Try in VS Code']);
  });

  it('restores the Start from and preview tabs saved before the tab reloaded', () => {
    unload();
    savedState = { palette: { startTab: 'paste', previewTab: 'contrast' } };
    load();
    sendThemes();
    sendCatalog();
    expect(selectedStart()).toBe('paste');
    expect(document.querySelector('[role="tablist"][aria-label="Previews"] [aria-selected="true"]')?.getAttribute('data-tab'))
      .toBe('contrast');
  });
});

describe('Theme Lab opening on the current theme and workspace color', () => {
  const LOG_CABIN = 'GigglyBits Dark (Log Cabin)';
  const ALL_REGIONS = ['titleBar', 'activityBar', 'statusBar', 'borders'];
  const PASTED_TRY = { mode: 'pasted', pasted: ['#cc0000', '#990000', '#336699'], chromeIndex: 2, surfaces: 'rich' };
  const NOTE = 'Dark Modern has no Theme Lab palette, so the Lab starts from the default palette.';

  const lastSaved = () => setState.mock.calls[setState.mock.calls.length - 1][0];
  const hueValue = () => document.querySelector<HTMLInputElement>('.gb-pl-hue-number')!.value;
  const FOLDER_NOTE = "This folder has its own color, which VS Code draws over any theme's frame.";
  const frameBoxText = () => document.querySelector('.gb-fr-box')?.textContent || '';
  /** The color the Workbench preview draws a key in: the preview redefines the --vscode-* variables. */
  const drawn = (key: string) => document.querySelector<HTMLElement>('.gb-pl-chrome .gb-pl-scope')!.style.getPropertyValue(GB.varFor(key));
  const sendIdentity = (identity: any, changed: boolean) => send({ type: 'identity', identity, changed });

  it('a fresh open under a shipped theme starts from its palette on the Wheel tab', () => {
    sendThemes(LOG_CABIN);
    send({ type: 'start', start: { base: BASES[LOG_CABIN] } });
    expect(setState).toHaveBeenCalled();
    expect(lastSaved().palette).toMatchObject({ rule: 'complementary', hue: 68, startTab: 'wheel' });
  });

  it('a fresh open with a recorded Try restores it, Editor choices and a Dark frame included, on the Paste tab', () => {
    sendThemes('GigglyBits Dark (Lab)');
    send({ type: 'start', start: { lastTry: PASTED_TRY } });
    expect(lastSaved().palette).toMatchObject({ mode: 'pasted', chromeIndex: 2, surfaces: 'rich', frame: { index: 2, style: 'dark' }, startTab: 'paste' });
  });

  it('a fresh open on a saved theme loads its design and name on the Saved tab', () => {
    const design = { mode: 'pasted', pasted: ['#cc0000', '#990000', '#336699'], colors: ['#cc0000', '#990000', '#336699'], chromeIndex: 2, surfaces: 'rich', frame: { color: '#225588', style: 'filled' }, edits: { swatches: {}, keys: {} } };
    sendThemes('GigglyBits Theme 1');
    send({ type: 'start', start: { saved: { name: 'Alpha', design } } });
    expect(document.querySelector<HTMLInputElement>('.gb-pl-name')!.value).toBe('Alpha');
    expect(drawn('titleBar.activeBackground')).toBe('#225588');
    expect(lastSaved().palette).toMatchObject({ mode: 'pasted', chromeIndex: 2, surfaces: 'rich', startTab: 'saved' });
  });

  it('a fresh open with a note shows the note and keeps the default palette', () => {
    sendThemes('Dark Modern');
    send({ type: 'start', start: { note: NOTE } });
    expect(document.body.textContent).toContain(NOTE);
    expect(hueValue()).toBe('210');
  });

  it('a tab restored by a reload keeps its palette and frame, ignoring start and identity', () => {
    unload();
    savedState = { palette: { rule: 'square', hue: 12, frame: { color: '#336699', style: 'filled' } } };
    load();
    sendThemes(LOG_CABIN);
    send({ type: 'start', start: { base: BASES[LOG_CABIN] } });
    sendIdentity({ fill: '#fed0f9', regions: ALL_REGIONS }, false);
    expect(hueValue()).toBe('12');
    expect(drawn('titleBar.activeBackground')).toBe('#336699');
  });

  it("an identity with a color shows the folder-color note in the Frame box, and none without one", () => {
    sendIdentity({ fill: '#fed0f9', regions: ALL_REGIONS }, false);
    expect(frameBoxText()).toContain(FOLDER_NOTE);
    sendIdentity(null, true);
    expect(frameBoxText()).not.toContain(FOLDER_NOTE);
  });

  it("an identity change never draws the folder's color: the preview keeps the theme's frame", () => {
    const before = drawn('statusBar.background');
    sendIdentity({ fill: '#fed0f9', regions: ALL_REGIONS }, false);
    sendIdentity({ fill: '#336699', regions: ['statusBar'] }, true);
    expect(drawn('statusBar.background')).toBe(before);
    expect(drawn('statusBar.background')).not.toBe('#336699');
    expect(document.querySelectorAll('input[type="checkbox"][data-region]')).toHaveLength(0);
  });

  it('shows no "chrome" or "workspace identity" wording on any tab of the page', () => {
    sendThemes('Dark Modern');
    sendCatalog();
    sendIdentity({ fill: '#fed0f9', regions: ALL_REGIONS }, false);
    const seen: string[] = [];
    for (const [label, ids] of [['Start from', ['wheel', 'paste', 'shipped', 'saved']], ['Previews', ['chrome', 'widgets', 'contrast']]] as const) {
      for (const id of ids) {
        document.querySelector<HTMLButtonElement>(`[role="tablist"][aria-label="${label}"] [data-tab="${id}"]`)!.click();
        // Every role list and the widget family list are part of the page too.
        document.querySelectorAll('details').forEach(d => { (d as HTMLDetailsElement).open = true; });
        seen.push(document.body.textContent || '');
      }
    }
    const matches = seen.flatMap(text => text.match(/.{0,30}(chrome|workspace identity).{0,30}/gi) || []);
    expect(matches).toEqual([]);
    // The tabs drew their content: the Widgets tab's chat card was on the page.
    expect(seen.join(' ')).toContain('Chat views');
  });
});

