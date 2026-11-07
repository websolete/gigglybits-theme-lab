/**
 * @jest-environment jsdom
 */
// The Theme Lab's color picker (media/colorPicker.js) on its own: lightness blocks, the
// fields and their conversions, the gamut note, keyboard steps, and commit and cancel.
export {};

/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */
const GB = require('../media/shared.js');
(window as any).GB = GB;
const CP = require('../media/colorPicker.js');
/* eslint-enable @typescript-eslint/no-require-imports */

beforeAll(() => {
  // jsdom has no canvas; the picker leaves the ring and panel blank without a 2D context.
  HTMLCanvasElement.prototype.getContext = (() => null) as any;
});

afterEach(() => {
  document.body.replaceChildren();
});

type Opened = {
  trigger: HTMLButtonElement;
  dialog: HTMLElement;
  field: (key: 'hex' | 'l' | 'c' | 'h') => HTMLInputElement;
  onInput: jest.Mock;
  onChange: jest.Mock;
  onCancel: jest.Mock;
};

/** Creates a trigger for `value`, puts it in the page and clicks it open. */
function openPicker(value = '#336699', extra: Record<string, any> = {}): Opened {
  const onInput = jest.fn();
  const onChange = jest.fn();
  const onCancel = jest.fn();
  const trigger = CP.create({ label: 'Test color', value, onInput, onChange, onCancel, ...extra }) as HTMLButtonElement;
  document.body.append(trigger);
  trigger.click();
  const dialog = document.querySelector<HTMLElement>('.gb-cp')!;
  return { trigger, dialog, field: key => dialog.querySelector<HTMLInputElement>(`.gb-cp-${key}`)!, onInput, onChange, onCancel };
}

/** Types `value` in `input` and commits it as a change event does. */
function type(input: HTMLInputElement, value: string) {
  input.value = value;
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

const key = (el: Element, k: string, shiftKey = false) =>
  el.dispatchEvent(new KeyboardEvent('keydown', { key: k, shiftKey, bubbles: true, cancelable: true }));

describe('color picker', () => {
  it('{#blocks-step} spaces five lightness blocks by the step at the color\'s own chroma and hue', () => {
    const o = GB.hexToOklch('#20c3d9');
    const list = CP.blocks('#20c3d9', 0.05);
    expect(list).toHaveLength(5);
    list.forEach((b: any, i: number) => {
      const back = GB.hexToOklch(b.hex);
      expect(Math.abs(back.l - (o.l + (i - 2) * 0.05))).toBeLessThanOrEqual(0.01);
      expect(b.disabled).toBe(false);
      // Not gray: each block keeps a visible chroma near the color's hue.
      expect(back.c).toBeGreaterThan(0.04);
      expect(Math.abs(back.h - o.h)).toBeLessThan(6);
    });
    expect(new Set(list.map((b: any) => b.hex)).size).toBe(5);
  });

  it('{#blocks-clamp} disables the blocks past lightness 1 for a light color', () => {
    expect(GB.hexToOklch('#f5f5f5').l).toBeGreaterThan(0.95);
    const list = CP.blocks('#f5f5f5', 0.05);
    expect(list.map((b: any) => b.disabled)).toEqual([false, false, false, true, true]);
  });

  it('{#fields} shows a typed hex as L, C and H, and a typed L as the hex', () => {
    const p = openPicker('#20c3d9');
    type(p.field('hex'), '#336699');
    const o = GB.hexToOklch('#336699');
    expect(p.field('l').value).toBe(o.l.toFixed(2));
    expect(p.field('c').value).toBe(o.c.toFixed(3));
    expect(p.field('h').value).toBe(o.h.toFixed(0));
    type(p.field('l'), '0.5');
    const c = Number(p.field('c').value);
    const h = Number(p.field('h').value);
    expect(p.field('hex').value).toBe(GB.oklchToHex({ l: 0.5, c, h }));
    expect(p.field('l').value).toBe('0.50');
  });

  it('{#gamut-note} says when a typed chroma was reduced to fit the screen, and only then', () => {
    const p = openPicker();
    const note = p.dialog.querySelector<HTMLElement>('.gb-cp-note')!;
    expect(note.hidden).toBe(true);
    p.field('l').value = '0.5';
    p.field('c').value = '0.4';
    type(p.field('h'), '250');
    expect(note.hidden).toBe(false);
    expect(note.textContent).toMatch(/reduced/i);
    expect(p.field('hex').value).toBe(GB.oklchToHex({ l: 0.5, c: 0.4, h: 250 }));
    type(p.field('c'), '0.1');
    expect(note.hidden).toBe(true);
    expect(note.textContent).toBe('');
  });

  it('{#keys} steps the hue by 1 and 10 on the ring, and lightness by 0.01 on the panel', () => {
    const p = openPicker('#336699');
    const ring = p.dialog.querySelector<HTMLElement>('.gb-cp-ring')!;
    const panel = p.dialog.querySelector<HTMLElement>('.gb-cp-panel')!;
    const hue = () => Number(ring.getAttribute('aria-valuenow'));
    const h0 = hue();
    key(ring, 'ArrowRight');
    expect(hue()).toBe((h0 + 1) % 360);
    key(ring, 'ArrowRight', true);
    expect(hue()).toBe((h0 + 11) % 360);
    const l0 = Number(p.field('l').value);
    key(panel, 'ArrowUp');
    expect(Number(p.field('l').value)).toBeCloseTo(l0 + 0.01, 5);
    expect(panel.getAttribute('aria-valuetext')).toMatch(/^Lightness \d\.\d\d, chroma \d\.\d{3}$/);
  });

  it('{#commit-cancel} Enter keeps the color: onChange once, the picker closed and focus on the trigger', () => {
    const p = openPicker('#336699');
    key(p.dialog.querySelector('.gb-cp-panel')!, 'ArrowUp');
    const hex = p.field('hex').value;
    expect(hex).not.toBe('#336699');
    expect(p.onInput).toHaveBeenLastCalledWith(hex);
    key(p.dialog.querySelector('.gb-cp-panel')!, 'Enter');
    expect(p.onChange).toHaveBeenCalledTimes(1);
    expect(p.onChange).toHaveBeenCalledWith(hex);
    expect(p.onCancel).not.toHaveBeenCalled();
    expect(document.querySelector('.gb-cp')).toBeNull();
    expect(p.trigger.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(p.trigger);
    expect(p.trigger.querySelector('.gb-cp-swatch')!.getAttribute('data-color')).toBe(hex);
  });

  it('{#commit-cancel} Escape cancels: onCancel once, onChange never, focus on the trigger, and the key stops there', () => {
    const outer = jest.fn();
    document.body.addEventListener('keydown', outer);
    const p = openPicker('#336699');
    key(p.dialog.querySelector('.gb-cp-panel')!, 'ArrowUp');
    key(p.dialog.querySelector('.gb-cp-panel')!, 'Escape');
    expect(p.onCancel).toHaveBeenCalledTimes(1);
    expect(p.onChange).not.toHaveBeenCalled();
    expect(document.querySelector('.gb-cp')).toBeNull();
    expect(document.activeElement).toBe(p.trigger);
    expect(outer.mock.calls.filter(c => c[0].key === 'Escape')).toHaveLength(0);
    document.body.removeEventListener('keydown', outer);
  });

  it('{#field-titles} titles the L, C and H fields Lightness, Chroma and Hue', () => {
    const p = openPicker();
    const titles = (['l', 'c', 'h'] as const).map(k => p.field(k).title);
    expect(titles[0]).toContain('Lightness');
    expect(titles[1]).toContain('Chroma');
    expect(titles[2]).toContain('Hue');
    for (const t of titles) {expect(t).toMatch(/Higher/);}
  });

  it('builds the trigger and the dialog as the page expects', () => {
    const p = openPicker('#336699', { className: 'gb-extra' });
    expect(p.trigger.className).toBe('secondary gb-cp-trigger gb-extra');
    expect(p.trigger.getAttribute('aria-label')).toBe('Test color');
    expect(p.trigger.getAttribute('aria-haspopup')).toBe('dialog');
    expect(p.trigger.getAttribute('aria-expanded')).toBe('true');
    expect(p.trigger.nextElementSibling).toBe(p.dialog);
    expect(p.dialog.getAttribute('role')).toBe('dialog');
    expect(p.dialog.getAttribute('aria-label')).toBe('Test color');
    expect(p.dialog.contains(document.activeElement)).toBe(true);
    expect(p.dialog.querySelectorAll('.gb-cp-block')).toHaveLength(5);
    // Every button of the picker is secondary, so the page keeps one primary button.
    for (const b of p.dialog.querySelectorAll('button')) {expect(b.classList.contains('secondary')).toBe(true);}
    for (const el of p.dialog.querySelectorAll('button, input, [role="slider"]')) {
      expect(el.getAttribute('aria-label') || (el as HTMLElement).textContent!.trim()).toBeTruthy();
    }
  });

  it('a block click takes that shade, the step selector respaces the blocks, and setValue changes what opens', () => {
    const p = openPicker('#336699');
    const plus2 = p.dialog.querySelector<HTMLButtonElement>('.gb-cp-block[data-k="2"]')!;
    const want = plus2.getAttribute('data-color');
    plus2.focus();
    plus2.click();
    expect(p.field('hex').value).toBe(want);
    // The blocks are rebuilt; focus moves to the new block, so Enter and Escape still reach the picker.
    expect(p.dialog.contains(document.activeElement)).toBe(true);
    expect(document.activeElement!.getAttribute('data-k')).toBe('2');
    expect(p.onInput).toHaveBeenLastCalledWith(want);
    p.dialog.querySelector<HTMLButtonElement>('.gb-cp-step[data-step="0.1"]')!.click();
    const ls = [...p.dialog.querySelectorAll('.gb-cp-block')].map(b => GB.hexToOklch(b.getAttribute('data-color')).l);
    expect(ls[3] - ls[2]).toBeCloseTo(0.1, 2);
    key(p.dialog, 'Escape');
    (p.trigger as any).setValue('#aa3300');
    expect(p.trigger.querySelector('.gb-cp-swatch')!.getAttribute('data-color')).toBe('#aa3300');
    p.trigger.click();
    expect(document.querySelector<HTMLInputElement>('.gb-cp-hex')!.value).toBe('#aa3300');
  });

  it('Enter on a block just taken keeps that block\'s color rather than stepping again', () => {
    const p = openPicker('#336699');
    const plus1 = p.dialog.querySelector<HTMLButtonElement>('.gb-cp-block[data-k="1"]')!;
    const want = plus1.getAttribute('data-color');
    plus1.focus();
    plus1.click();
    key(document.activeElement!, 'Enter');
    expect(p.onChange).toHaveBeenCalledTimes(1);
    expect(p.onChange).toHaveBeenCalledWith(want);
  });

  it('a press outside keeps the color once the press ends, and bounds clamp lightness and chroma', async () => {
    const outside = document.createElement('div');
    document.body.append(outside);
    const p = openPicker('#336699', { bounds: { l: [0.3, 0.95], c: [0, 0.3] } });
    type(p.field('l'), '0.2');
    expect(p.field('l').value).toBe('0.30');
    expect(p.dialog.querySelector<HTMLButtonElement>('.gb-cp-block[data-k="-2"]')!.disabled).toBe(true);
    outside.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    // Closed at once, but onChange waits for the press to end and its click to run.
    expect(document.querySelector('.gb-cp')).toBeNull();
    expect(p.onChange).not.toHaveBeenCalled();
    outside.dispatchEvent(new MouseEvent('pointerup', { bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(p.onChange).toHaveBeenCalledTimes(1);
    expect(GB.hexToOklch(p.onChange.mock.calls[0][0]).l).toBeCloseTo(0.3, 2);
    expect(document.querySelector('.gb-cp')).toBeNull();
  });

  it('oklchInGamut agrees with whether oklchToHex keeps the chroma', () => {
    expect(GB.oklchInGamut({ l: 0.5, c: 0.4, h: 250 })).toBe(false);
    expect(GB.oklchInGamut({ l: 0.5, c: 0.1, h: 250 })).toBe(true);
    expect(GB.oklchInGamut(GB.hexToOklch('#ffffff'))).toBe(true);
  });
});

describe('color picker Facets mode', () => {
  const mode = (p: Opened, m: 'smooth' | 'facets') => p.dialog.querySelector<HTMLButtonElement>(`.gb-cp-mode[data-mode="${m}"]`)!;
  afterEach(() => {
    // The mode carries to the next picker, so put it back for the other tests.
    const p = openPicker();
    mode(p, 'smooth').click();
    document.body.replaceChildren();
  });

  it('{#facets-toggle} switching to Facets leaves the color as it is, and the next picker opens in Facets', () => {
    const p = openPicker('#336699');
    expect(mode(p, 'smooth').getAttribute('aria-pressed')).toBe('true');
    mode(p, 'facets').click();
    expect(mode(p, 'facets').getAttribute('aria-pressed')).toBe('true');
    expect(p.dialog.hasAttribute('data-facets')).toBe(true);
    expect(p.field('hex').value).toBe('#336699');
    expect(p.onInput).not.toHaveBeenCalled();
    key(p.dialog, 'Escape');
    const again = openPicker('#336699');
    expect(again.dialog.hasAttribute('data-facets')).toBe(true);
  });

  it('{#facets-keys} arrow keys move one tile at a time: 15 degrees of hue, 0.1 lightness, 0.03 chroma', () => {
    const p = openPicker('#336699');
    mode(p, 'facets').click();
    const ring = p.dialog.querySelector<HTMLElement>('.gb-cp-ring')!;
    const panel = p.dialog.querySelector<HTMLElement>('.gb-cp-panel')!;
    const h0 = Number(p.field('h').value);
    key(ring, 'ArrowRight');
    expect(Number(p.field('h').value)).toBe((Math.round(h0 / 15) * 15 + 15) % 360);
    const l0 = Number(p.field('l').value);
    key(panel, 'ArrowUp');
    expect(Number(p.field('l').value)).toBeCloseTo(Math.round(l0 / 0.1) * 0.1 + 0.1, 5);
    const c = Number(p.field('c').value);
    expect(Math.abs(c / 0.03 - Math.round(c / 0.03))).toBeLessThan(1e-6);
  });

  it('{#facets-pointer} a press on the panel takes the tile under the pointer, and on the ring the nearest 15 degrees', () => {
    const p = openPicker('#336699');
    mode(p, 'facets').click();
    const panel = p.dialog.querySelector<HTMLElement>('.gb-cp-panel')!;
    const ring = p.dialog.querySelector<HTMLElement>('.gb-cp-ring')!;
    const box = (el: HTMLElement, size: number) => { el.getBoundingClientRect = () => ({ left: 0, top: 0, width: size, height: size, right: size, bottom: size, x: 0, y: 0, toJSON() {} }) as DOMRect; };
    box(panel, 110);
    // 11 rows (lightness 1 to 0) and 12 columns (chroma 0 to 0.33): row 3 is lightness 0.7, column 4 chroma 0.12.
    panel.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: (110 / 12) * 4.5, clientY: (110 / 11) * 3.5 }));
    expect([p.field('l').value, p.field('c').value]).toEqual(['0.70', '0.120']);
    box(ring, 200);
    // Straight right of the center is 90 degrees; a little below it still lands on 90.
    ring.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 190, clientY: 105 }));
    expect(p.field('h').value).toBe('90');
  });
});
