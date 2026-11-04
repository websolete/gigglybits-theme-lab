/**
 * @jest-environment jsdom
 */
// Runs the real Palette Lab (media/palette.js) in jsdom: contrast table, previews,
// decisions, the saved list, pasted palettes and starting from a shipped theme.
import * as fs from 'fs';
import * as path from 'path';

/* eslint-disable @typescript-eslint/no-require-imports */
const GB = require('../media/shared.js');
const TB = require('../media/themeBuilder.js');
/* eslint-enable @typescript-eslint/no-require-imports */

/* eslint-disable @typescript-eslint/no-explicit-any */
type Lab = { render(ctx: any): HTMLElement; startFrom(ui: any, base: any): void; restoreTry(ui: any, record: any): void };

const SEED = { version: 1, backgrounds: ['#121212', '#1e1e1e', '#252526'], palettes: [] as any[] };

function ctx(over: Record<string, any> = {}) {
  return {
    catalog: SEED,
    catalogPath: '/repo/palettes/catalog.json',
    catalogReason: '',
    liveBackground: '#1f1f1f',
    ui: {},
    post: jest.fn(),
    copy: jest.fn(),
    ...over,
  };
}

const buttonFor = (root: HTMLElement, label: string) =>
  [...root.querySelectorAll('button')].find(b => b.textContent === label) as HTMLButtonElement;


let lab: Lab;

beforeAll(() => {
  (window as any).GB = GB;
  (window as any).GBBuilder = TB;
  new Function(fs.readFileSync(path.join(__dirname, '..', 'media', 'gallery.js'), 'utf8'))();
  const src = fs.readFileSync(path.join(__dirname, '..', 'media', 'palette.js'), 'utf8');
  // The webview loads palette.js as a classic script; evaluate it the same way.
  new Function(src)();
  lab = (window as any).GBPalette;
});

describe('Palette Lab', () => {
  it('measures every triad color against three reference backgrounds and the live editor background', () => {
    const root = lab.render(ctx());
    expect(root.querySelectorAll('table.gb-pl-contrast .badge')).toHaveLength(20);
    const headers = [...root.querySelectorAll('table.gb-pl-contrast thead th')].map(th => th.textContent);
    expect(headers).toEqual(['Color', '#121212', '#1e1e1e', '#252526', 'your editor']);
    expect(root.querySelector('.gb-pl-lowest')?.textContent).toMatch(/Lowest contrast: \d+\.\d:1/);
  });

  it('posts a full include decision for the current candidate', () => {
    const c = ctx();
    const root = lab.render(c);
    buttonFor(root, 'Include').click();
    expect(c.post).toHaveBeenCalledTimes(1);
    const msg = c.post.mock.calls[0][0];
    expect(msg.type).toBe('paletteDecision');
    expect(msg.entry.id).toBe('triad-h210-l0.75-c0.130');
    expect(msg.entry.status).toBe('include');
    expect(msg.entry.colors).toHaveLength(5);
    for (const hex of msg.entry.colors) {expect(hex).toMatch(/^#[0-9a-f]{6}$/);}
    expect(msg.entry).toMatchObject({ source: 'generated', rule: 'triad', baseHue: 210, lightness: 0.75, chroma: 0.13, name: 'Triad 210°' });
    expect(Date.parse(msg.entry.decidedAt)).not.toBeNaN();
  });

  it('puts Include, Maybe, Exclude and the decided list in a Catalog box, and draws no Catalog box without a catalog', () => {
    const entry = { id: 'a', name: 'a', source: 'pasted', colors: ['#ff8800', '#336699'], status: 'include', note: '', decidedAt: '2026-11-03T00:00:00.000Z' };
    const root = lab.render(ctx({ catalog: { ...SEED, palettes: [entry] } }));
    const box = root.querySelector<HTMLElement>('fieldset.gb-pl-catalog')!;
    expect(box.querySelector('legend')?.textContent).toBe('Catalog');
    for (const label of ['Include', 'Maybe', 'Exclude']) {
      expect(box.contains(buttonFor(root, label))).toBe(true);
    }
    expect(box.querySelectorAll('.gb-pl-group .gb-pl-row')).toHaveLength(1);

    const none = lab.render(ctx({ catalog: null, catalogPath: null, catalogReason: 'Open the gigglybits-vscode-theme folder to save palette decisions.' }));
    expect(none.querySelector('fieldset.gb-pl-catalog')).toBeNull();
    expect(buttonFor(none, 'Include')).toBeUndefined();
    expect(buttonFor(none, 'Try in VS Code')).toBeDefined();
    expect(buttonFor(none, 'Save theme')).toBeDefined();
  });

  it('groups saved palettes by decision and hides an empty group', () => {
    const entry = (id: string, status: string) => ({ id, name: id, source: 'pasted', colors: ['#ff8800', '#336699'], status, note: '', decidedAt: '2026-11-03T00:00:00.000Z' });
    const catalog = { ...SEED, palettes: [entry('a', 'include'), entry('b', 'exclude')] };
    const root = lab.render(ctx({ catalog }));
    const groups = [...root.querySelectorAll('.gb-pl-group')];
    expect(groups.map(g => g.querySelector('h4')?.textContent)).toEqual(['Include', 'Exclude']);
    for (const g of groups) {expect(g.querySelectorAll('.gb-pl-row')).toHaveLength(1);}
    expect([...root.querySelectorAll('h4')].some(el => el.textContent === 'Maybe')).toBe(false);
  });

  it('judges a pasted list, naming the token that is not a color', () => {
    const root = lab.render(ctx());
    (root.querySelector('.gb-pl-paste') as HTMLTextAreaElement).value = '#ff8800 nothex 336699';
    buttonFor(root, 'Judge pasted colors').click();
    expect(root.querySelector('.gb-pl-invalid')?.textContent).toContain('nothex');
    expect(root.querySelectorAll('.gb-pl-candidate .gb-pl-swatch')).toHaveLength(2);
    expect(root.querySelectorAll('table.gb-pl-contrast tbody tr')).toHaveLength(2);
  });

  it('keeps the current candidate when a paste has too few colors', () => {
    const root = lab.render(ctx());
    (root.querySelector('.gb-pl-paste') as HTMLTextAreaElement).value = '#ff8800';
    buttonFor(root, 'Judge pasted colors').click();
    expect(root.querySelector('.gb-pl-error')).not.toBeNull();
    expect(root.querySelectorAll('.gb-pl-candidate .gb-pl-swatch')).toHaveLength(5);
  });

  it('shows the base color in the picker, and picking a color sets hue, lightness and chroma', () => {
    const c = ctx();
    const root = lab.render(c);
    const picker = root.querySelector('.gb-pl-picker') as HTMLInputElement;
    expect(picker.value).toBe(GB.oklchToHex({ l: 0.75, c: 0.13, h: 210 }));

    picker.value = '#ceaa3e';
    picker.dispatchEvent(new Event('input'));
    const o = GB.hexToOklch('#ceaa3e');
    expect((root.querySelector('.gb-pl-hue') as HTMLInputElement).value).toBe(String(Math.round(o.h)));

    buttonFor(root, 'Include').click();
    const entry = c.post.mock.calls[0][0].entry;
    expect(entry).toMatchObject({ source: 'generated', baseHue: Math.round(o.h), lightness: Number(o.l.toFixed(2)), chroma: Number(o.c.toFixed(3)) });
  });

  it('keeps the hue when a grey is picked', () => {
    const root = lab.render(ctx());
    const picker = root.querySelector('.gb-pl-picker') as HTMLInputElement;
    picker.value = '#808080';
    picker.dispatchEvent(new Event('input'));
    expect((root.querySelector('.gb-pl-hue') as HTMLInputElement).value).toBe('210');
  });

});

describe('Palette Lab Workbench preview, Frame and Editor', () => {
  const TRIAD = GB.harmony('triad', { hue: 210, lightness: 0.75, chroma: 0.13 }).map((d: { hex: string }) => d.hex);
  const region = (root: HTMLElement, name: string) => root.querySelector<HTMLElement>(`.gb-pl-chrome [data-region="${name}"]`)!;
  /** The color the Workbench preview draws a key in: the preview redefines the --vscode-* variables. */
  const drawn = (root: HTMLElement, key: string) =>
    root.querySelector<HTMLElement>('.gb-pl-chrome .gb-pl-scope')!.style.getPropertyValue(GB.varFor(key));
  const framePick = (root: HTMLElement, index: string) => root.querySelector<HTMLButtonElement>(`.gb-fr-box .gb-fr-pick[data-index="${index}"]`)!;
  const setValue = (el: HTMLInputElement | HTMLSelectElement, value: string) => {
    el.value = value;
    el.dispatchEvent(new Event('change'));
  };

  it('draws the whole theme Try in VS Code applies, a new design starting with a Filled frame in color 1', () => {
    const root = lab.render(ctx());
    const expected = TB.buildColors({ colors: TRIAD }, { index: 0, surfaces: 'neutral', frame: { index: 0, style: 'filled' } });
    for (const key of ['titleBar.activeBackground', 'statusBar.background', 'statusBar.noFolderBackground', 'editorGroup.border', 'inlineChatInput.border', 'errorForeground']) {
      expect({ key, drawn: drawn(root, key) }).toEqual({ key, drawn: expected[key] });
    }
    expect(drawn(root, 'titleBar.activeBackground')).toBe(TRIAD[0]);
    for (const name of ['titleBar', 'activityBar', 'sideBar', 'tabs', 'editorGroup', 'panel', 'chat', 'statusBar']) {
      expect({ name, found: Boolean(region(root, name)) }).toEqual({ name, found: true });
    }
    expect(root.querySelectorAll('.gb-ch-readout .badge')).toHaveLength(5);
  });

  it('choosing Frame color 3 moves the bars to color 3 and leaves the editor alone', () => {
    const c = ctx();
    const root = lab.render(c);
    const editorBg = drawn(root, 'editor.background');
    const inputBorder = drawn(root, 'input.border');
    framePick(root, '2').click();
    expect((c.ui as any).frame).toEqual({ index: 2, style: 'filled' });
    expect(drawn(root, 'titleBar.activeBackground')).toBe(TRIAD[2]);
    expect(drawn(root, 'editor.background')).toBe(editorBg);
    expect(drawn(root, 'input.border')).toBe(inputBorder);
  });

  it('a custom frame color draws the bars in that color, and the Dark style draws dark bars', () => {
    const c = ctx();
    const root = lab.render(c);
    setValue(root.querySelector<HTMLInputElement>('.gb-fr-custom-color')!, '#336699');
    expect((c.ui as any).frame).toEqual({ color: '#336699', style: 'filled' });
    expect(drawn(root, 'titleBar.activeBackground')).toBe('#336699');
    expect(framePick(root, 'custom').getAttribute('aria-checked')).toBe('true');
    setValue(root.querySelector<HTMLSelectElement>('.gb-fr-style')!, 'dark');
    expect(drawn(root, 'titleBar.activeBackground')).toBe(drawn(root, 'sideBar.background'));
  });

  it('choosing Editor accent 2 moves the buttons but not a Filled frame', () => {
    const root = lab.render(ctx());
    const button = drawn(root, 'button.background');
    const title = drawn(root, 'titleBar.activeBackground');
    root.querySelector<HTMLButtonElement>('.gb-ed-box .gb-ch-pick[data-index="1"]')!.click();
    expect(drawn(root, 'button.background')).not.toBe(button);
    expect(drawn(root, 'titleBar.activeBackground')).toBe(title);
  });

  it('Try in VS Code posts the Editor and Frame choices and edits, even with no catalog to save to', () => {
    const c = ctx({ catalogPath: null, ui: { chromeIndex: 1, surfaces: 'rich', frame: { color: '#336699', style: 'filled' } } });
    const root = lab.render(c);
    buttonFor(root, 'Try in VS Code').click();
    expect(c.post).toHaveBeenCalledTimes(1);
    const msg = c.post.mock.calls[0][0];
    expect(Object.keys(msg).sort()).toEqual(['chrome', 'edits', 'entry', 'settings', 'type']);
    expect(msg.entry).toEqual({ name: 'Triad 210°', colors: TRIAD });
    expect(msg.chrome).toEqual({ index: 1, surfaces: 'rich', frame: { color: '#336699', style: 'filled' } });
    expect(msg.settings.frame).toEqual({ color: '#336699', style: 'filled' });
    expect(msg.edits).toEqual({ swatches: {}, keys: {} });
    expect(msg.settings).not.toHaveProperty('edits');
  });

  it('Try in VS Code posts the tried settings, so the host can restore them later', () => {
    const c = ctx({ ui: { rule: 'square', hue: 12, lightness: 0.6, chroma: 0.2, chromeIndex: 2, surfaces: 'rich' } });
    const root = lab.render(c);
    buttonFor(root, 'Try in VS Code').click();
    expect(c.post.mock.calls[0][0].settings)
      .toMatchObject({ mode: 'generated', rule: 'square', hue: 12, lightness: 0.6, chroma: 0.2, chromeIndex: 2, surfaces: 'rich', frame: { index: 0, style: 'filled' } });
  });

  it('a restored Try with a frame selects it in the Frame box', () => {
    const ui: any = {};
    lab.restoreTry(ui, { mode: 'generated', rule: 'triad', hue: 210, lightness: 0.75, chroma: 0.13, chromeIndex: 0, surfaces: 'neutral', frame: { style: 'filled', color: '#336699' } });
    const root = lab.render(ctx({ ui }));
    expect(framePick(root, 'custom').getAttribute('aria-checked')).toBe('true');
    expect(root.querySelector<HTMLInputElement>('.gb-fr-custom-color')!.value).toBe('#336699');
    expect(root.querySelector<HTMLSelectElement>('.gb-fr-style')!.value).toBe('filled');
    expect(drawn(root, 'titleBar.activeBackground')).toBe('#336699');
  });

  it("names this folder's own color in the Frame box but keeps drawing the theme's frame", () => {
    const note = "This folder has its own color, which VS Code draws over any theme's frame.";
    const root = lab.render(ctx({ identityFill: '#fed0f9' }));
    expect(root.querySelector('.gb-fr-box')!.textContent).toContain(note);
    expect(drawn(root, 'titleBar.activeBackground')).toBe(TRIAD[0]);
    expect(lab.render(ctx()).querySelector('.gb-fr-box')!.textContent).not.toContain(note);
  });

  it('Use the frame color for this folder posts the frame color', () => {
    const c = ctx();
    const root = lab.render(c);
    framePick(root, '2').click();
    buttonFor(root, 'Use the frame color for this folder').click();
    expect(c.post).toHaveBeenCalledWith({ type: 'useAsIdentity', color: TRIAD[2] });
  });

  it('lists the Frame roles under a Frame heading, then the Editor roles under an Editor heading', () => {
    const root = lab.render(ctx());
    const list = root.querySelector('.gb-pl-chrome [data-disclose="roles"]')!;
    expect([...list.querySelectorAll('.gb-pl-role-group')].map(el => el.textContent)).toEqual(['Frame', 'Editor']);
    for (const container of list.querySelectorAll('.gb-pl-roles')) {
      const heading = container.previousElementSibling!.textContent!.toLowerCase();
      for (const row of container.querySelectorAll<HTMLElement>('.gb-pl-role')) {
        expect({ swatch: row.dataset.swatch, group: TB.SWATCHES[row.dataset.swatch!][2] }).toEqual({ swatch: row.dataset.swatch, group: heading });
      }
    }
    expect(list.querySelectorAll('.gb-pl-role[data-group="frame"]').length).toBeGreaterThan(0);
  });
});

describe('Palette Lab color editing', () => {
  const drawn = (root: HTMLElement, key: string) =>
    root.querySelector<HTMLElement>('.gb-pl-chrome .gb-pl-scope')!.style.getPropertyValue(GB.varFor(key));
  const chatInput = (root: HTMLElement) => root.querySelector<HTMLElement>('.gb-pl-chrome [data-region="chat"] .gb-chat-input')!;
  const keyRow = (root: HTMLElement, key: string) => root.querySelector<HTMLElement>(`.gb-pl-chrome .gb-pl-edit .gb-pl-key[data-key="${key}"]`)!;
  const setColor = (input: HTMLInputElement, value: string, event = 'change') => {
    input.value = value;
    input.dispatchEvent(new Event(event));
  };

  it('asks for a click until a part is picked, then lists the keys that draw it with their roles', () => {
    const root = lab.render(ctx());
    expect(root.querySelector('.gb-pl-chrome .gb-pl-edit')!.textContent).toContain('Click any part of the preview');
    chatInput(root).click();
    expect(chatInput(root).classList.contains('gb-pl-picked')).toBe(true);
    const row = keyRow(root, 'errorForeground');
    expect(row.textContent).toContain('Role: Error');
    expect(row.textContent).toContain(`(${TB.KEY_GROUPS.error.length} keys)`);
    expect(keyRow(root, 'input.background')).not.toBeNull();
  });

  it('editing a role recolors every key in it, and Try in VS Code sends the edit', () => {
    const c = ctx();
    const root = lab.render(c);
    chatInput(root).click();
    setColor(keyRow(root, 'errorForeground').querySelector<HTMLInputElement>('.gb-pl-key-role input[type="color"]')!, '#00ff00');
    expect((c.ui as any).edits).toEqual({ swatches: { error: '#00ff00' }, keys: {} });
    expect(drawn(root, 'errorForeground')).toBe('#00ff00');
    expect(drawn(root, 'editorError.foreground')).toBe('#00ff00');
    // The role's derived colors follow: the removed-text wash is the error color at 20%.
    expect(drawn(root, 'diffEditor.removedTextBackground')).toBe('#00ff0033');
    // The panel and the pick survive the redraw.
    expect(chatInput(root).classList.contains('gb-pl-picked')).toBe(true);
    expect(root.querySelector('.gb-pl-edits')!.textContent).toContain('Your edits (1)');
    buttonFor(root, 'Try in VS Code').click();
    expect(c.post.mock.calls[0][0].edits).toEqual({ swatches: { error: '#00ff00' }, keys: {} });
    expect(c.post.mock.calls[0][0].settings.edits).toEqual({ swatches: { error: '#00ff00' }, keys: {} });
  });

  it('editing one key leaves the rest of its role alone, and Reset all edits undoes it', () => {
    const c = ctx();
    const root = lab.render(c);
    const before = drawn(root, 'editorError.foreground');
    chatInput(root).click();
    setColor(keyRow(root, 'errorForeground').querySelector<HTMLInputElement>('details input[type="color"]')!, '#123456');
    expect(drawn(root, 'errorForeground')).toBe('#123456');
    expect(drawn(root, 'editorError.foreground')).toBe(before);
    buttonFor(root, 'Reset all edits').click();
    expect((c.ui as any).edits).toEqual({ swatches: {}, keys: {} });
    expect(drawn(root, 'errorForeground')).toBe(before);
  });

  it('a dragged color redraws the preview but keeps the edit panel, so the open input stays', () => {
    const root = lab.render(ctx());
    chatInput(root).click();
    const input = keyRow(root, 'errorForeground').querySelector<HTMLInputElement>('.gb-pl-key-role input[type="color"]')!;
    jest.useFakeTimers();
    const raf = window.requestAnimationFrame;
    (window as any).requestAnimationFrame = (fn: () => void) => setTimeout(fn, 16);
    setColor(input, '#ff00ff', 'input');
    jest.runAllTimers();
    (window as any).requestAnimationFrame = raf;
    jest.useRealTimers();
    expect(drawn(root, 'errorForeground')).toBe('#ff00ff');
    expect(root.contains(input)).toBe(true);
  });

  it('the Widgets tab draws the chat view with the extension-fixed orange marked, and its parts can be picked', () => {
    const c = ctx({ ui: { previewTab: 'widgets' } });
    const root = lab.render(c);
    const card = root.querySelector<HTMLElement>('.gb-pl-widgets [data-card="chat"]')!;
    expect(card).not.toBeNull();
    const fixed = card.querySelector<HTMLElement>('[data-fixed]')!;
    expect(fixed.getAttribute('data-fixed')).toBe('#d97757');
    fixed.click();
    expect(root.querySelector('.gb-pl-widgets .gb-pl-edit')!.textContent).toContain('set by the extension itself');
  });

  it('a restored Try brings its edits back, and starting from a shipped theme clears them', () => {
    const ui: any = {};
    lab.restoreTry(ui, { mode: 'generated', rule: 'triad', hue: 210, lightness: 0.75, chroma: 0.13, chromeIndex: 0, surfaces: 'neutral', edits: { swatches: { accent: '#ff0000' }, keys: {} } });
    expect(ui.edits).toEqual({ swatches: { accent: '#ff0000' }, keys: {} });
    const root = lab.render(ctx({ ui }));
    expect(drawn(root, 'button.background')).toBe('#ff0000');
    lab.startFrom(ui, { id: 'x', name: 'X', source: 'generated', rule: 'triad', baseHue: 10, lightness: 0.7, chroma: 0.1 });
    expect(ui.edits).toEqual({ swatches: {}, keys: {} });
  });
});

describe('Palette Lab layout', () => {
  const tablist = (root: HTMLElement, label: string) =>
    root.querySelector<HTMLElement>(`[role="tablist"][aria-label="${label}"]`)!;
  const tabTexts = (root: HTMLElement, label: string) =>
    [...tablist(root, label).querySelectorAll('[role="tab"]')].map(t => t.textContent || '');
  const tab = (root: HTMLElement, label: string, id: string) =>
    tablist(root, label).querySelector<HTMLButtonElement>(`[data-tab="${id}"]`)!;
  const panel = (root: HTMLElement, label: string, id: string) =>
    root.querySelector<HTMLElement>(`#${tab(root, label, id).getAttribute('aria-controls')}`)!;
  const selected = (root: HTMLElement, label: string) =>
    tablist(root, label).querySelector('[aria-selected="true"]')?.getAttribute('data-tab');
  const panelOf = (el: Element) => el.closest('[role="tabpanel"]') as HTMLElement;

  it('splits into a Start from column and a main column, each with its tablist, and the arrow keys move between tabs', () => {
    const root = lab.render(ctx());
    const children = [...root.children];
    expect(root.classList.contains('gb-palette')).toBe(true);
    expect(children).toHaveLength(2);
    expect(children[0].classList.contains('gb-pl-rail')).toBe(true);
    expect(children[1].classList.contains('gb-pl-main')).toBe(true);
    expect(children[0].contains(tablist(root, 'Start from'))).toBe(true);
    expect(children[1].contains(tablist(root, 'Previews'))).toBe(true);
    const start = tabTexts(root, 'Start from');
    ['Wheel', 'Paste', 'Shipped', 'Saved'].forEach((name, i) => expect(start[i].startsWith(name)).toBe(true));
    expect(start).toHaveLength(4);
    expect(tabTexts(root, 'Previews')).toEqual(['Workbench', 'Widgets', 'Contrast']);

    document.body.replaceChildren(root);
    const wheel = tab(root, 'Start from', 'wheel');
    wheel.focus();
    wheel.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(selected(root, 'Start from')).toBe('paste');
  });

  it('shows the Wheel and Workbench panels by default and keeps the others hidden', () => {
    const root = lab.render(ctx());
    expect(panel(root, 'Start from', 'wheel').hasAttribute('hidden')).toBe(false);
    expect(panel(root, 'Start from', 'wheel').querySelector('.gb-pl-hue')).not.toBeNull();
    expect(panelOf(root.querySelector('.gb-pl-paste')!).hasAttribute('hidden')).toBe(true);
    expect(selected(root, 'Previews')).toBe('chrome');
    expect(panelOf(root.querySelector('.gb-pl-scope')!).hasAttribute('hidden')).toBe(false);
    expect(root.querySelector('.gb-pl-panel')).toBeNull();
    expect(panelOf(root.querySelector('table.gb-pl-contrast')!).hasAttribute('hidden')).toBe(true);
  });

  it('opens on Workbench when the saved preview tab is the Code tab that no longer exists', () => {
    const root = lab.render(ctx({ ui: { previewTab: 'code' } }));
    expect(selected(root, 'Previews')).toBe('chrome');
    expect(tab(root, 'Previews', 'code')).toBeNull();
    // The Workbench drawing is there: the stage draws only for the tab the state names.
    expect(root.querySelector('.gb-pl-chrome .gb-pl-scope')).not.toBeNull();
  });

  it('reads the Wheel tab as Base color, Rule, Hue, Lightness, Chroma', () => {
    const root = lab.render(ctx());
    const labels = [...panel(root, 'Start from', 'wheel').querySelectorAll('.gb-pl-field > .gb-pl-field-name')].map(el => el.textContent);
    expect(labels).toEqual(['Base color', 'Rule', 'Hue', 'Lightness', 'Chroma']);
  });

  it('puts the shipped theme list node in the Shipped panel, or a waiting note without one', () => {
    const list = document.createElement('ul');
    const withList = lab.render(ctx({ shipped: list }));
    expect(panel(withList, 'Start from', 'shipped').contains(list)).toBe(true);
    const without = lab.render(ctx());
    expect(panel(without, 'Start from', 'shipped').textContent).toBe('Reading the installed themes...');
  });

  it('remembers the chosen tabs through a hue change and a fresh render', () => {
    const c: any = ctx({ save: jest.fn() });
    const root = lab.render(c);
    tab(root, 'Start from', 'paste').click();
    tab(root, 'Previews', 'contrast').click();
    expect(c.ui.startTab).toBe('paste');
    expect(c.ui.previewTab).toBe('contrast');
    expect(c.save).toHaveBeenCalled();

    const hue = root.querySelector<HTMLInputElement>('.gb-pl-hue')!;
    hue.value = '100';
    hue.dispatchEvent(new Event('input'));
    expect(selected(root, 'Start from')).toBe('paste');
    expect(selected(root, 'Previews')).toBe('contrast');

    const again = lab.render(c);
    expect(selected(again, 'Start from')).toBe('paste');
    expect(selected(again, 'Previews')).toBe('contrast');
  });

  it('keeps the same hue slider while it is dragged', () => {
    const root = lab.render(ctx());
    const before = root.querySelector<HTMLInputElement>('.gb-pl-hue')!;
    before.value = '120';
    before.dispatchEvent(new Event('input'));
    expect(root.querySelector('.gb-pl-hue')).toBe(before);
  });

  it('leaves Try in VS Code as the only primary button', () => {
    const root = lab.render(ctx({ shipped: document.createElement('div') }));
    const primary = [...root.querySelectorAll('button')]
      .filter(b => !b.classList.contains('secondary') && b.getAttribute('role') !== 'tab')
      .map(b => b.textContent);
    expect(primary).toEqual(['Try in VS Code']);
  });

  it('labels the contrast grades in a legend beside the table', () => {
    const root = lab.render(ctx());
    const legend = panel(root, 'Previews', 'contrast').querySelector('.gb-pl-legend')!;
    const badges = [...legend.querySelectorAll('span.badge')];
    expect(badges).toHaveLength(4);
    expect(badges.map(b => [...b.classList].find(c => c !== 'badge'))).toEqual(['aaa', 'aa', 'large', 'fail']);
    const text = legend.textContent || '';
    for (const part of ['7:1', '4.5:1', '3:1', 'under 3:1']) {expect(text).toContain(part);}
  });
});

describe('Palette Lab boxes and label column', () => {
  it('boxes the Start from, summary and Previews regions, each opening with its heading', () => {
    const root = lab.render(ctx());
    const boxes: Array<[string, string, string]> = [
      ['.gb-pl-rail', 'H2', 'Start from'],
      ['.gb-pl-summary', 'H3', 'Triad 210°'],
      ['.gb-pl-previews-box', 'H3', 'Previews'],
    ];
    for (const [selector, tag, text] of boxes) {
      const box = root.querySelector<HTMLElement>(selector)!;
      expect(box.classList.contains('gb-box')).toBe(true);
      expect(box.firstElementChild?.tagName).toBe(tag);
      expect(box.firstElementChild?.textContent).toBe(text);
    }
  });

  it('puts each summary, Frame and Editor label in the label cell of a field row', () => {
    const root = lab.render(ctx());
    const labels = [...root.querySelectorAll('.gb-pl-field > .gb-pl-field-name:first-child')].map(el => el.textContent);
    for (const label of ['Lowest contrast', 'Name', 'Note', 'Color', 'Style', 'Accent', 'Surfaces']) {
      expect(labels).toContain(label);
    }
  });

  it('boxes the Frame and Editor choices, with the folder-color button in the Frame box and no region checkboxes', () => {
    const root = lab.render(ctx());
    const legends = [...root.querySelectorAll('fieldset.gb-box > legend')].map(l => l.textContent);
    expect(legends).toEqual(['Catalog', 'Frame', 'Editor']);
    const frame = root.querySelector<HTMLElement>('fieldset.gb-fr-box')!;
    expect(frame.contains(buttonFor(root, 'Use the frame color for this folder'))).toBe(true);
    expect(frame.contains(buttonFor(root, 'Try in VS Code'))).toBe(false);
    expect(root.querySelectorAll('input[type="checkbox"][data-region]')).toHaveLength(0);
  });
});

describe('Palette Lab restoring a Try', () => {
  it('restoreTry loads a pasted record with its Editor choices, a Dark frame when it has none, and drops a base it does not have', () => {
    const ui: Record<string, any> = { mode: 'generated', baseId: 'x', baseName: 'X', chromeIndex: 0, surfaces: 'neutral' };
    lab.restoreTry(ui, { mode: 'pasted', pasted: ['#cc0000', '#990000', '#336699'], chromeIndex: 2, surfaces: 'rich' });
    expect(ui).toMatchObject({ mode: 'pasted', pasted: ['#cc0000', '#990000', '#336699'], chromeIndex: 2, surfaces: 'rich', frame: { index: 2, style: 'dark' } });
    expect(ui).not.toHaveProperty('baseId');
    expect(ui).not.toHaveProperty('baseName');
  });
});

// Last in the file: Load sets palette.js's module-level draft name, which a later render of
// the same candidate id would show instead of its default name.
describe('Palette Lab starting from a shipped theme', () => {
  const CANDY = { id: 'triad-h210-l0.75-c0.130', name: 'Candy', source: 'generated', rule: 'triad', baseHue: 210, lightness: 0.75, chroma: 0.13 };
  const decisionButtons = (root: HTMLElement) => ['Include', 'Maybe', 'Exclude'].map(label => buttonFor(root, label));

  it('startFrom sets the rule, hue, lightness and chroma, and resets the Editor and Frame choices to the shipped Dark look', () => {
    const ui: Record<string, any> = { rule: 'square', hue: 12, lightness: 0.6, chroma: 0.2, chromeIndex: 2, surfaces: 'rich', frame: { color: '#336699', style: 'filled' } };
    lab.startFrom(ui, CANDY);
    expect(ui).toMatchObject({ mode: 'generated', rule: 'triad', hue: 210, lightness: 0.75, chroma: 0.13, chromeIndex: 0, surfaces: 'neutral', frame: { index: 0, style: 'dark' } });
  });

  it('blocks saving the shipped palette unchanged, with a note, and keeps Try in VS Code', () => {
    const c = ctx({ ui: { chromeIndex: 2, surfaces: 'rich' } });
    lab.startFrom(c.ui, CANDY);
    const root = lab.render(c);
    for (const b of decisionButtons(root)) {expect(b.disabled).toBe(true);}
    expect(root.textContent).toContain('This is Candy as shipped.');
    expect(buttonFor(root, 'Try in VS Code').disabled).toBe(false);
  });

  it('saves a changed copy under its own id', () => {
    const c = ctx();
    lab.startFrom(c.ui, CANDY);
    const root = lab.render(c);
    const hue = root.querySelector('.gb-pl-hue-number') as HTMLInputElement;
    hue.value = '211';
    hue.dispatchEvent(new Event('change'));
    expect(root.textContent).not.toContain('as shipped');
    buttonFor(root, 'Include').click();
    expect(c.post).toHaveBeenCalledTimes(1);
    const msg = c.post.mock.calls[0][0];
    expect(msg.type).toBe('paletteDecision');
    expect(msg.entry.id).toBe('triad-h211-l0.75-c0.130');
  });

  it('Load on a saved palette clears the shipped base, even for the same id', () => {
    const saved = { ...CANDY, colors: GB.harmony('triad', { hue: 210, lightness: 0.75, chroma: 0.13 }).map((d: { hex: string }) => d.hex), status: 'include', note: '', decidedAt: '2026-11-03T00:00:00.000Z' };
    const c = ctx({ catalog: { ...SEED, palettes: [saved] } });
    lab.startFrom(c.ui, CANDY);
    const root = lab.render(c);
    expect(buttonFor(root, 'Include').disabled).toBe(true);
    root.querySelector<HTMLButtonElement>(`.gb-pl-row[data-id="${CANDY.id}"] button`)!.click();
    expect(buttonFor(root, 'Include').disabled).toBe(false);
    expect(root.textContent).not.toContain('as shipped');
  });

  it('startFrom with a pasted base loads its colors and blocks the unchanged save', () => {
    const pasted = { id: 'pasted-cc0000-990000', name: 'Pasted Pair', source: 'pasted', colors: ['#cc0000', '#990000'] };
    const c = ctx({ ui: { mode: 'generated', paste: '', pasted: null } });
    lab.startFrom(c.ui, pasted);
    expect(c.ui).toMatchObject({ mode: 'pasted', pasted: ['#cc0000', '#990000'], paste: '#cc0000 #990000', chromeIndex: 0, surfaces: 'neutral' });
    const root = lab.render(c);
    expect(root.querySelectorAll('.gb-pl-candidate .gb-pl-swatch')).toHaveLength(2);
    for (const b of decisionButtons(root)) {expect(b.disabled).toBe(true);}
    expect(root.textContent).toContain('This is Pasted Pair as shipped.');
  });
});

describe('Palette Lab saved themes', () => {
  const TRIAD = GB.harmony('triad', { hue: 210, lightness: 0.75, chroma: 0.13 }).map((d: { hex: string }) => d.hex);
  const SQUARE = GB.harmony('square', { hue: 12, lightness: 0.6, chroma: 0.2 }).map((d: { hex: string }) => d.hex);
  const design = (over: Record<string, any> = {}) => ({
    mode: 'generated', rule: 'square', hue: 12, lightness: 0.6, chroma: 0.2, colors: SQUARE,
    chromeIndex: 0, surfaces: 'neutral', frame: { index: 0, style: 'filled' }, edits: { swatches: {}, keys: {} }, ...over,
  });
  const theme = (id: string, name: string, slot: number | null, over: Record<string, any> = {}) =>
    ({ id, name, slot, design: design(over), groups: [], savedAt: '2026-11-04T00:00:00.000Z' });
  const LIBRARY = [theme('a', 'Alpha', 1), theme('b', 'Beta', null)];
  const row = (root: HTMLElement, id: string) => root.querySelector<HTMLElement>(`.gb-pl-lib-row[data-id="${id}"]`)!;
  const action = (root: HTMLElement, id: string, name: string) => row(root, id).querySelector<HTMLButtonElement>(`button[data-action="${name}"]`);
  const scope = (root: HTMLElement) => root.querySelector<HTMLElement>('.gb-pl-chrome .gb-pl-scope')!;
  const drawn = (root: HTMLElement, key: string) => scope(root).style.getPropertyValue(GB.varFor(key));
  const savedTab = (root: HTMLElement) => root.querySelector<HTMLElement>('[role="tablist"][aria-label="Start from"] [data-tab="saved"]')!;

  it('Save theme posts the name and the whole design, Frame included', () => {
    const c = ctx();
    const root = lab.render(c);
    const name = root.querySelector<HTMLInputElement>('.gb-pl-name')!;
    name.value = 'Alpha';
    name.dispatchEvent(new Event('input'));
    root.querySelector<HTMLButtonElement>('.gb-fr-box .gb-fr-pick[data-index="2"]')!.click();
    buttonFor(root, 'Save theme').click();
    const msg = c.post.mock.calls.find(call => call[0].type === 'saveTheme')![0];
    expect(msg.name).toBe('Alpha');
    expect(msg.design.frame).toEqual({ index: 2, style: 'filled' });
    expect(msg.design.colors).toEqual(TRIAD);
    expect(msg.design).toMatchObject({ mode: 'generated', rule: 'triad', hue: 210, lightness: 0.75, chroma: 0.13, chromeIndex: 0, surfaces: 'neutral' });
  });

  it('the Saved tab is labelled with the count and lists each theme with its slot', () => {
    const root = lab.render(ctx({ library: LIBRARY, hasFolder: true }));
    const label = savedTab(root);
    expect([label.firstChild?.firstChild?.textContent, label.querySelector('.count')?.textContent].join(' ')).toBe('Saved 2');
    const rows = [...root.querySelectorAll('.gb-pl-lib-row')].map(r =>
      [r.querySelector('.gb-pl-row-name')?.textContent, r.querySelector('.gb-pl-row-slot')?.textContent]);
    expect(rows).toEqual([['Alpha', 'Theme 1'], ['Beta', 'No slot']]);
    expect(root.querySelector('.gb-pl-library .gb-pl-group')).toBeNull();
  });

  it('says Use everywhere applies the Editor colors and each project keeps its own frame', () => {
    const root = lab.render(ctx({ library: LIBRARY, hasFolder: true }));
    const note = root.querySelector('.gb-pl-library .gb-pl-lib-note')?.textContent || '';
    expect(note).toContain("Use everywhere applies a theme's Editor colors");
    expect(note).toContain('Each project keeps its own frame');
  });

  it('says how to save a theme when there are none', () => {
    const root = lab.render(ctx({ library: [], hasFolder: true }));
    expect(root.querySelector('.gb-pl-lib-empty')?.textContent).toContain('click Save theme');
  });

  it('Use in this project, Use everywhere and Delete post the theme id', () => {
    const c = ctx({ library: LIBRARY, hasFolder: true });
    const root = lab.render(c);
    action(root, 'a', 'project')!.click();
    action(root, 'a', 'everywhere')!.click();
    action(root, 'a', 'delete')!.click();
    expect(c.post.mock.calls.map(call => call[0])).toEqual([
      { type: 'useTheme', id: 'a', where: 'project' },
      { type: 'useTheme', id: 'a', where: 'everywhere' },
      { type: 'deleteTheme', id: 'a' },
    ]);
    expect(action(root, 'a', 'project')!.textContent).toBe('Use in this project');
  });

  it('offers no Use in this project without a folder open', () => {
    const root = lab.render(ctx({ library: LIBRARY, hasFolder: false }));
    expect(action(root, 'a', 'project')).toBeNull();
    expect(action(root, 'a', 'everywhere')).not.toBeNull();
  });

  it('Load makes a saved theme the candidate, its custom frame and accent edit included, with its name', () => {
    const edits = { swatches: { accent: '#ff8800' }, keys: {} };
    const library = [theme('c', 'Custom', 2, { frame: { color: '#336699', style: 'filled' }, edits })];
    const c = ctx({ library, hasFolder: true });
    const root = lab.render(c);
    action(root, 'c', 'load')!.click();
    const entry = { colors: SQUARE };
    const expected = TB.buildColors(entry, { index: 0, surfaces: 'neutral', frame: { color: '#336699', style: 'filled' } }, edits);
    const unedited = TB.buildColors(entry, { index: 0, surfaces: 'neutral', frame: { color: '#336699', style: 'filled' } });
    expect(drawn(root, 'titleBar.activeBackground')).toBe('#336699');
    expect(drawn(root, 'button.background')).toBe(expected['button.background']);
    expect(expected['button.background']).not.toBe(unedited['button.background']);
    expect(root.querySelector<HTMLInputElement>('.gb-pl-name')!.value).toBe('Custom');
  });

  it('a saved design read back through parseLibrary and loaded builds the same colors as before saving', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { parseLibrary } = require('../src/themeLibrary');
    const c = ctx({ ui: { rule: 'square', hue: 12, lightness: 0.6, chroma: 0.2, chromeIndex: 1, surfaces: 'tinted', frame: { color: '#336699', style: 'filled' }, edits: { swatches: { accent: '#ff8800' }, keys: { 'editor.background': '#101010' } } } });
    const root = lab.render(c);
    const before = scope(root).style.cssText;
    buttonFor(root, 'Save theme').click();
    const msg = c.post.mock.calls.find(call => call[0].type === 'saveTheme')![0];
    const library = parseLibrary(JSON.parse(JSON.stringify([{ id: 'r', name: msg.name, slot: 1, design: msg.design, groups: [], savedAt: '2026-11-04T00:00:00.000Z' }])));
    expect(library).toHaveLength(1);

    const fresh = ctx({ library, hasFolder: true });
    const other = lab.render(fresh);
    expect(scope(other).style.cssText).not.toBe(before);
    action(other, 'r', 'load')!.click();
    expect(scope(other).style.cssText).toBe(before);
  });
});
