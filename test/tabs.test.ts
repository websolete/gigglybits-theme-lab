/**
 * @jest-environment jsdom
 */
// The shared tab control (GB.tabs in media/shared.js): ARIA wiring, keyboard selection,
// and panels that stay in the document while hidden.
import * as fs from 'fs';
import * as path from 'path';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const GB = require('../media/shared.js');

// Reading the source keeps fs and path in use and checks the export is the one the webview loads.
const source = fs.readFileSync(path.join(__dirname, '..', 'media', 'shared.js'), 'utf8');

function render(onSelect = jest.fn(), selected = 'one') {
  const el = GB.tabs({
    label: 'Sample',
    selected,
    onSelect,
    tabs: ['one', 'two', 'three'].map(id => ({ id, label: id.toUpperCase(), panel: GB.h('p', null, `panel ${id}`) })),
  });
  document.body.replaceChildren(el);
  return { el, onSelect };
}

const tabsOf = (el: HTMLElement) => [...el.querySelectorAll('[role="tab"]')] as HTMLButtonElement[];
const panelsOf = (el: HTMLElement) => [...el.querySelectorAll('[role="tabpanel"]')] as HTMLElement[];
const selectedId = (el: HTMLElement) => tabsOf(el).find(t => t.getAttribute('aria-selected') === 'true')?.dataset.tab;
const key = (tab: HTMLElement, k: string) => tab.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));

describe('GB.tabs', () => {
  it('is exported by media/shared.js', () => {
    expect(source).toMatch(/function tabs\(opts\)/);
    expect(typeof GB.tabs).toBe('function');
  });

  it('wires the tablist, tabs and panels by the ARIA tabs pattern', () => {
    const { el } = render();
    const lists = el.querySelectorAll('[role="tablist"]');
    expect(lists).toHaveLength(1);
    expect(lists[0].getAttribute('aria-label')).toBe('Sample');
    for (const tab of tabsOf(el)) {
      const panel = document.getElementById(tab.getAttribute('aria-controls') as string);
      expect(panel).not.toBeNull();
      expect(panel?.getAttribute('role')).toBe('tabpanel');
      expect(panel?.getAttribute('aria-labelledby')).toBe(tab.id);
    }
    const selected = tabsOf(el).filter(t => t.getAttribute('aria-selected') === 'true');
    expect(selected).toHaveLength(1);
    expect(selected[0].getAttribute('tabindex')).toBe('0');
    const visible = panelsOf(el).filter(p => !p.hasAttribute('hidden'));
    expect(visible).toHaveLength(1);
    expect(visible[0].getAttribute('aria-labelledby')).toBe(selected[0].id);
  });

  it('moves with ArrowRight, ArrowLeft, Home and End, focusing the tab and reporting it once', () => {
    const { el, onSelect } = render();
    const tabs = tabsOf(el);

    // ArrowRight on the last tab wraps to the first.
    tabs[2].click();
    onSelect.mockClear();
    tabs[2].focus();
    key(tabs[2], 'ArrowRight');
    expect(selectedId(el)).toBe('one');
    expect(document.activeElement).toBe(tabs[0]);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenLastCalledWith('one');

    // ArrowLeft on the first tab wraps to the last.
    onSelect.mockClear();
    key(tabs[0], 'ArrowLeft');
    expect(selectedId(el)).toBe('three');
    expect(document.activeElement).toBe(tabs[2]);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenLastCalledWith('three');

    // Home from the last tab selects the first.
    onSelect.mockClear();
    key(tabs[2], 'Home');
    expect(selectedId(el)).toBe('one');
    expect(document.activeElement).toBe(tabs[0]);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenLastCalledWith('one');

    // End from the first tab selects the last.
    onSelect.mockClear();
    key(tabs[0], 'End');
    expect(selectedId(el)).toBe('three');
    expect(document.activeElement).toBe(tabs[2]);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenLastCalledWith('three');
  });

  it('keeps the same panel nodes in the document when another tab is chosen', () => {
    const { el } = render();
    const before = panelsOf(el);
    tabsOf(el)[1].click();
    const after = panelsOf(el);
    expect(after).toHaveLength(before.length);
    before.forEach((node, i) => {
      expect(node.isConnected).toBe(true);
      expect(after[i]).toBe(node);
    });
    expect(before[1].hasAttribute('hidden')).toBe(false);
    expect(before[0].hasAttribute('hidden')).toBe(true);
  });

  it('selects the first tab for an unknown selection', () => {
    const { el } = render(jest.fn(), 'missing');
    expect(selectedId(el)).toBe('one');
  });
});
