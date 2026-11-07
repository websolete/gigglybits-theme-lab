// @ts-check
// Palette Lab for the Theme Lab, laid out to the design council's contract
// (.copirate/working/prototypes/theme-lab-council/CONTRACT-v4.md): numbered steps (1 Start,
// 2 Palette, 3 Frame and accent, 4 Roles, 5 Edit, 6 Try and Save) and a Preview card. From 75rem
// they are two panes, the Preview card and steps 4 and 5 on the right; narrower, one column. render()
// builds each region in the order of the width.
//
// The preview is drawn only in the floating Theme Preview window: renderPreview() draws its
// page (themePreview.js), the whole theme Try in VS Code would apply (themeBuilder.js) as a
// Workbench and the Palette Inspector's widgets (gallery.js). A part clicked there reaches the
// Lab through setPicked(), which opens the Edit dock on its color keys, by role or one key at a
// time; the edits ride along with Try in VS Code and Save theme.
//
// Step 1, Start, has two tabs: Wheel builds a new palette from a harmony rule, Saved lists
// the saved themes (ctx.library) to load one.
//
// The Style groups mode builds a group (a widget family's colors mapped to Editor roles) and
// lists the saved ones (ctx.groups, from gigglybits.groups), with the draft family's card drawn
// on the page. The previews draw the candidate with every group that is on, the draft taking
// the place of the on group of its family, and Try in VS Code sends the same groups.
//
// Palette colors are literal hex values. The live editor text and comment colors come
// from --vscode-* variables in palette.css.
(function () {
  // @ts-ignore provided by shared.js
  const { h, parseColor, toHex, varFor, contrastRatio, contrastGrade, harmony, paletteId, HARMONY_RULES, CHROME_SURFACES } = window.GB;

  const SEED_BACKGROUNDS = ['#121212', '#1e1e1e', '#252526'];
  const DEFAULTS = {
    rule: 'triad', hue: 210, lightness: 0.75, chroma: 0.13, mode: 'generated', pasted: null,
    chromeIndex: 0, surfaces: 'neutral',
    startTab: 'wheel',
  };
  /** A new design starts with a Filled frame in palette color 1. */
  const DEFAULT_FRAME = () => ({ index: 0, style: 'filled' });
  /** The frame an older Try had: Dark, following the editor accent. */
  const darkFrame = index => ({ index, style: 'dark' });
  /** The Start from tabs. A state saved while Paste or Shipped existed opens on Wheel. */
  const START_TABS = ['wheel', 'saved'];

  /**
   * Name and note for the current candidate. `auto` is the default name it was last given; a
   * palette change replaces Name only while Name still equals it. Start from and restoring a
   * Try clear it, so the new palette gets its default name.
   */
  let draft = { id: '', name: '', note: '', auto: '' };
  /**
   * The step 6 result line (CONTRACT-v4 section 7): the text, and what the next change to the
   * candidate turns it into ('try' or 'save'). `pendingSave` is the name a Save sent until a
   * library message holds a theme of that name. `ownName` is the saved theme this design was
   * saved as or loaded from: Name may match it without the Overwrites warning.
   */
  const result = { text: '', after: null, pendingSave: null, ownName: null };
  const sameName = (a, b) => String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
  function setResult(text, after = null) {
    result.text = text;
    result.after = after;
  }
  /** The candidate changed (palette, Frame, Editor or an edit): a Try or Save result goes stale. */
  function markChanged() {
    if (result.after === 'try') setResult('Changed since your last Try');
    else if (result.after === 'save') setResult('Unsaved changes');
  }

  const round = (v, digits) => Number(Number(v).toFixed(digits));

  /** The palette ui state, filled with defaults. */
  function stateOf(ctx) {
    const s = ctx.ui;
    for (const [k, v] of Object.entries(DEFAULTS)) if (s[k] === undefined) s[k] = v;
    if (!START_TABS.includes(s.startTab)) s.startTab = 'wheel';
    // The Paste tab is gone, and with it the text it held.
    delete s.paste;
    // Color edits are an object per state, never the shared default, and always cleaned.
    s.edits = Builder().cleanEdits(s.edits);
    // The frame is an object per state too: { index } or { color }, and a style.
    const f = s.frame;
    const okStyle = f && (f.style === 'filled' || f.style === 'dark');
    const okColor = f && typeof f.color === 'string' && (/^#[0-9a-f]{6}$/i.test(f.color) || Builder().isShift(f.color));
    const okIndex = f && Number.isInteger(f.index) && f.index >= 0;
    if (!okStyle || !(okColor || okIndex)) s.frame = DEFAULT_FRAME();
    // A custom accent (step 3) is a shift from the base, or an older fixed color; anything else goes.
    const a = s.accentColor;
    if (!(typeof a === 'string' && (/^#[0-9a-f]{6}$/i.test(a) || Builder().isShift(a)))) delete s.accentColor;
    // The preview tabs and Pin are gone: the preview window draws the Workbench and the widgets
    // on one page, so a state saved before then drops its tab.
    delete s.previewTab;
    delete s.previewPinned;
    // Widgets in the preview is gone too: the window draws every widget family, so a state
    // saved before then drops its choice.
    delete s.widgets;
    // The style group being built: a family, its rows' roles and a name.
    const g = s.groupDraft;
    const families = Builder().GROUP_FAMILIES;
    if (!g || typeof g !== 'object' || !Object.prototype.hasOwnProperty.call(families, g.family)) {
      s.groupDraft = { family: Object.keys(families)[0], name: '', roles: {} };
    } else {
      if (typeof g.name !== 'string') g.name = '';
      if (!g.roles || typeof g.roles !== 'object') g.roles = {};
    }
    // The open sections: step numbers 1 to 5. A fresh Lab opens on Start alone.
    if (!Array.isArray(s.sections)) s.sections = [1];
    s.sections = s.sections.filter(n => SECTIONS.includes(n));
    shiftFixedColors(s, ctx);
    return s;
  }

  /** The steps that collapse: 1 Start to 5 Edit. Step 6, Try and save, always shows. */
  const SECTIONS = [1, 2, 3, 4, 5];

  /** Opens step `n` in the state, leaving the other steps as they are. */
  function openSection(s, n) {
    if (!s.sections.includes(n)) s.sections = [...s.sections, n].sort();
  }

  // ----------------------------------------------------------------- style groups

  /** The saved style groups the host sent (src/themeLibrary.ts StyleGroup). */
  const groupsOf = ctx => (Array.isArray(ctx.groups) ? ctx.groups : []).filter(g => g && typeof g === 'object');

  /** The draft as { family, roles }, or null while no row names a role. */
  function draftGroup(s) {
    const d = s.groupDraft;
    return d && Object.keys(d.roles).length ? { family: d.family, roles: { ...d.roles } } : null;
  }

  /**
   * The groups the previews draw and Try in VS Code sends, { family, roles } each: every group
   * that is on, with a draft that counts in place of the on group of its family.
   */
  function previewGroups(ctx, s) {
    const draft = draftGroup(s);
    const on = groupsOf(ctx).filter(g => g.on === true && !(draft && g.family === draft.family))
      .map(g => ({ family: g.family, roles: { ...g.roles } }));
    return draft ? [...on, draft] : on;
  }

  function save(ctx) {
    if (typeof ctx.save === 'function') ctx.save();
  }

  /** The current candidate: { source, colors, rule?, baseHue?, lightness?, chroma?, details? }. */
  function candidateOf(s) {
    if (s.mode === 'pasted' && Array.isArray(s.pasted) && s.pasted.length) {
      return { source: 'pasted', colors: s.pasted.slice() };
    }
    const lightness = round(s.lightness, 2);
    const chroma = round(s.chroma, 3);
    const hue = Math.round(s.hue);
    const details = harmony(s.rule, { hue, lightness, chroma });
    return { source: 'generated', rule: s.rule, baseHue: hue, lightness, chroma, colors: details.map(d => d.hex), details };
  }

  function defaultName(c) {
    return c.source === 'generated' ? `${HARMONY_RULES[c.rule].name} ${c.baseHue}°` : `Pasted ${c.colors.length} colors`;
  }

  // @ts-ignore provided by shared.js
  const GBO = hex => window.GB.hexToOklch(hex);

  /** A small color dot. Colors go through el.style: the CSP blocks style attributes. */
  function dot(hex) {
    const el = h('span', { class: 'gb-pl-dot', title: hex });
    el.style.background = hex;
    return el;
  }

  /**
   * One labelled row: the label cell, then the control cell, so every label in a box lines
   * up in one column. A row holding buttons uses a div: a label would forward a click on
   * its text to the first button.
   */
  function fieldRow(name, controls, tag = 'label', title = undefined) {
    return h(tag, { class: 'gb-pl-field' },
      h('span', { class: 'gb-pl-field-name', title }, name),
      h(tag === 'label' ? 'span' : 'div', { class: 'gb-pl-field-control' }, ...controls));
  }

  // ------------------------------------------------------------- the Rule picker

  /** One line on what each harmony rule makes, for the Rule picker. */
  const RULE_NOTES = {
    analogous: 'Neighbors up to 60° either side of the base. Close, calm hues.',
    monochromatic: 'One hue: lighter, darker and softer versions of it.',
    triad: 'Three hues evenly spaced, 120° apart.',
    complementary: 'The base and its opposite, 180° away, with softer versions.',
    'split-complementary': 'The base and the two hues either side of its opposite.',
    square: 'Four hues evenly spaced, 90° apart.',
    compound: 'The base and a neighbor, plus the pair opposite them.',
    shades: 'One hue in five lightness steps.',
  };

  const SVG_NS = 'http://www.w3.org/2000/svg';
  function svg(tag, attrs) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
    return el;
  }

  /**
   * A rule's wheel diagram: a faint hue ring, and each of the rule's colors as a dot at its hue.
   * Dots further out are lighter, so one hue at several lightnesses reads as a spoke.
   */
  function ruleWheel(rule, base, colors, size) {
    const el = svg('svg', { width: size, height: size, viewBox: '-20 -20 40 40', class: 'gb-rule-wheel', 'aria-hidden': 'true' });
    for (let a = 0; a < 360; a += 15) {
      const t1 = ((a - 90) * Math.PI) / 180;
      const t2 = ((a + 15 - 90) * Math.PI) / 180;
      const [r, r2] = [19, 16.5];
      const p = (rad, t) => `${(rad * Math.cos(t)).toFixed(2)} ${(rad * Math.sin(t)).toFixed(2)}`;
      el.append(svg('path', {
        d: `M${p(r, t1)} A${r} ${r} 0 0 1 ${p(r, t2)} L${p(r2, t2)} A${r2} ${r2} 0 0 0 ${p(r2, t1)}Z`,
        fill: window.GB.oklchToHex({ l: 0.6, c: 0.1, h: a + 7.5 }), opacity: 0.8,
      }));
    }
    HARMONY_RULES[rule].slots.forEach(([dh, dl], i) => {
      const t = ((base.hue + dh - 90) * Math.PI) / 180;
      const rad = 5 + ((dl + 0.16) / 0.32) * 8;
      el.append(svg('circle', {
        cx: (rad * Math.cos(t)).toFixed(2), cy: (rad * Math.sin(t)).toFixed(2), r: dh === 0 && dl === 0 ? 4.2 : 3.2,
        fill: colors[i], stroke: '#111', 'stroke-width': 0.8,
      }));
    });
    return el;
  }

  /** A rule's five colors as a strip of blocks. */
  function ruleStrip(colors) {
    return h('span', { class: 'gb-rule-strip', 'aria-hidden': 'true' }, colors.map(hex => {
      const block = h('span', null);
      block.style.background = hex;
      return block;
    }));
  }

  let ruleCount = 0;
  /** Numbers the Wheel sliders' ids, so their labels point at them and two Lab roots never share one. */
  let sliderCount = 0;

  /**
   * The Rule picker (S2 in the walkthrough log): a button showing the rule's wheel diagram, name
   * and five colors at the current base, opening a listbox where every rule shows the same with
   * a line on what it makes. A native select cannot draw colors. Keyboard: arrows, Home, End,
   * Enter or Space to pick, Escape to close, and a letter jumps to the next rule starting with it.
   * `base()` gives { hue, lightness, chroma }, `current()` the rule id, and `onChange` takes an
   * event-like { target: { value } }. Returns { el, sync }: sync() redraws for a new base or rule.
   */
  function rulePicker(base, current, onChange) {
    const id = `gb-rule-${++ruleCount}`;
    const ids = Object.keys(HARMONY_RULES);
    const colorsOf = rule => window.GB.harmony(rule, base()).map(d => d.hex);
    let active = 0;
    const button = h('button', {
      type: 'button', class: 'gb-rule-btn gb-pl-rule', 'aria-haspopup': 'listbox', 'aria-expanded': 'false', 'aria-controls': `${id}-list`,
      onclick: () => (list.hidden ? openList() : closeList(true)),
      onkeydown: ev => {
        if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(ev.key)) {
          ev.preventDefault();
          openList();
        }
      },
    });
    const list = h('div', {
      class: 'gb-rule-list', role: 'listbox', id: `${id}-list`, tabindex: '-1', 'aria-label': 'Harmony rule',
      onkeydown: ev => {
        const move = to => {
          ev.preventDefault();
          active = (to + ids.length) % ids.length;
          paintActive();
        };
        if (ev.key === 'ArrowDown') move(active + 1);
        else if (ev.key === 'ArrowUp') move(active - 1);
        else if (ev.key === 'Home') move(0);
        else if (ev.key === 'End') move(ids.length - 1);
        else if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          choose(ids[active]);
        } else if (ev.key === 'Escape') {
          ev.preventDefault();
          ev.stopPropagation();
          closeList(true);
        } else if (ev.key === 'Tab') closeList(false);
        else if (/^[a-z]$/i.test(ev.key)) {
          const from = ids.findIndex((rid, i) => i > active && HARMONY_RULES[rid].name.toLowerCase().startsWith(ev.key.toLowerCase()));
          const at = from >= 0 ? from : ids.findIndex(rid => HARMONY_RULES[rid].name.toLowerCase().startsWith(ev.key.toLowerCase()));
          if (at >= 0) move(at);
        }
      },
      onfocusout: ev => {
        if (!el.contains(/** @type {Node | null} */ (ev.relatedTarget))) closeList(false);
      },
    });
    list.hidden = true;
    const el = h('div', { class: 'gb-rule' }, button, list);

    function optionId(i) { return `${id}-o${i}`; }
    function paintActive() {
      list.querySelectorAll('[role="option"]').forEach((o, i) => o.classList.toggle('gb-rule-active', i === active));
      list.setAttribute('aria-activedescendant', optionId(active));
      const o = list.querySelector(`#${optionId(active)}`);
      if (o && typeof o.scrollIntoView === 'function') o.scrollIntoView({ block: 'nearest' });
    }
    function drawOptions() {
      const b = base();
      list.replaceChildren(...ids.map((rid, i) => {
        const colors = colorsOf(rid);
        return h('div', {
          class: 'gb-rule-opt', role: 'option', id: optionId(i), 'data-rule': rid, 'aria-selected': String(rid === current()),
          onmousedown: ev => ev.preventDefault(),
          onclick: () => choose(rid),
        }, ruleWheel(rid, b, colors, 40),
        h('span', { class: 'gb-rule-text' }, h('span', { class: 'gb-rule-name' }, HARMONY_RULES[rid].name), h('span', { class: 'gb-rule-note' }, RULE_NOTES[rid] || '')),
        ruleStrip(colors));
      }));
    }
    /**
     * Places the open list against the window under the button (above it when there is more room
     * there), so a column that scrolls on its own, such as the wide layout's task column, cannot
     * clip it. A scroll outside the list closes it, since the button has moved away.
     */
    function place() {
      if (typeof button.getBoundingClientRect !== 'function') return;
      const r = button.getBoundingClientRect();
      const vw = window.innerWidth || 0;
      const vh = window.innerHeight || 0;
      if (!(vw > 0 && vh > 0 && r.width > 0)) return;
      const width = Math.max(r.width, Math.min(480, vw - 16));
      const left = Math.max(8, Math.min(r.left, vw - width - 8));
      const below = vh - r.bottom - 8;
      const above = r.top - 8;
      const up = below < 240 && above > below;
      Object.assign(list.style, {
        position: 'fixed', left: `${left}px`, width: `${width}px`,
        top: up ? '' : `${r.bottom + 2}px`, bottom: up ? `${vh - r.top + 2}px` : '',
        maxHeight: `${Math.max(160, Math.min(384, up ? above : below))}px`,
      });
    }
    const onScroll = ev => {
      if (!list.contains(/** @type {Node} */ (ev.target))) closeList(false);
    };
    function openList() {
      active = Math.max(0, ids.indexOf(current()));
      drawOptions();
      list.hidden = false;
      place();
      window.addEventListener('scroll', onScroll, true);
      window.addEventListener('resize', onScroll);
      button.setAttribute('aria-expanded', 'true');
      paintActive();
      list.focus();
    }
    function closeList(refocus) {
      if (list.hidden) return;
      list.hidden = true;
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
      button.setAttribute('aria-expanded', 'false');
      if (refocus) button.focus();
    }
    function choose(rid) {
      closeList(true);
      if (rid !== current()) onChange({ target: { value: rid } });
    }
    function sync() {
      const rule = current();
      const colors = colorsOf(rule);
      button.setAttribute('aria-label', `Harmony rule: ${HARMONY_RULES[rule].name}`);
      button.replaceChildren(ruleWheel(rule, base(), colors, 26), h('span', { class: 'gb-rule-name' }, HARMONY_RULES[rule].name), ruleStrip(colors),
        h('span', { class: 'codicon codicon-chevron-down gb-rule-chev', 'aria-hidden': 'true' }));
      if (!list.hidden) drawOptions();
    }
    sync();
    return { el, sync };
  }

  // ------------------------------------------------------------------ pieces

  /** What each reference background is, for the step 2 column headings. */
  const BACKGROUND_NAMES = {
    '#121212': ['Near black', 'A near-black background, darker than most dark themes'],
    '#1e1e1e': ['Dark editor', 'The editor background of VS Code\'s Dark+ theme'],
    '#252526': ['Dark side bar', 'The side bar background of VS Code\'s Dark+ theme'],
  };

  /** The step 2 columns: { hex, label, about } for each reference background, then the live editor's. */
  function columnsOf(ctx) {
    return [
      ...SEED_BACKGROUNDS.map(hex => ({ hex, label: BACKGROUND_NAMES[hex][0], about: BACKGROUND_NAMES[hex][1] })),
      { hex: ctx.liveBackground, label: 'Your editor', about: 'The editor background of the theme you are using now' },
    ];
  }

  /**
   * What a contrast grade means for the reader, keyed by contrastGrade's class. The thresholds
   * are WCAG's: 4.5:1 for normal text, 3:1 for large text and for icons and borders.
   */
  const GRADE_MEANING = {
    aaa: 'easy to read at any size',
    aa: 'fine for normal text',
    large: 'only for large or bold text, icons and borders',
    fail: 'hard to read; avoid it for text',
  };

  /** How readable a grade is, for the start of a ratio's tooltip. */
  const GRADE_VERDICT = {
    aaa: 'Easy to read at any size',
    aa: 'Readable as normal text',
    large: 'Fine for icons, borders and large text; too faint for normal text',
    fail: 'Hard to read; avoid it for text',
  };

  /**
   * A ratio's tooltip: how readable it is first, then what was measured and the ratio, then an
   * optional note. 'Readable as normal text. #dc8fd5 on Dark side bar (#252526): 6.5:1.'
   */
  function ratioTitle(ratio, what, note = '') {
    const [cls] = contrastGrade(ratio);
    return `${GRADE_VERDICT[cls]}. ${what}: ${ratio.toFixed(1)}:1.${note ? ` ${note}` : ''}`;
  }

  /** Which color is weakest, and on which background: { ratio, hex, bg } (bg as a hex). */
  function lowestOf(colors, columns) {
    let lowest = null;
    for (const hex of colors) {
      const fg = parseColor(hex);
      for (const col of columns) {
        const ratio = contrastRatio(fg, parseColor(col.hex));
        if (!lowest || ratio < lowest.ratio) lowest = { ratio, hex, bg: col.hex };
      }
    }
    return lowest;
  }

  const GRADE_TAGS = { aaa: 'AAA', aa: 'AA', large: 'Large', fail: 'Fail' };

  /** Each color's weakest pair: [{ hex, ratio, col }], col being the column it is weakest on. */
  function weakestPerColor(colors, columns) {
    return colors.map(hex => {
      const fg = parseColor(hex);
      let best = null;
      for (const col of columns) {
        const ratio = contrastRatio(fg, parseColor(col.hex));
        if (!best || ratio < best.ratio) best = { hex, ratio, col };
      }
      return best;
    });
  }

  /**
   * Step 6's readability sentence, from weakestPerColor: how many colors read well as normal
   * text on every background, then the ones that do not, by name.
   */
  function readabilitySummary(worst) {
    const graded = worst.map(w => ({ ...w, cls: contrastGrade(w.ratio)[0] }));
    const good = graded.filter(w => w.cls === 'aaa' || w.cls === 'aa').length;
    const list = ws => ws.map(w => w.hex).join(', ');
    const large = graded.filter(w => w.cls === 'large');
    const fail = graded.filter(w => w.cls === 'fail');
    const parts = [good === graded.length
      ? `All ${graded.length} colors read well as normal text on every background.`
      : `${good} of ${graded.length} colors read well as normal text on every background.`];
    if (large.length) parts.push(`${list(large)} ${large.length === 1 ? 'suits' : 'suit'} only large text, icons and borders.`);
    if (fail.length) parts.push(`${list(fail)} ${fail.length === 1 ? 'is' : 'are'} hard to read on some backgrounds.`);
    return parts.join(' ');
  }

  /**
   * What a ratio cell rates, drawn: "Aa" in `hex`, once at normal text size and once large and
   * bold, the two sizes the grades are about; the cell's swatch carries the background. Hidden
   * from screen readers, since the cell's title and badge already say the same.
   */
  function contrastSample(hex) {
    const sample = h('span', { class: 'gb-pl-sample', 'aria-hidden': 'true' },
      h('span', { class: 'gb-pl-sample-normal' }, 'Aa'),
      h('span', { class: 'gb-pl-sample-large' }, 'Aa'));
    sample.style.color = hex;
    return sample;
  }

  /**
   * Step 2: one row per palette color, a swatch chip that copies its hex, the hex over its
   * L C H values, then on each background one swatch holding a sample of the color as text and
   * its ratio and grade. The weakest cell, the same one the step 2 heading names (lowestOf), is outlined and
   * says so in its text.
   */
  function contrastTable(colors, details, columns, ctx) {
    const low = lowestOf(colors, columns);
    let marked = false;
    const rows = colors.map((hex, i) => {
      const fg = parseColor(hex);
      const d = details ? details[i] : GBO(hex);
      const chip = h('button', { class: 'gb-pl-swatch secondary', title: `Copy ${hex}`, 'aria-label': `Copy ${hex}`, onclick: () => ctx.copy(hex) });
      chip.style.background = hex;
      return h('tr', null,
        h('th', { scope: 'row' },
          h('div', { class: 'gb-pl-color-cell' }, chip,
            h('span', { class: 'gb-pl-color-text' },
              h('span', { class: 'gb-pl-hex' }, hex),
              d ? h('span', { class: 'gb-pl-oklch muted', title: 'OKLCH values: L is lightness (0 black, 1 white), C is chroma (0 gray, higher more vivid), H is hue in degrees' }, `L ${d.l.toFixed(2)} C ${d.c.toFixed(3)} H ${Math.round(d.h)}`) : null))),
        columns.map(col => {
          const ratio = contrastRatio(fg, parseColor(col.hex));
          const [cls, words] = contrastGrade(ratio);
          const weakest = !marked && hex === low.hex && col.hex === low.bg;
          if (weakest) marked = true;
          const title = ratioTitle(ratio, `${hex} on ${col.label} (${col.hex})`, weakest ? 'The weakest pair in the palette.' : '');
          const swatch = h('div', { class: 'gb-pl-ratio-cell' },
            contrastSample(hex),
            h('span', { class: `badge ${cls}` },
              `${ratio.toFixed(1)}`, h('span', { class: 'gb-pl-grade' }, ` ${GRADE_TAGS[cls] || words}`)));
          swatch.style.background = col.hex;
          return h('td', { class: weakest ? 'gb-pl-ratio gb-pl-weakest' : 'gb-pl-ratio', 'data-ratio': String(ratio), 'data-bg': col.hex, title },
            swatch,
            weakest ? h('span', { class: 'gb-sr' }, ', weakest') : null);
        }));
    });
    const head = h('tr', null,
      h('th', { scope: 'col' }, 'Palette color'),
      columns.map(col => h('th', { scope: 'col', title: `${col.about} (${col.hex})` },
        h('span', { class: 'gb-pl-bg-name' }, col.label), h('span', { class: 'gb-pl-bg-hex muted' }, col.hex))));
    return h('div', { class: 'gb-pl-table-wrap' },
      h('table', { class: 'gb-pl-contrast' },
        h('caption', { class: 'gb-sr' }, 'Contrast of each palette color as text on each background'),
        h('thead', null, head),
        h('tbody', null, rows)));
  }

  /** Step 2's opening line: what the table's numbers are. */
  function contrastIntro() {
    return h('p', { class: 'gb-pl-intro muted' },
      'How readable each palette color is as text on four dark backgrounds. Each cell shows "Aa" in the color, at normal size and large and bold, then its contrast ratio: higher reads more easily, from 1 (invisible) to 21 (black on white).');
  }

  /**
   * Names the grade thresholds on one line, each grade's badge and its range ('7:1+'), so the
   * badge colors and the short grade names never carry the meaning alone. What each grade means
   * is in its tooltip, and in hidden text for screen readers.
   */
  function contrastLegend() {
    return h('div', { class: 'gb-pl-legend', role: 'list', 'aria-label': 'What the grades mean' },
      h('span', { class: 'gb-pl-legend-l', 'aria-hidden': 'true' }, 'Grades'),
      [['aaa', 'AAA', '7:1+', '7:1 or more'], ['aa', 'AA', '4.5:1+', '4.5:1 or more'], ['large', 'Large', '3:1+', '3:1 or more'], ['fail', 'Fail', 'under 3:1', 'under 3:1']]
        .map(([cls, tag, short, range]) => h('span', { class: 'gb-pl-legend-row', role: 'listitem', title: `${tag}, ${range}: ${GRADE_MEANING[cls]}` },
          h('span', { class: `badge ${cls}` }, tag),
          h('span', null, short),
          h('span', { class: 'gb-sr' }, `: ${GRADE_MEANING[cls]}`))));
  }

  // ------------------------------------------------------------- candidate theme

  // @ts-ignore provided by themeBuilder.js
  const Builder = () => window.GBBuilder;
  // @ts-ignore provided by gallery.js
  const Gallery = () => window.GBGallery;

  const noEdits = () => ({ swatches: {}, keys: {} });
  const editCount = edits => Object.keys(edits.swatches).length + Object.keys(edits.keys).length;

  /** Every widget family the preview window draws, in the gallery's order, most important first. */
  const widgetFamilies = () => Gallery().cards.map(c => c.id).filter(id => id !== 'workbench');
  const REGION_NAMES = {
    titleBar: 'the title bar', activityBar: 'the activity bar', sideBar: 'the side bar', tabs: 'the editor tabs',
    editorGroup: 'the second editor group', panel: 'the panel', chat: 'the chat view', statusBar: 'the status bar',
  };

  /**
   * The theme Try in VS Code would apply (media/themeBuilder.js, the same code the host runs),
   * Frame and style groups included. A folder's own color is not drawn: the preview shows the
   * theme alone.
   */
  function themeOf(candidate, s, groups = []) {
    const { index, chrome, entry } = inputsOf(candidate, s);
    const B = Builder();
    // A key edited to VS Code's default is left out, so the drawing shows it unset: a modern UI
    // key in VS Code's worked-out default (galleryContext), any other in the Lab's own color.
    const colors = Object.fromEntries(Object.entries(B.buildColors(entry, chrome, s.edits, groups)).filter(([, v]) => v !== B.DEFAULT_COLOR));
    return {
      index, chrome, entry, groups, colors,
      sw: B.swatches(entry, chrome, s.edits),
      tokens: B.tokenColors(entry, chrome, s.edits, groups),
    };
  }

  /** The candidate's base color: the Wheel's Base color, or a pasted palette's first color. */
  function baseHexOf(candidate) {
    return Builder().baseColor({
      mode: candidate.source, hue: candidate.baseHue, lightness: candidate.lightness, chroma: candidate.chroma, colors: candidate.colors,
    });
  }

  /** What the builder takes for the candidate: the accent index, the chrome choices and the entry (palette and base). */
  function inputsOf(candidate, s) {
    const index = Math.min(Number(s.chromeIndex) || 0, candidate.colors.length - 1);
    const chrome = { index, ...(s.accentColor ? { color: s.accentColor } : {}), surfaces: s.surfaces, frame: s.frame, ...roleSettingsOf(s) };
    const entry = { colors: candidate.colors, base: baseHexOf(candidate) };
    return { index, chrome, entry };
  }

  /** The edits and frame last checked for fixed colors, so a state with none left is not checked again. */
  let fixedChecked = '';

  /**
   * Turns the fixed colors an older state, a saved theme or a Try holds into shifts that follow
   * the palette (media/themeBuilder.js toShifts): each edit is measured from the color it
   * replaces, and a custom frame color from the base color. A key the theme leaves unset keeps
   * its fixed color, having nothing to measure from.
   */
  function shiftFixedColors(s, ctx) {
    const sig = JSON.stringify([s.edits, s.frame]);
    if (sig === fixedChecked) return;
    const B = Builder();
    const fixed = v => typeof v === 'string' && v.startsWith('#');
    const frameFixed = fixed(s.frame.color);
    const editsFixed = [...Object.values(s.edits.swatches), ...Object.values(s.edits.keys)].some(fixed);
    if (frameFixed || editsFixed) {
      const { chrome, entry } = inputsOf(candidateOf(s), s);
      if (frameFixed) s.frame = { color: B.shiftFor(s.frame.color, entry.base), style: s.frame.style };
      if (editsFixed) s.edits = B.toShifts(entry, { ...chrome, frame: s.frame }, s.edits, previewGroups(ctx, s));
    }
    fixedChecked = JSON.stringify([s.edits, s.frame]);
  }

  /**
   * What gallery.js renderParts needs: the candidate's colors as its model, its token rules, and
   * VS Code's modern UI settings (null draws the classic workbench). The drawing's colors, which
   * `colors` carries for scoped(), add VS Code's defaults for the modern UI keys the candidate
   * leaves unset (GB.modernUIDefaults); the candidate's own colors, which the edit panel reads,
   * are not changed.
   */
  function galleryContext(colors, tokens, modernUI = null) {
    const drawn = { ...colors, ...window.GB.modernUIDefaults(colors) };
    const byKey = new Map();
    for (const [key, value] of Object.entries(drawn)) {
      const rgba = parseColor(value);
      if (rgba) byKey.set(key, { key, prop: varFor(key), value, rgba, hex: toHex(rgba), source: 'theme' });
    }
    const rules = tokens.map(r => ({ scope: r.scope.join(', '), foreground: r.settings.foreground, fontStyle: r.settings.fontStyle, origin: 'candidate' }));
    return { model: { byKey, tokens: rules }, tokens: rules, modernUI: modernUI || undefined, colors: drawn };
  }

  /**
   * The gallery paints with var(--vscode-*); redefining those variables on a wrapper makes
   * everything inside it draw in the candidate's colors instead of the active theme's.
   */
  function scoped(colors, node) {
    const el = h('div', { class: 'gb-pl-scope' }, node);
    for (const [key, value] of Object.entries(colors)) el.style.setProperty(varFor(key), value);
    return el;
  }

  /**
   * Fits a drawing to its frame (CONTRACT-v4 section 4). The zoom is the frame's width over the
   * drawing's natural width, never above 1, so parts are never drawn larger than full size.
   * Where the frame has a height of its own (the stage's preview row, or the narrow band up to
   * 45vh), a drawing taller than the frame is zoomed down to fit it, and the Workbench window's
   * middle row (activity bar, side bars, editor) grows to fill the height left. On a window under
   * 800px tall the wide stage keeps the height it has with the Edit dock open, so the drawing
   * does not rescale under the pointer when a pick opens the dock.
   */
  function fitToWidth(frame) {
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      const inner = /** @type {HTMLElement | null} */ (frame.firstElementChild);
      if (!inner) return;
      const wb = /** @type {HTMLElement | null} */ (inner.querySelector(':scope > .wb'));
      inner.style.zoom = '';
      if (wb) wb.style.height = '';
      const have = frame.clientWidth;
      let zoom = have > 0 ? Math.min(1, have / inner.scrollWidth) : 1;
      // Only the Lab's preview row gives the frame a height of its own (palette.css .gb-preview
      // .gb-pl-fit); elsewhere, as in the Theme Preview window, the frame is as tall as the drawing.
      let room = frame.closest('.gb-preview') ? frame.clientHeight : 0;
      const lab = frame.closest('.gb-palette');
      const stage = frame.closest('.gb-stage');
      if (room > 0 && lab && stage && lab.hasAttribute('data-wide') && !lab.hasAttribute('data-docked') && window.innerHeight < 800) {
        const line = stage.querySelector('.gb-s4-line');
        room -= Math.max(0, Math.round(stage.clientHeight * 0.45) - (line ? line.offsetHeight : 0));
      }
      const natural = inner.offsetHeight;
      if (room > 0 && natural > 0) {
        if (natural * zoom > room) zoom = room / natural;
        else if (wb && natural * zoom < room - 1) wb.style.height = `${Math.floor(room / zoom - (natural - wb.offsetHeight))}px`;
      }
      inner.style.zoom = zoom < 1 ? String(Math.max(0.25, zoom)) : '';
    });
    ro.observe(frame);
  }

  /** The part that was clicked: its card, its position among the card's parts, and its keys. */
  let picked = null;
  /**
   * The Edit dock: 'closed', 'open', or 'min' (its one-line heading, kept while edits exist);
   * the key row whose edit strip is open; whether
   * the Edits list is open; and the dock body's scroll position, kept through a redraw. `scope`
   * is { key, value } once a key's color editor is switched to 'key' (this key only) or 'role'
   * (every key in its role); without one, keyEditor picks from the edits.
   */
  const dock = { state: 'closed', key: null, scope: null, edits: false, scroll: 0 };
  /**
   * The ui state the pick and the dock belong to. The Theme Lab redraws with the same state
   * object, so they survive its redraws; a render with another state starts with neither.
   */
  let pickOwner = null;
  function ownPick(ui) {
    if (ui === pickOwner) return;
    pickOwner = ui;
    picked = null;
    Object.assign(result, { text: '', after: null, pendingSave: null, ownName: null });
    groupsMode = false;
    newGroupOpen = false;
    Object.assign(dock, { state: 'closed', key: null, scope: null, edits: false, scroll: 0 });
    Object.assign(rolesUi, { shown: [], open: null });
    highlighted = '';
  }
  /**
   * Opens the dock on a pick, with the first key's strip open, and opens step 5 in `ui`; the
   * other steps stay open or collapsed as they were.
   */
  function openDockOn(part, ui) {
    picked = part;
    Object.assign(dock, { state: 'open', key: part.keys[0] || part.around[0] || null, scope: null, scroll: 0 });
    if (!Array.isArray(ui.sections)) ui.sections = [1];
    openSection(ui, 5);
  }

  function describePart(part, card, scope) {
    const keys = (part.getAttribute('data-keys') || '').split(' ').filter(Boolean);
    const around = [];
    for (let n = part.parentElement; n && n !== scope && around.length < 6; n = n.parentElement) {
      for (const k of (n.getAttribute('data-keys') || '').split(' ').filter(Boolean)) {
        if (!keys.includes(k) && !around.includes(k)) around.push(k);
      }
    }
    const regionEl = part.closest('[data-region]');
    // A whole region is named by the region, not by its run-together text.
    const words = [];
    if (!part.hasAttribute('data-region')) {
      const walk = document.createTreeWalker(part, NodeFilter.SHOW_TEXT);
      for (let n = walk.nextNode(); n; n = walk.nextNode()) words.push(n.nodeValue);
    }
    const text = words.join(' ').trim().replace(/\s+/g, ' ');
    return {
      card,
      index: [...scope.querySelectorAll('[data-keys]')].indexOf(part),
      keys,
      around: around.slice(0, 6),
      label: text.length > 40 ? `${text.slice(0, 39)}...` : text,
      region: regionEl ? regionEl.getAttribute('data-region') : null,
      fixed: part.getAttribute('data-fixed'),
    };
  }

  /**
   * Makes a preview pickable: hovering outlines the innermost painted part, clicking selects it.
   * A pick made before a redraw is marked again on the redrawn part.
   */
  function pickable(scope, card, onPick) {
    const parts = [...scope.querySelectorAll('[data-keys]')];
    if (picked && picked.card === card && parts[picked.index]) parts[picked.index].classList.add('gb-pl-picked');
    scope.addEventListener('mouseover', ev => {
      scope.querySelectorAll('.gb-pl-hover').forEach(el => el.classList.remove('gb-pl-hover'));
      const part = /** @type {Element} */ (ev.target).closest('[data-keys]');
      if (part && scope.contains(part)) part.classList.add('gb-pl-hover');
    });
    scope.addEventListener('mouseleave', () => scope.querySelectorAll('.gb-pl-hover').forEach(el => el.classList.remove('gb-pl-hover')));
    scope.addEventListener('click', ev => {
      const part = /** @type {Element} */ (ev.target).closest('[data-keys]');
      if (!part || !scope.contains(part)) return;
      onPick(describePart(part, card, scope));
    });
  }

  /** The Workbench drawing, pickable, fitted to its frame, with the contrast badges under it. */
  function workbenchDrawing(theme, gctx, onPick) {
    const [part] = Gallery().renderParts(gctx, ['workbench']);
    const scope = scoped(gctx.colors, part.preview);
    pickable(scope, 'workbench', onPick);
    // The frame takes focus when the Edit dock closes (tabindex -1: not in the tab order).
    const fit = h('div', { class: 'gb-pl-fit', tabindex: '-1', 'aria-label': 'Workbench drawing' }, scope);
    fitToWidth(fit);
    return { node: h('div', { class: 'gb-pl-stage-main' }, fit, chromeReadout(theme.colors)), info: part.info };
  }

  /** One pickable card per chosen widget family, and each card's contrast info by id. */
  function widgetCards(theme, gctx, chosen, onPick) {
    const parts = Gallery().renderParts(gctx, chosen);
    const infos = {};
    const cards = parts.map(p => {
      infos[p.id] = p.info;
      const scope = scoped(gctx.colors, p.preview);
      pickable(scope, p.id, onPick);
      const worst = p.info.worst;
      return h('section', { class: 'gb-pl-widget', 'data-card': p.id },
        h('div', { class: 'gb-pl-widget-head' },
          h('h4', null, p.title),
          worst ? (() => {
            const [cls, words] = contrastGrade(worst.ratio);
            return h('span', { class: 'muted', title: ratioTitle(worst.ratio, `${worst.fg} on ${worst.bg}`, 'The weakest pair on this card.') }, `weakest contrast (${words}) `, h('span', { class: `badge ${cls}` }, `${worst.ratio.toFixed(1)}:1`));
          })() : null),
        p.blurb ? h('p', { class: 'muted gb-pl-widget-blurb' }, p.blurb) : null,
        h('div', { class: 'gb-pl-widget-preview' }, scope));
    });
    return { node: h('div', { class: 'gb-pl-stage-main gb-pl-widget-list' }, cards.length ? cards : h('p', { class: 'muted' }, 'No widget families to draw.')), infos };
  }

  /** Text and accent contrast for the chrome, as badges. */
  function chromeReadout(colors) {
    const checks = [
      ['Title bar text', 'titleBar.activeForeground', 'titleBar.activeBackground'],
      ['Activity bar icons', 'activityBar.foreground', 'activityBar.background'],
      ['Status bar text', 'statusBar.foreground', 'statusBar.background'],
      ['Active tab line', 'tab.activeBorderTop', 'editor.background'],
      ['Chat input border', 'inlineChatInput.border', 'sideBar.background'],
    ];
    const lead = h('span', { class: 'gb-ch-readout-l', title: 'Contrast between each part and what is behind it. Higher is easier to see; 4.5:1 suits text, 3:1 suits icons and lines.' }, 'Contrast:');
    return h('div', { class: 'gb-ch-readout' }, lead, checks.filter(([, fg, bg]) => parseColor(colors[fg]) && parseColor(colors[bg])).map(([label, fg, bg]) => {
      const ratio = contrastRatio(parseColor(colors[fg]), parseColor(colors[bg]));
      const [cls] = contrastGrade(ratio);
      return h('span', { class: 'gb-ch-check', 'data-check': fg, title: ratioTitle(ratio, label) },
        `${label} `, h('span', { class: `badge ${cls}` }, `${ratio.toFixed(1)}:1`));
    }));
  }

  // ------------------------------------------------------------------- editing

  /**
   * The Lab's color picker (media/colorPicker.js), a trigger labelled `label` showing `value`.
   * window.GBColorPicker is read only here, when a picker is made, so the Theme Preview page,
   * which does not load colorPicker.js, never needs it. `snapshot()` runs as the picker opens;
   * `input(hex)` runs on every change, `change(hex)` once when the color is kept, and on Escape
   * the step 6 result line goes back to what it said at the open and `cancel(snap)` puts back
   * the part of the state this place changed.
   * @param {{ label: string, value: string, className: string, bounds?: any, snapshot: () => any, input: (hex: string) => void, change: (hex: string) => void, cancel: (snap: any) => void }} o
   */
  function colorPicker(o) {
    let before = null;
    let resultBefore = null;
    // @ts-ignore provided by colorPicker.js
    const trigger = window.GBColorPicker.create({
      label: o.label, value: String(o.value || '#000000').slice(0, 7), className: o.className, bounds: o.bounds,
      onInput: o.input,
      onChange: hex => {
        before = null;
        o.change(hex);
      },
      onCancel: () => {
        const snap = before;
        before = null;
        if (resultBefore) Object.assign(result, resultBefore);
        o.cancel(snap);
      },
    });
    // The picker's own click handler runs first, so an open picker is a fresh one.
    trigger.addEventListener('click', () => {
      if (trigger.getAttribute('aria-expanded') !== 'true') return;
      before = o.snapshot();
      resultBefore = { text: result.text, after: result.after };
    });
    return trigger;
  }

  /**
   * How `now` differs from `preferred`, the color the palette gives, in words: lighter or darker,
   * more vivid or grayer, and the hue turn. Lightness runs 0 to 1 and chroma 0 to about 0.3; a
   * difference too small to see is left out.
   */
  function shiftWords(preferred, now) {
    const a = GBO(preferred.slice(0, 7));
    const b = GBO(now.slice(0, 7));
    const parts = [];
    const dl = b.l - a.l;
    const dc = b.c - a.c;
    if (Math.abs(dl) >= 0.005) parts.push(`${dl > 0 ? 'lighter' : 'darker'} by ${Math.abs(dl).toFixed(2)}`);
    if (Math.abs(dc) >= 0.003) parts.push(`${dc > 0 ? 'more vivid' : 'grayer'} by ${Math.abs(dc).toFixed(3)}`);
    if (a.c >= 0.02 && b.c >= 0.02) {
      const dh = ((((b.h - a.h) % 360) + 540) % 360) - 180;
      if (Math.abs(dh) >= 1) parts.push(`hue ${dh > 0 ? '+' : '-'}${Math.round(Math.abs(dh))}°`);
    }
    const alphaOf = hex => (hex.length === 9 ? Math.round(parseInt(hex.slice(7), 16) / 2.55) : 100);
    if (alphaOf(now) !== alphaOf(preferred)) parts.push(`${alphaOf(now)}% opacity`);
    return parts.length ? parts.join(', ') : 'no visible change';
  }

  /**
   * The line under an edited color (D5 in the walkthrough log): the color the palette gives with
   * a dot, how far the edit moves it, and whether the readability lift raised it. `edit` is the
   * stored value; null when there is no edit, so nothing is drawn.
   */
  function shiftNote(preferred, now, edit) {
    if (!edit || edit === Builder().DEFAULT_COLOR || typeof preferred !== 'string' || !/^#[0-9a-f]{6}/i.test(preferred) || !/^#[0-9a-f]{6}/i.test(now || '')) return null;
    const B = Builder();
    const raised = B.isShift(edit) && now.length === 7 && B.applyShift(edit, preferred).slice(0, 7) !== now.slice(0, 7);
    return h('p', {
      class: 'gb-shift muted',
      title: 'The edit is kept as this difference, so it moves with the palette when the base color or rule changes. Lightness runs from 0 (black) to 1 (white); chroma from 0 (gray) to about 0.3 (most vivid); hue is degrees around the color wheel.',
    }, dot(preferred), h('span', null, `Palette gives ${preferred.slice(0, 7)}; this edit: ${shiftWords(preferred, now)}.`),
    raised ? h('span', { class: 'gb-shift-raised' }, ' Raised to stay readable on the editor background.') : null);
  }

  /** The Lab's edits as a copy that later edits cannot change. */
  const copyEdits = edits => ({ swatches: { ...edits.swatches }, keys: { ...edits.keys } });

  /** Focuses `selector` in the Lab around `el` after a redraw has replaced `el`. */
  function refocusNear(el, selector) {
    const lab = el.closest('.gb-palette');
    return () => {
      const next = lab && /** @type {HTMLElement | null} */ (lab.querySelector(selector));
      if (next) next.focus();
    };
  }

  /** What the dock's heading says the pick is: its text and its region, or the whole region. */
  function pickedWhat(part) {
    if (!part) return '';
    const region = part.region && REGION_NAMES[part.region];
    if (!part.label && region) return `The whole of ${region}`;
    // The widget family it is in leads, 'Buttons: Commit'; a Workbench part names its region instead.
    const g = Gallery();
    const card = g && Array.isArray(g.cards) && part.card !== 'workbench' ? g.cards.find(c => c.id === part.card) : null;
    return `${card ? `${card.title}: ` : ''}${part.label || 'The selected part'}${region ? `, in ${region}` : ''}`;
  }

  /**
   * The Edit dock (CONTRACT-v4 section 1, "Wide, a part picked"): a labelled region headed by
   * the part (step 5's heading above it says '5 Edit'), an Edits (n) list, Reset all and a close button; then one
   * line per key of the pick and of the box around it, each a button that opens the one edit
   * strip (the role's color for every key in it, and this key alone). With no pick, a line
   * points to the preview window and to step 4, Roles. `act.close` closes it.
   * With the dock at 'min', only its heading line is drawn.
   */
  function editDock(theme, ctx, info, edit, act) {
    const s = stateOf(ctx);
    const B = Builder();
    const keyCount = swatch => (B.KEY_GROUPS[swatch] || []).length;
    const roleName = swatch => (B.SWATCHES[swatch] ? B.SWATCHES[swatch][0] : swatch);
    // The modern UI keys the theme leaves unset are drawn in VS Code's worked-out defaults, so
    // the dock shows those values rather than calling the keys unset.
    const modernDefaults = window.GB.modernUIDefaults(theme.colors);
    const reset = (label, clear) => h('button', { class: 'secondary gb-pl-reset', title: label, onclick: () => edit(clear, true) }, 'Reset');
    const setRole = swatch => (value, done) => edit(e => { e.swatches[swatch] = value; }, done);
    const setKey = key => (value, done) => edit(e => { e.keys[key] = value; }, done);
    const edits = s.edits;
    const count = editCount(edits);
    const id = `gb-dock-h-${++dockCount}`;

    // Step 5's own heading, above the dock, says '5 Edit'; the dock's names the part.
    const heading = h('h4', { class: 'gb-dock-h', id }, h('span', { class: 'gb-dock-what' }, pickedWhat(picked) || 'No part picked'));
    const section = h('section', {
      class: 'gb-pl-edit gb-dock', role: 'region', 'aria-labelledby': id,
      onkeydown: ev => { if (ev.key === 'Escape') { ev.preventDefault(); act.close(); } },
    });
    if (dock.state === 'min') {
      // One line: the part and the edit count; clicking it opens the dock again where it was.
      section.setAttribute('data-min', '');
      if (!picked) heading.querySelector('.gb-dock-what').textContent = 'Open the Edit panel';
      section.append(h('div', { class: 'gb-dock-head' },
        h('button', { class: 'gb-dock-reopen secondary', 'aria-expanded': 'false', onclick: act.reopen }, heading, h('span', { class: 'gb-dock-count muted' }, editsWord(count)))));
      return section;
    }

    // Edits (n): one line per edit with Reset, under the heading. An edit is stored as a shift,
    // so each line shows the color it gives now.
    const editRow = (label, value, clear) => h('li', null,
      value === B.DEFAULT_COLOR ? h('span', { class: 'gb-pl-dot gb-pl-dot-none' }) : dot(value),
      h('span', { class: 'gb-dock-edit-name' }, value === B.DEFAULT_COLOR ? `${label}, VS Code default` : label),
      reset(`Undo the edit to ${label}`, clear));
    const keyNow = (k, v) => (v === B.DEFAULT_COLOR ? v : theme.colors[k] || modernDefaults[k] || (B.isShift(v) ? '#000000' : v));
    const editList = h('div', { class: 'gb-dock-edits gb-pl-edits', id: `${id}-edits` },
      h('ul', null,
        ...Object.keys(edits.swatches).map(sw => editRow(`${roleName(sw)} (role)`, theme.sw[sw], e => { delete e.swatches[sw]; })),
        ...Object.entries(edits.keys).map(([k, v]) => editRow(`${plainKey(k)} (${k})`, keyNow(k, v), e => { delete e.keys[k]; }))));
    // With no edits there is no list, and no Edits button: the step heading already says 0 edits.
    editList.hidden = !dock.edits || !count;
    const editsToggle = h('button', {
      class: 'secondary gb-dock-edits-toggle', 'aria-expanded': String(dock.edits), 'aria-controls': editList.id,
      onclick: () => {
        dock.edits = !dock.edits;
        editList.hidden = !dock.edits;
        editsToggle.setAttribute('aria-expanded', String(dock.edits));
      },
    }, `Edits (${count})`);
    section.append(h('div', { class: 'gb-dock-head' }, heading,
      count ? editsToggle : null,
      count ? h('button', { class: 'secondary', onclick: () => edit(e => { e.swatches = {}; e.keys = {}; }, true) }, 'Reset all') : null,
      h('button', { class: 'secondary gb-dock-close', 'aria-label': 'Close the Edit panel', title: 'Close (Esc)', onclick: act.close }, '×')),
    editList);

    /** A fully transparent color reads 'transparent' rather than '#rrggbb00'. */
    const valueWord = v => (/^#[0-9a-f]{6}00$/i.test(v || '') ? 'transparent' : v);
    /**
     * A key's sample, as in Roles: its role's kind of sample in the key's own color, or for a key
     * with no role, text for a foreground, a line for a border and a fill for anything else.
     */
    const keySample = (key, swatch, value) => {
      const own = swatch || '__key';
      const names = sw => (sw === own ? plainKey(key) : roleName(sw));
      const kind = swatch ? sampleKind(swatch)
        : /foreground$/i.test(key) ? { kind: 'text', on: 'bg' }
          : /border$/i.test(key) ? { kind: 'line', on: 'bg' } : { kind: 'fill', on: 'bg', ink: 'text' };
      return roleSample(own, value, theme.sw, names, 'gb-pl-key-sample', kind);
    };

    // One line per key; the row opens its edit strip, and only one strip is open.
    const rows = [];
    function keyRow(key) {
      const value = theme.colors[key];
      const fallback = value ? undefined : modernDefaults[key];
      const swatch = B.SWATCH_OF[key];
      const pair = info ? info.pairs.filter(p => p.fg === key).reduce((a, p) => (!a || p.ratio < a.ratio ? p : a), null) : null;
      const stripId = `${id}-k${rows.length}`;
      const open = dock.key === key;
      const head = h('button', {
        class: 'gb-pl-key-head', 'aria-expanded': String(open), 'aria-controls': stripId,
        onclick: () => {
          dock.key = key;
          for (const r of rows) {
            const on = r.key === key;
            r.head.setAttribute('aria-expanded', String(on));
            r.strip.hidden = !on;
            r.row.classList.toggle('gb-open', on);
          }
        },
      },
      value || fallback ? keySample(key, swatch, value || fallback) : h('span', { class: 'gb-pl-dot gb-pl-dot-none' }),
      h('span', { class: 'gb-pl-key-label' }, h('span', { class: 'gb-pl-key-name' }, plainKey(key)), h('code', null, key)),
      h('span', { class: 'gb-pl-key-hex muted' }, valueWord(value || fallback) || 'unset'),
      pair ? (() => {
        const [cls] = contrastGrade(pair.ratio);
        return h('span', { class: `badge ${cls}`, title: ratioTitle(pair.ratio, `On ${pair.bg}, the color behind it`) }, `${pair.ratio.toFixed(1)}:1`);
      })() : h('span', { class: 'gb-pl-key-nobadge' }),
      h('span', { class: 'gb-pl-key-rolename muted' }, swatch ? `${roleName(swatch)} (${keyCount(swatch)})` : 'No role'));
      const strip = h('div', { class: 'gb-pl-key-strip', id: stripId }, keyEditor(key, swatch, value, fallback, head.querySelector('.badge')));
      strip.hidden = !open;
      const row = h('div', { class: open ? 'gb-pl-key gb-open' : 'gb-pl-key', 'data-key': key }, head, strip);
      rows.push({ key, head, strip, row });
      return row;
    }

    /**
     * The color editor under an open key row: what it changes (this key alone, or every key in
     * its role), the color as a picker and a hex field, its opacity, then Transparent, Use VS
     * Code default and Reset. A role's color is always opaque, so Opacity, Transparent and Use
     * VS Code default act on this key alone and switch the editor to This key only.
     */
    function keyEditor(key, swatch, value, fallback, badge) {
      const own = s.edits.keys[key];
      const isDefault = own === B.DEFAULT_COLOR;
      // value already carries this key's own edit (a shift is resolved by the builder).
      const shown = isDefault ? fallback : value || fallback;
      const hex7 = v => (/^#[0-9a-f]{6}/i.test(v || '') ? v.slice(0, 7).toLowerCase() : '#000000');
      const alphaOf = v => (/^#[0-9a-f]{8}$/i.test(v || '') ? Math.round(parseInt(v.slice(7), 16) / 2.55) : 100);
      const withAlpha = (c, a) => (a >= 100 ? c : c + Math.round((a * 255) / 100).toString(16).padStart(2, '0'));
      const keyColor = hex7(shown);
      const roleColor = swatch ? hex7(theme.sw[swatch]) : keyColor;
      // A key opens on This key only: a click on one part should change that part. Whole role is a
      // click away, and says how many colors it changes.
      let scope = swatch && dock.scope && dock.scope.key === key ? dock.scope.value : 'key';
      // What the editor shows; the inputs change it as they move, before the redraw.
      const view = { color: scope === 'role' ? roleColor : keyColor, alpha: scope === 'role' ? 100 : alphaOf(shown), unset: scope === 'key' && isDefault };
      const choose = next => { scope = next; dock.scope = { key, value: next }; };

      const chip = h('span', { class: 'gb-ke-chip', 'aria-hidden': 'true' });
      const sub = h('span', { class: 'gb-ke-sub muted' });
      const picker = colorPicker({
        label: `${key} color`, value: view.color, className: 'gb-ke-pick',
        snapshot: () => copyEdits(s.edits),
        input: v => applyColor(v, false),
        change: v => {
          const refocus = refocusNear(picker, `.gb-dock .gb-pl-key[data-key="${key}"] .gb-cp-trigger`);
          applyColor(v, true);
          refocus();
        },
        cancel: snap => {
          const refocus = refocusNear(picker, `.gb-dock .gb-pl-key[data-key="${key}"] .gb-cp-trigger`);
          if (snap) s.edits = snap;
          save(ctx);
          act.redraw();
          refocus();
        },
      });
      const hexField = h('input', {
        type: 'text', class: 'gb-ke-hex', spellcheck: 'false', 'aria-label': `${key} hex color, #rrggbb or #rrggbbaa`,
        onchange: ev => {
          const v = ev.target.value.trim().toLowerCase();
          if (!/^#[0-9a-f]{6}([0-9a-f]{2})?$/.test(v)) {
            hexField.setAttribute('aria-invalid', 'true');
            hexField.title = 'Use #rrggbb, or #rrggbbaa for a color with opacity';
            return;
          }
          if (scope === 'role' && v.length === 7) setRole(swatch)(v, true);
          else {
            choose('key');
            setKey(key)(v, true);
          }
        },
      });
      const alpha = h('input', {
        type: 'range', class: 'gb-ke-alpha', min: '0', max: '100', step: '1', 'aria-label': `${key} opacity, percent`,
        oninput: ev => applyAlpha(Number(ev.target.value), false),
        onchange: ev => applyAlpha(Number(ev.target.value), true),
      });
      const pct = h('span', { class: 'gb-ke-pct' });
      const segKey = h('button', { type: 'button', class: 'gb-ke-seg', 'data-scope': 'key', onclick: () => { choose('key'); Object.assign(view, { color: keyColor, alpha: alphaOf(shown), unset: isDefault }); paint(); } }, 'This key only');
      const segRole = h('button', {
        type: 'button', class: 'gb-ke-seg', 'data-scope': 'role', disabled: !swatch,
        title: swatch ? `Changes all ${keyCount(swatch)} colors in ${roleName(swatch)}, everywhere they are used` : 'This key has no role; it is colored on its own',
        onclick: () => { choose('role'); Object.assign(view, { color: roleColor, alpha: 100, unset: false }); paint(); },
      }, swatch ? `Whole role: ${roleName(swatch)} (${keyCount(swatch)})` : 'Whole role');
      const transparent = h('button', {
        type: 'button', class: 'secondary gb-ke-transparent', title: 'Keeps this key\'s color at 0% opacity',
        onclick: () => { choose('key'); setKey(key)(`${keyColor}00`, true); },
      }, 'Transparent');
      const toDefault = h('button', {
        type: 'button', class: 'secondary gb-ke-default', disabled: isDefault,
        title: 'Leaves this key out of the theme, so VS Code uses its own default color for it',
        onclick: () => { choose('key'); setKey(key)(B.DEFAULT_COLOR, true); },
      }, 'Use VS Code default');
      const resetBtn = h('button', {
        type: 'button', class: 'secondary gb-ke-reset',
        onclick: () => edit(e => { if (scope === 'role') delete e.swatches[swatch]; else delete e.keys[key]; }, true),
      }, 'Reset');
      const notes = h('div', { class: 'gb-ke-notes' });

      function applyColor(c, done) {
        if (scope === 'role') setRole(swatch)(c, done);
        else setKey(key)(withAlpha(c, view.unset ? 100 : view.alpha), done);
        Object.assign(view, { color: c, unset: false });
        if (!done) paint();
      }
      function applyAlpha(a, done) {
        if (scope === 'role') {
          choose('key');
          view.color = keyColor;
        }
        Object.assign(view, { alpha: a, unset: false });
        setKey(key)(withAlpha(view.color, a), done);
        if (!done) paint();
      }
      function paint() {
        chip.classList.toggle('gb-ke-unset', view.unset);
        chip.textContent = view.unset ? 'default' : '';
        chip.style.setProperty('--gb-ke-c', view.unset ? 'transparent' : withAlpha(view.color, view.alpha));
        picker.setValue(view.color);
        hexField.value = view.unset ? '' : withAlpha(view.color, view.alpha);
        hexField.placeholder = view.unset ? 'VS Code default' : '';
        hexField.removeAttribute('aria-invalid');
        hexField.title = '';
        alpha.value = String(view.alpha);
        pct.textContent = view.unset ? '' : `${view.alpha}%`;
        segKey.setAttribute('aria-pressed', String(scope === 'key'));
        segRole.setAttribute('aria-pressed', String(scope === 'role'));
        const canReset = scope === 'role' ? Boolean(s.edits.swatches[swatch]) : Boolean(own);
        resetBtn.disabled = !canReset;
        resetBtn.title = scope === 'role' ? `Undo the edit to the role ${swatch ? roleName(swatch) : ''}` : `Undo the edit to ${key}`;
        sub.textContent = view.unset ? 'Left to VS Code\'s default'
          : scope === 'role' ? `Changing every key in ${roleName(swatch)}`
          : own ? 'Edited on its own' : swatch ? `In ${roleName(swatch)}; changing this key alone` : 'No role; changing this key alone';
        const lines = [];
        if (isDefault) lines.push('This key is left out of the theme, so VS Code draws it in its own default color. The preview draws it unset.');
        else if (key in B.UNSET_KEYS) lines.push(`Not set by the theme: ${B.UNSET_KEYS[key]}`);
        else if (fallback) lines.push('Not set by the theme: VS Code works it out from the theme\'s other colors for the modern UI.');
        if (scope === 'role' && own) lines.push('This key has its own edit, which wins over the role. Reset it under This key only.');
        const shift = scope === 'role'
          ? shiftNote(B.preferredSwatch(theme.entry, theme.chrome, s.edits, swatch), theme.sw[swatch], s.edits.swatches[swatch])
          : shiftNote(B.preferredKey(theme.entry, theme.chrome, s.edits, theme.groups, key) || fallback, shown, own);
        notes.replaceChildren(...(shift ? [shift] : []), ...lines.map(t => h('p', { class: 'muted gb-ke-note' }, t)));
      }

      const field = (label, ...kids) => h('div', { class: 'gb-ke-row' }, h('span', { class: 'gb-ke-l' }, label), h('div', { class: 'gb-ke-ctl' }, ...kids));
      const editor = h('div', { class: 'gb-ke', role: 'group', 'aria-label': `Edit ${key}` },
        h('div', { class: 'gb-ke-top' }, chip, h('div', { class: 'gb-ke-name' }, h('span', { class: 'gb-ke-plain' }, plainKey(key), ' ', h('code', null, key)), sub), badge ? badge.cloneNode(true) : null),
        field('Change', h('div', { class: 'gb-ke-segs', role: 'group', 'aria-label': 'What to change' }, segKey, segRole)),
        field('Color', picker, hexField),
        field('Opacity', alpha, pct),
        notes,
        h('div', { class: 'gb-ke-actions' }, transparent, toDefault, resetBtn));
      paint();
      return editor;
    }

    // The dock body's groups: step 3's row (narrow, while step 3 is folded), the keys of the
    // part, and the box around it, each with a title and column headings.
    const keysWord = n => `${n} ${n === 1 ? 'key' : 'keys'}`;
    const columns = () => h('div', { class: 'gb-dock-cols', 'aria-hidden': 'true' },
      h('span'), h('span', null, 'Color'), h('span', null, 'Value'),
      h('span', { title: 'For a text or icon key: its contrast with the color behind it. 4.5:1 or more suits text, 3:1 suits icons and lines.' }, 'Contrast'),
      h('span', null, 'Role'));
    const group = (cls, title, hint, ...kids) => h('div', { class: `gb-dock-group ${cls}`, role: 'group', 'aria-label': title },
      h('div', { class: 'gb-dock-group-h' }, h('span', null, title), hint ? h('span', { class: 'gb-dock-group-hint' }, hint) : null), ...kids);
    const body = h('div', { class: 'gb-dock-body' });
    if (picked) {
      if (picked.fixed) {
        body.append(h('p', { class: 'muted gb-pl-key-note' }, `Its border is ${picked.fixed}, set by the extension itself. No theme key changes it.`));
      }
      if (picked.keys.length) body.append(group('gb-dock-part', 'This part', keysWord(picked.keys.length), columns(), ...picked.keys.map(keyRow)));
      // A click usually lands on text, so the box around it (its background and border) is
      // listed too: that is often the color the user meant.
      if (picked.around.length) body.append(group('gb-dock-around', 'Around it', keysWord(picked.around.length), columns(), ...picked.around.map(keyRow)));
    }

    if (!picked) body.append(h('p', { class: 'muted gb-dock-none' }, 'Pick a part in the preview window, or open a role in Roles.'));
    section.append(body);
    return section;
  }

  /** Numbers each dock's heading id, so two Lab roots never share one. */
  let dockCount = 0;

  // ----------------------------------------------------------------- the stages

  /**
   * The contrast info the Edit dock lists for the picked part: the picked card is drawn off the
   * page (the preview itself is in the Theme Preview window) and its info read back. Null with
   * no pick.
   */
  function pickedInfo(gctx) {
    if (!picked) return null;
    const [part] = Gallery().renderParts(gctx, [picked.card]);
    return part ? part.info : null;
  }

  /**
   * The Edit dock in `dockHost`. A color input being dragged changes the edits and saves them,
   * which sends the preview window the new state, but does not redraw the dock, so the input
   * stays open; a finished change redraws everything. `onLayout` runs after each draw so the
   * page can match its layout to the dock's state.
   */
  function stages(candidate, ctx, redrawAll, dockHost, onLayout = () => {}) {
    const s = stateOf(ctx);

    // The editors set colors; each new color is kept as a shift from the color it replaces, so
    // it follows the palette when the base color or rule changes (media/themeBuilder.js toShifts).
    function edit(apply, done) {
      const next = { swatches: { ...s.edits.swatches }, keys: { ...s.edits.keys } };
      apply(next);
      const { chrome, entry } = inputsOf(candidateOf(s), s);
      s.edits = Builder().toShifts(entry, chrome, next, previewGroups(ctx, s));
      markChanged();
      save(ctx);
      if (done) redrawAll();
    }

    /** Where focus goes when the dock closes: the step 5 line's Roles button. */
    function focusAfterClose() {
      const lab = dockHost.closest('.gb-palette');
      const target = lab && /** @type {HTMLElement | null} */ (lab.querySelector('.gb-s4-line .gb-roles-go'));
      if (target) target.focus();
    }

    const act = {
      close() {
        dock.state = editCount(s.edits) ? 'min' : 'closed';
        picked = null;
        redrawAll();
        focusAfterClose();
      },
      reopen() {
        dock.state = 'open';
        redrawAll();
      },
      /** Redraws everything without marking the candidate changed, as a cancelled pick does. */
      redraw() {
        redrawAll();
      },
    };

    /** Draws the dock for the current pick and edits, and returns the theme it drew from. */
    function draw() {
      const theme = themeOf(candidate, s, previewGroups(ctx, s));
      const oldBody = dockHost.querySelector('.gb-dock-body');
      if (oldBody) dock.scroll = oldBody.scrollTop;
      if (dock.state === 'closed') dockHost.replaceChildren();
      else {
        const info = pickedInfo(galleryContext(theme.colors, theme.tokens, ctx.modernUI));
        dockHost.replaceChildren(editDock(theme, ctx, info, edit, act));
        const body = dockHost.querySelector('.gb-dock-body');
        if (body) body.scrollTop = dock.scroll;
      }
      onLayout();
      return theme;
    }

    return { draw, edit };
  }

  /**
   * The Roles step's open parts: the folded families the user has shown, and the role whose
   * editor is open. They survive redraws; a render with another state starts with neither.
   */
  const rolesUi = { shown: [], open: null };
  /** The families that start folded to a strip of their colors. */
  const FOLDED_FAMILIES = ['status', 'terminal', 'frame'];
  /** Numbers each Roles step's ids, so two Lab roots never share one. */
  let rolesCount = 0;

  /**
   * The parts of the window a VS Code color belongs to, matched by its prefix, first match wins;
   * anything else is 'Text and general'. The Roles step groups a role's colors by these (R4-1).
   */
  const KEY_AREAS = [
    [/^(editorSuggestWidget|editorHoverWidget|editorWidget|widget|simpleFindWidget|editorStickyScroll|peekView|editorMarkerNavigation|parameterHints|debugExceptionWidget)/, 'Popups and widgets'],
    [/^(menu|menubar|quickInput|pickerGroup|keybindingLabel)/, 'Menus and pickers'],
    [/^notification/, 'Notifications'],
    [/^(tab|editorGroupHeader|breadcrumb)/, 'Tabs and breadcrumbs'],
    [/^(editorGroup|sash)/, 'Splits'],
    [/^(editor|minimap|scrollbar|diffEditor|merge)/, 'Editor'],
    [/^(list|tree)/, 'Lists and trees'],
    [/^(input|checkbox|dropdown|radio|toolbar|actionBar)/, 'Inputs and controls'],
    [/^button/, 'Buttons'],
    [/^(badge|progressBar)/, 'Badges and progress'],
    [/^sideBar/, 'Side bar'],
    [/^(panel|outputView|terminal)/, 'Panel and terminal'],
    [/^statusBar/, 'Status bar'],
    [/^(titleBar|activityBar|window|commandCenter)/, 'Frame'],
    [/^(chat|interactive|inlineChat)/, 'Chat'],
  ];
  const keyArea = key => (KEY_AREAS.find(([re]) => re.test(key)) || [null, 'Text and general'])[1];

  /** keys grouped by part of the window, as [area, keys] pairs, the largest part first. */
  function keysByArea(keys) {
    const groups = new Map();
    for (const k of keys) {
      const area = keyArea(k);
      if (!groups.has(area)) groups.set(area, []);
      groups.get(area).push(k);
    }
    return [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
  }

  /**
   * A VS Code color in plain words, made from its name: 'editorSuggestWidget.border' reads
   * 'Suggest widget border', 'sideBar.foreground' reads 'Side bar text'. The setting name shows
   * beside it, so a reading that comes out stiff still leads to the exact color.
   */
  function plainKey(key) {
    const words = s => s.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([a-z])([0-9])/g, '$1 $2').toLowerCase();
    const [prefix, prop = ''] = key.split('.');
    const what = words(prefix).replace(/^editor (?=\w)/, '');
    const how = words(prop).split(' ').map(w => (w === 'foreground' ? 'text' : w)).join(' ');
    const text = `${what} ${how}`.trim();
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  /** The keys last sent to the Theme Preview to outline, so the same list is not sent twice. */
  let highlighted = '';
  /** Asks the Theme Preview window to outline the parts that use `keys` (R4-2); [] clears them. */
  function highlightRole(ctx, keys) {
    const sig = keys.join(' ');
    if (sig === highlighted || typeof ctx.post !== 'function') return;
    highlighted = sig;
    ctx.post({ type: 'previewHighlight', keys: keys.slice() });
  }

  // ------------------------------------------------------------- role samples

  /** Roles drawn as text, with the role they sit on. Terminal colors sit on the editor background too. */
  const SAMPLE_TEXT_ON = {
    kw: 'bg', fn: 'bg', str: 'bg', type: 'bg', num: 'bg', bright: 'bg', text: 'bg', muted: 'bg', faint: 'bg',
    error: 'bg', warning: 'bg', success: 'bg', info: 'bg', conflict: 'bg',
    accentText: 'accent', accentTextFaint: 'accent', errorText: 'error', warningText: 'warning',
    frameFg: 'frameBg', frameMuted: 'frameBg', frameCcFg: 'frameBg', frameBadgeText: 'frameBadge', frameHoverText: 'frameHover', frameRemoteText: 'frameRemote',
  };
  /** Roles drawn as lines, with the role they run along. */
  const SAMPLE_LINE_ON = {
    divider: 'bg', border: 'bg', inputBorder: 'bg', frameLineAccent: 'bg', frameLineBg: 'bg', frameLineDivider: 'bg',
    frameBorder: 'frameBg', frameCcBorder: 'frameBg', frameActive: 'frameBg', frameWindow: 'frameBg',
  };
  /** Fills with their own text color; any other fill gets the plain text (frame fills, the frame text). */
  const SAMPLE_INK = {
    accent: 'accentText', accentHover: 'accentText', frameBg: 'frameFg', frameCcBg: 'frameCcFg',
    frameBadge: 'frameBadgeText', frameHover: 'frameHoverText', frameRemote: 'frameRemoteText',
  };

  /**
   * How a role shows in use: text on what it sits on ('text'), a line along it ('line'), or a
   * fill with text on it ('fill'). `on` is the role underneath, `ink` the text on a fill.
   * @returns {{ kind: 'text' | 'line' | 'fill', on: string, ink?: string }}
   */
  function sampleKind(sw) {
    if (sw.startsWith('ansi')) return { kind: 'text', on: 'bg' };
    if (SAMPLE_TEXT_ON[sw]) return { kind: 'text', on: SAMPLE_TEXT_ON[sw] };
    if (SAMPLE_LINE_ON[sw]) return { kind: 'line', on: SAMPLE_LINE_ON[sw] };
    const frame = sw.startsWith('frame');
    return { kind: 'fill', on: frame ? 'frameBg' : 'bg', ink: SAMPLE_INK[sw] || (frame ? 'frameFg' : 'text') };
  }

  /** What a role name reads as in a sample's title: 'the editor background', 'the accent'. */
  const sampleOnName = (sw, names) => (sw === 'bg' ? 'the editor background' : `${names(sw).toLowerCase()}`);

  /**
   * Paints `el`, a role sample, for `value` against the theme's swatches `sws`: "Aa" in the color
   * on what it sits on, a line of the color along it, or a fill of the color with its text on it.
   * A see-through color is drawn over what it sits on, as VS Code draws it. The title says what
   * it shows and, for text, its contrast. `names(sw)` gives a role's name.
   */
  function paintSample(el, sw, value, sws, names, k = sampleKind(sw)) {
    const back = String(sws[k.on] || sws.bg).slice(0, 7);
    el.setAttribute('data-color', value);
    el.setAttribute('data-kind', k.kind);
    el.style.boxShadow = '';
    el.style.color = '';
    el.textContent = k.kind === 'line' ? '' : 'Aa';
    const what = `${names(sw)} on ${sampleOnName(k.on, names)}`;
    if (k.kind === 'text') {
      el.style.background = back;
      el.style.color = value;
      const ratio = contrastRatio(window.GB.over(parseColor(value), parseColor(back)), parseColor(back));
      el.title = ratioTitle(ratio, `${what}, as text`);
    } else if (k.kind === 'line') {
      el.style.background = back;
      el.style.boxShadow = `inset 0 0 0 2px ${value}`;
      el.title = `${what}, as a line`;
    } else {
      // The fill over what it sits on, so a see-through fill shows as VS Code draws it.
      el.style.background = `linear-gradient(${value}, ${value}), ${back}`;
      const fill = window.GB.over(parseColor(value), parseColor(back));
      const ink = sws[k.ink] || sws.text;
      el.style.color = ink;
      const ratio = contrastRatio(window.GB.over(parseColor(ink), fill), fill);
      el.title = ratioTitle(ratio, `${names(k.ink)} on ${names(sw)}, as a fill on ${sampleOnName(k.on, names)}`);
    }
  }

  /** A role sample element of class `cls` (see paintSample); `kind` overrides sampleKind(sw). */
  function roleSample(sw, value, sws, names, cls, kind = undefined) {
    const el = h('span', { class: `gb-role-sample ${cls}`, 'aria-hidden': 'true' });
    paintSample(el, sw, value, sws, names, kind || sampleKind(sw));
    return el;
  }

  /**
   * Three lines of code in the syntax colors on the editor background, so a Colors change
   * shows as code before the preview window is looked at.
   */
  function codeSample(sws) {
    const tok = (sw, text) => {
      const el = h('span', { 'data-swatch': sw }, text);
      el.style.color = sws[sw];
      return el;
    };
    const lines = [
      [tok('kw', 'export'), ' ', tok('kw', 'class'), ' ', tok('type', 'Greeter'), ' {'],
      ['  ', tok('fn', 'greet'), '(name: ', tok('type', 'string'), ') { ', tok('kw', 'return'), ' ', tok('str', '"Hello, "'), ' + name.', tok('fn', 'repeat'), '(', tok('num', '2'), '); }'],
      ['}'],
    ];
    const el = h('pre', { class: 'gb-rf-code', title: 'Keywords, Functions, Strings, Types and Numbers as code on the editor background' },
      lines.map(line => h('div', null, ...line)));
    el.style.background = String(sws.bg).slice(0, 7);
    el.style.color = String(sws.text).slice(0, 7);
    return el;
  }

  /**
   * Step 4, Roles: one row per builder family (themeBuilder.js ROLE_FAMILIES) with how the
   * family is made, its setting and its roles as chips. A chip is a button with the number of
   * workbench keys in its role, or 'code' for a role only code uses; it opens one editor under
   * its family: the role's color, Reset when edited, and Show where, which picks the role's
   * first key as a click in the preview would. Status, Terminal and Frame start folded to a
   * strip of their colors. `edit` is stages' edit, `redraw` redraws the candidate, and
   * `focusIn(selector)` focuses an element of the Lab after a redraw.
   */
  function rolesStep(candidate, theme, ctx, edit, redraw, focusIn) {
    const s = stateOf(ctx);
    const B = Builder();
    const roles = B.cleanChrome(s);
    const keyCount = sw => (B.KEY_GROUPS[sw] || []).length;
    const roleName = sw => (B.SWATCHES[sw] ? B.SWATCHES[sw][0] : sw);
    const chipAt = sw => `.gb-roles .gb-role-chip[data-swatch="${sw}"]`;
    const n = ++rolesCount;
    /** A setting changed: mark the candidate changed, save, redraw, and focus `selector`. */
    const setting = (apply, selector) => {
      apply();
      markChanged();
      save(ctx);
      redraw();
      focusIn(selector);
    };
    const swatchOf = (value, cls) => {
      const el = h('span', { class: cls, 'aria-hidden': 'true', 'data-color': value });
      el.style.background = value;
      return el;
    };
    const segs = (label, family, options, current, pick) => h('div', { class: 'gb-ke-segs', role: 'group', 'aria-label': label },
      options.map(([id, text]) => h('button', {
        type: 'button', class: 'secondary gb-ke-seg', 'data-value': id, 'aria-pressed': String(id === current),
        onclick: () => { if (id !== current) setting(() => pick(id), `.gb-rf[data-family="${family}"] .gb-ke-seg[data-value="${id}"]`); },
      }, text)));
    const settingRow = (...kids) => h('div', { class: 'gb-rf-set' }, ...kids);
    const label = text => h('span', { class: 'gb-rf-l' }, text);
    const step3Link = (what, selector) => h('button', {
      type: 'button', class: 'secondary gb-rf-link', title: `Moves to step 3, where the ${what} is chosen`,
      onclick: () => focusIn(selector),
    }, 'change in step 3');

    /** The family's own setting, or null for Status and Terminal. */
    function familySetting(id) {
      const last = candidate.colors.length - 1;
      if (id === 'syntax') {
        const order = roles.syntax || [0, 1, 2, 3, 4];
        const picks = settingRow(label('Colors'), ...['kw', 'fn', 'str', 'type', 'num'].map((sw, i) => {
          const current = order[i] % candidate.colors.length;
          const select = h('select', {
            class: 'gb-rf-syntax', 'data-swatch': sw, 'aria-label': `${roleName(sw)}: palette color`,
            onchange: ev => {
              const next = order.slice();
              next[i] = Number(ev.target.value);
              setting(() => { s.syntax = next; }, `.gb-rf-syntax[data-swatch="${sw}"]`);
            },
          }, candidate.colors.map((hex, j) => h('option', { value: String(j), selected: j === current }, `${j + 1}`)));
          // The color as the theme draws it, lifted for readability, as text on the editor background.
          return h('span', { class: 'gb-rf-pick' }, h('span', { class: 'gb-rf-pick-l' }, roleName(sw)), select,
            roleSample(sw, theme.sw[sw], theme.sw, roleName, 'gb-rf-pick-sample'));
        }));
        return h('div', { class: 'gb-rf-syntax-set' }, picks, codeSample(theme.sw));
      }
      if (id === 'surfaces') {
        const word = v => (v === 1 ? 'Standard' : `${v.toFixed(1)}x`);
        const spoken = v => (v === 1 ? 'Standard, 1.0 times' : `${v.toFixed(1)} times the standard`);
        const value = h('span', { class: 'gb-rf-depth-v' }, word(roles.depth));
        const slider = h('input', {
          type: 'range', class: 'gb-rf-depth', min: '0.5', max: '2', step: '0.1', value: String(roles.depth),
          'aria-label': 'Surface depth', 'aria-valuetext': spoken(roles.depth),
          title: 'How far apart the surfaces step in lightness: under 1 closer together, over 1 further apart',
          oninput: ev => {
            const v = Number(ev.target.value);
            s.depth = v;
            markChanged();
            save(ctx);
            value.textContent = word(v);
            slider.setAttribute('aria-valuetext', spoken(v));
          },
          onchange: ev => setting(() => { s.depth = Number(ev.target.value); }, '.gb-rf-depth'),
        });
        return settingRow(label('Depth'), slider, value, label('Tint'),
          segs('Tint', 'surfaces', Object.entries(CHROME_SURFACES).map(([sid, def]) => [sid, def.name]), s.surfaces, sid => { s.surfaces = sid; }));
      }
      if (id === 'text') {
        return settingRow(label('Contrast'),
          segs('Text contrast', 'text', [['soft', 'Soft'], ['standard', 'Standard'], ['high', 'High']], roles.text, tid => { s.text = tid; }));
      }
      if (id === 'accent') {
        const index = Math.min(Number(s.chromeIndex) || 0, last);
        return settingRow(label('Accent'), dot(accentHexOf(candidate, s)), h('span', null, s.accentColor ? 'custom color' : `color ${index + 1}`),
          step3Link('accent color', '.gb-s3 .gb-ch-pick[aria-checked="true"]'));
      }
      if (id === 'frame') {
        const f = s.frame;
        const which = f.color ? 'custom color' : `color ${Math.min(Number(f.index) || 0, last) + 1}`;
        return settingRow(label('Frame'), dot(frameColor(candidate, f)), h('span', null, `${which}, ${f.style === 'dark' ? 'Dark' : 'Filled'}`),
          step3Link('Frame color', '.gb-s3 .gb-fr-pick[aria-checked="true"]'));
      }
      return null;
    }

    /**
     * One role as a row (R4-1): one line, a heading button with its color, name, what it is for and
     * how many VS Code colors use it, so a family scans as an even list (R4-3). The parts of the
     * window it colors, with a count each, are in the button's tooltip; the open row lists every
     * color it draws, grouped by those parts, under the role's editor (roleEditor). Hovering or focusing a row
     * outlines its parts in the Theme Preview window (R4-2); leaving it goes back to the open role.
     */
    function roleRow(sw) {
      const count = keyCount(sw);
      const open = rolesUi.open === sw;
      const edited = Boolean(s.edits.swatches[sw]);
      const about = B.SWATCHES[sw] ? B.SWATCHES[sw][1] : '';
      const areas = keysByArea(B.KEY_GROUPS[sw] || []);
      const tip = [about, areas.length ? `Colors: ${areas.map(([area, list]) => `${area} ${list.length}`).join(', ')}` : 'Used by code highlighting only',
        open ? 'Click to close' : 'Click to change it and see every color it draws'].filter(Boolean).join('\n');
      const head = h('button', {
        type: 'button', class: edited ? 'gb-role-chip gb-role-edited' : 'gb-role-chip', 'data-swatch': sw, title: tip,
        'aria-expanded': String(open), 'aria-controls': open ? `gb-role-ed-${n}` : null,
        'aria-label': `${roleName(sw)}, ${count ? `${count} ${count === 1 ? 'color' : 'colors'}` : 'code only'}${edited ? ', edited' : ''}. ${about}`,
        onclick: () => {
          rolesUi.open = open ? null : sw;
          redraw();
          focusIn(open ? chipAt(sw) : '.gb-role-ed .gb-cp-trigger');
        },
      }, h('span', { class: 'gb-role-chev codicon codicon-chevron-right', 'aria-hidden': 'true' }),
      roleSample(sw, theme.sw[sw], theme.sw, roleName, 'gb-role-dot'), h('span', { class: 'gb-role-name' }, roleName(sw)),
      h('span', { class: 'gb-role-about' }, about),
      h('span', { class: 'gb-role-count' },
        h('span', { class: 'gb-role-n' }, count ? String(count) : 'code'), count ? ` ${count === 1 ? 'color' : 'colors'}` : ' only'));
      const keys = B.KEY_GROUPS[sw] || [];
      const pointAt = () => highlightRole(ctx, keys);
      const pointBack = () => highlightRole(ctx, rolesUi.open ? B.KEY_GROUPS[rolesUi.open] || [] : []);
      return h('div', {
        class: open ? 'gb-role-row gb-role-open' : 'gb-role-row', 'data-swatch': sw,
        onmouseenter: pointAt, onmouseleave: pointBack,
        onfocusin: pointAt, onfocusout: ev => { if (!ev.currentTarget.contains(ev.relatedTarget)) pointBack(); },
      }, head, open ? roleEditor(sw) : null);
    }

    /** The open role's editor: its color, Reset when edited, and Show where. Escape closes it. */
    function roleEditor(sw) {
      const name = roleName(sw);
      const count = keyCount(sw);
      const big = roleSample(sw, theme.sw[sw], theme.sw, roleName, 'gb-role-big');
      const close = () => {
        rolesUi.open = null;
        redraw();
        focusIn(chipAt(sw));
      };
      // Dragging changes the edits and saves without a redraw, so the picker stays open.
      const input = colorPicker({
        label: `${name}: every key in this role`, value: theme.sw[sw], className: 'gb-role-pick',
        snapshot: () => copyEdits(s.edits),
        input: v => {
          paintSample(big, sw, v, theme.sw, roleName);
          edit(e => { e.swatches[sw] = v; }, false);
        },
        change: v => {
          edit(e => { e.swatches[sw] = v; }, true);
          focusIn('.gb-role-ed .gb-cp-trigger');
        },
        cancel: snap => {
          if (snap) s.edits = snap;
          save(ctx);
          redraw();
          focusIn('.gb-role-ed .gb-cp-trigger');
        },
      });
      const reset = s.edits.swatches[sw] ? h('button', {
        type: 'button', class: 'secondary gb-pl-reset', title: `Undo the edit to ${name}`,
        onclick: () => {
          edit(e => { delete e.swatches[sw]; }, true);
          focusIn('.gb-role-ed .gb-cp-trigger');
        },
      }, 'Reset') : null;
      const shift = shiftNote(B.preferredSwatch(theme.entry, theme.chrome, s.edits, sw), theme.sw[sw], s.edits.swatches[sw]);
      // Show where brings the preview window forward (opening it if closed), outlines every part
      // this role colors and scrolls to the first. Keywords has no workbench key, so nothing to show.
      const showWhere = count ? h('button', {
        type: 'button', class: 'secondary gb-role-where', title: `Brings the preview window forward and outlines every part ${name} colors`,
        onclick: () => ctx.post({ type: 'showWhere', keys: (B.KEY_GROUPS[sw] || []).slice() }),
      }, 'Show where') : null;
      const used = count
        ? `Changing it recolors all ${count} ${count === 1 ? 'color' : 'colors'} below, in every part of the window listed.`
        : 'Used by code highlighting only, not by any VS Code color.';
      // Every color the role draws, in plain words, grouped by part of the window, with the
      // VS Code setting name beside it.
      const list = count ? h('div', { class: 'gb-role-keys' }, keysByArea(B.KEY_GROUPS[sw]).map(([area, keys]) =>
        h('div', { class: 'gb-role-keygroup', role: 'group', 'aria-label': area },
          h('h5', null, area, ' ', h('span', { class: 'muted' }, String(keys.length))),
          h('ul', null, keys.map(k => h('li', null, h('span', null, plainKey(k)), h('code', null, k))))))) : null;
      return h('div', {
        class: 'gb-role-ed', id: `gb-role-ed-${n}`, role: 'group', 'aria-label': `Edit ${name}`, 'data-swatch': sw,
        onkeydown: ev => {
          if (ev.key !== 'Escape') return;
          ev.preventDefault();
          ev.stopPropagation();
          close();
        },
      }, h('div', { class: 'gb-role-ed-top' }, big,
        h('div', { class: 'gb-role-ed-actions' }, input, reset, showWhere),
        h('div', { class: 'gb-role-ed-text muted' }, used, shift)),
      list);
    }

    const rows = B.ROLE_FAMILIES.map(fam => {
      const foldable = FOLDED_FAMILIES.includes(fam.id);
      const folded = foldable && !rolesUi.shown.includes(fam.id);
      const edited = fam.roles.filter(sw => s.edits.swatches[sw]).length;
      const nameId = `gb-rf-${fam.id}-${n}`;
      const toggle = foldable ? h('button', {
        type: 'button', class: 'secondary gb-rf-link gb-rf-toggle', 'aria-expanded': String(!folded),
        'aria-label': `${folded ? 'Show' : 'Hide'} the ${fam.roles.length} ${fam.name} roles`,
        onclick: () => {
          rolesUi.shown = folded ? [...rolesUi.shown, fam.id] : rolesUi.shown.filter(id => id !== fam.id);
          if (!folded && fam.roles.includes(rolesUi.open)) rolesUi.open = null;
          redraw();
          focusIn(`.gb-rf[data-family="${fam.id}"] .gb-rf-toggle`);
        },
      }, folded ? 'Show' : 'Hide') : null;
      const strip = folded ? h('span', { class: 'gb-rf-strip', 'aria-hidden': 'true' },
        fam.roles.map(sw => swatchOf(theme.sw[sw], 'gb-rf-strip-c'))) : null;
      const row = h('section', { class: 'gb-rf', 'data-family': fam.id, 'aria-labelledby': nameId },
        h('div', { class: 'gb-rf-head' },
          h('h4', { class: 'gb-rf-name', id: nameId }, fam.name),
          h('span', { class: 'gb-rf-count muted' }, `${fam.roles.length} roles`),
          edited ? h('span', { class: 'gb-rf-edited' }, `${edited} edited`) : null,
          strip, toggle));
      if (folded) {
        row.setAttribute('data-folded', '');
        return row;
      }
      row.append(h('p', { class: 'gb-rf-how muted' }, fam.how));
      const own = familySetting(fam.id);
      if (own) row.append(own);
      row.append(h('div', { class: 'gb-rf-roles' }, fam.roles.map(roleRow)));
      return row;
    });
    // The open role stays outlined in the preview; with none open, nothing is.
    highlightRole(ctx, rolesUi.open ? B.KEY_GROUPS[rolesUi.open] || [] : []);
    return [
      h('p', { class: 'gb-rf-intro muted' }, 'Every color in the theme belongs to a role. Each family below is made from your palette in one way; change the family, or open a role and change it alone. Point at a role to see which parts of the window it colors, outlined in the preview window too; open it to change it and see every color it draws.'),
      ...rows,
    ];
  }

  /** The Roles step's state line: how many roles and families, and how many roles are edited. */
  function rolesState(s) {
    const B = Builder();
    const total = B.ROLE_FAMILIES.reduce((sum, fam) => sum + fam.roles.length, 0);
    const edited = Object.keys(s.edits.swatches).length;
    return `${total} roles in ${B.ROLE_FAMILIES.length} families${edited ? ` · ${edited} edited` : ''}`;
  }

  /** The frame's hex color: its custom color, or the palette color its index picks. */
  function frameColor(candidate, frame) {
    if (frame.color && Builder().isShift(frame.color)) return Builder().applyShift(frame.color, baseHexOf(candidate));
    if (frame.color) return frame.color;
    return candidate.colors[Math.min(Number(frame.index) || 0, candidate.colors.length - 1)];
  }

  /** A custom frame color as the shift from the base color it is kept as, so it follows the base (D4). */
  const frameShift = (candidate, hex) => Builder().shiftFor(hex.toLowerCase(), baseHexOf(candidate));

  /** What each Surfaces choice does, under its name in step 3. */
  const SURFACE_ABOUT = {
    neutral: 'Gray, a trace of the accent',
    tinted: 'A light wash of the accent',
    rich: 'Strongly the accent\'s hue',
  };

  /** What each frame style does, under its name in step 3. */
  const FRAME_STYLES = [
    ['filled', 'Filled', 'Bars in the frame color'],
    ['dark', 'Dark', 'Dark bars, color on markers'],
  ];

  /**
   * A small drawing of a VS Code window in the swatches `sw`: title bar, activity bar with its
   * active marker, side bar with a selected row, tabs, editor with three lines of code, status
   * bar. Step 3's example chips use it so a choice shows what it changes before it is made.
   */
  function miniWindow(sw) {
    const op = hex => String(hex).slice(0, 7);
    const part = (cls, color, ...kids) => {
      const el = h('span', { class: cls }, ...kids);
      el.style.background = op(color);
      return el;
    };
    const tab = part('gb-mini-tab', sw.bg);
    tab.style.borderTopColor = op(sw.accent);
    const side = part('gb-mini-side', sw.deep, part('gb-mini-sel', sw.select));
    side.style.borderRightColor = op(sw.divider);
    return h('span', { class: 'gb-mini', 'aria-hidden': 'true' },
      part('gb-mini-title', sw.frameBg),
      part('gb-mini-act', sw.frameBg, part('gb-mini-mark', sw.frameActive)),
      side,
      part('gb-mini-tabs', sw.deep, tab),
      part('gb-mini-code', sw.bg, part('gb-mini-ln', sw.kw), part('gb-mini-ln', sw.fn), part('gb-mini-ln', sw.str)),
      part('gb-mini-status', sw.frameBg));
  }

  /** The color the editor accent comes from: the custom accent, or the palette color picked. */
  function accentHexOf(candidate, s) {
    const { chrome, entry } = inputsOf(candidate, s);
    return Builder().accentSource(entry, chrome).toLowerCase();
  }

  /**
   * Step 3's rows, as { frameRow, styleRow, accentRow, surfacesRow, groupsBox }. Each row has a
   * label with a short line under it naming what it colors (the label's title says more), then
   * its choices. Frame style and Surfaces are example chips: each draws a small window in the
   * colors it would give, so the difference shows before the choice is made.
   */
  function frameEditorRows(candidate, ctx, redrawAll) {
    const s = stateOf(ctx);
    const index = Math.min(Number(s.chromeIndex) || 0, candidate.colors.length - 1);
    const frame = s.frame;
    const custom = Boolean(frame.color);
    const frameIndex = custom ? -1 : Math.min(Number(frame.index) || 0, candidate.colors.length - 1);
    const color = frameColor(candidate, frame);
    const change = apply => ev => { apply(ev); markChanged(); save(ctx); redrawAll(); };
    const radio = (cls, label, i, picked, onclick, ...kids) => {
      const b = h('button', {
        class: `${cls} secondary`, role: 'radio', 'aria-checked': String(picked), title: label, 'data-index': String(i), onclick,
      }, ...kids);
      b.classList.toggle('gb-ch-picked', picked);
      return b;
    };
    /**
     * A custom color picker: it previews as it is dragged (saved without a redraw, so the picker
     * stays open), redraws once kept, and puts back what `snapshot` took when cancelled.
     */
    const customPicker = (label, className, value, snapshot, set, restore) => {
      const at = `.${className}`;
      const el = colorPicker({
        label, value, className, snapshot,
        input: hex => { set(hex); markChanged(); save(ctx); },
        change: hex => { const refocus = refocusNear(el, at); set(hex); markChanged(); save(ctx); redrawAll(); refocus(); },
        cancel: snap => { const refocus = refocusNear(el, at); if (snap) restore(snap); save(ctx); redrawAll(); refocus(); },
      });
      return el;
    };
    const { chrome, entry } = inputsOf(candidate, s);
    const swFor = over => Builder().swatches(entry, { ...chrome, ...over }, s.edits);
    const example = (cls, name, about, id, picked, onclick, sw) => radio(`${cls} gb-ex-pick`, `${name}: ${about}`, id, picked, onclick,
      miniWindow(sw), h('span', { class: 'gb-ex-text' }, h('span', { class: 'gb-ex-name' }, name), h('small', { class: 'gb-ex-about muted' }, about)));

    // Frame color: one palette color, or a custom one kept as a shift from the base (D4).
    let customColor = color;
    const customInput = customPicker('Custom frame color', 'gb-fr-custom', color, () => ({ ...s.frame }),
      hex => { customColor = hex; s.frame = { color: frameShift(candidate, hex), style: frame.style }; },
      snap => { s.frame = snap; });
    const framePicks = h('div', { class: 'gb-ch-picks', role: 'radiogroup', 'aria-label': 'Frame color' },
      candidate.colors.map((hex, i) => radio('gb-fr-pick', `Frame color ${i + 1} ${hex}`, i, i === frameIndex,
        change(() => { s.frame = { index: i, style: frame.style }; }), dot(hex), ` ${i + 1}`)),
      radio('gb-fr-pick', 'Custom frame color', 'custom', custom,
        change(() => { s.frame = { color: frameShift(candidate, customColor), style: frame.style }; }), 'Custom'),
      customInput);
    const styles = h('div', { class: 'gb-ex-picks', role: 'radiogroup', 'aria-label': 'Frame style' },
      FRAME_STYLES.map(([id, name, about]) => example('gb-fr-style-pick', name, about, id, frame.style === id,
        change(() => { s.frame = { ...frame, style: id }; }), swFor({ frame: { ...frame, style: id } }))));

    // Accent: one palette color, or a custom one kept as a shift from the base, like the frame's.
    const accentCustom = Boolean(s.accentColor);
    let accentColor = accentHexOf(candidate, s);
    const accentInput = customPicker('Custom accent color', 'gb-ac-custom', accentColor, () => ({ v: s.accentColor }),
      hex => { accentColor = hex; s.accentColor = frameShift(candidate, hex); },
      snap => { if (snap.v) s.accentColor = snap.v; else delete s.accentColor; });
    const accentPicks = h('div', { class: 'gb-ch-picks', role: 'radiogroup', 'aria-label': 'Accent color' },
      candidate.colors.map((hex, i) => radio('gb-ch-pick', `Accent color ${i + 1} ${hex}`, i, !accentCustom && i === index,
        change(() => { s.chromeIndex = i; delete s.accentColor; }), dot(hex), ` ${i + 1}`)),
      radio('gb-ch-pick', 'Custom accent color', 'custom', accentCustom,
        change(() => { s.accentColor = frameShift(candidate, accentColor); }), 'Custom'),
      accentInput);
    const surfaces = h('div', { class: 'gb-ex-picks', role: 'radiogroup', 'aria-label': 'Surfaces' },
      Object.entries(CHROME_SURFACES).map(([id, def]) => example('gb-ch-surface-pick', def.name, SURFACE_ABOUT[id] || '', id, s.surfaces === id,
        change(() => { s.surfaces = id; }), swFor({ surfaces: id }))));

    const row = (cls, label, hint, title, ...kids) => h('div', { class: `gb-fe-row ${cls}`, role: 'group', 'aria-label': label },
      h('span', { class: 'gb-fe-l', title }, label, h('small', { class: 'muted' }, hint)), ...kids);
    const frameRow = row('gb-fr-box', 'Frame color', 'Title, activity and status bars',
      'The title bar, activity bar, status bar and window border. Text on them is picked to stay readable.', framePicks,
      ctx.identityFill
        ? h('p', { class: 'muted gb-fr-note' }, `This folder's settings still hold the old GigglyBits folder color (${ctx.identityFill}), which VS Code draws over every GigglyBits theme's frame. Use in this project with a saved theme removes it.`)
        : null);
    const styleRow = row('gb-fs-box', 'Frame style', 'How the frame uses its color',
      'Filled paints the bars in the frame color. Dark keeps them dark and puts the color on the active marker and badges.', styles);
    const accentRow = row('gb-ed-box', 'Accent', 'Buttons, links, badges, focus',
      'The color of buttons, links, badges, selections and focus outlines, lifted to read 4.5:1 on the editor. It also gives the surfaces their hue.', accentPicks);
    const surfacesRow = row('gb-sf-box', 'Surfaces', 'Side bar, tabs, panels',
      'How strongly the side bar, tabs, panels and widgets take the accent\'s hue. The editor background stays #1e1e1e.', surfaces);
    return { frameRow, styleRow, accentRow, surfacesRow, groupsBox: accentGroupRows(candidate, ctx, redrawAll, radio, change) };
  }

  /**
   * Step 3's accent groups (walkthrough decision G1): a row per group in themeBuilder.js
   * ACCENT_GROUPS, each taking its colors from the accent (the default), a palette color or a
   * custom color kept as a shift from the base, then what the group gets: the color, hovered,
   * text on it, a selection tint and a wash. While the Accent role has an edit, the edit wins
   * over every group (G2), and the box says so.
   */
  function accentGroupRows(candidate, ctx, redrawAll, radio, change) {
    const s = stateOf(ctx);
    const B = Builder();
    const groups = B.cleanAccentGroups(s.accentGroups);
    const last = candidate.colors.length - 1;
    const setGroup = (id, src) => {
      const next = { ...groups };
      if (src) next[id] = src;
      else delete next[id];
      s.accentGroups = next;
    };
    const accentEdited = Boolean(s.edits.swatches.accent);
    const accentHex = accentHexOf(candidate, s);
    const rows = Object.entries(B.ACCENT_GROUPS).map(([id, def]) => {
      const src = groups[id];
      const own = src && Number.isInteger(src.index) ? Math.min(src.index, last) : -1;
      const customOn = Boolean(src && src.color);
      const sourceHex = !src ? accentHex : customOn ? (B.isShift(src.color) ? B.applyShift(src.color, baseHexOf(candidate)) : src.color) : candidate.colors[own];
      let customColor = sourceHex;
      const at = `.gb-ag-row[data-group="${id}"] .gb-ag-custom`;
      const custom = colorPicker({
        label: `${def.label}: custom color`, value: sourceHex, className: 'gb-ag-custom',
        snapshot: () => ({ ...B.cleanAccentGroups(s.accentGroups) }),
        input: hex => { customColor = hex; setGroup(id, { color: frameShift(candidate, hex) }); markChanged(); save(ctx); },
        change: hex => { const refocus = refocusNear(custom, at); customColor = hex; setGroup(id, { color: frameShift(candidate, hex) }); markChanged(); save(ctx); redrawAll(); refocus(); },
        cancel: snap => { const refocus = refocusNear(custom, at); if (snap) s.accentGroups = snap; save(ctx); redrawAll(); refocus(); },
      });
      const picks = h('div', { class: 'gb-ch-picks', role: 'radiogroup', 'aria-label': `${def.label} color` },
        radio('gb-ag-pick', `${def.label}: follow the accent`, 'accent', !src, change(() => setGroup(id, null)), 'Accent'),
        candidate.colors.map((hex, i) => radio('gb-ag-pick', `${def.label}: color ${i + 1} ${hex}`, i, i === own,
          change(() => setGroup(id, { index: i })), dot(hex), ` ${i + 1}`)),
        radio('gb-ag-pick', `${def.label}: custom color`, 'custom', customOn, change(() => setGroup(id, { color: frameShift(candidate, customColor) })), 'Custom'),
        custom);
      const set = B.accentSet(sourceHex);
      const sample = h('span', { class: 'gb-ag-sample' }, 'Aa');
      sample.style.background = set.accent;
      sample.style.color = set.accentText;
      const preview = h('span', {
        class: 'gb-ag-preview', title: 'What the group gets: its color, the color hovered, text on it, a selection tint and a wash, worked out by the accent\'s rules (lifted to 4.5:1 on the editor background)',
      }, dot(set.accent), dot(set.accentHover), sample, dot(set.accentSel), dot(set.accentWash));
      return h('div', { class: 'gb-fe-row gb-ag-row', role: 'group', 'aria-label': def.label, 'data-group': id },
        h('span', { class: 'gb-fe-l gb-ag-l', title: def.about }, def.label, h('small', { class: 'muted' }, `${def.keys.length} colors`)),
        picks, preview);
    });
    return h('div', { class: 'gb-ag', role: 'group', 'aria-label': 'Accent groups' },
      h('div', { class: 'gb-ag-head' }, h('span', { class: 'gb-ag-title' }, 'Accent groups'),
        h('span', { class: 'muted gb-ag-key', title: 'Each row ends with what the group gets: its color, the color hovered, text on it, a selection tint and a wash' }, 'Preview: color, hover, text, selection, wash')),
      h('p', { class: 'muted gb-ag-note' }, 'Give a set of controls its own color. On Accent a group follows the accent above. Whichever color it takes, its hover, text and selection shades are worked out from it.'),
      accentEdited ? h('p', { class: 'gb-ag-overridden' }, 'The Accent role in step 4, Roles, has an edit of its own. It wins over these choices until you reset it there.') : null,
      rows);
  }

  /**
   * Step 3's state line, short enough for the heading: 'Frame 1 Filled · Accent 1 · Neutral
   * surfaces', then how many accent groups have a color of their own. The step names them.
   */
  function frameEditorState(candidate, s) {
    const last = candidate.colors.length - 1;
    const f = s.frame;
    const frame = f.color ? 'Frame Custom' : `Frame ${Math.min(Number(f.index) || 0, last) + 1}`;
    const accent = s.accentColor ? 'Accent Custom' : `Accent ${Math.min(Number(s.chromeIndex) || 0, last) + 1}`;
    const surfaces = CHROME_SURFACES[s.surfaces] ? CHROME_SURFACES[s.surfaces].name : s.surfaces;
    const own = Object.keys(Builder().cleanAccentGroups(s.accentGroups)).length;
    const groups = own ? ` · ${own} ${own === 1 ? 'group' : 'groups'} with own color` : '';
    return `${frame} ${f.style === 'dark' ? 'Dark' : 'Filled'} · ${accent} · ${surfaces} surfaces${groups}`;
  }

  /**
   * The Roles step's settings in the state (syntax, depth, text), cleaned by the builder, with
   * each one left out while it is at its default, so a design made without touching them saves
   * and tries as it always did. Syntax [0, 1, 2, 3, 4] is the default order.
   */
  function roleSettingsOf(s) {
    const c = Builder().cleanChrome(s);
    const out = {};
    if (c.syntax && c.syntax.some((v, i) => v !== i)) out.syntax = c.syntax;
    if (c.depth !== 1) out.depth = c.depth;
    if (c.text !== 'standard') out.text = c.text;
    if (Object.keys(c.accentGroups).length) out.accentGroups = c.accentGroups;
    return out;
  }

  /**
   * Puts the Roles step's settings from a Try record or a saved design into the state, cleaned
   * (a depth out of range comes in clamped, so the slider can show it), and clears those absent.
   */
  function takeRoleSettings(ui, src) {
    const c = roleSettingsOf(src || {});
    delete ui.syntax;
    delete ui.depth;
    delete ui.text;
    delete ui.accentGroups;
    Object.assign(ui, c);
  }

  /**
   * The candidate as a saved theme's design (src/themeLibrary.ts Design): its palette and
   * the settings that made it, the Editor and Frame choices, the Roles step's settings when
   * changed, and the color edits.
   */
  function designOf(candidate, s) {
    const chromeIndex = Math.min(Number(s.chromeIndex) || 0, candidate.colors.length - 1);
    return {
      mode: candidate.source,
      ...(candidate.source === 'generated'
        ? { rule: candidate.rule, hue: candidate.baseHue, lightness: candidate.lightness, chroma: candidate.chroma }
        : { pasted: candidate.colors.slice() }),
      colors: candidate.colors.slice(),
      chromeIndex,
      ...(s.accentColor ? { accentColor: s.accentColor } : {}),
      surfaces: s.surfaces,
      frame: { ...s.frame },
      edits: Builder().cleanEdits(s.edits),
      ...roleSettingsOf(s),
    };
  }

  /**
   * Step 6's first line: Name, Try in VS Code and Save theme. `showResult` redraws the bar's
   * result text, which Name, Try and Save change.
   */
  function decisionControls(candidate, ctx, showResult = () => {}) {
    const id = paletteId(candidate);
    // A new palette renames the design only while Name still shows the last default (or is
    // empty): a typed name, or a loaded theme's, stays, so Save updates that theme.
    if (draft.id !== id) {
      const named = draft.name.trim() !== '' && draft.name !== draft.auto;
      const auto = defaultName(candidate);
      draft = named ? { ...draft, id, auto } : { id, name: auto, note: '', auto };
    }
    const SAVE_TITLE = 'Saves this design under its name to your saved themes, which every VS Code window can use';
    const library = Array.isArray(ctx.library) ? ctx.library : [];
    /**
     * The saved theme this design is, when Name is the name it was saved or loaded under and
     * nothing has changed since; Use in this project and Use everywhere act on it.
     */
    const savedAs = () => {
      const n = draft.name.trim();
      if (!n || !result.ownName || !sameName(n, result.ownName) || result.text === 'Unsaved changes') return null;
      return library.find(t => t && sameName(t.name, n)) || null;
    };
    const use = (where, label, title) => h('button', {
      class: 'secondary gb-bar-use', 'data-action': where, title,
      onclick: () => {
        const t = savedAs();
        if (t) ctx.post({ type: 'useTheme', id: t.id, where });
      },
    }, label);
    const useProject = ctx.hasFolder
      ? use('project', 'Use in this project', 'Gives this project its own frame and Editor colors from the saved theme; other projects keep theirs')
      : null;
    const useEverywhere = use('everywhere', 'Use everywhere', 'Applies the saved theme\'s Editor colors to every window; each project keeps its own frame');
    const syncSave = () => {
      const empty = !draft.name.trim();
      saveTheme.disabled = empty;
      saveTheme.title = empty ? 'Name the design to save it' : SAVE_TITLE;
      // Once saved, the theme can be put to use from here, not only from Start > Saved themes.
      const saved = Boolean(savedAs());
      for (const b of [useProject, useEverywhere]) if (b) b.hidden = !saved;
    };
    const name = h('input', {
      type: 'text', class: 'gb-pl-name', value: draft.name,
      oninput: ev => { draft.name = ev.target.value; syncSave(); showResult(); },
    });
    // Applies the candidate, with its Editor and Frame choices, as the GigglyBits Dark (Lab)
    // theme. It writes settings.
    const apply = h('button', {
      class: 'gb-pl-apply',
      title: 'Writes this palette to your settings under GigglyBits Dark (Lab) and switches to that theme',
      onclick: () => {
        const s = stateOf(ctx);
        const chromeIndex = Math.min(Number(s.chromeIndex) || 0, candidate.colors.length - 1);
        // settings: what the host records so a Lab opened later under the Lab theme restores
        // this Try (src/labStart.ts TryRecord).
        const settings = {
          mode: s.mode, rule: s.rule, hue: s.hue, lightness: s.lightness, chroma: s.chroma, pasted: s.pasted,
          chromeIndex, ...(s.accentColor ? { accentColor: s.accentColor } : {}), surfaces: s.surfaces, frame: { ...s.frame },
          ...(editCount(s.edits) ? { edits: s.edits } : {}),
          ...roleSettingsOf(s),
        };
        ctx.post({
          type: 'applyPalette',
          entry: { name: draft.name.trim() || defaultName(candidate), colors: candidate.colors.slice(), base: baseHexOf(candidate) },
          chrome: { index: chromeIndex, ...(s.accentColor ? { color: s.accentColor } : {}), surfaces: s.surfaces, frame: { ...s.frame }, ...roleSettingsOf(s) },
          edits: s.edits,
          settings,
          // The groups the preview draws, so the Try looks like the preview.
          groups: previewGroups(ctx, s),
        });
        setResult('Tried in VS Code', 'try');
        showResult();
      },
    }, 'Try in VS Code');
    // Saves the design, everything the Lab holds, to your saved themes (gigglybits.library).
    // The result line says Saved once a library message holds a theme of that name.
    const saveTheme = h('button', {
      class: 'gb-pl-save-theme secondary',
      title: SAVE_TITLE,
      onclick: () => {
        const saveName = draft.name.trim();
        if (!saveName) return;
        result.pendingSave = saveName;
        ctx.post({ type: 'saveTheme', name: saveName, design: designOf(candidate, stateOf(ctx)) });
      },
    }, 'Save theme');
    syncSave();
    // Step 6's first line: its number, Name, then the two buttons.
    return [
      h('span', { class: 'gb-step-n', 'aria-hidden': 'true' }, '6'),
      h('label', { class: 'gb-bar-name' }, h('span', { class: 'gb-bar-l' }, 'Name'), name),
      h('div', { class: 'gb-pl-buttons' }, apply, saveTheme, useProject, useEverywhere),
    ];
  }

  /** Numbers each saved row's action strip, so the chevron can name the strip it controls. */
  let libCount = 0;

  /**
   * Start from > Saved: your saved themes (src/themeLibrary.ts), one line each: its colors,
   * name and slot, a visible Load, and a chevron that shows Use in this project (only with a
   * folder open), Use everywhere and Delete. Enter on a row loads it. The host does the using
   * and deleting; Delete asks there first. `onLoad(name)` runs after a Load.
   */
  function libraryList(ctx, rerender, onLoad = () => {}) {
    const themes = Array.isArray(ctx.library) ? ctx.library : [];
    if (!themes.length) {
      return h('p', { class: 'muted gb-pl-lib-empty' }, 'No saved themes yet. Name a design and click Save theme to keep it here, ready to use in any window.');
    }
    const load = theme => () => {
      loadSaved(ctx.ui, theme);
      save(ctx);
      onLoad(theme.name);
      rerender(true);
    };
    const act = (label, action, onclick, title) => h('button', { class: 'secondary', 'data-action': action, title, onclick }, label);
    const use = (theme, where) => () => ctx.post({ type: 'useTheme', id: theme.id, where });
    return h('div', { class: 'gb-pl-library' }, themes.map(t => {
      const strip = h('div', { class: 'gb-pl-lib-actions', id: `gb-lib-${++libCount}` },
        ctx.hasFolder ? act('Use in this project', 'project', use(t, 'project'), 'Gives this project its own frame and Editor colors from this theme; other projects keep theirs') : null,
        act('Use everywhere', 'everywhere', use(t, 'everywhere'), "Applies this theme's Editor colors to every window; each project keeps its own frame"),
        act('Delete', 'delete', () => ctx.post({ type: 'deleteTheme', id: t.id }), 'Deletes this saved theme; VS Code asks first'));
      strip.hidden = true;
      const more = h('button', {
        class: 'secondary gb-pl-lib-more', 'aria-expanded': 'false', 'aria-controls': strip.id, 'aria-label': `More for ${t.name}`, title: 'Use or delete',
        onclick: () => {
          strip.hidden = !strip.hidden;
          more.setAttribute('aria-expanded', String(!strip.hidden));
        },
      }, h('span', { class: 'codicon codicon-chevron-down', 'aria-hidden': 'true' }));
      const loadIt = load(t);
      return h('div', {
        class: 'gb-pl-row gb-pl-lib-row', 'data-id': t.id, tabindex: '0', title: 'Enter loads this theme',
        onkeydown: ev => { if (ev.key === 'Enter' && ev.target === ev.currentTarget) { ev.preventDefault(); loadIt(); } },
      },
      h('div', { class: 'gb-pl-mini' }, (t.design && Array.isArray(t.design.colors) ? t.design.colors : []).map(dot)),
      h('span', { class: 'gb-pl-row-name', title: t.name }, t.name),
      h('span', { class: 'gb-pl-row-slot muted' }, t.slot ? `Theme ${t.slot}` : 'No slot'),
      act('Load', 'load', loadIt, `Makes ${t.name} the design in the Lab`),
      more,
      strip);
    }));
  }

  /** The widget card each style group family is drawn on in the Style groups mode's stage. */
  const FAMILY_CARDS = { tabs: 'tabs', lists: 'lists', buttons: 'buttons', editorText: 'editor-text' };
  /** Whether the Style groups mode is open; never saved in webview state. */
  let groupsMode = false;
  /** Whether the mode's New group disclosure is open. */
  let newGroupOpen = false;

  /**
   * The Style groups mode's task column (CONTRACT-v4 section 3, level 3): the saved groups, one
   * line each with On, name and family, a click on the line showing Load and Delete; then a New
   * group disclosure holding Family and one role select per key or token rule. Load opens New
   * group filled. The host saves, switches and deletes; Delete asks there first. Returns the
   * column and, for the step 6 bar, the Group name input and Save group.
   * `redraw` rebuilds the mode; `redrawStage` redraws only its card.
   */
  function styleGroupsMode(ctx, redraw, redrawStage) {
    const s = stateOf(ctx);
    const B = Builder();
    const families = B.GROUP_FAMILIES;
    const editorRoles = Object.keys(B.SWATCHES).filter(name => B.SWATCHES[name][2] === 'editor');
    const d = s.groupDraft;
    const family = families[d.family];
    const familySelect = h('select', {
      class: 'gb-sg-family', 'aria-label': 'Family',
      onchange: ev => {
        // Another family has other rows, so its roles start empty.
        s.groupDraft = { family: ev.target.value, name: d.name, roles: {} };
        save(ctx);
        redraw();
        const again = /** @type {HTMLElement | null} */ (document.querySelector('.gb-sg-family'));
        if (again) again.focus();
      },
    }, Object.entries(families).map(([id, f]) => h('option', { value: id, selected: id === d.family }, f.label)));
    const roleSelect = name => {
      const select = h('select', {
        class: 'gb-sg-role', 'aria-label': `${name} role`,
        onchange: ev => {
          const roles = { ...s.groupDraft.roles };
          if (ev.target.value) roles[name] = ev.target.value; else delete roles[name];
          s.groupDraft = { ...s.groupDraft, roles };
          save(ctx);
          redrawStage();
        },
      },
      h('option', { value: '' }, "Theme's own"),
      editorRoles.map(role => h('option', { value: role }, B.SWATCHES[role][0])));
      select.value = d.roles[name] || '';
      return select;
    };
    const rows = [...family.keys, ...family.tokens].map(name =>
      h('div', { class: 'gb-sg-row', 'data-name': name }, h('code', null, name), roleSelect(name)));

    const saveButton = h('button', {
      class: 'gb-sg-save secondary',
      onclick: () => {
        const g = s.groupDraft;
        if (!g.name.trim()) return;
        ctx.post({ type: 'saveGroup', name: g.name.trim(), family: g.family, roles: { ...g.roles } });
      },
    }, 'Save group');
    const syncSave = () => {
      const empty = !s.groupDraft.name.trim();
      saveButton.disabled = empty;
      saveButton.title = empty ? 'Name the group to save it' : 'Saves this group; one group per family is on at a time';
    };
    const nameInput = h('input', {
      type: 'text', class: 'gb-sg-name', 'aria-label': 'Group name', placeholder: 'Name this group', value: d.name,
      oninput: ev => {
        s.groupDraft = { ...s.groupDraft, name: ev.target.value };
        syncSave();
        save(ctx);
      },
    });
    syncSave();

    const saved = groupsOf(ctx);
    const act = (label, action, onclick) => h('button', { class: 'secondary', 'data-action': action, onclick }, label);
    const savedRow = g => {
      const on = h('input', {
        type: 'checkbox', 'data-action': 'on', 'aria-label': `${g.name} on`,
        onchange: ev => ctx.post({ type: 'setGroupOn', id: g.id, on: ev.target.checked }),
      });
      on.checked = g.on === true;
      const actions = h('div', { class: 'gb-sg-actions' },
        act('Load', 'load', () => {
          s.groupDraft = { family: g.family, name: g.name, roles: { ...(g.roles || {}) } };
          newGroupOpen = true;
          save(ctx);
          redraw();
        }),
        act('Delete', 'delete', () => ctx.post({ type: 'deleteGroup', id: g.id })));
      actions.hidden = true;
      const toggle = h('button', {
        class: 'secondary gb-sg-toggle', 'aria-expanded': 'false', title: 'Show Load and Delete',
        onclick: () => {
          actions.hidden = !actions.hidden;
          toggle.setAttribute('aria-expanded', String(!actions.hidden));
        },
      },
      h('span', { class: 'gb-pl-row-name' }, g.name),
      h('span', { class: 'gb-sg-family-name muted' }, families[g.family] ? families[g.family].label : g.family));
      return h('div', { class: 'gb-sg-saved', 'data-id': g.id }, h('label', { class: 'gb-sg-on' }, on, ' On'), toggle, actions);
    };
    const list = h('div', { class: 'gb-sg-list' },
      h('h3', { class: 'gb-sg-h' }, `Saved groups (${saved.length})`),
      saved.length ? saved.map(savedRow) : h('p', { class: 'muted gb-sg-empty' }, 'No style groups yet. Build one under New group and click Save group.'));
    const fresh = h('details', { class: 'gb-sg-new' },
      h('summary', null, 'New group'),
      h('p', { class: 'muted gb-sg-about' }, "A group draws a family's colors from the theme roles you pick. A group that is on applies to every saved theme you use, each in its own colors; one per family is on at a time. A single color you edited in a theme still wins."),
      fieldRow('Family', [familySelect]),
      h('div', { class: 'gb-sg-rows' }, rows));
    fresh.open = newGroupOpen;
    fresh.addEventListener('toggle', () => { newGroupOpen = fresh.open; });
    return { column: h('div', { class: 'gb-sg' }, list, fresh), nameInput, saveButton };
  }

  // ------------------------------------------------------------------ render

  /** Whether the Lab root was last at least 75rem wide; a redraw keeps the layout it had. */
  let wide = false;

  /** 75rem in pixels: from this width the Lab is two panes (palette.css uses the same breakpoint). */
  function wideFrom() {
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    return 75 * rem;
  }

  /** A step's numbered heading; `state` is the span that carries the step's one-line state. */
  function stepHead(n, title, state) {
    return h('h3', { class: 'gb-step-h', id: `gb-step-${n}-h` },
      h('span', { class: 'gb-step-n', 'aria-hidden': 'true' }, String(n)), h('span', { class: 'gb-step-t' }, title), state);
  }

  /** One numbered step: its heading with its state line, then its body. */
  function step(n, title, state, ...body) {
    return h('div', { class: `gb-step gb-s${n}`, 'data-step': String(n), role: 'group', 'aria-labelledby': `gb-step-${n}-h` },
      stepHead(n, title, state), h('div', { class: 'gb-step-body', id: `gb-step-${n}-b` }, ...body));
  }

  /** Step 1's state line: where the palette came from. */
  function sourceLine(candidate, s) {
    if (typeof s.sourceLabel === 'string' && s.sourceLabel) return s.sourceLabel;
    return candidate.source === 'generated' ? `Wheel, ${defaultName(candidate)}` : `Pasted, ${candidate.colors.length} colors`;
  }

  const editsWord = n => `${n} ${n === 1 ? 'edit' : 'edits'}`;

  /**
   * The Theme Lab page: the Preview card (whether the Theme Preview window is open, and Open
   * Preview), steps 1, 2 and 3, step 4 (Roles), step 5 (Edit) and the step 6
   * bar. The preview itself is drawn only in the Theme Preview window (src/themePreviewPanel.ts).
   * From 75rem the page is two panes, the steps and the bar on the left and the Preview card
   * and steps 4 and 5 on the right; narrower, one column. `ctx.detached` says whether the window is open.
   */
  function render(ctx) {
    const s = stateOf(ctx);
    ownPick(s);
    const windowOpen = ctx.detached === true;
    const library = Array.isArray(ctx.library) ? ctx.library : [];
    // A Save waits for the library message that holds its theme, then says so.
    const savedNow = result.pendingSave && library.find(t => t && sameName(t.name, result.pendingSave));
    if (savedNow) {
      setResult(`Saved as ${savedNow.name}`, 'save');
      result.ownName = savedNow.name;
      result.pendingSave = null;
    }
    const grid = h('div', { class: 'gb-lab-grid' });
    const root = h('div', { class: 'gb-palette' }, grid);

    // The candidate's parts live in these slots. A change redraws their contents; the
    // controls and tablists stay, so focus and tabs hold.
    // states[4] is step 5's (Edit), named by its class gb-s4; states.roles is step 4's (Roles).
    const states = { 1: h('span', { class: 'gb-step-state' }), 2: h('span', { class: 'gb-step-state' }), 3: h('span', { class: 'gb-step-state' }), 4: h('span', { class: 'gb-step-state' }), roles: h('span', { class: 'gb-step-state' }) };
    const paletteSlot = h('div', { class: 'gb-pl-summary' });
    const feSlot = h('div', { class: 'gb-fe' });
    const rolesSlot = h('div', { class: 'gb-rfs' });
    /** Focuses the Lab's first element matching `selector`, after a redraw has replaced it. */
    const focusIn = selector => {
      const el = /** @type {HTMLElement | null} */ (root.querySelector(selector));
      if (el) el.focus();
    };
    // Roles on the step 5 line opens step 4 if it is collapsed, scrolls to it and focuses its
    // first chip: the keyboard path to any color without a pick (CONTRACT-v4 section 7).
    const rolesGo = h('button', {
      class: 'secondary gb-roles-go', title: 'Moves to step 4, Roles, where any color in the theme can be changed',
      onclick: () => {
        if (!s.sections.includes(4)) {
          openSection(s, 4);
          save(ctx);
          syncSteps();
        }
        const chip = /** @type {HTMLElement | null} */ (root.querySelector('.gb-roles .gb-role-chip'));
        if (!chip) return;
        if (typeof chip.scrollIntoView === 'function') chip.scrollIntoView({ block: 'nearest' });
        chip.focus();
      },
    }, 'Roles');
    const s4Line = h('div', { class: 'gb-s4-line' },
      h('span', { class: 'gb-s4-text muted' }, 'Click any part of the preview window to fine-tune its colors.'), rolesGo);
    const editHost = h('div', { class: 'gb-s4-edit' });
    const barSlot = h('div', { class: 'gb-bar-main' });
    // Step 6: its heading carries the result text (which reads "Overwrites 'X'" instead while
    // Name is another saved theme's name); under Name and the buttons, the palette summary:
    // each color with its weakest grade, then a sentence on how readable the palette is.
    const chipsEl = h('div', { class: 'gb-bar-chips', role: 'list', 'aria-label': 'Palette colors and their weakest grade' });
    const lowEl = h('span', { class: 'gb-bar-low' });
    // The readability sentence is for screen readers and the palette's tooltip; the bar stays one
    // line shorter for it, since step 2 shows the same grades in full.
    const readEl = h('p', { class: 'gb-bar-read gb-sr' });
    const palEl = h('div', { class: 'gb-bar-pal' }, h('span', { class: 'gb-bar-l' }, 'Palette'), chipsEl);
    const hintEl = h('p', { class: 'gb-bar-hint muted' },
      'Try in VS Code switches to it as GigglyBits Dark (Lab). Save theme adds it to your saved themes.');
    const resultEl = h('span', { class: 'gb-step-state gb-bar-result', role: 'status', 'aria-live': 'polite' });
    const bar2 = h('div', { class: 'gb-bar2' }, hintEl, palEl, readEl);
    function showResult() {
      const name = draft.name.trim();
      const other = name ? library.find(t => t && sameName(t.name, name)) : null;
      const over = other && !(result.ownName && sameName(result.ownName, other.name));
      resultEl.textContent = over ? `Overwrites '${other.name}'` : result.text;
      resultEl.classList.toggle('gb-bar-overwrites', Boolean(over));
    }
    /** Steps 1 to 5 as built for the current width: [{ n, el }], filled by build(). */
    let stepEls = [];
    /**
     * Each of steps 1 to 5 collapses to its heading, a button that opens or closes it. Which are
     * open is the user's choice, kept in s.sections; a pick in the preview opens step 5 and
     * changes no other step (D3 in the walkthrough log).
     */
    function syncSteps() {
      for (const { n, el } of stepEls) {
        const head = /** @type {HTMLElement} */ (el.querySelector(':scope > .gb-step-h'));
        const body = /** @type {HTMLElement} */ (el.querySelector(':scope > .gb-step-body'));
        const parts = [...head.querySelectorAll('.gb-step-n, .gb-step-t, .gb-step-state')];
        const open = s.sections.includes(n);
        body.hidden = !open;
        el.toggleAttribute('data-collapsed', !open);
        el.toggleAttribute('data-open', open);
        const button = /** @type {HTMLElement | null} */ (head.querySelector(':scope > .gb-step-btn'));
        if (button) {
          button.setAttribute('aria-expanded', String(open));
          continue;
        }
        head.replaceChildren(h('button', {
          type: 'button', class: 'gb-step-btn', 'aria-expanded': String(open), 'aria-controls': body.id,
          onclick: () => {
            s.sections = s.sections.includes(n) ? s.sections.filter(x => x !== n) : [...s.sections, n].sort();
            save(ctx);
            syncSteps();
          },
        }, h('span', { class: 'gb-step-chev codicon codicon-chevron-right', 'aria-hidden': 'true' }), ...parts));
      }
      if (allToggle) {
        const allOpen = SECTIONS.every(n => s.sections.includes(n));
        allToggle.textContent = allOpen ? 'Collapse all' : 'Expand all';
        allToggle.setAttribute('aria-label', allOpen ? 'Collapse every step' : 'Expand every step');
      }
    }
    /** Expand all / Collapse all, at the top of the page: opens every step, or closes them all once all are open. */
    const allToggle = h('button', {
      type: 'button', class: 'secondary gb-all-toggle',
      onclick: () => {
        s.sections = SECTIONS.every(n => s.sections.includes(n)) ? [] : SECTIONS.slice();
        save(ctx);
        syncSteps();
      },
    });
    root.prepend(h('div', { class: 'gb-lab-top' }, allToggle));
    /** Matches the page to the dock: the step 5 line gives way to it, and the stage rows change. */
    function layout() {
      root.toggleAttribute('data-docked', dock.state === 'open');
      root.toggleAttribute('data-dock-min', dock.state === 'min');
      s4Line.hidden = dock.state !== 'closed';
      syncSteps();
    }
    function drawCandidate() {
      const candidate = candidateOf(s);
      const columns = columnsOf(ctx);
      const low = lowestOf(candidate.colors, columns);
      states[1].textContent = sourceLine(candidate, s);
      const [lowCls] = contrastGrade(low.ratio);
      const lowTitle = ratioTitle(low.ratio, `${low.hex} on ${low.bg}`, 'The weakest pair in the palette.');
      const lowCol = columns.find(c => c.hex === low.bg);
      states[2].textContent = `Weakest pair ${low.ratio.toFixed(1)}:1 (${GRADE_TAGS[lowCls]}): ${low.hex} on ${lowCol ? lowCol.label : low.bg}`;
      states[2].title = lowTitle;
      states[3].textContent = frameEditorState(candidate, s);
      states[4].textContent = editsWord(editCount(s.edits));
      states.roles.textContent = rolesState(s);
      paletteSlot.replaceChildren(
        contrastIntro(),
        contrastTable(candidate.colors, candidate.details, columns, ctx),
        contrastLegend(),
        h('p', { class: 'gb-pl-adjusted muted' }, 'The table rates the colors as picked. When the theme is built, each color used for code text, and the accent, is raised to at least 4.5:1 and the input outline to 3:1, so a Fail here does not mean unreadable code.'));
      const rows = frameEditorRows(candidate, ctx, drawCandidate);
      feSlot.replaceChildren(rows.frameRow, rows.styleRow, rows.accentRow, rows.surfacesRow, rows.groupsBox);
      const stage = stages(candidate, ctx, drawCandidate, editHost, layout);
      const theme = stage.draw();
      rolesSlot.replaceChildren(...rolesStep(candidate, theme, ctx, stage.edit, drawCandidate, focusIn));
      // decisionControls' first item is a step number, which the heading carries here.
      barSlot.replaceChildren(...decisionControls(candidate, ctx, showResult).slice(1));
      const worst = weakestPerColor(candidate.colors.slice(0, 10), columns);
      chipsEl.replaceChildren(...worst.map(w => {
        const [cls] = contrastGrade(w.ratio);
        const chip = h('span', { class: 'gb-bar-chip', 'aria-hidden': 'true' });
        chip.style.background = w.hex;
        return h('span', { class: 'gb-bar-pill', role: 'listitem', title: ratioTitle(w.ratio, `${w.hex} at its weakest, on ${w.col.label} (${w.col.hex})`) },
          chip, h('span', { class: 'gb-sr' }, `${w.hex}: `), h('span', { class: `badge ${cls}` }, GRADE_TAGS[cls]));
      }));
      lowEl.title = lowTitle;
      lowEl.replaceChildren('Weakest contrast ', h('span', { class: `badge ${lowCls}` }, `${low.ratio.toFixed(1)}:1`), '.');
      readEl.replaceChildren(readabilitySummary(worst), ' ', lowEl);
      palEl.title = `${readabilitySummary(worst)} Weakest contrast ${low.ratio.toFixed(1)}:1.`;
      showResult();
    }

    function rerender(full) {
      if (full) grid.replaceChildren(...build());
      else drawCandidate();
    }

    function generatedChange(apply) {
      return ev => {
        apply(ev.target.value);
        s.mode = 'generated';
        delete s.sourceLabel;
        markChanged();
        save(ctx);
        syncControls();
        drawCandidate();
      };
    }

    const ruleSelect = rulePicker(() => ({ hue: Number(s.hue), lightness: Number(s.lightness), chroma: Number(s.chroma) }), () => s.rule,
      generatedChange(v => { s.rule = v; }));
    const hueRange = h('input', { type: 'range', min: 0, max: 359, step: 1, value: s.hue, 'aria-label': 'Base hue', class: 'gb-pl-hue', oninput: generatedChange(v => { s.hue = Number(v); }) });
    const hueNumber = h('input', { type: 'number', min: 0, max: 359, step: 1, value: s.hue, 'aria-label': 'Base hue value', class: 'gb-pl-hue-number', onchange: generatedChange(v => { s.hue = ((Math.round(Number(v)) % 360) + 360) % 360; }) });
    const lightRange = h('input', { type: 'range', min: 0.3, max: 0.95, step: 0.01, value: s.lightness, 'aria-label': 'Lightness', class: 'gb-pl-lightness', oninput: generatedChange(v => { s.lightness = Number(v); }) });
    const chromaRange = h('input', { type: 'range', min: 0, max: 0.3, step: 0.005, value: s.chroma, 'aria-label': 'Chroma', class: 'gb-pl-chroma', oninput: generatedChange(v => { s.chroma = Number(v); }) });
    const lightValue = h('span', { class: 'gb-pl-value' });
    const chromaValue = h('span', { class: 'gb-pl-value' });

    // Base color picker: picking a color sets hue, lightness and chroma from its OKLCH
    // values, kept within the slider ranges; moving a slider moves the trigger's swatch.
    const pickBase = hex => {
      const o = GBO(hex);
      if (!o) return;
      // A grey has no meaningful hue, so keep the current one.
      if (o.c >= 0.01) s.hue = Math.round(o.h) % 360;
      s.lightness = Math.min(0.95, Math.max(0.3, round(o.l, 2)));
      s.chroma = Math.min(0.3, Math.max(0, round(o.c, 3)));
      s.mode = 'generated';
      delete s.sourceLabel;
      markChanged();
      save(ctx);
      syncControls();
      drawCandidate();
    };
    const BASE_KEYS = ['hue', 'lightness', 'chroma', 'mode', 'sourceLabel'];
    const picker = colorPicker({
      label: 'Base color', value: window.GB.oklchToHex({ l: Number(s.lightness), c: Number(s.chroma), h: Number(s.hue) }),
      className: 'gb-pl-base',
      // The ranges of the Lightness and Chroma sliders below.
      bounds: { l: [0.3, 0.95], c: [0, 0.3] },
      snapshot: () => Object.fromEntries(BASE_KEYS.map(k => [k, s[k]])),
      input: pickBase,
      change: pickBase,
      cancel: snap => {
        if (snap) {
          for (const k of BASE_KEYS) {
            if (snap[k] === undefined) delete s[k];
            else s[k] = snap[k];
          }
        }
        save(ctx);
        syncControls();
        drawCandidate();
      },
    });

    const baseHex = h('code', { class: 'gb-pl-base-hex muted' });

    function syncControls() {
      const l = Number(s.lightness);
      const c = Number(s.chroma);
      const hue = Number(s.hue);
      const base = window.GB.oklchToHex({ l, c, h: hue });
      picker.setValue(base);
      baseHex.textContent = base;
      ruleSelect.sync();
      lightRange.value = String(s.lightness);
      chromaRange.value = String(s.chroma);
      hueRange.value = String(s.hue);
      hueNumber.value = String(s.hue);
      lightValue.textContent = l.toFixed(2);
      chromaValue.textContent = c.toFixed(3);
      // Each track shows what moving its slider does, at the other two values (S3).
      const ramp = (fn, from, to, n) => `linear-gradient(90deg, ${Array.from({ length: n + 1 }, (_, i) => fn(from + ((to - from) * i) / n)).join(', ')})`;
      hueRange.style.setProperty('--gb-track', ramp(x => window.GB.oklchToHex({ l, c, h: x }), 0, 360, 24));
      lightRange.style.setProperty('--gb-track', ramp(x => window.GB.oklchToHex({ l: x, c, h: hue }), 0.3, 0.95, 12));
      chromaRange.style.setProperty('--gb-track', ramp(x => window.GB.oklchToHex({ l, c: x, h: hue }), 0, 0.3, 12));
    }

    /**
     * One slider row on a shared grid, so the three tracks start, end and sit at the same height:
     * the label, the track, then the value in a column of one width (the Hue number box's), and
     * under the track the words for its two ends.
     */
    const sliderRow = (name, range, value, from, to, title) => h('div', { class: 'gb-pl-slider', title },
      h('label', { class: 'gb-pl-field-name', for: range.id }, name), range, value,
      h('div', { class: 'gb-pl-ends', 'aria-hidden': 'true' }, h('span', null, from), h('span', null, to)));
    hueRange.id = `gb-pl-hue-${++sliderCount}`;
    lightRange.id = `gb-pl-light-${sliderCount}`;
    chromaRange.id = `gb-pl-chroma-${sliderCount}`;
    // Two columns where there is room (S1): Base color and Rule, then the three sliders.
    const controls = h('div', { class: 'gb-pl-controls gb-pl-wheel' },
      h('div', { class: 'gb-pl-col' },
        // A div, not a label: a label forwards a click on the picker's ring or panel to the trigger.
        fieldRow('Base color', [picker, baseHex], 'div', 'The color the palette is built around. Pick it here or move the sliders; every color in the theme follows it.'),
        fieldRow('Color rule', [ruleSelect.el], 'div', 'How the other four palette colors relate to the base. Open the list to see each rule\'s colors at your base.')),
      h('div', { class: 'gb-pl-col gb-pl-sliders' },
        sliderRow('Hue', hueRange, hueNumber, '0°', '359°', 'Where the base sits around the color wheel, in degrees: about 30 is red, 140 green and 265 blue.'),
        sliderRow('Lightness', lightRange, lightValue, 'darker', 'lighter', 'How light the base is: OKLCH lightness, where 0 is black and 1 is white. The slider runs from 0.30 to 0.95.'),
        sliderRow('Chroma', chromaRange, chromaValue, 'grayer', 'more vivid', 'How vivid the base is: OKLCH chroma, where 0 is gray and about 0.3 is as vivid as a screen shows.')));

    /** Rebuilds the regions, for a new width or a change of mode. */
    function rebuild() {
      grid.replaceChildren(...build());
    }

    /**
     * The Style groups mode: the task column becomes the groups editor, the stage a temporary
     * view of the draft family's card alone, and the bar Group name, Save group and Try in VS
     * Code. The view does not write the stage tab, so Back to design finds it as it was.
     */
    function buildGroupsMode() {
      const candidate = candidateOf(s);
      const cardView = h('div', { class: 'gb-preview gb-sg-stage' });
      const familyName = h('span', { class: 'gb-sg-stage-name' });
      function drawGroupStage() {
        const theme = themeOf(candidate, s, previewGroups(ctx, s));
        const gctx = galleryContext(theme.colors, theme.tokens, ctx.modernUI);
        const d = s.groupDraft;
        const fam = Builder().GROUP_FAMILIES[d.family];
        familyName.textContent = `Style group preview: ${fam ? fam.label : d.family}`;
        cardView.replaceChildren(widgetCards(theme, gctx, [FAMILY_CARDS[d.family] || d.family], () => {}).node);
      }
      drawGroupStage();
      const sg = styleGroupsMode(ctx, rebuild, drawGroupStage);
      const back = h('button', { class: 'secondary gb-sg-back', onclick: () => { groupsMode = false; rebuild(); } }, 'Back to design');
      const decide = decisionControls(candidate, ctx);
      const tryButton = decide[2].querySelector('.gb-pl-apply');
      const bar = h('div', { class: 'gb-step gb-bar', 'data-step': '6' },
        h('div', { class: 'gb-bar-main' },
          h('span', { class: 'gb-step-n', 'aria-hidden': 'true' }, '6'),
          h('label', { class: 'gb-bar-name' }, h('span', { class: 'gb-bar-l' }, 'Group'), sg.nameInput),
          h('div', { class: 'gb-pl-buttons' }, sg.saveButton, tryButton)),
        h('div', { class: 'gb-bar2' }, 'Theme ', h('span', { class: 'gb-bar-theme muted', title: 'The theme the group is tried with' }, draft.name)));
      const tasks = h('section', { class: 'gb-tasks gb-sg-mode', 'aria-label': 'Style groups' },
        h('div', { class: 'gb-step gb-sg-top' }, back, h('h2', { class: 'gb-sg-title' }, 'Style groups')), sg.column, bar);
      const stage = h('section', { class: 'gb-stage', 'aria-label': 'Style group preview' },
        h('div', { class: 'gb-tabrow' }, familyName), cardView);
      root.toggleAttribute('data-wide', wide);
      root.removeAttribute('data-docked');
      root.removeAttribute('data-dock-min');
      stepEls = [];
      allToggle.hidden = true;
      watch(stage, bar);
      return wide ? [tasks, stage] : [stage, tasks];
    }

    function build() {
      if (groupsMode) return buildGroupsMode();
      syncControls();
      drawCandidate();
      // The foot of the Saved tab opens the Style groups mode.
      const groupsFoot = h('p', { class: 'gb-sg-foot muted' },
        `Style groups (${groupsOf(ctx).length}), shared looks for one widget family`,
        h('button', {
          class: 'secondary', title: 'Opens the style groups in place of the design steps',
          onclick: () => {
            groupsMode = true;
            picked = null;
            dock.state = 'closed';
            rebuild();
          },
        }, 'Edit style groups'));
      const startTabs = window.GB.tabs({
        label: 'Start from',
        selected: s.startTab,
        onSelect: id => { s.startTab = id; save(ctx); },
        tabs: [
          { id: 'wheel', label: 'Color wheel', panel: controls },
          { id: 'saved', label: h('span', null, 'Saved themes', h('span', { class: 'count' }, String(library.length))), panel: h('div', { class: 'gb-pl-saved' }, libraryList(ctx, rerender), groupsFoot) },
        ],
      });
      // startNote: why a fresh Theme Lab opened on the defaults (src/labStart.ts startConfig).
      const note = ctx.startNote ? h('p', { class: 'gb-pl-start-note muted' }, ctx.startNote) : null;
      // The Preview card: the preview is drawn only in the Theme Preview window, which the host
      // opens with the Lab in a window of its own. Open Preview opens it again once closed, or
      // brings the open one forward.
      const previewCard = h('div', { class: 'gb-step gb-away', role: 'group', 'aria-label': 'Preview' },
        h('div', { class: 'gb-away-line' },
          h('span', { class: 'gb-away-text' }, windowOpen
            ? 'The preview is open in its own window. Click any part of it to edit that part\'s colors here.'
            : 'The preview window is closed. Open it to see the theme and to pick parts to edit.'),
          h('button', {
            // Secondary in both states: Try in VS Code is the page's one primary action.
            class: 'secondary gb-away-open',
            title: windowOpen ? 'Brings the preview window forward' : 'Opens the Workbench and widget previews in a window of their own',
            onclick: () => ctx.post({ type: 'openPreviewWindow' }),
          }, 'Open Preview')));

      const s1 = step(1, 'Start', states[1], note,
        h('p', { class: 'gb-step-lead muted' }, 'Pick a base color and a rule. The rule makes five related colors, and every color in the theme is worked out from those five, readability included. Or start from a theme you saved.'),
        startTabs);
      const s2 = step(2, 'Palette', states[2], paletteSlot);
      const s3 = step(3, 'Frame and accent', states[3],
        h('p', { class: 'gb-step-lead muted' }, 'Choose which palette colors the window uses. Text and hover shades on each color are worked out for you and stay readable.'),
        feSlot);
      // Step 4, Roles, has a class of its own: gb-s4 is step 5 (Edit), which kept its class.
      const sRoles = h('div', { class: 'gb-step gb-roles', 'data-step': '4', role: 'group', 'aria-labelledby': 'gb-step-4-h' },
        stepHead(4, 'Roles', states.roles), h('div', { class: 'gb-step-body', id: 'gb-step-4-b' }, rolesSlot));
      // Step 5 keeps the class gb-s4; its body is the line pointing to the preview, or the dock.
      const s4 = h('div', { class: 'gb-step gb-s4', 'data-step': '5', role: 'group', 'aria-labelledby': 'gb-step-5-h' },
        stepHead(5, 'Edit', states[4]), h('div', { class: 'gb-step-body', id: 'gb-step-5-b' }, s4Line, editHost));
      const bar = h('div', { class: 'gb-step gb-bar', 'data-step': '6', role: 'group', 'aria-labelledby': 'gb-step-6-h' },
        stepHead(6, 'Try and save', resultEl), h('div', { class: 'gb-step-body' }, barSlot, bar2));
      stepEls = [...[s1, s2, s3].map((el, i) => ({ n: i + 1, el })), { n: 4, el: sRoles }, { n: 5, el: s4 }];
      allToggle.hidden = false;
      // Wide, the Preview card, step 4 (Roles) and step 5 with its Edit dock have the second pane.
      const tasks = h('section', { class: 'gb-tasks', 'aria-label': 'Design steps' }, ...(wide ? [s1, s2, s3, bar] : [previewCard, s1, s2, s3, sRoles, s4, bar]));
      root.toggleAttribute('data-wide', wide);
      // No preview band on this page (only the Style groups mode has one).
      root.style.setProperty('--band-h', '0px');
      syncSteps();
      watch(bar);
      return wide ? [tasks, h('section', { class: 'gb-stage', 'aria-label': 'Preview, Roles and Edit' }, previewCard, sRoles, s4)] : [tasks];
    }

    // The wide flag follows the root's width; the band and bar heights are published for the
    // scroll margins in palette.css.
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(entries => {
      for (const entry of entries) {
        if (entry.target === root) {
          const width = entry.contentRect.width;
          if (!(width > 0)) continue;
          const next = width >= wideFrom();
          if (next !== wide) {
            wide = next;
            grid.replaceChildren(...build());
          }
        } else {
          const el = /** @type {HTMLElement} */ (entry.target);
          root.style.setProperty(el.classList.contains('gb-bar') ? '--bar-h' : '--band-h', `${el.offsetHeight}px`);
        }
      }
    });
    let watched = [];
    function watch(...els) {
      if (!ro) return;
      for (const el of watched) ro.unobserve(el);
      watched = els;
      for (const el of els) ro.observe(el);
    }

    grid.replaceChildren(...build());
    if (ro) ro.observe(root);
    return root;
  }

  // ------------------------------------------------------------ Theme Preview

  /**
   * The Theme Preview window's page (media/themePreview.js): one scrolling page of the Lab's
   * candidate, a Workbench section then a Widgets section with one card per widget family,
   * every family in the gallery's order, drawn with the same candidate and style groups as the Lab. `ui` is the Lab's
   * Palette Lab state, `groups` the saved style groups. A click on a drawn part posts
   * { type: 'pickPart', part }, part being describePart's plain values, for the Lab to edit.
   * `modernUI` is VS Code's modern UI settings, which the Workbench drawing follows.
   * @param {{ ui: any, groups?: any[], modernUI?: any, post: (message: any) => void }} ctx
   */
  function renderPreview(ctx) {
    const s = stateOf(ctx);
    const candidate = candidateOf(s);
    const theme = themeOf(candidate, s, previewGroups(ctx, s));
    const gctx = galleryContext(theme.colors, theme.tokens, ctx.modernUI);
    const families = widgetFamilies();
    const workbenchSlot = h('div', { class: 'gb-pl-chrome' });
    const widgetsSlot = h('div', { class: 'gb-pl-widgets-wrap' });

    function onPick(part) {
      picked = part;
      ctx.post({ type: 'pickPart', part });
      draw();
    }

    function draw() {
      workbenchSlot.replaceChildren(workbenchDrawing(theme, gctx, onPick).node);
      widgetsSlot.replaceChildren(widgetCards(theme, gctx, families, onPick).node);
    }
    draw();

    const section = (id, title, aside, body) => h('section', { class: 'gb-tp-section', 'aria-labelledby': id },
      h('div', { class: 'gb-tp-head' }, h('h2', { class: 'gb-tp-h', id }, title), aside ? h('span', { class: 'gb-tp-aside muted' }, aside) : null),
      h('div', { class: 'gb-tp-body' }, body));
    return h('div', { class: 'gb-tp' },
      h('p', { class: 'gb-tp-hint muted' }, 'Click any part to edit its colors in the Theme Lab.'),
      section('gb-tp-workbench', 'Workbench', 'A VS Code window in the theme', workbenchSlot),
      section('gb-tp-widgets', 'Widgets', `All ${families.length} widget families, most important first`, widgetsSlot));
  }

  /**
   * Makes a part picked in the Theme Preview window the picked part, opening the Edit dock on
   * it. `ui` is the Palette Lab state.
   * @param {any} ui
   * @param {{ card: string, index: number, keys: string[], around: string[], label: string, region: string | null, fixed: string | null }} part
   */
  function setPicked(ui, part) {
    if (!part || typeof part !== 'object' || typeof part.card !== 'string' || !Array.isArray(part.keys)) return;
    ownPick(ui);
    openDockOn({
      card: part.card,
      index: Number(part.index),
      keys: part.keys.filter(k => typeof k === 'string'),
      around: Array.isArray(part.around) ? part.around.filter(k => typeof k === 'string') : [],
      label: typeof part.label === 'string' ? part.label : '',
      region: typeof part.region === 'string' ? part.region : null,
      fixed: typeof part.fixed === 'string' ? part.fixed : null,
    }, ui);
  }

  /** A new candidate clears the pick, and the dock with it. */
  function clearPick() {
    picked = null;
    dock.state = 'closed';
  }

  /**
   * Makes the last Try in VS Code the candidate again, Editor and Frame choices included.
   * `record` is the host's stored TryRecord (src/labStart.ts); a record from before the Frame
   * existed gets the Dark frame it was tried with. An older record's baseId and baseName,
   * from when a Lab could start from a shipped theme, are not carried into the state.
   * @param {any} ui
   * @param {{ mode: 'generated' | 'pasted', rule?: string, hue?: number, lightness?: number, chroma?: number, pasted?: string[], chromeIndex: number, accentColor?: string, surfaces: string, baseId?: string, baseName?: string }} record
   */
  function restoreTry(ui, record) {
    if (record.mode === 'pasted' && Array.isArray(record.pasted)) {
      Object.assign(ui, { mode: 'pasted', pasted: record.pasted.slice() });
    } else {
      Object.assign(ui, { mode: 'generated', rule: record.rule, hue: record.hue, lightness: record.lightness, chroma: record.chroma });
    }
    ui.chromeIndex = record.chromeIndex;
    if (record.accentColor) ui.accentColor = record.accentColor;
    else delete ui.accentColor;
    ui.surfaces = record.surfaces;
    ui.frame = record.frame ? { ...record.frame } : darkFrame(record.chromeIndex);
    ui.edits = record.edits ? Builder().cleanEdits(record.edits) : noEdits();
    takeRoleSettings(ui, record);
    clearPick();
    delete ui.baseId;
    delete ui.baseName;
    delete ui.sourceLabel;
    draft = { id: '', name: '', note: '', auto: '' };
  }

  /**
   * Makes a saved theme the candidate: its palette, Editor and Frame choices and color edits,
   * with its name in the Name field. `saved` is { name, design } (src/themeLibrary.ts Design).
   * @param {any} ui
   * @param {{ name: string, design: any }} saved
   */
  function loadSaved(ui, saved) {
    const d = saved.design;
    if (d.mode === 'pasted' && Array.isArray(d.pasted)) {
      Object.assign(ui, { mode: 'pasted', pasted: d.pasted.slice() });
    } else {
      Object.assign(ui, { mode: 'generated', rule: d.rule, hue: d.hue, lightness: d.lightness, chroma: d.chroma });
    }
    ui.chromeIndex = d.chromeIndex;
    if (d.accentColor) ui.accentColor = d.accentColor;
    else delete ui.accentColor;
    ui.surfaces = d.surfaces;
    ui.frame = { ...d.frame };
    ui.edits = Builder().cleanEdits(d.edits);
    takeRoleSettings(ui, d);
    clearPick();
    delete ui.baseId;
    delete ui.baseName;
    ui.sourceLabel = `Saved: ${saved.name}`;
    ownPick(ui);
    setResult(`Loaded ${saved.name}`);
    result.ownName = saved.name;
    draft = { id: paletteId(candidateOf(stateOf({ ui }))), name: saved.name, note: '', auto: '' };
  }

  /**
   * Starts a project theme from a folder's old color: the frame becomes `frame` and the Name
   * field shows `name`. The rest of the candidate stays as it is.
   * @param {any} ui
   * @param {{ frame: { color?: string, index?: number, style: 'filled' | 'dark' }, name: string }} seed
   */
  function seedFrame(ui, seed) {
    ui.frame = { ...seed.frame };
    draft = { id: paletteId(candidateOf(stateOf({ ui }))), name: seed.name, note: '', auto: '' };
  }

  // @ts-ignore
  window.GBPalette = { render, renderPreview, setPicked, restoreTry, loadSaved, seedFrame };
})();
