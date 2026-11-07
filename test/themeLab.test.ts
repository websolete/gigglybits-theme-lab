/**
 * @jest-environment jsdom
 */
// The whole Theme Lab page (media/themeLab.js with palette.js) in jsdom: the Start step's
// Wheel and Saved tabs, what a fresh open starts from, tab choices surviving new data and a
// reload, and a single primary button.
import * as fs from 'fs';
import * as path from 'path';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const GB = require('../media/shared.js');

/* eslint-disable @typescript-eslint/no-explicit-any */

// The page's order after shared.js (src/themeLabPanel.ts): colorPicker.js comes before palette.js.
const SCRIPTS = ['themeBuilder.js', 'gallery.js', 'colorPicker.js', 'palette.js', 'themeLab.js'].map(f =>
  fs.readFileSync(path.join(__dirname, '..', 'media', f), 'utf8'));

let postMessage: jest.Mock;
/** The page's vscode.setState, so a test can read the state it saved last. */
let setState: jest.Mock;
let listeners: Array<[string, EventListenerOrEventListenerObject]> = [];
/** What vscode.getState() returns on load: undefined for a first open, set to simulate a reload. */
let savedState: any;

/** Loads the page the way the webview does: shared.js first, then the scripts in order. */
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
/** A library message with no saved themes or groups, as the host sends on 'ready'. */
const sendLibrary = () => send({ type: 'library', themes: [], groups: [], hasFolder: false });

const startTab = (id: string) =>
  document.querySelector<HTMLButtonElement>(`[role="tablist"][aria-label="Start from"] [data-tab="${id}"]`)!;
const selectedStart = () =>
  document.querySelector('[role="tablist"][aria-label="Start from"] [aria-selected="true"]')?.getAttribute('data-tab');

/**
 * The Theme Preview window's page for the last previewState the Lab posted, drawn the way
 * media/themePreview.js draws the state the host forwards to it.
 */
function previewPage(): HTMLElement {
  const states = postMessage.mock.calls.map(c => c[0]).filter(m => m.type === 'previewState');
  const last = states[states.length - 1];
  return (window as any).GBPalette.renderPreview({ ui: last.palette, groups: last.groups, post: jest.fn() });
}

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
  it('{#removed} has no Theme Lab heading, no Open Palette Inspector, no Pin, no Contrast tab, no Previews heading and no fieldset in step 3', () => {
    sendLibrary();
    const app = document.getElementById('app')!;
    const buttons = [...app.querySelectorAll('button')].map(b => (b.textContent || '').trim());
    expect([...app.querySelectorAll('h1')].filter(el => el.textContent === 'Theme Lab')).toEqual([]);
    expect(buttons.filter(t => t === 'Open Palette Inspector' || t === 'Pin')).toEqual([]);
    expect(app.querySelector('[role="tab"][data-tab="contrast"]')).toBeNull();
    expect([...app.querySelectorAll('h1, h2, h3, h4')].filter(el => el.textContent === 'Previews')).toEqual([]);
    expect(app.querySelector('.gb-s3')).not.toBeNull();
    expect(app.querySelector('.gb-s3 fieldset')).toBeNull();
    expect(document.querySelector('.gb-lab-active')).toBeNull();
  });

  it('offers Start from Wheel and Saved only, with no theme list and no paste input', () => {
    sendLibrary();
    const tabs = [...document.querySelectorAll('[role="tablist"][aria-label="Start from"] [role="tab"]')].map(t => t.getAttribute('data-tab'));
    expect(tabs).toEqual(['wheel', 'saved']);
    expect(document.querySelector('.gb-tl, textarea')).toBeNull();
    expect(document.getElementById('section-themes')).toBeNull();
  });

  it('ignores a themes message from an older host', () => {
    send({ type: 'themes', themes: ['GigglyBits Dark (Candy)'], active: 'GigglyBits Dark (Candy)', bases: {} });
    expect(document.querySelector('.gb-tl')).toBeNull();
    expect(selectedStart()).toBe('wheel');
  });

  const setHue = (value: string) => {
    const hue = document.querySelector<HTMLInputElement>('.gb-pl-hue')!;
    hue.value = value;
    hue.dispatchEvent(new Event('input'));
  };
  const posted = (type: string) => postMessage.mock.calls.map(c => c[0]).filter(m => m.type === type);

  it('keeps the chosen Start from tab when a new library arrives', () => {
    sendLibrary();
    startTab('saved').click();
    sendLibrary();
    expect(selectedStart()).toBe('saved');
  });

  it('{#saved-then-change} after Save and a library message holding that name, says Saved as the name, then Unsaved changes once Hue changes', () => {
    sendLibrary();
    const result = () => document.querySelector('.gb-bar [role="status"]')!.textContent;
    const save = [...document.querySelectorAll<HTMLButtonElement>('.gb-bar button')].find(b => b.textContent === 'Save theme')!;
    save.click();
    const msg = posted('saveTheme')[0];
    expect(msg.name).toBe('Triad 210°');
    send({ type: 'library', themes: [{ id: 's1', name: 'Triad 210°', slot: 1, design: msg.design, groups: [], savedAt: '2026-11-05T00:00:00.000Z' }], groups: [], hasFolder: false });
    expect(result()).toBe('Saved as Triad 210°');
    setHue('120');
    expect(result()).toBe('Unsaved changes');
  });

  it('Try in VS Code sends settings with no baseId or baseName', () => {
    sendLibrary();
    [...document.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent === 'Try in VS Code')!.click();
    const settings = posted('applyPalette')[0].settings;
    expect(settings).toMatchObject({ mode: 'generated', rule: 'triad', hue: 210 });
    expect(settings).not.toHaveProperty('baseId');
    expect(settings).not.toHaveProperty('baseName');
  });

  it('has Try in VS Code as the only primary button on the page while the preview window is open', () => {
    sendLibrary();
    send({ type: 'previewDetached', detached: true });
    // Step headings, role rows and the Rule picker are buttons drawn as heading lines and a dropdown.
    const primary = [...document.querySelectorAll('#app button')]
      .filter(b => !b.classList.contains('secondary') && b.getAttribute('role') !== 'tab' && !b.matches('.gb-step-btn, .gb-rule-btn, .gb-role-chip'))
      .map(b => b.textContent);
    expect(primary).toEqual(['Try in VS Code']);
  });

  it('posts a previewState with the new hue after the hue changes, for the Theme Preview window', () => {
    sendLibrary();
    const before = postMessage.mock.calls.length;
    const hue = document.querySelector<HTMLInputElement>('.gb-pl-hue')!;
    hue.value = '123';
    hue.dispatchEvent(new Event('input'));
    const after = postMessage.mock.calls.slice(before).map(c => c[0]).filter(m => m.type === 'previewState');
    expect(after.length).toBeGreaterThan(0);
    expect(after[after.length - 1].palette.hue).toBe(123);
    expect(Array.isArray(after[after.length - 1].groups)).toBe(true);
  });

  it('a pickPart from the Theme Preview window opens the Edit dock on the part, listing its keys', () => {
    sendLibrary();
    // The page draws no preview; the part is one the Theme Preview window would post.
    expect(document.querySelector('.gb-pl-chrome, .gb-pl-scope')).toBeNull();
    const keys = ['inlineChatInput.border', 'input.background'];
    expect(document.querySelector('.gb-pl-edit')).toBeNull();
    send({ type: 'pickPart', part: { card: 'workbench', index: 5, keys, around: [], label: '', region: 'chat', fixed: null } });
    const panel = document.querySelector('.gb-dock.gb-pl-edit')!;
    expect(panel).not.toBeNull();
    expect(panel.querySelector('.gb-dock-what')!.textContent).toBe('The whole of the chat view');
    for (const key of keys) {
      expect({ key, listed: Boolean(panel.querySelector(`.gb-dock-part .gb-pl-key[data-key="${key}"]`)) }).toEqual({ key, listed: true });
    }
    // A later host message redraws the Lab and keeps the pick.
    sendLibrary();
    expect(document.querySelector('.gb-dock .gb-pl-key[data-key="inlineChatInput.border"]')).not.toBeNull();
  });

  it('says whether the preview window is open from previewDetached, and Open Preview posts openPreviewWindow', () => {
    sendLibrary();
    const text = () => document.querySelector('.gb-away .gb-away-text')!.textContent;
    expect(text()).toMatch(/^The preview window is closed\. /);
    send({ type: 'previewDetached', detached: true });
    expect(text()).toMatch(/^The preview is open in its own window\. /);
    send({ type: 'previewDetached', detached: false });
    expect(text()).toMatch(/^The preview window is closed\. /);
    document.querySelector<HTMLButtonElement>('.gb-away .gb-away-open')!.click();
    expect(posted('openPreviewWindow')).toEqual([{ type: 'openPreviewWindow' }]);
    expect(posted('restoreInline')).toEqual([]);
  });

  it('restores the Start from tab saved before the tab reloaded', () => {
    unload();
    savedState = { palette: { startTab: 'saved' } };
    load();
    sendLibrary();
    expect(selectedStart()).toBe('saved');
  });

  it('a reload whose saved state is on the Paste or Shipped tab opens on Wheel', () => {
    for (const tab of ['paste', 'shipped']) {
      unload();
      savedState = { palette: { startTab: tab } };
      load();
      sendLibrary();
      expect({ tab, selected: selectedStart() }).toEqual({ tab, selected: 'wheel' });
    }
  });

  it('{#contrast-tab-saved} a reload whose saved state has a preview tab and Pin drops them and draws no tabs for them', () => {
    unload();
    savedState = { palette: { previewTab: 'contrast', previewPinned: true } };
    load();
    sendLibrary();
    expect(document.querySelector('[role="tablist"][aria-label="Previews"]')).toBeNull();
    const palette = posted('previewState').pop().palette;
    expect(palette).not.toHaveProperty('previewTab');
    expect(palette).not.toHaveProperty('previewPinned');
  });
});

describe('Theme Lab opening on the current theme and workspace color', () => {
  const ALL_REGIONS = ['titleBar', 'activityBar', 'statusBar', 'borders'];
  const PASTED_TRY = { mode: 'pasted', pasted: ['#cc0000', '#990000', '#336699'], chromeIndex: 2, surfaces: 'rich' };
  const NOTE = 'Dark Modern has no Theme Lab palette, so the Lab starts from the default palette.';

  const lastSaved = () => setState.mock.calls[setState.mock.calls.length - 1][0];
  const hueValue = () => document.querySelector<HTMLInputElement>('.gb-pl-hue-number')!.value;
  const FOLDER_NOTE = "This folder's settings still hold the old GigglyBits folder color (#fed0f9), which VS Code draws over every GigglyBits theme's frame. Use in this project with a saved theme removes it.";
  const frameBoxText = () => document.querySelector('.gb-fr-box')?.textContent || '';
  /** The color the Theme Preview's Workbench draws a key in, for the Lab's last previewState. */
  const drawn = (key: string) => previewPage().querySelector<HTMLElement>('.gb-pl-chrome .gb-pl-scope')!.style.getPropertyValue(GB.varFor(key));
  const sendIdentity = (identity: any, changed: boolean) => send({ type: 'identity', identity, changed });

  it('a fresh open with a recorded Try of pasted colors restores it, Editor choices and a Dark frame included, on the Wheel tab', () => {
    send({ type: 'start', start: { lastTry: PASTED_TRY } });
    expect(lastSaved().palette).toMatchObject({ mode: 'pasted', pasted: PASTED_TRY.pasted, chromeIndex: 2, surfaces: 'rich', frame: { index: 2, style: 'dark' }, startTab: 'wheel' });
    expect(selectedStart()).toBe('wheel');
  });

  it('a fresh open with a recorded generated Try restores it on the Wheel tab, with no base carried over', () => {
    send({ type: 'start', start: { lastTry: { mode: 'generated', rule: 'square', hue: 12, lightness: 0.6, chroma: 0.2, chromeIndex: 0, surfaces: 'neutral', baseId: 'x', baseName: 'X' } } });
    expect(lastSaved().palette).toMatchObject({ rule: 'square', hue: 12, startTab: 'wheel' });
    expect(lastSaved().palette).not.toHaveProperty('baseId');
    expect(lastSaved().palette).not.toHaveProperty('baseName');
  });

  it('a fresh open on a saved theme loads its design and name on the Saved tab', () => {
    const design = { mode: 'pasted', pasted: ['#cc0000', '#990000', '#336699'], colors: ['#cc0000', '#990000', '#336699'], chromeIndex: 2, surfaces: 'rich', frame: { color: '#225588', style: 'filled' }, edits: { swatches: {}, keys: {} } };
    send({ type: 'start', start: { saved: { name: 'Alpha', design } } });
    expect(document.querySelector<HTMLInputElement>('.gb-pl-name')!.value).toBe('Alpha');
    expect(drawn('titleBar.activeBackground')).toBe('#225588');
    expect(lastSaved().palette).toMatchObject({ mode: 'pasted', chromeIndex: 2, surfaces: 'rich', startTab: 'saved' });
  });

  it('a fresh open with a note shows the note and keeps the default palette', () => {
    send({ type: 'start', start: { note: NOTE } });
    expect(document.body.textContent).toContain(NOTE);
    expect(hueValue()).toBe('210');
  });

  it('a tab restored by a reload keeps its palette and frame, ignoring start and identity', () => {
    unload();
    savedState = { palette: { rule: 'square', hue: 12, frame: { color: '#336699', style: 'filled' } } };
    load();
    send({ type: 'start', start: { lastTry: PASTED_TRY } });
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
    sendLibrary();
    const before = drawn('statusBar.background');
    sendIdentity({ fill: '#fed0f9', regions: ALL_REGIONS }, false);
    sendIdentity({ fill: '#336699', regions: ['statusBar'] }, true);
    expect(drawn('statusBar.background')).toBe(before);
    expect(drawn('statusBar.background')).not.toBe('#336699');
    expect(document.querySelectorAll('input[type="checkbox"][data-region]')).toHaveLength(0);
  });

  it('a frameSeed sets the frame color and the name, for Make project theme', () => {
    send({ type: 'start', start: { note: NOTE } });
    send({ type: 'frameSeed', frame: { color: '#336699', style: 'filled' }, name: 'copirate' });
    expect(drawn('titleBar.activeBackground')).toBe('#336699');
    expect(document.querySelector<HTMLInputElement>('.gb-pl-name')!.value).toBe('copirate');
  });

  it("draws the library message's switched-on groups and lists its groups in the Style groups box", () => {
    sendLibrary();
    const before = drawn('button.background');
    send({
      type: 'library', themes: [], hasFolder: false,
      groups: [{ id: 'g1', name: 'Calm', family: 'buttons', roles: { 'button.background': 'deep' }, on: true, savedAt: '' }],
    });
    expect(drawn('button.background')).not.toBe(before);
    expect(drawn('button.background')).toBe(drawn('sideBar.background'));
    expect(document.querySelector('.gb-sg-foot')?.textContent).toContain('Style groups (1)');
    [...document.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent === 'Edit style groups')!.click();
    expect(document.querySelector('.gb-sg-saved[data-id="g1"] .gb-pl-row-name')?.textContent).toBe('Calm');
  });

  it('shows no "chrome" or "workspace identity" wording on any tab of the page or in the preview window', () => {
    sendLibrary();
    sendIdentity({ fill: '#fed0f9', regions: ALL_REGIONS }, false);
    const seen: string[] = [];
    for (const id of ['wheel', 'saved']) {
      startTab(id).click();
      // The folded Roles families and the closed disclosures are part of the page too.
      for (let toggle = document.querySelector<HTMLButtonElement>('.gb-rf[data-folded] .gb-rf-toggle'); toggle;
        toggle = document.querySelector<HTMLButtonElement>('.gb-rf[data-folded] .gb-rf-toggle')) {
        toggle.click();
      }
      document.querySelectorAll('details').forEach(d => { (d as HTMLDetailsElement).open = true; });
      seen.push(document.body.textContent || '');
    }
    seen.push(previewPage().textContent || '');
    const matches = seen.flatMap(text => text.match(/.{0,30}(chrome|workspace identity).{0,30}/gi) || []);
    expect(matches).toEqual([]);
    // The page and the window drew their content: the page has its steps, and the window
    // draws the chat family.
    expect(seen.slice(0, -1).join(' ')).toContain('Frame and accent');
    expect(seen[seen.length - 1]).toContain('Chat views');
  });
});

describe('Theme Lab page and VS Code\'s modern UI settings', () => {
  it('draws no Workbench on the page when the modern UI settings arrive, and a pick still opens the Edit dock', () => {
    sendLibrary();
    send({ type: 'modernUI', modernUI: { modern: true, uppercase: false, tabStyle: 'pill' } });
    expect(document.querySelector('#app .wb, #app .gb-pl-chrome')).toBeNull();
    send({ type: 'pickPart', part: { card: 'workbench', index: 2, keys: ['tab.activeBackground'], around: [], label: 'a.ts', region: 'tabs', fixed: null } });
    expect(document.querySelector('.gb-dock .gb-pl-key[data-key="tab.activeBackground"]')).not.toBeNull();
  });
});
