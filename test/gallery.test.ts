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

  it('lists extension-contributed colors grouped by extension', () => {
    const c = gallery.renderContributions(ctx());
    expect(c).toMatchObject({ count: 1, extensions: 1 });
    expect(c.nodes[0].textContent).toContain('fixture.highlight');
    expect(c.nodes[0].textContent).toContain('A fixture color.');
  });
});
