/**
 * @jest-environment jsdom
 */
// Runs the real Palette Lab (media/palette.js) in jsdom: contrast table, previews,
// decisions, the saved list, pasted designs and restoring a Try.
import * as fs from 'fs';
import * as path from 'path';

/* eslint-disable @typescript-eslint/no-require-imports */
const GB = require('../media/shared.js');
const TB = require('../media/themeBuilder.js');
/* eslint-enable @typescript-eslint/no-require-imports */

/* eslint-disable @typescript-eslint/no-explicit-any */
type Lab = {
  render(ctx: any): HTMLElement;
  renderPreview(ctx: any): HTMLElement;
  setPicked(ui: any, part: any): void;
  restoreTry(ui: any, record: any): void;
};

function ctx(over: Record<string, any> = {}) {
  return {
    liveBackground: '#1f1f1f',
    ui: {},
    post: jest.fn(),
    copy: jest.fn(),
    ...over,
  };
}

const buttonFor = (root: HTMLElement, label: string) =>
  [...root.querySelectorAll('button')].find(b => b.textContent === label) as HTMLButtonElement;

/**
 * jsdom has no layout, so this stands in for ResizeObserver: report() hands an element's
 * width to every observer watching it, as the browser would after a resize.
 */
class FakeResizeObserver {
  static all: FakeResizeObserver[] = [];
  targets = new Set<Element>();
  constructor(private cb: (entries: any[]) => void) { FakeResizeObserver.all.push(this); }
  observe(el: Element) { this.targets.add(el); }
  unobserve(el: Element) { this.targets.delete(el); }
  disconnect() { this.targets.clear(); }
  static report(el: Element, width: number) {
    for (const ro of [...FakeResizeObserver.all]) {
      if (ro.targets.has(el)) {ro.cb([{ target: el, contentRect: { width, height: 900 } }]);}
    }
  }
}

/** Renders the Lab and reports its root `width` px wide. */
function renderAt(width: number, over: Record<string, any> = {}) {
  const root = lab.render(ctx(over));
  FakeResizeObserver.report(root, width);
  return root;
}

/** Renders the Lab for `c` and, given a width, reports its root that wide. */
function renderWith(c: any, width?: number) {
  const root = lab.render(c);
  if (width !== undefined) {FakeResizeObserver.report(root, width);}
  return root;
}

/** The Theme Preview window's page for the Lab state `c.ui`, as themePreview.js draws it. */
function previewOf(c: any, post: jest.Mock = jest.fn()) {
  return lab.renderPreview({ ui: c.ui, groups: c.groups, modernUI: c.modernUI, post });
}

/**
 * Clicks a part in the Theme Preview page for `c.ui` (a selector, or a function finding it),
 * hands the posted part to the Lab as themeLab.js does on a host pickPart, and returns the Lab
 * re-rendered with the same ctx, reported `width` px wide when one is given.
 */
function pickIn(c: any, find: string | ((page: HTMLElement) => HTMLElement), width?: number) {
  const post = jest.fn();
  const page = previewOf(c, post);
  const el = typeof find === 'string' ? page.querySelector<HTMLElement>(find)! : find(page);
  el.click();
  const picks = post.mock.calls.map(call => call[0]).filter(m => m.type === 'pickPart');
  expect(picks).toHaveLength(1);
  lab.setPicked(c.ui, picks[0].part);
  return renderWith(c, width);
}

/** The Theme Preview's Workbench drawing for `c.ui`: it redefines the --vscode-* variables. */
const scopeIn = (c: any) => previewOf(c).querySelector<HTMLElement>('.gb-pl-chrome .gb-pl-scope')!;
/** The color the Theme Preview's Workbench drawing paints a key in, for the Lab state `c.ui`. */
const drawnIn = (c: any, key: string) => scopeIn(c).style.getPropertyValue(GB.varFor(key));
const CHAT_INPUT = '.gb-pl-chrome [data-region="chat"] .gb-chat-input';

/** Whether `b` comes after `a` in document order, outside it. */
const follows = (a: Element, b: Element) => !a.contains(b) && Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

/**
 * Opens the color picker (media/colorPicker.js) behind `trigger`, types `hex` in its hex field,
 * then keeps the color with Enter, leaves the picker open ('open') or cancels with Escape.
 * Returns the picker.
 */
function pickColor(trigger: HTMLElement, hex: string, then: 'keep' | 'open' | 'cancel' = 'keep') {
  expect(trigger.classList.contains('gb-cp-trigger')).toBe(true);
  trigger.click();
  const dialog = trigger.nextElementSibling as HTMLElement;
  expect(dialog.classList.contains('gb-cp')).toBe(true);
  const field = dialog.querySelector<HTMLInputElement>('.gb-cp-hex')!;
  field.value = hex;
  field.dispatchEvent(new Event('change', { bubbles: true }));
  if (then !== 'open') {
    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: then === 'keep' ? 'Enter' : 'Escape', bubbles: true, cancelable: true }));
  }
  return dialog;
}
/** The color a picker trigger shows. */
const triggerColor = (trigger: Element) => trigger.querySelector('.gb-cp-swatch')!.getAttribute('data-color');

let lab: Lab;

beforeAll(() => {
  (window as any).ResizeObserver = FakeResizeObserver;
  (window as any).GB = GB;
  (window as any).GBBuilder = TB;
  // jsdom has no canvas; the color picker leaves its ring and panel blank without a 2D context.
  HTMLCanvasElement.prototype.getContext = (() => null) as any;
  new Function(fs.readFileSync(path.join(__dirname, '..', 'media', 'gallery.js'), 'utf8'))();
  // The page loads colorPicker.js after gallery.js and before palette.js.
  new Function(fs.readFileSync(path.join(__dirname, '..', 'media', 'colorPicker.js'), 'utf8'))();
  const src = fs.readFileSync(path.join(__dirname, '..', 'media', 'palette.js'), 'utf8');
  // The webview loads palette.js as a classic script; evaluate it the same way.
  new Function(src)();
  lab = (window as any).GBPalette;
});

describe('Palette Lab', () => {
  it('with no catalog message, measures every triad color against three reference backgrounds and the live editor background', () => {
    const root = lab.render(ctx());
    expect(root.querySelectorAll('table.gb-pl-contrast .badge')).toHaveLength(20);
    const headers = [...root.querySelectorAll('table.gb-pl-contrast thead th')].map(th => th.textContent);
    expect(headers).toEqual(['Color', 'Near black#121212', 'Dark editor#1e1e1e', 'Dark side bar#252526', 'Your editor#1f1f1f']);
    expect(root.querySelector('.gb-s2 .gb-step-state')?.textContent).toMatch(/^weakest contrast \d+\.\d:1 \((AAA|AA|Large|Fail)\), /);
  });

  it('draws no Catalog: no Include, Maybe or Exclude, and no decided list', () => {
    const root = lab.render(ctx());
    for (const label of ['Include', 'Maybe', 'Exclude']) {expect(buttonFor(root, label)).toBeUndefined();}
    expect(root.querySelector('[class*="catalog" i]')).toBeNull();
    expect(buttonFor(root, 'Try in VS Code')).toBeDefined();
    expect(buttonFor(root, 'Save theme')).toBeDefined();
  });

  it('draws a pasted candidate, from a saved theme or a Try, with its own colors', () => {
    const root = lab.render(ctx({ ui: { mode: 'pasted', pasted: ['#ff8800', '#336699'] } }));
    expect(root.querySelectorAll('.gb-s2 .gb-pl-swatch')).toHaveLength(2);
    expect(root.querySelectorAll('table.gb-pl-contrast tbody tr')).toHaveLength(2);
  });

  it('has no paste input and no Judge pasted colors button', () => {
    const root = lab.render(ctx());
    expect(root.querySelector('textarea')).toBeNull();
    expect(buttonFor(root, 'Judge pasted colors')).toBeUndefined();
  });

  it('shows the base color in the picker, and picking a color sets hue, lightness and chroma', () => {
    const c = ctx();
    const root = lab.render(c);
    const picker = root.querySelector<HTMLElement>('.gb-pl-base')!;
    expect(triggerColor(picker)).toBe(GB.oklchToHex({ l: 0.75, c: 0.13, h: 210 }));

    pickColor(picker, '#ceaa3e');
    const o = GB.hexToOklch('#ceaa3e');
    expect((root.querySelector('.gb-pl-hue') as HTMLInputElement).value).toBe(String(Math.round(o.h)));

    buttonFor(root, 'Save theme').click();
    const design = c.post.mock.calls[0][0].design;
    expect(design).toMatchObject({ mode: 'generated', hue: Math.round(o.h), lightness: Number(o.l.toFixed(2)), chroma: Number(o.c.toFixed(3)) });
  });

  it('keeps the hue when a grey is picked', () => {
    const root = lab.render(ctx());
    pickColor(root.querySelector<HTMLElement>('.gb-pl-base')!, '#808080');
    expect((root.querySelector('.gb-pl-hue') as HTMLInputElement).value).toBe('210');
  });

});

describe('Palette Lab Workbench preview, Frame and Editor', () => {
  const TRIAD = GB.harmony('triad', { hue: 210, lightness: 0.75, chroma: 0.13 }).map((d: { hex: string }) => d.hex);
  const region = (page: HTMLElement, name: string) => page.querySelector<HTMLElement>(`.gb-pl-chrome [data-region="${name}"]`)!;
  const framePick = (root: HTMLElement, index: string) => root.querySelector<HTMLButtonElement>(`.gb-fr-box .gb-fr-pick[data-index="${index}"]`)!;
  const setValue = (el: HTMLInputElement | HTMLSelectElement, value: string) => {
    el.value = value;
    el.dispatchEvent(new Event('change'));
  };

  it('draws the whole theme Try in VS Code applies, a new design starting with a Filled frame in color 1', () => {
    const c = ctx();
    lab.render(c);
    const page = previewOf(c);
    const expected = TB.buildColors({ colors: TRIAD }, { index: 0, surfaces: 'neutral', frame: { index: 0, style: 'filled' } });
    for (const key of ['titleBar.activeBackground', 'statusBar.background', 'statusBar.noFolderBackground', 'editorGroup.border', 'inlineChatInput.border', 'errorForeground']) {
      expect({ key, drawn: drawnIn(c, key) }).toEqual({ key, drawn: expected[key] });
    }
    expect(drawnIn(c, 'titleBar.activeBackground')).toBe(TRIAD[0]);
    for (const name of ['titleBar', 'activityBar', 'sideBar', 'tabs', 'editorGroup', 'panel', 'chat', 'statusBar']) {
      expect({ name, found: Boolean(region(page, name)) }).toEqual({ name, found: true });
    }
    expect(page.querySelectorAll('.gb-ch-readout .badge')).toHaveLength(5);
  });

  it('choosing Frame color 3 moves the bars to color 3 and leaves the editor alone', () => {
    const c = ctx();
    const root = lab.render(c);
    const editorBg = drawnIn(c, 'editor.background');
    const inputBorder = drawnIn(c, 'input.border');
    framePick(root, '2').click();
    expect((c.ui as any).frame).toEqual({ index: 2, style: 'filled' });
    expect(drawnIn(c, 'titleBar.activeBackground')).toBe(TRIAD[2]);
    expect(drawnIn(c, 'editor.background')).toBe(editorBg);
    expect(drawnIn(c, 'input.border')).toBe(inputBorder);
  });

  it('a custom frame color draws the bars in that color, and the Dark style draws dark bars', () => {
    const c = ctx();
    const root = lab.render(c);
    pickColor(root.querySelector<HTMLElement>('.gb-fr-custom')!, '#336699');
    expect((c.ui as any).frame).toEqual({ color: '#336699', style: 'filled' });
    expect(drawnIn(c, 'titleBar.activeBackground')).toBe('#336699');
    expect(framePick(root, 'custom').getAttribute('aria-checked')).toBe('true');
    setValue(root.querySelector<HTMLSelectElement>('.gb-fr-style')!, 'dark');
    expect(drawnIn(c, 'titleBar.activeBackground')).toBe(drawnIn(c, 'sideBar.background'));
  });

  it('choosing Editor accent 2 moves the buttons but not a Filled frame', () => {
    const c = ctx();
    const root = lab.render(c);
    const button = drawnIn(c, 'button.background');
    const title = drawnIn(c, 'titleBar.activeBackground');
    root.querySelector<HTMLButtonElement>('.gb-ed-box .gb-ch-pick[data-index="1"]')!.click();
    expect(drawnIn(c, 'button.background')).not.toBe(button);
    expect(drawnIn(c, 'titleBar.activeBackground')).toBe(title);
  });

  it('Try in VS Code posts the Editor and Frame choices and edits, ', () => {
    const c = ctx({ ui: { chromeIndex: 1, surfaces: 'rich', frame: { color: '#336699', style: 'filled' } } });
    const root = lab.render(c);
    buttonFor(root, 'Try in VS Code').click();
    expect(c.post).toHaveBeenCalledTimes(1);
    const msg = c.post.mock.calls[0][0];
    expect(Object.keys(msg).sort()).toEqual(['chrome', 'edits', 'entry', 'groups', 'settings', 'type']);
    expect(msg.groups).toEqual([]);
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
    expect(triggerColor(root.querySelector('.gb-fr-custom')!)).toBe('#336699');
    expect(root.querySelector<HTMLSelectElement>('.gb-fr-style')!.value).toBe('filled');
    expect(drawnIn({ ui }, 'titleBar.activeBackground')).toBe('#336699');
  });

  it("names this folder's old color in the Frame box but keeps drawing the theme's frame", () => {
    const note = "This folder's settings still hold the old GigglyBits folder color (#fed0f9), which VS Code draws over every GigglyBits theme's frame. Use in this project with a saved theme removes it.";
    const c = ctx({ identityFill: '#fed0f9' });
    const root = lab.render(c);
    expect(root.querySelector('.gb-fr-box')!.textContent).toContain(note);
    expect(drawnIn(c, 'titleBar.activeBackground')).toBe(TRIAD[0]);
    expect(lab.render(ctx()).querySelector('.gb-fr-box')!.textContent).not.toContain(note);
  });

  it('draws no Use the frame color for this folder button, with or without an old folder color', () => {
    for (const c of [ctx(), ctx({ identityFill: '#fed0f9' })]) {
      const labels = [...lab.render(c).querySelectorAll('button')].map(b => (b.textContent || '').trim());
      expect(labels.filter(t => t === 'Use the frame color for this folder')).toEqual([]);
    }
  });

  it('puts every Frame role, and only those, in the Frame family of the Roles step', () => {
    const root = lab.render(ctx());
    root.querySelector<HTMLButtonElement>('.gb-rf[data-family="frame"] .gb-rf-toggle')!.click();
    const frame = [...root.querySelectorAll<HTMLElement>('.gb-rf[data-family="frame"] .gb-role-chip')].map(ch => ch.dataset.swatch!).sort();
    expect(frame.length).toBeGreaterThan(0);
    expect(frame).toEqual(Object.keys(TB.SWATCHES).filter(sw => TB.SWATCHES[sw][2] === 'frame').sort());
  });
});

describe('Palette Lab color editing', () => {
  /** The chat input in a fresh Theme Preview page for `c.ui`, which marks the picked part. */
  const chatInputIn = (c: any) => previewOf(c).querySelector<HTMLElement>(CHAT_INPUT)!;
  const keyRow = (root: HTMLElement, key: string) => root.querySelector<HTMLElement>(`.gb-pl-edit .gb-pl-key[data-key="${key}"]`)!;
  const setColor = (input: HTMLInputElement, value: string, event = 'change') => {
    input.value = value;
    input.dispatchEvent(new Event(event));
  };

  it('asks for a click in the preview window until a part is picked, then lists the keys that draw it with their roles', () => {
    const c = ctx();
    const first = lab.render(c);
    expect(first.querySelector('.gb-s4-line')!.textContent).toContain('Click any part of the preview window');
    expect(first.querySelector('.gb-pl-edit')).toBeNull();
    const root = pickIn(c, CHAT_INPUT);
    expect(chatInputIn(c).classList.contains('gb-pl-picked')).toBe(true);
    expect(root.querySelector<HTMLElement>('.gb-s4-line')!.hidden).toBe(true);
    const row = keyRow(root, 'errorForeground');
    expect(row.querySelector('.gb-pl-key-rolename')!.textContent).toBe(`Error (${TB.KEY_GROUPS.error.length})`);
    expect(row.querySelector('.gb-ke-seg[data-scope="role"]')!.textContent).toBe(`Whole role: Error (${TB.KEY_GROUPS.error.length})`);
    expect(keyRow(root, 'input.background')).not.toBeNull();
  });

  it('shows a modern UI key the theme leaves unset in the color the preview draws it, not as unset', () => {
    const c = { ...ctx(), modernUI: { modern: true, uppercase: false, tabStyle: 'connected' } };
    lab.render(c);
    const root = pickIn(c, '.gb-pl-chrome [data-region="tabs"] .gb-tab');
    const row = keyRow(root, 'modernEditorTab.activeBackground');
    const drawnValue = drawnIn(c, 'modernEditorTab.activeBackground');
    expect(drawnValue).not.toBe('');
    expect(row.querySelector('.gb-pl-key-head')!.textContent).toContain(drawnValue);
    expect(row.querySelector('.gb-pl-key-head')!.textContent).not.toContain('unset');
    expect(row.textContent).toContain('works it out');
    expect(keyRow(root, 'window.activeBorder').querySelector('.gb-pl-key-rolename')!.textContent).toMatch(/ \(2\)$/);
  });

  it('editing a role recolors every key in it, and Try in VS Code sends the edit', () => {
    const c = ctx();
    lab.render(c);
    const root = pickIn(c, CHAT_INPUT);
    keyRow(root, 'errorForeground').querySelector<HTMLButtonElement>('.gb-ke-seg[data-scope="role"]')!.click();
    pickColor(keyRow(root, 'errorForeground').querySelector<HTMLElement>('.gb-ke-pick')!, '#00ff00');
    expect((c.ui as any).edits).toEqual({ swatches: { error: '#00ff00' }, keys: {} });
    expect(drawnIn(c, 'errorForeground')).toBe('#00ff00');
    expect(drawnIn(c, 'editorError.foreground')).toBe('#00ff00');
    // The role's derived colors follow: the removed-text wash is the error color at 20%.
    expect(drawnIn(c, 'diffEditor.removedTextBackground')).toBe('#00ff0033');
    // The dock and the pick survive the redraw.
    expect(root.querySelector('.gb-dock')).not.toBeNull();
    expect(chatInputIn(c).classList.contains('gb-pl-picked')).toBe(true);
    expect(buttonFor(root, 'Edits (1)')).toBeDefined();
    buttonFor(root, 'Try in VS Code').click();
    expect(c.post.mock.calls[0][0].edits).toEqual({ swatches: { error: '#00ff00' }, keys: {} });
    expect(c.post.mock.calls[0][0].settings.edits).toEqual({ swatches: { error: '#00ff00' }, keys: {} });
  });

  it('editing one key leaves the rest of its role alone, and Reset all edits undoes it', () => {
    const c = ctx();
    lab.render(c);
    const before = drawnIn(c, 'editorError.foreground');
    const root = pickIn(c, CHAT_INPUT);
    keyRow(root, 'errorForeground').querySelector<HTMLButtonElement>('.gb-ke-seg[data-scope="key"]')!.click();
    pickColor(keyRow(root, 'errorForeground').querySelector<HTMLElement>('.gb-ke-pick')!, '#123456');
    expect(drawnIn(c, 'errorForeground')).toBe('#123456');
    expect(drawnIn(c, 'editorError.foreground')).toBe(before);
    buttonFor(root, 'Reset all').click();
    expect((c.ui as any).edits).toEqual({ swatches: {}, keys: {} });
    expect(drawnIn(c, 'errorForeground')).toBe(before);
  });

  it('a dragged color changes and saves the edit, for the preview window, but keeps the dock, so the open input stays', () => {
    const save = jest.fn();
    const c = ctx({ save });
    lab.render(c);
    const root = pickIn(c, CHAT_INPUT);
    keyRow(root, 'errorForeground').querySelector<HTMLButtonElement>('.gb-ke-seg[data-scope="role"]')!.click();
    const input = keyRow(root, 'errorForeground').querySelector<HTMLElement>('.gb-ke-pick')!;
    const dock = root.querySelector('.gb-dock')!;
    save.mockClear();
    const picker = pickColor(input, '#ff00ff', 'open');
    expect((c.ui as any).edits).toEqual({ swatches: { error: '#ff00ff' }, keys: {} });
    expect(save).toHaveBeenCalled();
    expect(drawnIn(c, 'errorForeground')).toBe('#ff00ff');
    expect(root.contains(input)).toBe(true);
    expect(root.contains(picker)).toBe(true);
    expect(root.querySelector('.gb-dock')).toBe(dock);
    // A finished change redraws the whole Lab, the dock included.
    picker.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    expect(root.querySelector('.gb-dock')).not.toBe(dock);
    expect(root.querySelector('.gb-dock')).not.toBeNull();
  });

  describe('the color editor', () => {
    const editor = (root: HTMLElement, key: string) => keyRow(root, key).querySelector<HTMLElement>('.gb-ke')!;
    const opened = () => {
      const c = ctx();
      lab.render(c);
      const root = pickIn(c, CHAT_INPUT);
      return { c, root, color: drawnIn(c, 'errorForeground').slice(0, 7) };
    };

    it('starts on the whole role for a key with a role and no edit of its own, and says what each choice changes', () => {
      const { root } = opened();
      const ed = editor(root, 'errorForeground');
      expect(ed.querySelector('.gb-ke-seg[aria-pressed="true"]')!.getAttribute('data-scope')).toBe('role');
      expect(ed.querySelector('.gb-ke-sub')!.textContent).toBe('Changing every key in Error');
      ed.querySelector<HTMLButtonElement>('.gb-ke-seg[data-scope="key"]')!.click();
      expect(ed.querySelector('.gb-ke-seg[aria-pressed="true"]')!.getAttribute('data-scope')).toBe('key');
      expect(ed.querySelector('.gb-ke-sub')!.textContent).toBe('In Error; changing this key alone');
    });

    it('Transparent sets this key alone to its color at 0% opacity, and the preview draws that', () => {
      const { c, root, color } = opened();
      const before = drawnIn(c, 'editorError.foreground');
      editor(root, 'errorForeground').querySelector<HTMLButtonElement>('.gb-ke-transparent')!.click();
      expect((c.ui as any).edits).toEqual({ swatches: {}, keys: { errorForeground: `${color}00` } });
      expect(drawnIn(c, 'errorForeground')).toBe(`${color}00`);
      expect(drawnIn(c, 'editorError.foreground')).toBe(before);
      const ed = editor(root, 'errorForeground');
      expect(ed.querySelector('.gb-ke-seg[aria-pressed="true"]')!.getAttribute('data-scope')).toBe('key');
      expect(ed.querySelector<HTMLInputElement>('.gb-ke-hex')!.value).toBe(`${color}00`);
      expect(ed.querySelector('.gb-ke-pct')!.textContent).toBe('0%');
    });

    it('Opacity sets this key alone to its color with that alpha', () => {
      const { c, root, color } = opened();
      setColor(editor(root, 'errorForeground').querySelector<HTMLInputElement>('.gb-ke-alpha')!, '50');
      expect((c.ui as any).edits.keys).toEqual({ errorForeground: `${color}80` });
      expect(editor(root, 'errorForeground').querySelector('.gb-ke-pct')!.textContent).toBe('50%');
    });

    it('the hex field takes #rrggbbaa, and a value that is not a color is marked and changes nothing', () => {
      const { c, root } = opened();
      const hex = () => editor(root, 'errorForeground').querySelector<HTMLInputElement>('.gb-ke-hex')!;
      setColor(hex(), 'red');
      expect(hex().getAttribute('aria-invalid')).toBe('true');
      expect((c.ui as any).edits?.keys ?? {}).toEqual({});
      setColor(hex(), '#11223344');
      expect((c.ui as any).edits.keys).toEqual({ errorForeground: '#11223344' });
      expect(drawnIn(c, 'errorForeground')).toBe('#11223344');
    });

    it('Use VS Code default leaves the key out of the preview, lists the edit as such, and Try in VS Code sends it', () => {
      const { c, root } = opened();
      editor(root, 'errorForeground').querySelector<HTMLButtonElement>('.gb-ke-default')!.click();
      expect((c.ui as any).edits).toEqual({ swatches: {}, keys: { errorForeground: 'default' } });
      expect(drawnIn(c, 'errorForeground')).toBe('');
      const ed = editor(root, 'errorForeground');
      expect(ed.querySelector('.gb-ke-chip')!.classList.contains('gb-ke-unset')).toBe(true);
      expect(ed.querySelector<HTMLButtonElement>('.gb-ke-default')!.disabled).toBe(true);
      expect(ed.textContent).toContain('VS Code draws it in its own default color');
      buttonFor(root, 'Edits (1)').click();
      expect(root.querySelector('.gb-dock-edits li')!.textContent).toContain('errorForeground (VS Code default)');
      buttonFor(root, 'Try in VS Code').click();
      expect(c.post.mock.calls[0][0].edits).toEqual({ swatches: {}, keys: { errorForeground: 'default' } });
      // Reset in the editor undoes it.
      editor(root, 'errorForeground').querySelector<HTMLButtonElement>('.gb-ke-reset')!.click();
      expect((c.ui as any).edits).toEqual({ swatches: {}, keys: {} });
    });
  });

  it('the preview\'s Widgets section draws the chat view with the extension-fixed orange marked, and its parts can be picked', () => {
    const c = ctx();
    lab.render(c);
    const card = previewOf(c).querySelector<HTMLElement>('.gb-pl-widgets-wrap [data-card="chat"]')!;
    expect(card).not.toBeNull();
    expect(card.querySelector<HTMLElement>('[data-fixed]')!.getAttribute('data-fixed')).toBe('#d97757');
    const root = pickIn(c, '.gb-pl-widgets-wrap [data-card="chat"] [data-fixed]');
    expect(root.querySelector('.gb-pl-edit')!.textContent).toContain('set by the extension itself');
  });

  it('a restored Try brings its edits back, and restoring one with no edits clears them', () => {
    const ui: any = {};
    lab.restoreTry(ui, { mode: 'generated', rule: 'triad', hue: 210, lightness: 0.75, chroma: 0.13, chromeIndex: 0, surfaces: 'neutral', edits: { swatches: { accent: '#ff0000' }, keys: {} } });
    expect(ui.edits).toEqual({ swatches: { accent: '#ff0000' }, keys: {} });
    lab.render(ctx({ ui }));
    expect(drawnIn({ ui }, 'button.background')).toBe('#ff0000');
    lab.restoreTry(ui, { mode: 'generated', rule: 'triad', hue: 10, lightness: 0.7, chroma: 0.1, chromeIndex: 0, surfaces: 'neutral' });
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

  afterEach(() => { renderAt(880); });

  it('{#region-order} wide, the task column holds steps 1 to 3 and the bar, and the stage the Preview card and steps 4 and 5; narrow, one column of the Preview card, steps 1 to 5 and the bar', () => {
    const regions = (root: HTMLElement) => [...root.querySelector('.gb-lab-grid')!.children].map(el => el.className);
    const kids = (el: Element) => [...el.children].map(c => c.className);
    const wideRoot = renderAt(1400);
    expect(regions(wideRoot)).toEqual(['gb-tasks', 'gb-stage']);
    expect(kids(wideRoot.querySelector('.gb-tasks')!)).toEqual(['gb-step gb-s1', 'gb-step gb-s2', 'gb-step gb-s3', 'gb-step gb-bar']);
    expect(kids(wideRoot.querySelector('.gb-stage')!)).toEqual(['gb-step gb-away', 'gb-step gb-roles', 'gb-step gb-s4']);
    expect(wideRoot.hasAttribute('data-wide')).toBe(true);

    const narrow = renderAt(880);
    expect(regions(narrow)).toEqual(['gb-tasks']);
    expect(kids(narrow.querySelector('.gb-tasks')!))
      .toEqual(['gb-step gb-away', 'gb-step gb-s1', 'gb-step gb-s2', 'gb-step gb-s3', 'gb-step gb-roles', 'gb-step gb-s4', 'gb-step gb-bar']);
    expect(narrow.hasAttribute('data-wide')).toBe(false);
    for (const root of [wideRoot, narrow]) {
      expect(root.hasAttribute('data-detached')).toBe(false);
      expect(root.querySelector('.gb-preview, .gb-tabrow, .gb-pl-chrome, .gb-pl-scope')).toBeNull();
    }
  });

  it('{#step-states} reads each step heading\'s state: the source, the lowest pair, the frame and accent, the edit count', () => {
    const root = renderAt(880);
    const state = (n: number) => root.querySelector(`.gb-s${n} .gb-step-state`)?.textContent;
    expect(state(1)).toBe('Wheel, Triad 210°');
    const TRIAD = GB.harmony('triad', { hue: 210, lightness: 0.75, chroma: 0.13 }).map((d: { hex: string }) => d.hex);
    const m = /^weakest contrast \d+\.\d:1 \((?:AAA|AA|Large|Fail)\), (#[0-9a-f]{6}) on (#[0-9a-f]{6})$/.exec(state(2) || '');
    expect(m).not.toBeNull();
    expect(TRIAD).toContain(m![1]);
    expect(['#121212', '#1e1e1e', '#252526', '#1f1f1f']).toContain(m![2]);
    expect(state(3)).toBe('Frame 1 Filled · Accent 1 Neutral');
    expect(state(4)).toBe('0 edits');
  });

  it('{#one-primary} has Try in VS Code as the only primary button at both widths, with the preview window open', () => {
    for (const width of [1400, 880]) {
      const root = renderAt(width, { detached: true });
      const primary = [...root.querySelectorAll('button')]
        .filter(b => !b.classList.contains('secondary') && b.getAttribute('role') !== 'tab')
        .map(b => b.textContent);
      expect({ width, primary }).toEqual({ width, primary: ['Try in VS Code'] });
    }
  });

  it('draws no Pin, no Contrast tab, no Previews heading and no fieldset in step 3', () => {
    const root = renderAt(880);
    expect(buttonFor(root, 'Pin')).toBeUndefined();
    expect(root.querySelector('[role="tab"][data-tab="contrast"]')).toBeNull();
    expect([...root.querySelectorAll('h1, h2, h3, h4')].filter(el => el.textContent === 'Previews')).toEqual([]);
    expect(root.querySelector('.gb-s3 fieldset')).toBeNull();
    expect(root.querySelector('.gb-s3 .gb-fr-box')).not.toBeNull();
  });

  it('puts the Start from tablist in step 1 as the page\'s only tablist, and the arrow keys move between its tabs', () => {
    const root = lab.render(ctx());
    expect(root.querySelector('.gb-s1')!.contains(tablist(root, 'Start from'))).toBe(true);
    expect([...root.querySelectorAll('[role="tablist"]')].map(t => t.getAttribute('aria-label'))).toEqual(['Start from']);

    document.body.replaceChildren(root);
    const wheel = tab(root, 'Start from', 'wheel');
    wheel.focus();
    wheel.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(selected(root, 'Start from')).toBe('saved');
  });

  it('{#two-tabs} holds exactly the Start from tabs Wheel and Saved, in that order', () => {
    const root = lab.render(ctx());
    const tabs = [...tablist(root, 'Start from').querySelectorAll('[role="tab"]')];
    expect(tabs.map(t => t.getAttribute('data-tab'))).toEqual(['wheel', 'saved']);
    const texts = tabTexts(root, 'Start from');
    expect(texts[0]).toBe('Wheel');
    // The Saved tab carries the saved-theme count after its name.
    expect(texts[1]).toMatch(/^Saved\d+$/);
  });

  it('{#old-tab-falls-back} opens a state saved on the Paste or Shipped tab on Wheel, with its panel shown', () => {
    for (const startTab of ['paste', 'shipped']) {
      const ui: any = { startTab };
      const root = lab.render(ctx({ ui }));
      expect({ startTab, selected: selected(root, 'Start from') }).toEqual({ startTab, selected: 'wheel' });
      expect({ startTab, hidden: panel(root, 'Start from', 'wheel').hasAttribute('hidden') }).toEqual({ startTab, hidden: false });
      expect(ui.startTab).toBe('wheel');
    }
  });

  it('shows the Wheel panel by default and keeps the Saved panel hidden', () => {
    const root = lab.render(ctx());
    expect(panel(root, 'Start from', 'wheel').hasAttribute('hidden')).toBe(false);
    expect(panel(root, 'Start from', 'wheel').querySelector('.gb-pl-hue')).not.toBeNull();
    expect(panelOf(root.querySelector('.gb-pl-saved')!).hasAttribute('hidden')).toBe(true);
    expect(root.querySelector('.gb-pl-panel')).toBeNull();
  });

  it('drops a preview tab and Pin saved before the preview moved to its own window', () => {
    for (const previewTab of ['widgets', 'code', 'contrast']) {
      const ui: any = { previewTab, previewPinned: true };
      const root = lab.render(ctx({ ui }));
      expect({ previewTab, tab: 'previewTab' in ui, pin: 'previewPinned' in ui }).toEqual({ previewTab, tab: false, pin: false });
      expect(root.querySelector('[role="tablist"][aria-label="Previews"]')).toBeNull();
    }
  });

  it('reads the Wheel tab as Base color, Rule, Hue, Lightness, Chroma', () => {
    const root = lab.render(ctx());
    const labels = [...panel(root, 'Start from', 'wheel').querySelectorAll('.gb-pl-field > .gb-pl-field-name')].map(el => el.textContent);
    expect(labels).toEqual(['Base color', 'Rule', 'Hue', 'Lightness', 'Chroma']);
  });

  it('remembers the chosen Start from tab through a hue change and a fresh render', () => {
    const c: any = ctx({ save: jest.fn() });
    const root = lab.render(c);
    tab(root, 'Start from', 'saved').click();
    expect(c.ui.startTab).toBe('saved');
    expect(c.save).toHaveBeenCalled();

    const hue = root.querySelector<HTMLInputElement>('.gb-pl-hue')!;
    hue.value = '100';
    hue.dispatchEvent(new Event('input'));
    expect(selected(root, 'Start from')).toBe('saved');

    const again = lab.render(c);
    expect(selected(again, 'Start from')).toBe('saved');
  });

  it('keeps the same hue slider while it is dragged', () => {
    const root = lab.render(ctx());
    const before = root.querySelector<HTMLInputElement>('.gb-pl-hue')!;
    before.value = '120';
    before.dispatchEvent(new Event('input'));
    expect(root.querySelector('.gb-pl-hue')).toBe(before);
  });

  it('labels the contrast grades in a legend in step 2', () => {
    const root = lab.render(ctx());
    const legend = root.querySelector('.gb-s2 .gb-pl-legend')!;
    const badges = [...legend.querySelectorAll('span.badge')];
    expect(badges).toHaveLength(4);
    expect(badges.map(b => [...b.classList].find(c => c !== 'badge'))).toEqual(['aaa', 'aa', 'large', 'fail']);
    const text = legend.textContent || '';
    for (const part of ['7:1', '4.5:1', '3:1', 'under 3:1', 'fine for normal text', 'hard to read']) {expect(text).toContain(part);}
  });
});

describe('Palette Lab step 2 contrast table', () => {
  const rows = (root: HTMLElement) => [...root.querySelectorAll<HTMLElement>('.gb-s2 table.gb-pl-contrast tbody tr')];
  const TEN = ['#ff8800', '#336699', '#cc0000', '#00aa55', '#aa00ff', '#ffee00', '#0088ff', '#ff0088', '#88ff00', '#00ffee'];

  it('{#table-rows} has one row per palette color, each with its hex, an L C H line and 4 ratio cells, for 5 and then 10 colors', () => {
    const check = (root: HTMLElement, n: number) => {
      const rs = rows(root);
      expect(rs).toHaveLength(n);
      for (const r of rs) {
        expect(r.querySelector('.gb-pl-hex')?.textContent).toMatch(/^#[0-9a-f]{6}$/);
        expect(r.querySelector('.gb-pl-oklch')?.textContent).toMatch(/^L \d\.\d\d C \d\.\d{3} H \d+$/);
        expect(r.querySelectorAll('td.gb-pl-ratio')).toHaveLength(4);
      }
    };
    check(lab.render(ctx()), 5);
    // Ten colors come from a pasted design, as a saved theme or a Try holds one.
    const ten = lab.render(ctx({ ui: { mode: 'pasted', pasted: TEN } }));
    check(ten, 10);
    expect(rows(ten).map(r => r.querySelector('.gb-pl-hex')!.textContent)).toEqual(TEN);
  });

  it('{#weakest-one} marks exactly one cell, the minimum ratio, as weakest, and the step 2 heading names the same ratio, color and background', () => {
    const root = lab.render(ctx());
    const cells = [...root.querySelectorAll<HTMLElement>('.gb-s2 td.gb-pl-ratio')];
    expect(cells).toHaveLength(20);
    const ratios = cells.map(c => Number(c.dataset.ratio));
    const marked = cells.filter(c => c.classList.contains('gb-pl-weakest'));
    expect(marked).toHaveLength(1);
    expect(Number(marked[0].dataset.ratio)).toBe(Math.min(...ratios));
    expect(marked[0].textContent).toContain('weakest');
    const hex = marked[0].closest('tr')!.querySelector('.gb-pl-hex')!.textContent;
    const low = Math.min(...ratios);
    const tag = { aaa: 'AAA', aa: 'AA', large: 'Large', fail: 'Fail' }[GB.contrastGrade(low)[0] as string];
    expect(root.querySelector('.gb-s2 .gb-step-state')!.textContent)
      .toBe(`weakest contrast ${low.toFixed(1)}:1 (${tag}), ${hex} on ${marked[0].dataset.bg}`);
    const verdict = { aaa: 'Easy to read at any size', aa: 'Readable as normal text', large: 'Fine for icons, borders and large text; too faint for normal text', fail: 'Hard to read; avoid it for text' }[GB.contrastGrade(low)[0] as string];
    const title = marked[0].getAttribute('title')!;
    expect(title.startsWith(`${verdict}. ${hex} on `)).toBe(true);
    expect(title.endsWith(` (${marked[0].dataset.bg}): ${low.toFixed(1)}:1. The weakest pair in the palette.`)).toBe(true);
  });

  it('{#cell-sample} makes each ratio cell one swatch on the column\'s background, holding "Aa" in the row\'s color at normal and large size, then the badge', () => {
    const rgb = (hex: string) => `rgb(${[1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`;
    const root = lab.render(ctx());
    let cells = 0;
    for (const r of rows(root)) {
      const hex = r.querySelector('.gb-pl-hex')!.textContent!;
      for (const td of r.querySelectorAll<HTMLElement>('td.gb-pl-ratio')) {
        const swatch = td.querySelector<HTMLElement>(':scope > .gb-pl-ratio-cell')!;
        const sample = swatch.firstElementChild as HTMLElement;
        expect({ bg: td.dataset.bg, swatch: swatch.style.background, sample: sample.className, color: sample.style.color })
          .toEqual({ bg: td.dataset.bg, swatch: rgb(td.dataset.bg!), sample: 'gb-pl-sample', color: rgb(hex) });
        expect(sample.getAttribute('aria-hidden')).toBe('true');
        expect([...sample.children].map(s => [s.className, s.textContent])).toEqual([['gb-pl-sample-normal', 'Aa'], ['gb-pl-sample-large', 'Aa']]);
        // The badge sits inside the same swatch, after the sample, so each pairs with its own column.
        expect(sample.nextElementSibling!.classList.contains('badge')).toBe(true);
        cells++;
      }
    }
    expect(cells).toBe(20);
    expect(root.querySelector('.gb-s2 .gb-pl-intro')!.textContent).toContain('Each cell shows "Aa" in the color on that background');
  });

  it('{#adjusted-line} names the automatic adjustments in one line after the legend', () => {
    const root = lab.render(ctx());
    const legend = root.querySelector('.gb-s2 .gb-pl-legend')!;
    expect(legend.nextElementSibling?.textContent).toContain('lifted to at least 4.5:1');
  });

  it('{#explained} says what the numbers are before the table, and each cell and heading says what it measured', () => {
    const root = lab.render(ctx());
    const body = root.querySelector('.gb-s2 .gb-step-body')!;
    const intro = body.querySelector('.gb-pl-intro')!;
    expect(intro.textContent).toContain('contrast ratio');
    expect(intro.textContent).toContain('higher is easier to read');
    expect(follows(intro, body.querySelector('table.gb-pl-contrast')!)).toBe(true);
    // A cell's title leads with what its ratio means, then the pair and the ratio; the first
    // column is the near-black background. The weakest cell's extra note is checked in {#weakest-one}.
    const cell = [...body.querySelectorAll<HTMLElement>('tr td.gb-pl-ratio:nth-child(2)')].find(c => !c.classList.contains('gb-pl-weakest'))!;
    expect(cell.title).toMatch(/^(Easy to read at any size|Readable as normal text|Fine for icons[^.]*|Hard to read; avoid it for text)\. #[0-9a-f]{6} on Near black \(#121212\): \d+\.\d:1\.$/);
    const VERDICTS: Record<string, string> = { aaa: 'Easy to read at any size', aa: 'Readable as normal text', large: 'Fine for icons, borders and large text; too faint for normal text', fail: 'Hard to read; avoid it for text' };
    const ratio = Number(cell.dataset.ratio);
    expect(cell.title.startsWith(`${VERDICTS[GB.contrastGrade(ratio)[0]]}. `)).toBe(true);
    expect(cell.title.endsWith(`: ${ratio.toFixed(1)}:1.`)).toBe(true);
    expect(body.querySelector<HTMLElement>('thead th:nth-child(2)')!.title).toContain('near-black background');
  });

  it('copies a color\'s hex when its swatch chip is clicked', () => {
    const c = ctx();
    const root = lab.render(c);
    const chip = rows(root)[1].querySelector<HTMLButtonElement>('.gb-pl-swatch')!;
    chip.click();
    expect(c.copy).toHaveBeenCalledWith(rows(root)[1].querySelector('.gb-pl-hex')!.textContent);
  });
});

describe('Palette Lab Edit dock', () => {
  afterEach(() => { renderAt(880); document.body.replaceChildren(); });
  const TRIAD = GB.harmony('triad', { hue: 210, lightness: 0.75, chroma: 0.13 }).map((d: { hex: string }) => d.hex);
  const dockOf = (root: HTMLElement) => root.querySelector<HTMLElement>('.gb-dock');
  const keyRows = (root: HTMLElement) => [...root.querySelectorAll<HTMLElement>('.gb-dock .gb-pl-key')];
  const expanded = (root: HTMLElement) =>
    keyRows(root).filter(r => r.querySelector('.gb-pl-key-head')!.getAttribute('aria-expanded') === 'true').map(r => r.dataset.key);
  it('{#one-strip} a pick opens the dock with only the first key row expanded, and clicking the third row moves the one strip there', () => {
    const c = ctx();
    expect(dockOf(renderWith(c, 1400))).toBeNull();
    const root = pickIn(c, CHAT_INPUT, 1400);
    expect(dockOf(root)).not.toBeNull();
    // Wide, the dock is step 4 in the stage, under the Preview card.
    expect(follows(root.querySelector('.gb-stage .gb-away')!, root.querySelector('.gb-stage .gb-s4 .gb-dock')!)).toBe(true);
    const rows = keyRows(root);
    expect(rows.length).toBeGreaterThanOrEqual(3);
    expect(expanded(root)).toEqual([rows[0].dataset.key]);
    rows[2].querySelector<HTMLButtonElement>('.gb-pl-key-head')!.click();
    const third = keyRows(root)[2].dataset.key;
    expect(expanded(root)).toEqual([third]);
    expect(keyRows(root).filter(r => !r.querySelector('.gb-pl-key-strip')!.hasAttribute('hidden')).map(r => r.dataset.key)).toEqual([third]);
  });

  it('{#role-edit} changing the role input of a picked key in an opaque role sets every key of that role in the preview', () => {
    const c = ctx();
    renderWith(c, 1400);
    const chrome = { index: 0, surfaces: 'neutral', frame: { index: 0, style: 'filled' } };
    const colors = TB.buildColors({ colors: TRIAD }, chrome);
    const sw = TB.swatches({ colors: TRIAD }, chrome);
    const opaque = (role: string) => TB.KEY_GROUPS[role].every((k: string) => colors[k] === sw[role]);
    const firstKey = (el: Element) => (el.getAttribute('data-keys') || '').split(' ').filter(Boolean)[0];
    const isOpaquePart = (p: HTMLElement) => {
      const role = TB.SWATCH_OF[firstKey(p)];
      return role && TB.KEY_GROUPS[role].length > 1 && opaque(role);
    };
    const part = [...previewOf(c).querySelectorAll<HTMLElement>('.gb-pl-chrome [data-keys]')].find(isOpaquePart)!;
    expect(part).toBeDefined();
    const key = firstKey(part);
    const role = TB.SWATCH_OF[key];
    const root = pickIn(c, page => [...page.querySelectorAll<HTMLElement>('.gb-pl-chrome [data-keys]')].find(isOpaquePart)!, 1400);
    root.querySelector<HTMLButtonElement>(`.gb-dock .gb-pl-key[data-key="${key}"] .gb-ke-seg[data-scope="role"]`)!.click();
    pickColor(root.querySelector<HTMLElement>(`.gb-dock .gb-pl-key[data-key="${key}"] .gb-ke-pick`)!, '#336699');
    const keys: string[] = TB.KEY_GROUPS[role];
    expect(keys.map(k => [k, drawnIn(c, k)])).toEqual(keys.map(k => [k, '#336699']));
  });

  it('{#roles-button} the step 5 line\'s Roles button focuses the first chip of step 4, at both widths', () => {
    for (const width of [1400, 880]) {
      const root = renderAt(width);
      document.body.replaceChildren(root);
      const button = root.querySelector<HTMLButtonElement>('.gb-s4-line .gb-roles-go')!;
      expect(button.textContent).toBe('Roles');
      button.click();
      expect({ width, focused: document.activeElement }).toEqual({ width, focused: root.querySelector('.gb-roles .gb-role-chip') });
      expect(dockOf(root)).toBeNull();
    }
  });

  it('{#no-pick-line} the dock reopened with no pick shows its heading and the line pointing to the preview and Roles', () => {
    const c = ctx();
    lab.render(c);
    const root = pickIn(c, CHAT_INPUT, 1400);
    const row = keyRows(root)[0];
    row.querySelector<HTMLButtonElement>('.gb-ke-seg[data-scope="key"]')!.click();
    pickColor(row.querySelector<HTMLElement>('.gb-ke-pick')!, '#123456');
    root.querySelector<HTMLButtonElement>('.gb-dock-close')!.click();
    dockOf(root)!.querySelector<HTMLButtonElement>('.gb-dock-reopen')!.click();
    const dock = dockOf(root)!;
    expect(dock.hasAttribute('data-min')).toBe(false);
    expect(dock.querySelector('.gb-dock-h')!.textContent).toMatch(/^5\s*Edit$/);
    expect(dock.querySelector('.gb-dock-body')!.textContent).toBe('Pick a part in the preview window, or open a role in Roles.');
  });

  it('{#esc-focus} Esc in the open dock closes it and moves focus to the step 5 line\'s Roles button', () => {
    const c = ctx();
    lab.render(c);
    const root = pickIn(c, CHAT_INPUT, 1400);
    document.body.replaceChildren(root);
    const head = keyRows(root)[0].querySelector<HTMLButtonElement>('.gb-pl-key-head')!;
    head.focus();
    head.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(dockOf(root)).toBeNull();
    expect(root.querySelector<HTMLElement>('.gb-s4-line')!.hidden).toBe(false);
    expect(document.activeElement).toBe(root.querySelector('.gb-s4-line .gb-roles-go'));
    // The close button does the same.
    const again = pickIn(c, CHAT_INPUT, 1400);
    document.body.replaceChildren(again);
    again.querySelector<HTMLButtonElement>('.gb-dock-close')!.click();
    expect(dockOf(again)).toBeNull();
    expect(document.activeElement).toBe(again.querySelector('.gb-s4-line .gb-roles-go'));
  });

  it('with edits, closing leaves the dock as its one-line heading, and the Edits list has one line per edit with Reset', () => {
    const c = ctx();
    lab.render(c);
    const root = pickIn(c, CHAT_INPUT, 1400);
    document.body.replaceChildren(root);
    const row = keyRows(root)[0];
    row.querySelector<HTMLButtonElement>('.gb-ke-seg[data-scope="key"]')!.click();
    pickColor(row.querySelector<HTMLElement>('.gb-ke-pick')!, '#123456');
    buttonFor(root, 'Edits (1)').click();
    expect(root.querySelectorAll('.gb-dock-edits li')).toHaveLength(1);
    expect(root.querySelector('.gb-dock-edits li button')!.textContent).toBe('Reset');
    root.querySelector<HTMLButtonElement>('.gb-dock-close')!.click();
    expect(dockOf(root)!.hasAttribute('data-min')).toBe(true);
    expect(dockOf(root)!.querySelector('.gb-dock-body')).toBeNull();
  });

  it('labels the dock as a region by its heading, which names the part', () => {
    const c = ctx();
    lab.render(c);
    const root = pickIn(c, CHAT_INPUT, 1400);
    const dock = dockOf(root)!;
    const head = root.querySelector(`#${dock.getAttribute('aria-labelledby')}`)!;
    expect(dock.getAttribute('role')).toBe('region');
    expect(head.textContent).toMatch(/^5\s*Edit/);
  });
});

describe('Palette Lab step 4 Roles', () => {
  afterEach(() => { renderAt(880); });
  const FAMILIES = ['Syntax', 'Accent', 'Surfaces', 'Text', 'Status', 'Terminal', 'Frame'];
  const rolesOf = (root: HTMLElement) => root.querySelector<HTMLElement>('.gb-roles')!;
  const familyRows = (root: HTMLElement) => [...rolesOf(root).querySelectorAll<HTMLElement>('.gb-rf')];
  const chipOf = (root: HTMLElement, sw: string) => rolesOf(root).querySelector<HTMLButtonElement>(`.gb-role-chip[data-swatch="${sw}"]`)!;
  /** Clicks Show on every folded family, each click redrawing the Lab. */
  function showAll(root: HTMLElement) {
    for (let row = rolesOf(root).querySelector('.gb-rf[data-folded]'); row; row = rolesOf(root).querySelector('.gb-rf[data-folded]')) {
      row.querySelector<HTMLButtonElement>('.gb-rf-toggle')!.click();
    }
  }

  it('{#roles-rows} step 4 is headed Roles and holds the seven families in order, the first four open and the last three folded, with 84 role chips once each is shown', () => {
    const root = lab.render(ctx());
    const head = rolesOf(root).querySelector(':scope > .gb-step-h')!;
    expect([head.querySelector('.gb-step-n')!.textContent, head.querySelector('.gb-step-t')!.textContent]).toEqual(['4', 'Roles']);
    const rows = familyRows(root);
    expect(rows.map(r => r.querySelector('.gb-rf-name')!.textContent)).toEqual(FAMILIES);
    expect(rows.map(r => r.hasAttribute('data-folded'))).toEqual([false, false, false, false, true, true, true]);
    // A folded family is its strip of colors and a Show button, with no chips.
    for (const row of rows.slice(4)) {
      expect(row.querySelector('.gb-role-chip')).toBeNull();
      expect(row.querySelectorAll('.gb-rf-strip-c').length).toBeGreaterThan(0);
      expect(row.querySelector('.gb-rf-toggle')!.textContent).toBe('Show');
    }
    showAll(root);
    expect(familyRows(root).some(r => r.hasAttribute('data-folded'))).toBe(false);
    const chips = [...rolesOf(root).querySelectorAll<HTMLElement>('.gb-role-chip')];
    expect(chips).toHaveLength(84);
    expect(chips.map(ch => ch.dataset.swatch).sort()).toEqual(Object.keys(TB.SWATCHES).sort());
    expect(chips.every(ch => ch.tagName === 'BUTTON')).toBe(true);
  });

  it('{#step-headings} reads the step headings 1 to 6 as Start, Palette, Frame and Editor, Roles, Edit, Try and save', () => {
    for (const width of [1400, 880]) {
      const root = renderAt(width);
      const heads = [...root.querySelectorAll<HTMLElement>('.gb-step-h')]
        .map(hd => [hd.querySelector('.gb-step-n')!.textContent, hd.querySelector('.gb-step-t')!.textContent])
        .sort((a, b) => Number(a[0]) - Number(b[0]));
      expect({ width, heads }).toEqual({
        width,
        heads: [['1', 'Start'], ['2', 'Palette'], ['3', 'Frame and Editor'], ['4', 'Roles'], ['5', 'Edit'], ['6', 'Try and save']],
      });
    }
  });

  it('{#chip-editor} the Raised surface chip opens an editor that records a role edit, Reset removes it, and Escape closes it with focus on the chip', () => {
    const c: any = ctx();
    const root = lab.render(c);
    document.body.replaceChildren(root);
    chipOf(root, 'raised').click();
    expect(chipOf(root, 'raised').getAttribute('aria-expanded')).toBe('true');
    const editor = rolesOf(root).querySelector<HTMLElement>('.gb-role-ed')!;
    expect(editor.dataset.swatch).toBe('raised');
    expect(editor.textContent).toContain(`Used by ${TB.KEY_GROUPS.raised.length} keys`);
    expect(document.activeElement).toBe(editor.querySelector('.gb-cp-trigger'));
    pickColor(editor.querySelector<HTMLElement>('.gb-cp-trigger')!, '#333333');
    expect(c.ui.edits.swatches.raised).toBe('#333333');
    buttonFor(rolesOf(root), 'Reset').click();
    expect(c.ui.edits.swatches.raised).toBeUndefined();
    const open = rolesOf(root).querySelector<HTMLElement>('.gb-role-ed')!;
    open.querySelector<HTMLElement>('.gb-cp-trigger')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(rolesOf(root).querySelector('.gb-role-ed')).toBeNull();
    expect(document.activeElement).toBe(chipOf(root, 'raised'));
    expect(chipOf(root, 'raised').getAttribute('aria-expanded')).toBe('false');
  });

  it('{#settings-ui} Keywords color 3, Depth 1.5 and Text High set the state, and the Keywords chip shows the builder\'s kw for that state', () => {
    const c: any = ctx();
    const root = lab.render(c);
    const keywords = rolesOf(root).querySelector<HTMLSelectElement>('.gb-rf-syntax[data-swatch="kw"]')!;
    expect([...keywords.options].map(o => o.textContent)).toEqual(['1', '2', '3', '4', '5']);
    keywords.value = '2';
    keywords.dispatchEvent(new Event('change'));
    const depth = rolesOf(root).querySelector<HTMLInputElement>('.gb-rf-depth')!;
    expect([depth.min, depth.max, depth.step]).toEqual(['0.5', '2', '0.1']);
    depth.value = '1.5';
    depth.dispatchEvent(new Event('change'));
    buttonFor(rolesOf(root).querySelector('.gb-rf[data-family="text"]')!, 'High').click();
    expect([c.ui.syntax[0], c.ui.depth, c.ui.text]).toEqual([2, 1.5, 'high']);
    const s = c.ui;
    const entry = { colors: GB.harmony(s.rule, { hue: Math.round(s.hue), lightness: Number(Number(s.lightness).toFixed(2)), chroma: Number(Number(s.chroma).toFixed(3)) }).map((d: any) => d.hex) };
    const chrome = { index: s.chromeIndex, surfaces: s.surfaces, frame: s.frame, syntax: s.syntax, depth: s.depth, text: s.text };
    const kw = TB.swatches(entry, chrome, s.edits).kw;
    expect(chipOf(root, 'kw').querySelector<HTMLElement>('.gb-role-dot')!.dataset.color).toBe(kw);
    // The Depth slider names its multiplier, and the selected Text level is pressed.
    expect(rolesOf(root).querySelector('.gb-rf-depth')!.getAttribute('aria-valuetext')).toBe('1.5 times the standard');
    expect(rolesOf(root).querySelector('.gb-rf[data-family="text"] [aria-pressed="true"]')!.textContent).toBe('High');
  });

  it('{#code-label} the Keywords chip shows code and the Accent chip its key count', () => {
    const root = lab.render(ctx());
    expect(chipOf(root, 'kw').querySelector('.gb-role-n')!.textContent).toBe('code');
    expect(chipOf(root, 'accent').querySelector('.gb-role-n')!.textContent).toBe(String(TB.KEY_GROUPS.accent.length));
    expect(chipOf(root, 'kw').getAttribute('aria-label')).toContain('Keywords');
    // Keywords has no key to show in the preview.
    chipOf(root, 'kw').click();
    expect(buttonFor(rolesOf(root), 'Show where')).toBeUndefined();
    chipOf(root, 'accent').click();
    expect(buttonFor(rolesOf(root), 'Show where')).toBeDefined();
  });

  it('{#roles-placement} with the stage built, Roles sits in the stage before Edit, and after a pick shows only its heading line', () => {
    const c: any = ctx();
    const root = renderWith(c, 1400);
    const stage = root.querySelector<HTMLElement>('.gb-stage')!;
    const kids = [...stage.children].map(el => el.className);
    expect(kids.indexOf('gb-step gb-roles')).toBeGreaterThan(-1);
    expect(kids.indexOf('gb-step gb-roles')).toBeLessThan(kids.indexOf('gb-step gb-s4'));
    expect(stage.querySelector<HTMLElement>('.gb-roles > .gb-step-body')!.hidden).toBe(false);
    const picked = pickIn(c, CHAT_INPUT, 1400);
    const roles = picked.querySelector<HTMLElement>('.gb-stage > .gb-roles')!;
    expect(roles.querySelector<HTMLElement>(':scope > .gb-step-body')!.hidden).toBe(true);
    expect(roles.querySelector(':scope > .gb-step-h button.gb-step-btn')).not.toBeNull();
    // Show where on a role picks its first key, which opens the dock and folds Roles too.
    const fresh = ctx();
    const again = renderWith(fresh, 1400);
    document.body.replaceChildren(again);
    chipOf(again, 'raised').click();
    buttonFor(rolesOf(again), 'Show where').click();
    expect(again.querySelector(`.gb-dock .gb-pl-key[data-key="${TB.KEY_GROUPS.raised[0]}"]`)).not.toBeNull();
    expect(again.querySelector<HTMLElement>('.gb-stage > .gb-roles > .gb-step-body')!.hidden).toBe(true);
  });
});

describe('Palette Lab step 5 bar', () => {
  const TEN = ['#ff8800', '#336699', '#cc0000', '#00aa55', '#aa00ff', '#ffee00', '#0088ff', '#ff0088', '#88ff00', '#00ffee'];
  const result = (root: HTMLElement) => root.querySelector<HTMLElement>('.gb-bar [role="status"]')!;
  const setName = (root: HTMLElement, value: string) => {
    const name = root.querySelector<HTMLInputElement>('.gb-bar .gb-pl-name')!;
    name.value = value;
    name.dispatchEvent(new Event('input'));
  };
  const setHue = (root: HTMLElement, value: string) => {
    const hue = root.querySelector<HTMLInputElement>('.gb-pl-hue')!;
    hue.value = value;
    hue.dispatchEvent(new Event('input'));
  };

  it('{#bar-line} shows the palette as chips and the same lowest ratio as step 2\'s heading, in a polite live region', () => {
    const root = lab.render(ctx());
    const line = root.querySelector<HTMLElement>('.gb-bar .gb-bar2')!;
    const ratioOf = (text: string | null) => /[Ww]eakest contrast (\d+\.\d):1/.exec(text || '')?.[1];
    expect(line.querySelectorAll('.gb-bar-chip')).toHaveLength(5);
    expect(ratioOf(line.querySelector('.gb-bar-low')!.textContent)).toBe(ratioOf(root.querySelector('.gb-s2 .gb-step-state')!.textContent));
    expect(ratioOf(line.querySelector('.gb-bar-low')!.textContent)).toBeDefined();
    expect(result(root).getAttribute('aria-live')).toBe('polite');
    const ten = lab.render(ctx({ ui: { mode: 'pasted', pasted: TEN } }));
    expect(ten.querySelectorAll('.gb-bar .gb-bar2 .gb-bar-chip')).toHaveLength(10);
    expect(ratioOf(ten.querySelector('.gb-bar .gb-bar-low')!.textContent)).toBe(ratioOf(ten.querySelector('.gb-s2 .gb-step-state')!.textContent));
  });

  it('{#bar-summary} is headed Try and save, gives each color its weakest grade, and says which colors are hard to read', () => {
    const root = lab.render(ctx());
    const head = root.querySelector('.gb-bar > .gb-step-h')!;
    expect(head.querySelector('.gb-step-t')!.textContent).toBe('Try and save');
    expect(head.contains(result(root))).toBe(true);
    expect(root.querySelector('.gb-bar .gb-bar-read')!.textContent).toMatch(/^All 5 colors read well as normal text on every background\. Weakest contrast \d+\.\d:1\.$/);
    const three = lab.render(ctx({ ui: { mode: 'pasted', pasted: ['#333333', '#ffffff', '#eeeeee'] } }));
    const pills = [...three.querySelectorAll<HTMLElement>('.gb-bar .gb-bar-pill')];
    expect(pills.map(p => p.querySelector('.badge')!.textContent)).toEqual(['Fail', 'AAA', 'AAA']);
    expect(pills[0].title).toMatch(/^Hard to read; avoid it for text\. #333333 at its weakest, on /);
    expect(three.querySelector('.gb-bar .gb-bar-read')!.textContent)
      .toMatch(/^2 of 3 colors read well as normal text on every background\. #333333 is hard to read on some backgrounds\. /);
  });

  it('{#stale-try} says Tried in VS Code after Try, and Changed since your last Try once Hue changes', () => {
    const root = lab.render(ctx());
    buttonFor(root, 'Try in VS Code').click();
    expect(result(root).textContent).toBe('Tried in VS Code');
    setHue(root, '120');
    expect(result(root).textContent).toBe('Changed since your last Try');
  });

  it('{#overwrites} warns "Overwrites \'Ocean\'" when Name, trimmed and lower-cased, is a saved theme\'s name', () => {
    const library = [{ id: 'o', name: 'Ocean', slot: 1, design: { colors: ['#112233'] }, groups: [], savedAt: '' }];
    const root = lab.render(ctx({ library }));
    expect(result(root).textContent).not.toContain('Overwrites');
    setName(root, 'ocean ');
    expect(result(root).textContent).toBe("Overwrites 'Ocean'");
    expect(result(root).classList.contains('gb-bar-overwrites')).toBe(true);
    setName(root, 'Oceans');
    expect(result(root).textContent).not.toContain('Overwrites');
  });

  it('{#save-empty} disables Save theme while Name is empty, with the reason in its title', () => {
    const root = lab.render(ctx());
    for (const empty of ['', '   ']) {
      setName(root, empty);
      const save = buttonFor(root, 'Save theme');
      expect({ empty, disabled: save.disabled, titled: save.title.trim() !== '' }).toEqual({ empty, disabled: true, titled: true });
    }
    setName(root, 'Mine');
    expect(buttonFor(root, 'Save theme').disabled).toBe(false);
  });
});

describe('Palette Lab narrow folding', () => {
  afterEach(() => { renderAt(880); });
  const body = (root: HTMLElement, n: number) => root.querySelector<HTMLElement>(`.gb-s${n} > .gb-step-body`)!;
  const head = (root: HTMLElement, n: number) => root.querySelector<HTMLElement>(`.gb-s${n} > .gb-step-h`)!;
  const keyRows = (root: HTMLElement) => [...root.querySelectorAll<HTMLElement>('.gb-dock .gb-pl-key')];
  const expanded = (root: HTMLElement) =>
    keyRows(root).filter(r => r.querySelector('.gb-pl-key-head')!.getAttribute('aria-expanded') === 'true').map(r => r.dataset.key);

  it('{#fold-on-pick} at 880 px a pick hides the bodies of steps 1 to 3 and leaves their headings, each a collapsed button', () => {
    const c = ctx();
    const before = renderWith(c, 880);
    expect([1, 2, 3].map(n => body(before, n).hidden)).toEqual([false, false, false]);
    const root = pickIn(c, CHAT_INPUT, 880);
    expect([1, 2, 3].map(n => body(root, n).hidden)).toEqual([true, true, true]);
    for (const n of [1, 2, 3]) {
      expect(head(root, n).hidden).toBe(false);
      const button = head(root, n).querySelector('button.gb-step-btn')!;
      expect({ n, expanded: button.getAttribute('aria-expanded') }).toEqual({ n, expanded: 'false' });
    }
    expect(root.querySelector('.gb-s1 .gb-step-state')!.textContent).toBe('Wheel, Triad 210°');
  });

  it('{#reopen-keeps-place} at 880 px, opening step 2 shrinks the dock to one line naming the part, and reopening it keeps the third key row expanded', () => {
    const c = ctx();
    renderWith(c, 880);
    const root = pickIn(c, CHAT_INPUT, 880);
    keyRows(root)[2].querySelector<HTMLButtonElement>('.gb-pl-key-head')!.click();
    const third = keyRows(root)[2].dataset.key;
    head(root, 2).querySelector<HTMLButtonElement>('button.gb-step-btn')!.click();
    expect(body(root, 2).hidden).toBe(false);
    expect([body(root, 1).hidden, body(root, 3).hidden]).toEqual([true, true]);
    const dock = root.querySelector<HTMLElement>('.gb-dock')!;
    expect(dock.hasAttribute('data-min')).toBe(true);
    expect(dock.querySelector('.gb-pl-key')).toBeNull();
    expect(dock.textContent).toContain('in the chat view');
    dock.querySelector<HTMLButtonElement>('.gb-dock-reopen')!.click();
    expect(root.querySelector('.gb-dock')!.hasAttribute('data-min')).toBe(false);
    expect(expanded(root)).toEqual([third]);
    expect(body(root, 2).hidden).toBe(true);
  });

  it('{#frame-row-moves} at 880 px a pick in the status bar moves the Frame row into the dock\'s first row, and step 3 keeps no Frame row', () => {
    const c = ctx();
    renderWith(c, 880);
    const root = pickIn(c, '.gb-pl-chrome [data-region="statusBar"]', 880);
    const first = root.querySelector('.gb-dock .gb-dock-body')!.firstElementChild!;
    expect(first.classList.contains('gb-dock-lead')).toBe(true);
    expect(first.querySelector('.gb-dock-lead-row > .gb-fr-box')).not.toBeNull();
    expect(first.querySelectorAll('.gb-fr-pick').length).toBeGreaterThan(0);
    expect(root.querySelectorAll('.gb-fr-box')).toHaveLength(1);
    expect(root.querySelector('.gb-s3 .gb-fr-box')).toBeNull();
    expect(root.querySelector('.gb-s3 .gb-step-state')!.textContent).toBe('Frame 1 Filled · Accent 1 Neutral');
    // A pick in the editor tabs moves the Editor row instead.
    const other = ctx();
    renderWith(other, 880);
    const tabs = pickIn(other, '.gb-pl-chrome [data-region="tabs"] .gb-tab', 880);
    expect(tabs.querySelector('.gb-dock .gb-dock-body > .gb-dock-lead:first-child .gb-ed-box')).not.toBeNull();
    expect(tabs.querySelector('.gb-s3 .gb-fr-box')).not.toBeNull();
  });

  it('{#wide-no-fold} at 1400 px a pick leaves steps 1 to 3 with their bodies shown and the Frame row in step 3', () => {
    const c = ctx();
    renderWith(c, 1400);
    const root = pickIn(c, '.gb-pl-chrome [data-region="statusBar"]', 1400);
    expect(root.querySelector('.gb-dock')).not.toBeNull();
    expect([1, 2, 3].map(n => body(root, n).hidden)).toEqual([false, false, false]);
    expect(root.querySelector('.gb-s3 .gb-fr-box')).not.toBeNull();
    // Only step 4 (Roles, in the stage) folds to a heading button while the dock is open.
    expect(root.querySelector('.gb-tasks .gb-step-btn')).toBeNull();
  });

  it('{#roles-fold-narrow} at 880 px a pick folds step 4 (Roles) to its heading with steps 1 to 3, and its heading opens it', () => {
    const c = ctx();
    renderWith(c, 880);
    const root = pickIn(c, CHAT_INPUT, 880);
    document.body.replaceChildren(root);
    const roles = root.querySelector<HTMLElement>('.gb-tasks > .gb-roles')!;
    expect(roles.querySelector<HTMLElement>(':scope > .gb-step-body')!.hidden).toBe(true);
    roles.querySelector<HTMLButtonElement>(':scope > .gb-step-h button.gb-step-btn')!.click();
    const again = root.querySelector<HTMLElement>('.gb-tasks > .gb-roles')!;
    expect(again.querySelector<HTMLElement>(':scope > .gb-step-body')!.hidden).toBe(false);
    expect(root.querySelector('.gb-dock')!.hasAttribute('data-min')).toBe(true);
    expect(document.activeElement).toBe(again.querySelector('.gb-step-btn'));
  });
});

describe('Theme Preview drawing fit', () => {
  /** Reports the preview's Workbench frame `width` px wide, its drawing `natural` px wide, and returns the zoom set. */
  function zoomAt(width: number, natural: number) {
    const page = previewOf(ctx());
    const frame = page.querySelector<HTMLElement>('.gb-pl-chrome .gb-pl-fit')!;
    const inner = frame.firstElementChild as HTMLElement;
    Object.defineProperty(frame, 'clientWidth', { configurable: true, get: () => width });
    Object.defineProperty(inner, 'scrollWidth', { configurable: true, get: () => natural });
    FakeResizeObserver.report(frame, width);
    return Number(inner.style.zoom || 1);
  }

  it('{#zoom-width} zooms the drawing to its frame\'s width over its natural width, never above 1', () => {
    expect(zoomAt(870, 1130)).toBeCloseTo(0.77, 2);
    expect(Math.abs(zoomAt(870, 1130) - 0.77)).toBeLessThanOrEqual(0.01);
    expect(zoomAt(1400, 1130)).toBe(1);
    expect(zoomAt(1400, 1400)).toBe(1);
  });
});

describe('Palette Lab steps and label column', () => {
  it('opens each of steps 1, 2 and 3 with a numbered heading, and no step is a bordered box', () => {
    const root = lab.render(ctx());
    const steps: Array<[string, string, string]> = [['.gb-s1', '1', 'Start'], ['.gb-s2', '2', 'Palette'], ['.gb-s3', '3', 'Frame and Editor']];
    for (const [selector, n, title] of steps) {
      const el = root.querySelector<HTMLElement>(selector)!;
      const head = el.firstElementChild!;
      expect({ selector, tag: head.tagName, n: head.querySelector('.gb-step-n')?.textContent, title: head.querySelector('.gb-step-t')?.textContent })
        .toEqual({ selector, tag: 'H3', n, title });
      expect(el.classList.contains('gb-box')).toBe(false);
    }
    expect(root.querySelector('.gb-tasks .gb-box:not(.gb-sg)')).toBeNull();
  });

  it('labels the Frame and Editor rows, with what each colors in the label\'s title', () => {
    const root = lab.render(ctx());
    const label = (sel: string) => root.querySelector<HTMLElement>(`.gb-s3 ${sel} .gb-fe-l`)!;
    expect([label('.gb-fr-box').textContent, label('.gb-ed-box').textContent]).toEqual(['Frame', 'Editor']);
    expect(label('.gb-fr-box').title).toBe('Title bar, activity bar, status bar and window border.');
    expect(label('.gb-ed-box').title).toBe('Everything else: editor, side bar, tabs, panel, inputs and widgets.');
  });

  it('draws the Frame row with no folder-color button and no region checkboxes', () => {
    const root = lab.render(ctx());
    const frame = root.querySelector<HTMLElement>('.gb-fr-box')!;
    // The custom frame color's picker trigger is the one button besides the color choices.
    expect(frame.querySelectorAll('button:not([role="radio"]):not(.gb-cp-trigger)')).toHaveLength(0);
    expect(frame.querySelectorAll('.gb-cp-trigger.gb-fr-custom')).toHaveLength(1);
    expect(frame.contains(buttonFor(root, 'Try in VS Code'))).toBe(false);
    expect(root.querySelectorAll('input[type="checkbox"][data-region]')).toHaveLength(0);
  });
});

describe('Palette Lab Preview card', () => {
  afterEach(() => { renderAt(880); });
  const card = (root: HTMLElement) => root.querySelector<HTMLElement>('.gb-step.gb-away')!;
  const familyTotal = () => (window as any).GBGallery.cards.filter((x: any) => x.id !== 'workbench').length;

  it('says whether the preview window is open, and Open Preview asks the host to open it or bring it forward', () => {
    const closed = ctx();
    const away = card(lab.render(closed));
    expect([away.getAttribute('role'), away.getAttribute('aria-label')]).toEqual(['group', 'Preview']);
    expect(away.querySelector('.gb-away-text')!.textContent).toMatch(/^The preview window is closed\. /);
    const open = away.querySelector<HTMLButtonElement>('.gb-away-open')!;
    expect(open.textContent).toBe('Open Preview');
    open.click();
    expect(closed.post.mock.calls.map(call => call[0])).toEqual([{ type: 'openPreviewWindow' }]);

    const detached = ctx({ detached: true });
    const floating = card(lab.render(detached));
    expect(floating.querySelector('.gb-away-text')!.textContent).toMatch(/^The preview is open in its own window\. /);
    floating.querySelector<HTMLButtonElement>('.gb-away-open')!.click();
    expect(detached.post.mock.calls.map(call => call[0])).toEqual([{ type: 'openPreviewWindow' }]);
    expect(buttonFor(floating, 'Show it here')).toBeUndefined();
  });

  it('{#no-family-picker} holds no widget family picker, and the preview window draws every family', () => {
    const c: any = ctx({ ui: { widgets: ['chat', 'lists'] } });
    const root = lab.render(c);
    expect(card(root).querySelector('details, input[type="checkbox"]')).toBeNull();
    expect(card(root).textContent).not.toContain('Widgets in the preview');
    // A state saved while the picker existed drops its choice.
    expect('widgets' in c.ui).toBe(false);
    const drawn = [...previewOf(c).querySelectorAll<HTMLElement>('.gb-pl-widget[data-card]')].map(el => el.dataset.card);
    expect(drawn).toHaveLength(familyTotal());
  });
});

describe('Palette Lab renderPreview, the Theme Preview window\'s page', () => {
  const total = () => (window as any).GBGallery.cards.filter((x: any) => x.id !== 'workbench').length;
  const sections = (page: HTMLElement) => [...page.querySelectorAll<HTMLElement>(':scope > section.gb-tp-section')];
  const cardsOf = (page: HTMLElement) => [...page.querySelectorAll<HTMLElement>('.gb-pl-widgets-wrap .gb-pl-widget[data-card]')].map(el => el.dataset.card);

  it('draws a hint, then a Workbench section and a Widgets section in that order, with no tablist and no restore button', () => {
    const page = previewOf(ctx());
    expect(page.className).toBe('gb-tp');
    expect(page.firstElementChild!.classList.contains('gb-tp-hint')).toBe(true);
    const [workbench, widgets] = sections(page);
    expect(sections(page).map(s => s.querySelector('.gb-tp-h')!.textContent)).toEqual(['Workbench', 'Widgets']);
    expect(follows(page.firstElementChild!, workbench)).toBe(true);
    expect(workbench.querySelector('.gb-tp-body .gb-pl-chrome .gb-pl-scope')).not.toBeNull();
    expect(workbench.querySelector('.gb-tp-body .gb-ch-readout')).not.toBeNull();
    expect(widgets.querySelector('.gb-tp-body .gb-pl-widgets-wrap')).not.toBeNull();
    expect(page.querySelector('[role="tablist"], .gb-tabrow, .gb-tp-restore')).toBeNull();
    expect(buttonFor(page, 'Show in the Theme Lab')).toBeUndefined();
  });

  it('{#all-families} draws a card for every widget family in the gallery\'s order, whatever an older state chose, and says so in the aside', () => {
    const aside = (page: HTMLElement) => sections(page)[1].querySelector('.gb-tp-aside')!.textContent;
    const order = (window as any).GBGallery.cards.map((x: any) => x.id).filter((id: string) => id !== 'workbench');
    expect(order).toHaveLength(total());
    expect(order.slice(0, 3)).toEqual(['chat', 'buttons', 'inputs']);
    const fresh = previewOf({ ui: {} });
    expect(cardsOf(fresh)).toEqual(order);
    expect(aside(fresh)).toBe(`All ${total()} widget families, most important first`);
    const older = previewOf({ ui: { widgets: ['chat', 'lists'] } });
    expect(cardsOf(older)).toEqual(order);
  });

  it('posts a clicked part as pickPart and marks it, without needing a restore', () => {
    const post = jest.fn();
    const c = ctx();
    lab.render(c);
    const page = previewOf(c, post);
    page.querySelector<HTMLElement>(CHAT_INPUT)!.click();
    const picks = post.mock.calls.map(call => call[0]).filter(m => m.type === 'pickPart');
    expect(picks).toHaveLength(1);
    expect(picks[0].part).toMatchObject({ card: 'workbench', region: 'chat' });
    expect(page.querySelector(CHAT_INPUT)!.classList.contains('gb-pl-picked')).toBe(true);
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

  it('says in the Use buttons\' titles that Use everywhere applies the Editor colors and each project keeps its own frame', () => {
    const root = lab.render(ctx({ library: LIBRARY, hasFolder: true }));
    expect(root.querySelector('.gb-pl-library .gb-pl-lib-note')).toBeNull();
    expect(action(root, 'a', 'everywhere')!.title).toContain("Editor colors");
    expect(action(root, 'a', 'project')!.title).toContain('frame');
  });

  it('{#saved-row} shows a visible Load and a collapsed chevron; the chevron shows Use everywhere and Delete; Enter on the row loads it', () => {
    const c = ctx({ library: LIBRARY, hasFolder: true, ui: { startTab: 'saved' } });
    const root = lab.render(c);
    document.body.replaceChildren(root);
    const load = action(root, 'a', 'load')!;
    expect(load.textContent).toBe('Load');
    expect(load.closest('[hidden]')).toBeNull();
    const chevron = row(root, 'a').querySelector<HTMLButtonElement>('.gb-pl-lib-more')!;
    expect(chevron.getAttribute('aria-expanded')).toBe('false');
    const strip = () => row(root, 'a').querySelector<HTMLElement>('.gb-pl-lib-actions')!;
    expect(strip().hidden).toBe(true);
    chevron.click();
    expect(row(root, 'a').querySelector('.gb-pl-lib-more')!.getAttribute('aria-expanded')).toBe('true');
    expect(strip().hidden).toBe(false);
    expect([...strip().querySelectorAll('button')].map(b => b.textContent)).toEqual(['Use in this project', 'Use everywhere', 'Delete']);
    expect(drawnIn(c, 'titleBar.activeBackground')).not.toBe(SQUARE[0]);
    row(root, 'b').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(root.querySelector<HTMLInputElement>('.gb-pl-name')!.value).toBe('Beta');
    expect(drawnIn(c, 'titleBar.activeBackground')).toBe(SQUARE[0]);
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
    expect(drawnIn(c, 'titleBar.activeBackground')).toBe('#336699');
    expect(drawnIn(c, 'button.background')).toBe(expected['button.background']);
    expect(expected['button.background']).not.toBe(unedited['button.background']);
    expect(root.querySelector<HTMLInputElement>('.gb-pl-name')!.value).toBe('Custom');
  });

  it('a saved design read back through parseLibrary and loaded builds the same colors as before saving', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { parseLibrary } = require('../src/themeLibrary');
    const c = ctx({ ui: { rule: 'square', hue: 12, lightness: 0.6, chroma: 0.2, chromeIndex: 1, surfaces: 'tinted', frame: { color: '#336699', style: 'filled' }, edits: { swatches: { accent: '#ff8800' }, keys: { 'editor.background': '#101010' } } } });
    const root = lab.render(c);
    const before = scopeIn(c).style.cssText;
    buttonFor(root, 'Save theme').click();
    const msg = c.post.mock.calls.find(call => call[0].type === 'saveTheme')![0];
    const library = parseLibrary(JSON.parse(JSON.stringify([{ id: 'r', name: msg.name, slot: 1, design: msg.design, groups: [], savedAt: '2026-11-04T00:00:00.000Z' }])));
    expect(library).toHaveLength(1);

    const fresh = ctx({ library, hasFolder: true });
    const other = lab.render(fresh);
    expect(scopeIn(fresh).style.cssText).not.toBe(before);
    action(other, 'r', 'load')!.click();
    expect(scopeIn(fresh).style.cssText).toBe(before);
  });

  it('{#pasted-saved} loads a saved theme whose design mode is pasted, with its pasted colors, and Save posts it as pasted', () => {
    const PASTED = ['#cc0000', '#990000', '#336699', '#00aa55'];
    const pastedDesign = {
      mode: 'pasted', pasted: PASTED, colors: PASTED,
      chromeIndex: 1, surfaces: 'neutral', frame: { index: 1, style: 'filled' }, edits: { swatches: {}, keys: {} },
    };
    const library = [{ id: 'p', name: 'Pasted Four', slot: 3, design: pastedDesign, groups: [], savedAt: '2026-11-04T00:00:00.000Z' }];
    const c = ctx({ library, hasFolder: true, ui: { startTab: 'saved' } });
    const root = lab.render(c);
    action(root, 'p', 'load')!.click();
    const hexes = [...root.querySelectorAll('.gb-s2 table.gb-pl-contrast tbody tr .gb-pl-hex')].map(el => el.textContent);
    expect(hexes).toEqual(PASTED);
    expect(c.ui).toMatchObject({ mode: 'pasted', pasted: PASTED });
    buttonFor(root, 'Save theme').click();
    const msg = c.post.mock.calls.find(call => call[0].type === 'saveTheme')![0];
    expect(msg.name).toBe('Pasted Four');
    expect(msg.design).toMatchObject({ mode: 'pasted', pasted: PASTED, colors: PASTED });
  });

  it('{#default-design} saves a fresh design without the Roles step settings', () => {
    const c = ctx();
    const root = lab.render(c);
    buttonFor(root, 'Save theme').click();
    const design = c.post.mock.calls.find(call => call[0].type === 'saveTheme')![0].design;
    expect(['syntax', 'depth', 'text'].filter(k => k in design)).toEqual([]);
  });

  it('{#settings-carried} carries syntax, depth and text through Save, the library, Load and Try', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { parseLibrary } = require('../src/themeLibrary');
    const SETTINGS = { syntax: [2, 1, 0, 3, 4], depth: 1.5, text: 'high' };
    const first = ctx({ ui: { ...SETTINGS } });
    buttonFor(lab.render(first), 'Save theme').click();
    const saved = first.post.mock.calls.find(call => call[0].type === 'saveTheme')![0];
    expect(saved.design).toMatchObject(SETTINGS);
    // The host keeps the design in the library it sends back (src/themeLibrary.ts parseLibrary).
    const library = parseLibrary([{ id: 'r', name: saved.name, slot: 4, design: saved.design, groups: [], savedAt: '2026-11-06T00:00:00.000Z' }]);
    expect(library[0].design).toMatchObject(SETTINGS);
    const second = ctx({ library, ui: { startTab: 'saved' } });
    const root = lab.render(second);
    action(root, 'r', 'load')!.click();
    expect(second.ui).toMatchObject(SETTINGS);
    buttonFor(root, 'Try in VS Code').click();
    const tried = second.post.mock.calls.map(call => call[0]).find(m => m.type === 'applyPalette');
    expect(tried.chrome).toMatchObject(SETTINGS);
    expect(tried.settings).toMatchObject(SETTINGS);
  });
});

describe('Palette Lab style groups', () => {
  // The saved-theme tests above leave a loaded name in palette.js's module-level draft, which
  // a palette change keeps; restoring a Try on a throwaway state clears it.
  beforeEach(() => lab.restoreTry({}, { mode: 'generated', rule: 'triad', hue: 210, lightness: 0.75, chroma: 0.13, chromeIndex: 0, surfaces: 'neutral' }));
  const TRIAD =GB.harmony('triad', { hue: 210, lightness: 0.75, chroma: 0.13 }).map((d: { hex: string }) => d.hex);
  /** The default candidate's swatches: Triad 210, accent color 1, neutral surfaces, a Filled frame in color 1. */
  const SW = TB.swatches({ colors: TRIAD }, { index: 0, surfaces: 'neutral', frame: { index: 0, style: 'filled' } });
  /** The color the stage draws a key in: its card's scope redefines the --vscode-* variables. */
  const drawn = (root: HTMLElement, key: string) =>
    root.querySelector<HTMLElement>('.gb-stage .gb-pl-scope')!.style.getPropertyValue(GB.varFor(key));
  const box = (root: HTMLElement) => root.querySelector<HTMLElement>('.gb-sg')!;
  const choose = (select: HTMLSelectElement, value: string) => {
    select.value = value;
    select.dispatchEvent(new Event('change'));
  };
  const familySelect = (root: HTMLElement) => box(root).querySelector<HTMLSelectElement>('.gb-sg-family')!;
  const roleSelect = (root: HTMLElement, name: string) => box(root).querySelector<HTMLSelectElement>(`.gb-sg-row[data-name="${name}"] .gb-sg-role`)!;
  /** Picks the option the user reads as `label`, such as 'Raised surface'. */
  const chooseLabel = (select: HTMLSelectElement, label: string) =>
    choose(select, [...select.options].find(o => o.textContent === label)!.value);
  const enter = (root: HTMLElement) => buttonFor(root, 'Edit style groups').click();
  const cards = (root: HTMLElement) => [...root.querySelectorAll<HTMLElement>('.gb-stage [data-card]')].map(c => c.dataset.card);
  const GROUPS = [
    { id: 'g1', name: 'Calm', family: 'buttons', roles: { 'button.background': 'raised' }, on: false, savedAt: '2026-11-04T00:00:00.000Z' },
    { id: 'g2', name: 'Wide tabs', family: 'tabs', roles: { 'tab.activeBackground': 'deep' }, on: true, savedAt: '2026-11-04T00:00:00.000Z' },
  ];

  it('closes the Style groups editor until asked for: the Saved tab\'s foot names the groups and offers Edit style groups', () => {
    const root = lab.render(ctx({ groups: GROUPS }));
    expect(root.querySelector('.gb-sg')).toBeNull();
    const foot = root.querySelector('.gb-sg-foot')!;
    expect(foot.textContent).toContain('Style groups (2), shared looks for one widget family');
    expect(foot.closest('[role="tabpanel"]')!.getAttribute('data-tab')).toBe('saved');
    expect(foot.querySelector('button')!.textContent).toBe('Edit style groups');
  });

  it('{#mode-enter} the mode lists the saved groups before New group, draws one tabs card, and the bar holds Group name, Save group and Try in VS Code', () => {
    const root = lab.render(ctx({ groups: GROUPS }));
    enter(root);
    const tasks = root.querySelector<HTMLElement>('.gb-tasks')!;
    expect(buttonFor(root, 'Back to design')).toBeDefined();
    const list = tasks.querySelector('.gb-sg-list')!;
    const fresh = tasks.querySelector('.gb-sg-new')!;
    expect(follows(list, fresh)).toBe(true);
    expect(fresh.querySelector('summary')!.textContent).toBe('New group');
    expect(root.querySelector('.gb-s1')).toBeNull();
    expect(cards(root)).toEqual(['tabs']);
    const bar = root.querySelector<HTMLElement>('.gb-bar')!;
    expect(bar.querySelector<HTMLInputElement>('input.gb-sg-name')!.getAttribute('aria-label')).toBe('Group name');
    expect([...bar.querySelectorAll('button')].map(b => b.textContent)).toEqual(['Save group', 'Try in VS Code']);
    expect(bar.querySelector('.gb-bar-theme')!.textContent).toBe('Triad 210°');
    const primary = [...root.querySelectorAll('button')].filter(b => !b.classList.contains('secondary') && b.getAttribute('role') !== 'tab').map(b => b.textContent);
    expect(primary).toEqual(['Try in VS Code']);
  });

  it('{#editor-text-card} choosing the editorText family draws the editor-text card', () => {
    const root = lab.render(ctx());
    enter(root);
    choose(familySelect(root), 'editorText');
    expect(cards(root)).toEqual(['editor-text']);
    choose(familySelect(root), 'lists');
    expect(cards(root)).toEqual(['lists']);
  });

  it('{#exact-restore} Back to design restores the design page, and the preview window draws every family throughout', () => {
    const c: any = ctx();
    const all = (window as any).GBGallery.cards.map((x: any) => x.id).filter((id: string) => id !== 'workbench');
    const previewCards = () => [...previewOf(c).querySelectorAll<HTMLElement>('.gb-pl-widgets-wrap [data-card]')].map(el => el.dataset.card);
    const root = lab.render(c);
    expect(cards(root)).toEqual([]);
    expect(previewCards()).toEqual(all);
    enter(root);
    choose(familySelect(root), 'editorText');
    expect(cards(root)).toEqual(['editor-text']);
    expect(previewCards()).toEqual(all);
    buttonFor(root, 'Back to design').click();
    expect(cards(root)).toEqual([]);
    expect(previewCards()).toEqual(all);
    expect('widgets' in c.ui).toBe(false);
    expect(root.querySelector('.gb-s1')).not.toBeNull();
    expect(c.ui).not.toHaveProperty('groupsMode');
  });

  it('{#save-group} Save group posts the typed group name and the draft family', () => {
    const c = ctx();
    const root = lab.render(c);
    enter(root);
    const name = root.querySelector<HTMLInputElement>('.gb-bar input.gb-sg-name')!;
    name.value = 'Quiet tabs';
    name.dispatchEvent(new Event('input'));
    buttonFor(root, 'Save group').click();
    const msgs = c.post.mock.calls.map(call => call[0]).filter(m => m.type === 'saveGroup');
    expect(msgs).toEqual([{ type: 'saveGroup', name: 'Quiet tabs', family: 'tabs', roles: {} }]);
  });

  it('has one row per family key with Theme\'s own first, then every Editor role', () => {
    const root = lab.render(ctx());
    enter(root);
    expect([...familySelect(root).options].map(o => o.textContent)).toEqual(['Tabs', 'Lists and trees', 'Buttons', 'Editor text']);
    choose(familySelect(root), 'buttons');
    expect(box(root).querySelectorAll('.gb-sg-row')).toHaveLength(9);
    const options = [...roleSelect(root, 'button.background').options].map(o => o.textContent);
    expect(options[0]).toBe("Theme's own");
    const editorRoles = Object.keys(TB.SWATCHES).filter((n: string) => TB.SWATCHES[n][2] === 'editor').map((n: string) => TB.SWATCHES[n][0]);
    expect(options.slice(1)).toEqual(editorRoles);
    choose(familySelect(root), 'editorText');
    expect([...box(root).querySelectorAll('.gb-sg-row')].map(r => r.getAttribute('data-name')))
      .toEqual(['editor.foreground', 'Keyword', 'Function', 'String', 'Type', 'Number', 'Comment']);
  });

  it('a Buttons draft mapping button.background to Raised surface draws it in the raised swatch', () => {
    const root = lab.render(ctx());
    enter(root);
    choose(familySelect(root), 'buttons');
    expect(drawn(root, 'button.background')).toBe(SW.accent);
    chooseLabel(roleSelect(root, 'button.background'), 'Raised surface');
    expect(drawn(root, 'button.background')).toBe(SW.raised);
    expect(SW.raised).not.toBe(SW.accent);
  });

  it('Save group posts the name, the family and only the rows that name a role', () => {
    const c = ctx();
    const root = lab.render(c);
    enter(root);
    choose(familySelect(root), 'buttons');
    chooseLabel(roleSelect(root, 'button.background'), 'Raised surface');
    const name = root.querySelector<HTMLInputElement>('.gb-sg-name')!;
    name.value = 'Calm buttons';
    name.dispatchEvent(new Event('input'));
    buttonFor(root, 'Save group').click();
    const msgs = c.post.mock.calls.map(call => call[0]).filter(m => m.type === 'saveGroup');
    expect(msgs).toEqual([{ type: 'saveGroup', name: 'Calm buttons', family: 'buttons', roles: { 'button.background': 'raised' } }]);
  });

  it('lists each saved group on one line with On, name and family; clicking the row shows Load and Delete, which act on that group', () => {
    const c = ctx({ groups: GROUPS });
    const root = lab.render(c);
    enter(root);
    const row = () => box(root).querySelector<HTMLElement>('.gb-sg-saved[data-id="g1"]')!;
    expect(row().querySelector('.gb-pl-row-name')!.textContent).toBe('Calm');
    expect(row().querySelector('.gb-sg-family-name')!.textContent).toBe('Buttons');
    const actions = () => row().querySelector<HTMLElement>('.gb-sg-actions')!;
    expect(actions().hidden).toBe(true);
    row().querySelector<HTMLButtonElement>('.gb-sg-toggle')!.click();
    expect(actions().hidden).toBe(false);
    const on = row().querySelector<HTMLInputElement>('input[data-action="on"]')!;
    expect(on.checked).toBe(false);
    on.checked = true;
    on.dispatchEvent(new Event('change'));
    row().querySelector<HTMLButtonElement>('button[data-action="delete"]')!.click();
    expect(c.post.mock.calls.map(call => call[0])).toEqual([
      { type: 'setGroupOn', id: 'g1', on: true },
      { type: 'deleteGroup', id: 'g1' },
    ]);
    row().querySelector<HTMLButtonElement>('button[data-action="load"]')!.click();
    expect(familySelect(root).value).toBe('buttons');
    expect(roleSelect(root, 'button.background').value).toBe('raised');
    expect(box(root).querySelector<HTMLDetailsElement>('.gb-sg-new')!.open).toBe(true);
    expect(root.querySelector<HTMLInputElement>('.gb-sg-name')!.value).toBe('Calm');
  });

  it('draws a group that is on with no draft, and a draft takes the place of the on group of its family', () => {
    const on = [{ ...GROUPS[0], on: true }];
    const root = lab.render(ctx({ groups: on }));
    enter(root);
    choose(familySelect(root), 'buttons');
    expect(drawn(root, 'button.background')).toBe(SW.raised);
    chooseLabel(roleSelect(root, 'button.background'), 'Deep surface');
    expect(drawn(root, 'button.background')).toBe(SW.deep);
    chooseLabel(roleSelect(root, 'button.background'), "Theme's own");
    expect(drawn(root, 'button.background')).toBe(SW.raised);
  });

  it('Try in VS Code sends a Buttons draft as groups, with the on groups of other families', () => {
    const c = ctx({ groups: GROUPS });
    const root = lab.render(c);
    enter(root);
    choose(familySelect(root), 'buttons');
    chooseLabel(roleSelect(root, 'button.background'), 'Raised surface');
    buttonFor(root, 'Try in VS Code').click();
    const msg = c.post.mock.calls.map(call => call[0]).find(m => m.type === 'applyPalette');
    expect(msg.groups).toEqual([
      { family: 'tabs', roles: { 'tab.activeBackground': 'deep' } },
      { family: 'buttons', roles: { 'button.background': 'raised' } },
    ]);
  });
});

// Last in the file: these leave palette.js's module-level draft name set.
describe('Palette Lab Name across palette changes', () => {
  const BASE = { mode: 'generated', rule: 'triad', hue: 30, lightness: 0.7, chroma: 0.12, chromeIndex: 0, surfaces: 'neutral' };
  const nameOf = (root: HTMLElement) => (root.querySelector('.gb-bar .gb-pl-name') as HTMLInputElement).value;
  const setHue = (root: HTMLElement, value: number) => {
    const range = root.querySelector('.gb-pl-hue') as HTMLInputElement;
    range.value = String(value);
    range.dispatchEvent(new Event('input'));
  };
  const type = (root: HTMLElement, text: string) => {
    const input = root.querySelector('.gb-bar .gb-pl-name') as HTMLInputElement;
    input.value = text;
    input.dispatchEvent(new Event('input'));
  };

  it('{#name-default-follows} a name nobody typed follows the palette', () => {
    const ui: Record<string, any> = {};
    lab.restoreTry(ui, BASE);
    const root = lab.render(ctx({ ui }));
    expect(nameOf(root)).toMatch(/ 30°$/);
    setHue(root, 40);
    expect(nameOf(root)).toMatch(/ 40°$/);
  });

  it('{#name-kept-loaded} a loaded theme keeps its name through a palette change, and Save updates it without Overwrites', () => {
    const ui: Record<string, any> = {};
    const design = { mode: 'generated', rule: 'triad', hue: 200, lightness: 0.7, chroma: 0.12, chromeIndex: 0, surfaces: 'neutral', frame: { index: 0, style: 'filled' }, edits: { swatches: {}, keys: {} } };
    (lab as any).loadSaved(ui, { name: 'Ocean', design });
    const library = [{ id: 'o', name: 'Ocean', slot: 1, design, groups: [], savedAt: '' }];
    const c = ctx({ ui, library });
    const root = lab.render(c);
    setHue(root, 201);
    expect(nameOf(root)).toBe('Ocean');
    expect(root.querySelector('.gb-bar [role="status"]')!.textContent).not.toContain('Overwrites');
    buttonFor(root, 'Save theme').click();
    expect(c.post.mock.calls.map(call => call[0]).filter(m => m.type === 'saveTheme').map(m => m.name)).toEqual(['Ocean']);
  });

  it('{#name-kept-typed} a typed name survives a slider move; restoring a Try gives the new palette its default name again', () => {
    const ui: Record<string, any> = {};
    lab.restoreTry(ui, BASE);
    const root = lab.render(ctx({ ui }));
    type(root, 'Harbor');
    setHue(root, 55);
    expect(nameOf(root)).toBe('Harbor');
    lab.restoreTry(ui, { ...BASE, hue: 90 });
    expect(nameOf(lab.render(ctx({ ui })))).toMatch(/ 90°$/);
  });
});

describe('Palette Lab color picker', () => {
  const rolesOf = (root: HTMLElement) => root.querySelector<HTMLElement>('.gb-roles')!;
  const chipOf = (root: HTMLElement, sw: string) => rolesOf(root).querySelector<HTMLButtonElement>(`.gb-role-chip[data-swatch="${sw}"]`)!;
  const roleTrigger = (root: HTMLElement) => rolesOf(root).querySelector<HTMLElement>('.gb-role-ed .gb-cp-trigger')!;
  const errorRow = (root: HTMLElement) => root.querySelector<HTMLElement>('.gb-pl-edit .gb-pl-key[data-key="errorForeground"]')!;
  const press = (el: Element, key: string) => el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  const BASE_KEYS = ['hue', 'lightness', 'chroma', 'mode', 'sourceLabel'];
  const baseOf = (ui: any) => Object.fromEntries(BASE_KEYS.map(k => [k, ui[k]]));
  /** The Lab for `c` in the page, with the Raised surface role's editor open. */
  const openRaised = (c: any) => {
    const root = lab.render(c);
    document.body.replaceChildren(root);
    chipOf(root, 'raised').click();
    return root;
  };

  beforeEach(() => lab.restoreTry({}, { mode: 'generated', rule: 'triad', hue: 210, lightness: 0.75, chroma: 0.13, chromeIndex: 0, surfaces: 'neutral' }));

  it('{#four-places} a color picked at the base color, the custom frame, a role and a key in Edit reaches the Lab state', () => {
    const c: any = ctx();
    const root = lab.render(c);
    // Unlike #ceaa3e, whose lightness and chroma equal the defaults, this color moves all three.
    pickColor(root.querySelector<HTMLElement>('.gb-pl-base')!, '#7a3e9c');
    const o = GB.hexToOklch('#7a3e9c');
    expect([c.ui.hue, c.ui.lightness, c.ui.chroma]).toEqual([Math.round(o.h) % 360, Number(o.l.toFixed(2)), Number(o.c.toFixed(3))]);
    expect([c.ui.hue, c.ui.lightness, c.ui.chroma]).not.toEqual([210, 0.75, 0.13]);
    pickColor(root.querySelector<HTMLElement>('.gb-fr-custom')!, '#336699');
    expect(c.ui.frame).toEqual({ color: '#336699', style: 'filled' });
    chipOf(root, 'raised').click();
    pickColor(roleTrigger(root), '#404040');
    expect(c.ui.edits.swatches.raised).toBe('#404040');
    const c2: any = ctx();
    lab.render(c2);
    const r2 = pickIn(c2, CHAT_INPUT);
    // Whole role is the default scope, which writes the role; This key only writes the key.
    errorRow(r2).querySelector<HTMLButtonElement>('.gb-ke-seg[data-scope="key"]')!.click();
    pickColor(errorRow(r2).querySelector<HTMLElement>('.gb-ke-pick')!, '#123456');
    expect(c2.ui.edits.keys.errorForeground).toBe('#123456');
  });

  it('{#drag-live} a color changed in the Raised role\'s open picker saves and previews without closing the picker', () => {
    const save = jest.fn();
    const c: any = ctx({ save });
    const root = openRaised(c);
    const trigger = roleTrigger(root);
    save.mockClear();
    const dialog = pickColor(trigger, '#505050', 'open');
    expect(save).toHaveBeenCalled();
    expect(c.ui.edits.swatches.raised).toBe('#505050');
    expect(drawnIn(c, 'editorWidget.background')).toBe('#505050');
    expect(dialog.isConnected).toBe(true);
    expect(root.querySelector('.gb-cp')).toBe(dialog);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    press(dialog, 'Escape');
  });

  it('{#cancel-state} Escape in the Raised role\'s picker puts the edits back and keeps the editor open; at the base color it puts back hue, lightness, chroma, mode and source', () => {
    const c: any = ctx({ ui: { edits: { swatches: { error: '#ff0000' }, keys: {} } } });
    const root = openRaised(c);
    const before = JSON.parse(JSON.stringify(c.ui.edits));
    const dialog = pickColor(roleTrigger(root), '#505050', 'open');
    expect(c.ui.edits.swatches.raised).toBe('#505050');
    press(dialog, 'Escape');
    expect(c.ui.edits).toEqual(before);
    expect(rolesOf(root).querySelector('.gb-role-ed')).not.toBeNull();
    expect(document.activeElement).toBe(roleTrigger(root));

    const c2: any = ctx({ ui: { mode: 'pasted', pasted: ['#ff8800', '#336699'], sourceLabel: 'Saved: Ocean', hue: 40, lightness: 0.6, chroma: 0.1 } });
    const r2 = lab.render(c2);
    const base = baseOf(c2.ui);
    const d2 = pickColor(r2.querySelector<HTMLElement>('.gb-pl-base')!, '#20c3d9', 'open');
    expect(c2.ui.mode).toBe('generated');
    expect(c2.ui.sourceLabel).toBeUndefined();
    press(d2, 'Escape');
    expect(baseOf(c2.ui)).toEqual(base);
  });

  it('{#cancel-others} Escape at the custom frame and at a key in Edit puts them back with the dock open; at the base color the Hue slider shows the restored hue', () => {
    const c: any = ctx({ ui: { frame: { index: 1, style: 'dark' } } });
    const root = lab.render(c);
    document.body.replaceChildren(root);
    const frameBefore = JSON.parse(JSON.stringify(c.ui.frame));
    const d = pickColor(root.querySelector<HTMLElement>('.gb-fr-custom')!, '#336699', 'open');
    // The custom frame color now previews while it is dragged.
    expect(c.ui.frame).toEqual({ color: '#336699', style: 'dark' });
    expect(drawnIn(c, 'titleBar.activeBackground')).not.toBe('');
    press(d, 'Escape');
    expect(c.ui.frame).toEqual(frameBefore);
    expect(document.activeElement).toBe(root.querySelector('.gb-fr-custom'));

    const c2: any = ctx();
    lab.render(c2);
    const r2 = pickIn(c2, CHAT_INPUT, 1400);
    document.body.replaceChildren(r2);
    errorRow(r2).querySelector<HTMLButtonElement>('.gb-ke-seg[data-scope="key"]')!.click();
    const keysBefore = JSON.parse(JSON.stringify(c2.ui.edits.keys));
    const d2 = pickColor(errorRow(r2).querySelector<HTMLElement>('.gb-ke-pick')!, '#123456', 'open');
    expect(c2.ui.edits.keys.errorForeground).toBe('#123456');
    press(d2, 'Escape');
    expect(c2.ui.edits.keys).toEqual(keysBefore);
    const dock = r2.querySelector<HTMLElement>('.gb-dock')!;
    expect(dock).not.toBeNull();
    expect(dock.hasAttribute('data-min')).toBe(false);
    expect(document.activeElement).toBe(errorRow(r2).querySelector('.gb-ke-pick'));

    const r3 = lab.render(ctx());
    const hue = r3.querySelector<HTMLInputElement>('.gb-pl-hue')!;
    expect(hue.value).toBe('210');
    const d3 = pickColor(r3.querySelector<HTMLElement>('.gb-pl-base')!, '#ceaa3e', 'open');
    expect(hue.value).not.toBe('210');
    press(d3, 'Escape');
    expect(hue.value).toBe('210');
  });

  it('{#trigger-follows} moving the Hue slider moves the base color trigger\'s swatch', () => {
    const root = lab.render(ctx());
    const hue = root.querySelector<HTMLInputElement>('.gb-pl-hue')!;
    hue.value = '40';
    hue.dispatchEvent(new Event('input'));
    expect(triggerColor(root.querySelector('.gb-pl-base')!)).toBe(GB.oklchToHex({ l: 0.75, c: 0.13, h: 40 }));
  });

  it('{#base-bounds} the base color picker keeps lightness within the Lightness slider\'s range', () => {
    const c: any = ctx();
    const root = lab.render(c);
    const trigger = root.querySelector<HTMLElement>('.gb-pl-base')!;
    trigger.click();
    const l = (trigger.nextElementSibling as HTMLElement).querySelector<HTMLInputElement>('.gb-cp-l')!;
    l.value = '0.2';
    l.dispatchEvent(new Event('change', { bubbles: true }));
    expect(l.value).toBe('0.30');
    expect(c.ui.lightness).toBe(0.3);
    press(trigger.nextElementSibling!, 'Escape');
  });

  it('a cancelled pick puts the step 6 result line back to what it said', () => {
    const c: any = ctx();
    const root = openRaised(c);
    buttonFor(root, 'Try in VS Code').click();
    const result = () => root.querySelector('.gb-bar-result')!.textContent;
    expect(result()).toBe('Tried in VS Code');
    const dialog = pickColor(roleTrigger(root), '#505050', 'keep');
    expect(dialog.isConnected).toBe(false);
    expect(result()).toBe('Changed since your last Try');
    buttonFor(root, 'Try in VS Code').click();
    press(pickColor(roleTrigger(root), '#606060', 'open'), 'Escape');
    expect(result()).toBe('Tried in VS Code');
  });

  it('the base color row is a div, so a click inside the open picker is not forwarded to the trigger', () => {
    const root = lab.render(ctx());
    const row = root.querySelector('.gb-pl-base')!.closest('.gb-pl-field')!;
    expect(row.tagName).toBe('DIV');
  });
});
