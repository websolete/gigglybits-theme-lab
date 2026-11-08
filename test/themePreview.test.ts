/**
 * @jest-environment jsdom
 */
// The Theme Preview page (media/themePreview.js with palette.js renderPreview) in jsdom: it
// draws the Lab state the host sends, with its syntax sets, redraws on the next state, and
// posts the parts clicked in it for the Lab to edit.
import * as fs from 'fs';
import * as path from 'path';

/* eslint-disable @typescript-eslint/no-require-imports */
const GB = require('../media/shared.js');
const TB = require('../media/themeBuilder.js');
/* eslint-enable @typescript-eslint/no-require-imports */

/* eslint-disable @typescript-eslint/no-explicit-any */

const SCRIPTS = ['gallery.js', 'palette.js', 'themePreview.js'].map(f =>
  fs.readFileSync(path.join(__dirname, '..', 'media', f), 'utf8'));

let postMessage: jest.Mock;
let listeners: Array<[string, EventListenerOrEventListenerObject]> = [];

/** Loads the page the way the webview does: shared.js and themeBuilder.js first, then the scripts in order. */
function load() {
  document.body.innerHTML = '<div id="app"></div>';
  postMessage = jest.fn();
  (window as any).acquireVsCodeApi = () => ({ postMessage, getState: () => undefined, setState: jest.fn() });
  (window as any).GB = GB;
  (window as any).GBBuilder = TB;
  const add = window.addEventListener.bind(window);
  jest.spyOn(window, 'addEventListener').mockImplementation((type: string, fn: any, opts?: any) => {
    listeners.push([type, fn]);
    add(type, fn, opts);
  });
  for (const src of SCRIPTS) {new Function(src)();}
}

function unload() {
  for (const [type, fn] of listeners) {window.removeEventListener(type, fn);}
  listeners = [];
  jest.restoreAllMocks();
}

beforeEach(load);
afterEach(unload);

const send = (data: any) => window.dispatchEvent(new MessageEvent('message', { data }));
const sendState = (palette: any, syntaxSets: any[] = []) => send({ type: 'state', palette, syntaxSets });
/** The color the Workbench drawing paints a key in: the drawing redefines the --vscode-* variables. */
const drawn = (key: string) =>
  document.querySelector<HTMLElement>('.gb-pl-chrome .gb-pl-scope')!.style.getPropertyValue(GB.varFor(key));
const SQUARE = GB.harmony('square', { hue: 12, lightness: 0.75, chroma: 0.13 }).map((d: { hex: string }) => d.hex);
const chrome = (index: number) => ({ index, surfaces: 'neutral', frame: { index: 0, style: 'filled' } });

describe('Theme Preview page', () => {
  it('posts ready on load and waits for the Lab', () => {
    expect(postMessage).toHaveBeenCalledWith({ type: 'ready' });
    expect(document.getElementById('app')!.textContent).toContain('Waiting for the Theme Lab');
  });

  it('draws the state it is sent, then redraws in the next state\'s accent', () => {
    sendState({ rule: 'square', hue: 12 });
    const first = TB.buildColors({ colors: SQUARE }, chrome(0))['button.background'];
    expect(drawn('button.background')).toBe(first);
    sendState({ rule: 'square', hue: 12, chromeIndex: 1 });
    const second = TB.buildColors({ colors: SQUARE }, chrome(1))['button.background'];
    expect(second).not.toBe(first);
    expect(drawn('button.background')).toBe(second);
  });

  it('draws a state on a syntax set in the set\'s Functions color', () => {
    const colors = { keyword: '#c792ea', function: '#82aaff', string: '#c3e88d', type: '#ffcb6b', number: '#f78c6c', comment: '#7f848e', tag: '#f07178', attribute: '#ffcb6b', variable: '#eeffff', property: '#b2ccd6', constant: '#ff9cac', operator: '#89ddff', regex: '#c17e70' };
    sendState({ rule: 'square', hue: 12, syntaxSet: 's1' }, [{ id: 's1', name: 'Night', colors, isDefault: false, savedAt: '' }]);
    // symbolIcon.functionForeground takes the Functions role, which a set colors.
    expect(drawn('symbolIcon.functionForeground')).toBe(colors.function);
    expect(TB.swatches({ colors: SQUARE }, chrome(0)).fn).not.toBe(colors.function);
  });

  it('draws the Workbench then the Widgets on one page with no tabs, whatever preview tab an older Lab state names', () => {
    sendState({ rule: 'square', hue: 12, previewTab: 'contrast' });
    const headings = () => [...document.querySelectorAll('#app .gb-tp > section.gb-tp-section .gb-tp-h')].map(el => el.textContent);
    expect(headings()).toEqual(['Workbench', 'Widgets']);
    expect(document.querySelector('[role="tablist"], [role="tab"], .gb-tp-restore')).toBeNull();
    expect(document.querySelector('.gb-tp-section .gb-pl-chrome .gb-pl-scope')).not.toBeNull();
    expect(document.querySelector('.gb-pl-widgets-wrap [data-card="chat"]')).not.toBeNull();
    // A state from a Lab that still chose families draws every family anyway.
    sendState({ rule: 'square', hue: 40, widgets: ['buttons'] });
    expect(headings()).toEqual(['Workbench', 'Widgets']);
    const all = (window as any).GBGallery.cards.map((x: any) => x.id).filter((id: string) => id !== 'workbench');
    expect([...document.querySelectorAll<HTMLElement>('.gb-pl-widgets-wrap [data-card]')].map(el => el.dataset.card)).toEqual(all);
  });

  it('keeps the page where it was scrolled when the next state redraws it', () => {
    sendState({ rule: 'square', hue: 12 });
    let top = 240;
    const writes: number[] = [];
    Object.defineProperty(document, 'scrollingElement', {
      configurable: true,
      get: () => ({ get scrollTop() { return top; }, set scrollTop(v: number) { writes.push(v); top = v; } }),
    });
    try {
      sendState({ rule: 'square', hue: 40 });
      expect(writes).toEqual([240]);
    } finally {
      delete (document as any).scrollingElement;
    }
  });

  it('posts a clicked Workbench part as pickPart with its card and keys, in plain values', () => {
    sendState({ rule: 'square', hue: 12 });
    const part = document.querySelector<HTMLElement>('.gb-pl-chrome [data-region="chat"] .gb-chat-input')!;
    part.click();
    const msgs = postMessage.mock.calls.map(c => c[0]).filter(m => m.type === 'pickPart');
    expect(msgs).toHaveLength(1);
    expect(msgs[0].part.card).toBe('workbench');
    expect(msgs[0].part.keys).toEqual(part.getAttribute('data-keys')!.split(' ').filter(Boolean));
    expect(Object.keys(msgs[0].part).sort()).toEqual(['around', 'card', 'fixed', 'index', 'keys', 'label', 'region']);
    expect(JSON.parse(JSON.stringify(msgs[0].part))).toEqual(msgs[0].part);
  });

  it('redraws the last state as the modern workbench when the modern UI settings arrive', () => {
    sendState({ rule: 'square', hue: 12 });
    expect(document.querySelector('.gb-pl-chrome .wb')!.classList.contains('wb-modern')).toBe(false);
    send({ type: 'modernUI', modernUI: { modern: true, uppercase: false, tabStyle: 'connected' } });
    expect(document.querySelector('.gb-pl-chrome .wb')!.classList.contains('wb-modern')).toBe(true);
  });
});

describe('Theme Preview role outlines', () => {
  const lit = () => [...document.querySelectorAll('.gb-pl-role-hl')];
  it('{#role-outline} outlines every drawn part that uses a highlighted key, keeps the outline through a redraw, and clears it on an empty list', () => {
    sendState({ rule: 'square', hue: 12 });
    send({ type: 'highlight', keys: ['sideBar.background'] });
    expect(lit().length).toBeGreaterThan(0);
    expect(lit().every(el => (el.getAttribute('data-keys') || '').split(' ').includes('sideBar.background'))).toBe(true);
    sendState({ rule: 'square', hue: 40 });
    expect(lit().length).toBeGreaterThan(0);
    send({ type: 'highlight', keys: [] });
    expect(lit()).toEqual([]);
  });

  it('{#role-outline-scroll} scrolls to the first outlined part only when the message asks to (Show where)', () => {
    sendState({ rule: 'square', hue: 12 });
    const scrolled = jest.fn();
    (Element.prototype as any).scrollIntoView = scrolled;
    try {
      send({ type: 'highlight', keys: ['sideBar.background'] });
      expect(lit().length).toBeGreaterThan(0);
      expect(scrolled).not.toHaveBeenCalled();
      send({ type: 'highlight', keys: ['sideBar.background'], scroll: true });
      expect(scrolled).toHaveBeenCalledTimes(1);
    } finally {
      delete (Element.prototype as any).scrollIntoView;
    }
  });
});
