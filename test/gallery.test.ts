/**
 * @jest-environment jsdom
 */
// Runs the real gallery catalog (media/gallery.js) in jsdom: every card must draw,
// unset keys must be recorded but not painted, and contrast pairs must be found.
import * as fs from 'fs';
import * as path from 'path';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const GB = require('../media/shared.js');

/* eslint-disable @typescript-eslint/no-explicit-any */
type Gallery = {
  render(ctx: any): { node: HTMLElement; shown: number; total: number };
  renderContributions(ctx: any): { nodes: HTMLElement[]; count: number; extensions: number };
  catalogSize: number;
};

const COLORS: Record<string, string> = {
  'editor.background': '#1f1f1f',
  'editor.foreground': '#cccccc',
  'button.background': '#0078d4',
  'button.foreground': '#ffffff',
  'button.hoverBackground': '#026ec1',
  'sideBar.background': '#181818',
  'sideBar.foreground': '#cccccc',
  'statusBar.background': '#181818',
  'statusBar.foreground': '#cccccc',
  'list.hoverBackground': '#2a2d2e',
  'commandCenter.background': '#ffffff0d',
  'titleBar.activeBackground': '#181818',
  'fixture.highlight': '#ff0000',
};

function model() {
  const byKey = new Map<string, any>();
  for (const [key, value] of Object.entries(COLORS)) {
    const rgba = GB.parseColor(value);
    byKey.set(key, { key, prop: GB.varFor(key), value, rgba, hex: GB.toHex(rgba), source: key === 'button.background' ? 'user' : 'theme' });
  }
  return { byKey, tokens: [{ scope: 'keyword', foreground: '#569cd6', source: 'theme', origin: 'x.json' }] };
}

function ctx(ui: Partial<{ filter: string; source: string; lowContrast: boolean }> = {}) {
  const m = model();
  return {
    model: m,
    tokens: m.tokens,
    snapshot: { contributions: { 'fixture.highlight': { extensionId: 'me.fixture', extensionName: 'Fixture', builtIn: false, description: 'A fixture color.' } } },
    ui: { filter: '', source: 'all', lowContrast: false, ...ui },
    copy: jest.fn(),
    sourceBadge: (s: string) => document.createTextNode(s),
    contrastBadge: (r: number) => document.createTextNode(r.toFixed(1)),
    trackOpen: (d: HTMLElement) => d,
  };
}

let gallery: Gallery;

beforeAll(() => {
  (window as any).GB = GB;
  const src = fs.readFileSync(path.join(__dirname, '..', 'media', 'gallery.js'), 'utf8');
  // The webview loads gallery.js as a classic script; evaluate it the same way.
  new Function(src)();
  gallery = (window as any).GBGallery;
});

describe('element gallery', () => {
  it('draws every catalog entry without falling back to an error message', () => {
    const { node, shown, total } = gallery.render(ctx());
    expect(total).toBe(gallery.catalogSize);
    expect(shown).toBe(total);
    expect(node.querySelectorAll('.gb-card')).toHaveLength(total);
    expect(node.querySelectorAll('.gb-preview .warn')).toHaveLength(0);
  });

  it('gives every card at least one key chip and a definitions table', () => {
    const { node } = gallery.render(ctx());
    for (const card of node.querySelectorAll('.gb-card')) {
      const title = card.querySelector('h3')?.textContent;
      expect({ title, chips: card.querySelectorAll('.gb-chip').length > 0 }).toEqual({ title, chips: true });
      expect(card.querySelector('.gb-defs table')).not.toBeNull();
    }
  });

  it('records an unset key on the part but paints nothing for it', () => {
    const { node } = gallery.render(ctx());
    const buttons = [...node.querySelectorAll('.gb-card')].find(c => c.querySelector('h3')?.textContent === 'Buttons')!;
    const border = buttons.querySelector('.gb-chip[data-key="button.border"]')!;
    expect(border.classList.contains('unset')).toBe(true);
    const primary = buttons.querySelector('.gb-button') as HTMLElement;
    // jsdom drops var() from most inline style properties, so data-painted is the signal.
    expect(primary.getAttribute('data-keys')!.split(' ')).toEqual(expect.arrayContaining(['button.background', 'button.foreground', 'button.border']));
    expect(primary.getAttribute('data-painted')!.split(' ').sort()).toEqual(['button.background', 'button.foreground']);
  });

  it('pairs a text color with the nearest painted background for contrast', () => {
    const { node } = gallery.render(ctx());
    const buttons = [...node.querySelectorAll('.gb-card')].find(c => c.querySelector('h3')?.textContent === 'Buttons')!;
    const worst = buttons.querySelector('.gb-worst');
    expect(worst).not.toBeNull();
    expect(worst!.getAttribute('title')).toMatch(/on (button|sideBar)\./);
  });

  it('filters cards by title or by any key they use', () => {
    const { node } = gallery.render(ctx({ filter: 'statusBarItem.errorBackground' }));
    const titles = [...node.querySelectorAll('.gb-card h3')].map(h => h.textContent);
    expect(titles).toEqual(['Status bar']);
  });

  it('filters cards to those touched by a source, such as user overrides', () => {
    const { node, shown } = gallery.render(ctx({ source: 'user' }));
    expect(shown).toBeGreaterThan(0);
    for (const card of node.querySelectorAll('.gb-card')) {
      expect(card.querySelector('.gb-chip[data-key="button.background"]')).not.toBeNull();
    }
  });

  it('fits only the Workbench overview to its card, rather than scrolling it sideways', () => {
    const observed: Element[] = [];
    (window as any).ResizeObserver = class { constructor(private fn: () => void) {} observe(el: Element) { observed.push(el); } disconnect() {} };
    try {
      const { node } = gallery.render(ctx());
      const fitted = [...node.querySelectorAll('.gb-card')].filter(c => c.querySelector('.gb-preview-fit')).map(c => c.querySelector('h3')!.textContent);
      expect(fitted).toEqual(['Workbench overview']);
      expect(observed).toHaveLength(1);
    } finally {
      delete (window as any).ResizeObserver;
    }
  });

  it('lists extension-contributed colors grouped by extension', () => {
    const c = gallery.renderContributions(ctx());
    expect(c).toMatchObject({ count: 1, extensions: 1 });
    expect(c.nodes[0].textContent).toContain('fixture.highlight');
    expect(c.nodes[0].textContent).toContain('A fixture color.');
  });
});

describe('Workbench drawing and VS Code\'s modern UI settings', () => {
  type Modern = Partial<{ modern: boolean; uppercase: boolean; tabStyle: string }>;
  /** The Workbench preview's root (.wb), drawn with the given modern UI settings, or none. */
  const workbench = (modernUI?: Modern): HTMLElement => {
    const parts = (gallery as any).renderParts(modernUI ? { ...ctx(), modernUI } : ctx(), ['workbench']);
    return parts[0].preview;
  };
  /** The Panel card's preview root. */
  const panelCard = (modernUI?: Modern): HTMLElement =>
    (gallery as any).renderParts(modernUI ? { ...ctx(), modernUI } : ctx(), ['panel'])[0].preview;
  const keysOf = (el: Element | null) => (el!.getAttribute('data-keys') || '').split(' ');
  const activeTab = (wb: HTMLElement) => wb.querySelector('[data-region="tabs"] .gb-tab')!;
  const activeAct = (wb: HTMLElement) => wb.querySelector('[data-region="activityBar"] .wb-act')!;
  const MODERN = { modern: true, uppercase: false, tabStyle: 'connected' };

  it('draws the classic workbench with no modern settings', () => {
    const wb = workbench();
    expect(wb.classList.contains('wb')).toBe(true);
    expect(wb.classList.contains('wb-modern')).toBe(false);
    expect(wb.classList.contains('gb-upper')).toBe(true);
    expect(keysOf(activeTab(wb))).toContain('tab.activeBackground');
    expect(keysOf(activeTab(wb)).some(k => k.startsWith('modern'))).toBe(false);
  });

  it('draws floating cards and the modern active parts with the modern UI on', () => {
    const wb = workbench(MODERN);
    expect(wb.classList.contains('wb-modern')).toBe(true);
    expect(keysOf(wb)).toContain('modernUI.shellBackground');
    expect(keysOf(wb.querySelector('[data-region="sideBar"]'))).toContain('surface.border');
    expect(keysOf(wb.querySelector('[data-region="panel"]'))).toContain('modernPanel.border');
    expect(keysOf(activeTab(wb))).toContain('modernEditorTab.activeBackground');
    expect(keysOf(activeTab(wb))).not.toContain('tab.activeBackground');
    expect(keysOf(activeAct(wb))).toContain('modernActivityBarItem.activeBackground');
    expect(wb.classList.contains('gb-upper')).toBe(false);
  });

  it('writes headers and panel tabs in mixed case, shown in capitals under the classic UI or the uppercase setting', () => {
    for (const modernUI of [undefined, MODERN]) {
      const wb = workbench(modernUI);
      expect(wb.querySelector('[data-region="sideBar"] .wb-side-title')!.textContent).toBe('Explorer');
      expect([...wb.querySelectorAll('[data-region="panel"] .gb-ptab')].map(t => t.textContent)).toEqual(['Terminal', 'Problems', 'Output']);
      expect([...panelCard(modernUI).querySelectorAll('.gb-ptab')].map(t => t.textContent!.trim())).toEqual(['Problems 3', 'Output', 'Terminal']);
    }
    expect(workbench({ modern: true, uppercase: true }).classList.contains('gb-upper')).toBe(true);
    expect(workbench({ modern: false }).classList.contains('gb-upper')).toBe(true);
    expect(panelCard({ modern: true, uppercase: true }).classList.contains('gb-upper')).toBe(true);
  });

  it('paints the whole editor area in the editor background, so a short editor group leaves no gap', () => {
    for (const modernUI of [undefined, MODERN]) {
      expect(keysOf(workbench(modernUI).querySelector('.wb-editor'))).toContain('editor.background');
    }
  });

  it('marks pill tabs only under the modern UI with the pill style', () => {
    expect(workbench({ modern: true, tabStyle: 'pill' }).classList.contains('wb-pill')).toBe(true);
    expect(workbench({ modern: true, tabStyle: 'connected' }).classList.contains('wb-pill')).toBe(false);
    expect(workbench({ modern: false, tabStyle: 'pill' }).classList.contains('wb-pill')).toBe(false);
  });

  it('has the casing and card rules in gallery.css', () => {
    const css = fs.readFileSync(path.join(__dirname, '..', 'media', 'gallery.css'), 'utf8');
    const rules = [...css.matchAll(/([^{}]*)\{([^}]*)\}/g)];
    const upper = rules.find(r => r[1].includes('.gb-upper') && /text-transform:\s*uppercase/.test(r[2]));
    expect(upper).toBeDefined();
    for (const sel of ['.gb-upper .wb-side-title', '.gb-upper .wb-section', '.gb-upper .gb-ptab']) {
      expect(upper![1]).toContain(sel);
    }
    expect(css).toMatch(/\.wb-modern > \.wb-side[^{]*\{[^}]*border-radius:\s*8px/);
  });
});
