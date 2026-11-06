// @ts-check
// The Theme Lab's color picker: a trigger button that opens, in place, a hue ring around a
// lightness-by-chroma panel, before and now swatches, hex, L, C and H fields, and five
// lightness blocks with a step size. Every conversion goes through window.GB (media/shared.js).
// Loads as window.GBColorPicker in the webview and, under Jest, is also module.exports.
(function (root, factory) {
  const api = factory();
  if (root) root.GBColorPicker = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : undefined, function () {
  /** @returns {any} */
  const GB = () => /** @type {any} */ (window).GB;

  /** The panel's chroma edge: sRGB's largest OKLCH chroma is about 0.32 (#ff00ff). */
  const PANEL_C = 0.33;
  const STEPS = [0.02, 0.05, 0.1];
  const RING = 200;
  const RING_W = 18;
  const SIDE = Math.floor((RING / 2 - RING_W) * Math.SQRT2) - 4;

  const TITLES = {
    hex: 'Hex: the color as #rrggbb, the way VS Code settings write it',
    l: 'Lightness: how light the color is, from 0 (black) to 1 (white). Higher is lighter.',
    c: 'Chroma: how colorful the color is, from 0 (gray) to about 0.32 for the most vivid screen colors. Higher is more colorful.',
    h: 'Hue: the color\'s angle on the ring, 0 to 360 degrees. Red is near 30, green near 140, blue near 265. Higher turns it further around the ring.',
  };
  const HINTS = { l: '0 black to 1 white', c: '0 gray to about 0.32 vivid', h: 'degrees around the ring' };

  let count = 0;
  /** The open picker's close function, so opening another closes it first. */
  let openClose = null;

  const wrap = x => ((x % 360) + 360) % 360;
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const fixed = (v, n) => Number(v).toFixed(n);

  /** Small DOM builder, as GB.h, so this file can build before shared.js is asked for. */
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : String(v));
    }
    for (const c of kids.flat()) {
      if (c === null || c === undefined || c === false) continue;
      el.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return el;
  }

  /**
   * Five lightness blocks around `hex`: lightness l0 - 2*step to l0 + 2*step at the color's
   * own chroma and hue, l0 being hexToOklch(hex).l. A block past 0 or 1 is disabled.
   * @param {string} hex
   * @param {number} step
   * @returns {Array<{ hex: string, l: number, disabled: boolean }>}
   */
  function blocks(hex, step) {
    const o = GB().hexToOklch(hex);
    return [-2, -1, 0, 1, 2].map(k => {
      const l = o.l + k * step;
      const disabled = l < 0 || l > 1;
      return { hex: GB().oklchToHex({ l: clamp(l, 0, 1), c: o.c, h: o.h }), l, disabled };
    });
  }

  /** A 2D context, or null where there is none (jsdom), so drawing is skipped rather than throwing. */
  function ctx2d(canvas) {
    try {
      return canvas.getContext ? canvas.getContext('2d') : null;
    } catch {
      return null;
    }
  }

  /**
   * A trigger for the picker: a button showing `value` that opens the picker after itself.
   * onInput(hex) runs on every change, onChange(hex) once on Enter or a press outside, and
   * onCancel() once on Escape. `bounds` { l: [min, max], c: [min, max] } limits L and C.
   * @param {{ label: string, value: string, className?: string, bounds?: { l?: number[], c?: number[] }, onInput?: (hex: string) => void, onChange?: (hex: string) => void, onCancel?: () => void }} opts
   */
  function create(opts) {
    const id = `gb-cp-${++count}`;
    let value = String(opts.value || '#000000').slice(0, 7).toLowerCase();
    const swatch = h('span', { class: 'gb-cp-swatch', 'aria-hidden': 'true' });
    const trigger = /** @type {HTMLButtonElement & { setValue(hex: string): void }} */ (h('button', {
      type: 'button', class: `secondary gb-cp-trigger${opts.className ? ` ${opts.className}` : ''}`,
      'aria-label': opts.label, title: opts.label, 'aria-haspopup': 'dialog', 'aria-expanded': 'false', 'aria-controls': id,
    }, swatch));
    const paint = hex => {
      swatch.setAttribute('data-color', hex);
      swatch.style.background = hex;
    };
    paint(value);
    trigger.setValue = hex => {
      if (!/^#[0-9a-f]{6}/i.test(String(hex || ''))) return;
      value = String(hex).slice(0, 7).toLowerCase();
      paint(value);
    };
    let close = null;
    trigger.addEventListener('click', () => {
      if (close) close('change');
      else close = open();
    });

    /** Opens the picker after the trigger; returns its close(how). */
    function open() {
      if (openClose) openClose('change');
      const b = opts.bounds || {};
      const lb = b.l || [0, 1];
      const cb = b.c || [0, PANEL_C];
      const inBounds = (l, c) => l >= lb[0] - 1e-9 && l <= lb[1] + 1e-9 && c >= cb[0] - 1e-9 && c <= cb[1] + 1e-9;
      const before = value;
      const state = { l: 0, c: 0, h: 0 };
      let step = 0.05;
      let drawnHue = NaN;

      const hexNow = () => GB().oklchToHex(state);
      const setState = next => {
        state.l = clamp(Number(next.l), Math.max(0, lb[0]), Math.min(1, lb[1]));
        state.c = clamp(Number(next.c), Math.max(0, cb[0]), cb[1]);
        state.h = wrap(Number(next.h));
      };
      const fromHex = hex => {
        const o = GB().hexToOklch(hex);
        if (o) setState(o);
      };
      fromHex(value);

      const field = (key, label) => {
        const input = h('input', {
          type: 'text', class: `gb-cp-field gb-cp-${key}`, id: `${id}-${key}`, spellcheck: 'false',
          title: TITLES[key], 'aria-label': key === 'hex' ? `${opts.label}: hex color, #rrggbb` : label,
          inputmode: key === 'hex' ? null : 'decimal',
          onchange: () => applyField(input),
        });
        const row = [h('label', { class: 'gb-cp-fl', for: input.id, title: TITLES[key] }, label), input];
        if (HINTS[key]) row.push(h('span', { class: 'gb-cp-hint muted' }, HINTS[key]));
        return { input, row };
      };
      const fHex = field('hex', 'Hex');
      const fL = field('l', 'Lightness');
      const fC = field('c', 'Chroma');
      const fH = field('h', 'Hue');
      const note = h('p', { class: 'gb-cp-note', role: 'status' });

      const ringCanvas = h('canvas', { width: String(RING), height: String(RING), 'aria-hidden': 'true' });
      const ringMark = h('span', { class: 'gb-cp-mark', 'aria-hidden': 'true' });
      const ring = h('div', {
        class: 'gb-cp-ring', role: 'slider', tabindex: '0', 'aria-label': 'Hue', 'aria-valuemin': '0', 'aria-valuemax': '359',
        title: 'Hue: drag around the ring, or use the arrow keys (Shift for 10 degrees)',
      }, ringCanvas, ringMark);
      const panelCanvas = h('canvas', { width: String(SIDE), height: String(SIDE), 'aria-hidden': 'true' });
      const panelMark = h('span', { class: 'gb-cp-mark', 'aria-hidden': 'true' });
      const panel = h('div', {
        class: 'gb-cp-panel', role: 'slider', tabindex: '0', 'aria-label': 'Lightness and chroma', 'aria-valuemin': '0', 'aria-valuemax': '1',
        title: 'Lightness up and down (1 white at the top, 0 black at the bottom), chroma left to right (0 gray to 0.33). Arrow keys move it. Striped: colors the screen cannot show.',
      }, panelCanvas, panelMark);
      panel.style.width = panel.style.height = `${SIDE}px`;

      const oldSw = h('div', { class: 'gb-cp-old', title: `Before: ${before}, the color when the picker opened` }, 'before');
      const newSw = h('div', { class: 'gb-cp-new' }, 'now');
      const stepButtons = STEPS.map(sz => h('button', {
        type: 'button', class: 'secondary gb-cp-step', 'data-step': String(sz), title: `Blocks are ${fixed(sz, 2)} lightness apart`,
        onclick: () => { step = sz; sync(); },
      }, fixed(sz, 2)));
      const blockRow = h('div', { class: 'gb-cp-blocks' });
      const blockLabels = h('div', { class: 'gb-cp-blabels', 'aria-hidden': 'true' });

      const dialog = h('div', {
        class: 'gb-cp', id, role: 'dialog', 'aria-label': opts.label,
        onkeydown: ev => {
          if (ev.key === 'Escape') {
            ev.preventDefault();
            ev.stopPropagation();
            finish('cancel');
          } else if (ev.key === 'Enter') {
            ev.preventDefault();
            ev.stopPropagation();
            // A typed field counts; a focused block does not, since its click (or Space) already
            // took it and Enter on it again would step the color once more.
            const t = /** @type {HTMLElement} */ (ev.target);
            if (t instanceof HTMLInputElement) applyField(t);
            finish('change');
          }
        },
      },
      h('div', { class: 'gb-cp-head' }, h('b', null, opts.label), h('span', { class: 'gb-cp-keys muted' }, 'Enter keeps · Esc puts back')),
      h('div', { class: 'gb-cp-top' },
        h('div', { class: 'gb-cp-wheel' }, ring, panel),
        h('div', { class: 'gb-cp-side' },
          h('div', { class: 'gb-cp-swatches' }, oldSw, newSw),
          h('div', { class: 'gb-cp-fields' }, fHex.row, fL.row, fC.row, fH.row),
          note)),
      h('div', { class: 'gb-cp-lightness' },
        h('div', { class: 'gb-cp-bh' },
          h('span', null, 'Lightness blocks'),
          h('span', { class: 'muted', title: 'Each block is the color made lighter or darker by the step, keeping its chroma and hue' }, 'your color, darker and lighter'),
          h('span', { class: 'gb-cp-steps', role: 'group', 'aria-label': 'Lightness step' }, stepButtons)),
        blockRow, blockLabels));
      oldSw.style.background = before;
      oldSw.style.color = GB().textOn(before);

      function emit() {
        sync();
        if (typeof opts.onInput === 'function') opts.onInput(hexNow());
      }
      function applyField(input) {
        if (input === fHex.input) {
          const v = input.value.trim().toLowerCase();
          if (!/^#[0-9a-f]{6}$/.test(v)) {
            input.setAttribute('aria-invalid', 'true');
            return;
          }
          if (v === hexNow() && !input.hasAttribute('aria-invalid')) return;
          fromHex(v);
          emit();
          return;
        }
        const l = Number(fL.input.value);
        const c = Number(fC.input.value);
        const hue = Number(fH.input.value);
        if (![l, c, hue].every(Number.isFinite)) {
          input.setAttribute('aria-invalid', 'true');
          return;
        }
        setState({ l, c, h: hue });
        emit();
      }
      function fromBlock(btn) {
        fromHex(btn.getAttribute('data-color'));
        emit();
      }

      function drawRing() {
        const g = ctx2d(ringCanvas);
        if (!g) return;
        const r = RING / 2 - RING_W / 2;
        g.lineWidth = RING_W;
        for (let a = 0; a < 360; a += 1) {
          g.strokeStyle = GB().oklchToHex({ l: 0.72, c: 0.15, h: a });
          g.beginPath();
          g.arc(RING / 2, RING / 2, r, ((a - 90 - 0.8) * Math.PI) / 180, ((a - 90 + 0.8) * Math.PI) / 180);
          g.stroke();
        }
      }
      function drawPanel() {
        const g = ctx2d(panelCanvas);
        if (!g) return;
        const cell = 2;
        for (let y = 0; y < SIDE; y += cell) {
          const l = 1 - y / (SIDE - 1);
          for (let x = 0; x < SIDE; x += cell) {
            const c = (PANEL_C * x) / (SIDE - 1);
            const hex = GB().oklchToHex({ l, c, h: state.h });
            let fill = hex;
            const out = !GB().oklchInGamut({ l, c, h: state.h });
            if (out || !inBounds(l, c)) {
              // Shaded: the reduced color mixed toward the panel background, in stripes.
              const p = GB().parseColor(hex);
              const k = ((x + y) >> 2) & 1 ? 0.25 : 0.38;
              fill = GB().toHex({ r: p.r * k + 31 * (1 - k), g: p.g * k + 31 * (1 - k), b: p.b * k + 31 * (1 - k), a: 1 });
            }
            g.fillStyle = fill;
            g.fillRect(x, y, cell, cell);
          }
        }
        drawnHue = state.h;
      }

      /** Draws everything that reads the state: marks, swatch, fields, blocks and the note. */
      function sync() {
        const hex = hexNow();
        if (Math.round(drawnHue) !== Math.round(state.h)) drawPanel();
        const a = ((state.h - 90) * Math.PI) / 180;
        const r = RING / 2 - RING_W / 2;
        ringMark.style.left = `${RING / 2 + Math.cos(a) * r}px`;
        ringMark.style.top = `${RING / 2 + Math.sin(a) * r}px`;
        panelMark.style.left = `${(Math.min(1, state.c / PANEL_C)) * SIDE}px`;
        panelMark.style.top = `${(1 - state.l) * SIDE}px`;
        ring.setAttribute('aria-valuenow', String(Math.round(state.h) % 360));
        ring.setAttribute('aria-valuetext', `Hue ${Math.round(state.h) % 360} degrees`);
        panel.setAttribute('aria-valuenow', fixed(state.l, 2));
        panel.setAttribute('aria-valuetext', `Lightness ${fixed(state.l, 2)}, chroma ${fixed(state.c, 3)}`);
        newSw.style.background = hex;
        newSw.style.color = GB().textOn(hex);
        newSw.title = `Now: ${hex}`;
        fHex.input.value = hex;
        fL.input.value = fixed(state.l, 2);
        fC.input.value = fixed(state.c, 3);
        fH.input.value = fixed(state.h, 0);
        for (const f of [fHex, fL, fC, fH]) f.input.removeAttribute('aria-invalid');
        const reduced = !GB().oklchInGamut(state);
        note.textContent = reduced ? 'Chroma reduced to fit the screen: this hue at this lightness cannot be that colorful.' : '';
        note.hidden = !reduced;
        for (const btn of stepButtons) btn.setAttribute('aria-pressed', String(Number(btn.getAttribute('data-step')) === step));
        const list = blocks(hex, step);
        // The blocks are rebuilt, so a focused block hands focus to its replacement, or the
        // panel when that one is disabled, and Enter and Escape still reach the picker.
        const active = /** @type {HTMLElement | null} */ (document.activeElement);
        const focusedK = active && blockRow.contains(active) ? active.getAttribute('data-k') : null;
        blockRow.replaceChildren(...list.map((bl, i) => {
          const k = i - 2;
          const off = bl.disabled || !inBounds(bl.l, GB().hexToOklch(bl.hex).c);
          const where = k === 0 ? 'the color now' : `${k > 0 ? 'lighter' : 'darker'} by ${Math.abs(k)} ${Math.abs(k) === 1 ? 'step' : 'steps'}`;
          const btn = h('button', {
            type: 'button', class: k === 0 ? 'secondary gb-cp-block gb-cp-cur' : 'secondary gb-cp-block', 'data-color': bl.hex, 'data-k': String(k),
            disabled: off,
            'aria-label': off ? `Lightness ${fixed(bl.l, 2)}, ${where}: unavailable` : `Lightness ${fixed(bl.l, 2)}, ${where}, ${bl.hex}`,
            title: bl.disabled ? `Past ${bl.l < 0 ? 'black' : 'white'}: no ${bl.l < 0 ? 'darker' : 'lighter'} color at this step`
              : off ? 'Outside the range this color allows' : `Lightness ${fixed(bl.l, 2)}: ${bl.hex}`,
            onclick: () => fromBlock(btn),
          });
          if (!off) btn.style.background = bl.hex;
          return btn;
        }));
        if (focusedK !== null) {
          const again = /** @type {HTMLButtonElement | null} */ (blockRow.querySelector(`[data-k="${focusedK}"]`));
          if (again && !again.disabled) again.focus();
          else panel.focus();
        }
        blockLabels.replaceChildren(...list.map((bl, i) => {
          const k = i - 2;
          return h('span', null, k === 0 ? 'now' : `${k > 0 ? '+' : '-'}${Math.abs(k)}`,
            h('b', null, bl.disabled ? `past ${bl.l < 0 ? 'black' : 'white'}` : `L ${fixed(bl.l, 2)}`));
        }));
      }

      // Pointer: the ring sets hue by angle, the panel lightness and chroma by position.
      const drag = (el, at) => {
        el.addEventListener('pointerdown', ev => {
          const pe = /** @type {PointerEvent} */ (ev);
          ev.preventDefault();
          el.focus();
          at(pe);
          if (el.setPointerCapture && pe.pointerId !== undefined) {
            try { el.setPointerCapture(pe.pointerId); } catch { /* not capturable */ }
          }
          const move = m => at(/** @type {PointerEvent} */ (m));
          const up = () => {
            el.removeEventListener('pointermove', move);
            el.removeEventListener('pointerup', up);
            el.removeEventListener('pointercancel', up);
          };
          el.addEventListener('pointermove', move);
          el.addEventListener('pointerup', up);
          el.addEventListener('pointercancel', up);
        });
      };
      drag(ring, ev => {
        const box = ring.getBoundingClientRect();
        const dx = ev.clientX - (box.left + box.width / 2);
        const dy = ev.clientY - (box.top + box.height / 2);
        if (!dx && !dy) return;
        setState({ ...state, h: (Math.atan2(dx, -dy) * 180) / Math.PI });
        emit();
      });
      drag(panel, ev => {
        const box = panel.getBoundingClientRect();
        if (!box.width || !box.height) return;
        const x = clamp((ev.clientX - box.left) / box.width, 0, 1);
        const y = clamp((ev.clientY - box.top) / box.height, 0, 1);
        setState({ l: 1 - y, c: x * PANEL_C, h: state.h });
        emit();
      });
      ring.addEventListener('keydown', ev => {
        const by = ev.shiftKey ? 10 : 1;
        if (ev.key === 'ArrowRight' || ev.key === 'ArrowUp') setState({ ...state, h: state.h + by });
        else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowDown') setState({ ...state, h: state.h - by });
        else return;
        ev.preventDefault();
        emit();
      });
      panel.addEventListener('keydown', ev => {
        if (ev.key === 'ArrowUp') setState({ ...state, l: state.l + 0.01 });
        else if (ev.key === 'ArrowDown') setState({ ...state, l: state.l - 0.01 });
        else if (ev.key === 'ArrowRight') setState({ ...state, c: state.c + 0.005 });
        else if (ev.key === 'ArrowLeft') setState({ ...state, c: state.c - 0.005 });
        else return;
        ev.preventDefault();
        emit();
      });

      /** A press outside the picker and its trigger keeps the color. */
      const outside = ev => {
        if (!dialog.isConnected) {
          teardown();
          return;
        }
        const t = /** @type {Node} */ (ev.target);
        if (dialog.contains(t) || trigger.contains(t)) return;
        // onChange runs once the press has ended, so a redraw it causes does not swallow the
        // click the press began (a click on another role chip still opens that role). A press on
        // another picker's trigger keeps the color at once, as that trigger opens its own picker.
        const other = t instanceof Element && t.closest('.gb-cp-trigger');
        finish('change', !other);
      };
      /** Keeps the picker under its trigger, or above it when there is no room below. */
      const place = () => {
        const tb = trigger.getBoundingClientRect();
        const w = dialog.offsetWidth;
        const ht = dialog.offsetHeight;
        const vw = document.documentElement.clientWidth || window.innerWidth;
        const vh = document.documentElement.clientHeight || window.innerHeight;
        const below = tb.bottom + 4;
        const top = below + ht > vh && tb.top - ht - 4 >= 0 ? tb.top - ht - 4 : below;
        dialog.style.top = `${Math.max(0, top)}px`;
        dialog.style.left = `${clamp(tb.left, 4, Math.max(4, vw - w - 4))}px`;
      };

      function teardown() {
        document.removeEventListener('pointerdown', outside, true);
        window.removeEventListener('scroll', place, true);
        window.removeEventListener('resize', place);
        dialog.remove();
        trigger.setAttribute('aria-expanded', 'false');
        if (openClose === finish) openClose = null;
        close = null;
      }
      /**
       * Closes the picker, returns focus to the trigger, then runs onChange or onCancel once.
       * `afterPress` holds onChange until the pointer press that closed the picker has ended
       * and its click has run.
       */
      function finish(how, afterPress = false) {
        if (close !== finish) return;
        const hex = hexNow();
        teardown();
        if (how === 'change') {
          value = hex;
          paint(hex);
        }
        if (trigger.isConnected) trigger.focus();
        const run = () => {
          if (how === 'change') {
            if (typeof opts.onChange === 'function') opts.onChange(hex);
          } else if (typeof opts.onCancel === 'function') opts.onCancel();
        };
        if (!afterPress) {
          run();
          return;
        }
        const later = () => {
          document.removeEventListener('pointerup', later, true);
          document.removeEventListener('pointercancel', later, true);
          setTimeout(run, 0);
        };
        document.addEventListener('pointerup', later, true);
        document.addEventListener('pointercancel', later, true);
      }

      trigger.after(dialog);
      trigger.setAttribute('aria-expanded', 'true');
      drawRing();
      sync();
      place();
      document.addEventListener('pointerdown', outside, true);
      window.addEventListener('scroll', place, true);
      window.addEventListener('resize', place);
      openClose = finish;
      close = finish;
      panel.focus();
      return finish;
    }

    return trigger;
  }

  return { create, blocks, STEPS, PANEL_C };
});
