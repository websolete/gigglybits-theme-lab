// @ts-check
// Palette Lab for the Theme Lab: builds a candidate palette from a color-wheel harmony
// rule (or a pasted hex list), measures each color against the dark reference
// backgrounds, and posts include / maybe / exclude decisions to the extension host, which
// writes them to palettes/catalog.json.
//
// The Workbench and Widgets previews draw the whole theme Try in VS Code would apply
// (themeBuilder.js) with the Palette Inspector's widgets (gallery.js). Clicking a drawn part
// opens its color keys for editing, by role or one key at a time; the edits ride along with
// Try in VS Code but are not saved to the catalog.
// startFrom() loads a shipped theme's palette as the candidate; that copy cannot be saved
// until a setting changes, so the shipped palette's catalog entry is never renamed.
//
// Palette colors are literal hex values. The live editor text and comment colors come
// from --vscode-* variables in palette.css.
(function () {
  // @ts-ignore provided by shared.js
  const { h, parseColor, toHex, varFor, contrastRatio, contrastGrade, harmony, paletteId, parseHexList, HARMONY_RULES, CHROME_SURFACES } = window.GB;

  const SEED_BACKGROUNDS = ['#121212', '#1e1e1e', '#252526'];
  /** The background the theme builder targets; the Workbench preview is drawn on it. */
  const THEME_BACKGROUND = '#1e1e1e';
  const DEFAULTS = {
    rule: 'triad', hue: 210, lightness: 0.75, chroma: 0.13, paste: '', mode: 'generated', pasted: null,
    chromeIndex: 0, surfaces: 'neutral',
    startTab: 'wheel', previewTab: 'chrome',
  };
  /** A new design starts with a Filled frame in palette color 1. */
  const DEFAULT_FRAME = () => ({ index: 0, style: 'filled' });
  /** The frame a shipped theme or an older Try had: Dark, following the editor accent. */
  const darkFrame = index => ({ index, style: 'dark' });
  const STATUS_HEADINGS = [['include', 'Include'], ['maybe', 'Maybe'], ['exclude', 'Exclude']];

  /** Last paste result, shown until the next paste. */
  let lastParse = null;
  /** Name and note typed for the current candidate; reset when the candidate changes. */
  let draft = { id: '', name: '', note: '' };

  const round = (v, digits) => Number(Number(v).toFixed(digits));

  /** The palette ui state, filled with defaults. */
  function stateOf(ctx) {
    const s = ctx.ui;
    for (const [k, v] of Object.entries(DEFAULTS)) if (s[k] === undefined) s[k] = v;
    // Color edits are an object per state, never the shared default, and always cleaned.
    s.edits = Builder().cleanEdits(s.edits);
    // The frame is an object per state too: { index } or { color }, and a style.
    const f = s.frame;
    const okStyle = f && (f.style === 'filled' || f.style === 'dark');
    const okColor = f && typeof f.color === 'string' && /^#[0-9a-f]{6}$/i.test(f.color);
    const okIndex = f && Number.isInteger(f.index) && f.index >= 0;
    if (!okStyle || !(okColor || okIndex)) s.frame = DEFAULT_FRAME();
    // The Code tab is gone; a tab saved before it went opens on Workbench.
    if (s.previewTab === 'code') s.previewTab = 'chrome';
    return s;
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
  function fieldRow(name, controls, tag = 'label') {
    return h(tag, { class: 'gb-pl-field' },
      h('span', { class: 'gb-pl-field-name' }, name),
      h(tag === 'label' ? 'span' : 'div', { class: 'gb-pl-field-control' }, ...controls));
  }

  // ------------------------------------------------------------------ pieces

  function swatches(colors, details, ctx) {
    return h('div', { class: 'gb-pl-swatches' }, colors.map((hex, i) => {
      const d = details ? details[i] : GBO(hex);
      const fill = h('div', { class: 'gb-pl-fill' });
      fill.style.background = hex;
      return h('button', { class: 'gb-pl-swatch secondary', title: `Copy ${hex}`, onclick: () => ctx.copy(hex) },
        fill,
        h('span', { class: 'gb-pl-hex' }, hex),
        d ? h('span', { class: 'gb-pl-oklch muted' }, `L ${d.l.toFixed(2)} C ${d.c.toFixed(3)} H ${Math.round(d.h)}`) : null);
    }));
  }

  function columnsOf(ctx) {
    const bgs = ctx.catalog && Array.isArray(ctx.catalog.backgrounds) ? ctx.catalog.backgrounds : SEED_BACKGROUNDS;
    return [...bgs.map(hex => ({ hex, label: hex })), { hex: ctx.liveBackground, label: 'your editor' }];
  }

  /** The one-line answer to "which color is weakest, and where": shown above the actions. */
  function lowestLine(colors, columns) {
    let lowest = null;
    for (const hex of colors) {
      const fg = parseColor(hex);
      for (const col of columns) {
        const ratio = contrastRatio(fg, parseColor(col.hex));
        if (!lowest || ratio < lowest.ratio) lowest = { ratio, hex, bg: col.label };
      }
    }
    const [cls] = contrastGrade(lowest.ratio);
    // Laid out as a labelled row; the hidden ": " keeps the read-aloud and copied text whole.
    return h('p', { class: 'gb-pl-lowest gb-pl-field' },
      h('span', { class: 'gb-pl-field-name' }, 'Lowest contrast'),
      h('span', { class: 'gb-pl-field-control' },
        h('span', { class: 'gb-sr' }, ': '),
        h('span', { class: `badge ${cls}` }, `${lowest.ratio.toFixed(1)}:1`), ` (${lowest.hex} on ${lowest.bg})`));
  }

  /** Every color against every background, for the Contrast tab. */
  function contrastTable(colors, columns) {
    const rows = colors.map((hex, i) => {
      const fg = parseColor(hex);
      return h('tr', null,
        h('th', { scope: 'row' }, dot(hex), ` ${i + 1} ${hex}`),
        columns.map(col => {
          const ratio = contrastRatio(fg, parseColor(col.hex));
          const [cls, words] = contrastGrade(ratio);
          return h('td', null, h('span', { class: `badge ${cls}`, title: `${ratio.toFixed(2)}:1 on ${col.label} (${words})` }, `${ratio.toFixed(1)}:1`));
        }));
    });
    return h('table', { class: 'gb-pl-contrast' },
      h('thead', null, h('tr', null, h('th', null, 'Color'), columns.map(col => h('th', null, col.label)))),
      h('tbody', null, rows));
  }

  /** Names the grade thresholds, so the badge colors never carry the meaning alone. */
  function contrastLegend() {
    return h('p', { class: 'gb-pl-legend' },
      [['aaa', '7:1 AAA'], ['aa', '4.5:1 AA'], ['large', '3:1 large text only'], ['fail', 'under 3:1 fails']]
        .map(([cls, text]) => h('span', { class: `badge ${cls}` }, text)));
  }

  // ------------------------------------------------------------- candidate theme

  // @ts-ignore provided by themeBuilder.js
  const Builder = () => window.GBBuilder;
  // @ts-ignore provided by gallery.js
  const Gallery = () => window.GBGallery;

  const noEdits = () => ({ swatches: {}, keys: {} });
  const editCount = edits => Object.keys(edits.swatches).length + Object.keys(edits.keys).length;

  /** Widget families the Widgets tab shows until the user picks others. */
  const DEFAULT_WIDGETS = ['chat', 'buttons', 'inputs', 'lists', 'quick-input', 'notifications', 'editor-selection', 'editor-diagnostics'];
  const REGION_NAMES = {
    titleBar: 'the title bar', activityBar: 'the activity bar', sideBar: 'the side bar', tabs: 'the editor tabs',
    editorGroup: 'the second editor group', panel: 'the panel', chat: 'the chat view', statusBar: 'the status bar',
  };

  /**
   * The theme Try in VS Code would apply (media/themeBuilder.js, the same code the host runs),
   * Frame included. A folder's own color is not drawn: the preview shows the theme alone.
   */
  function themeOf(candidate, s) {
    const index = Math.min(Number(s.chromeIndex) || 0, candidate.colors.length - 1);
    const chrome = { index, surfaces: s.surfaces, frame: s.frame };
    const entry = { colors: candidate.colors };
    const B = Builder();
    const colors = B.buildColors(entry, chrome, s.edits);
    return {
      index, chrome, colors,
      sw: B.swatches(entry, chrome, s.edits),
      tokens: B.tokenColors(entry, chrome, s.edits),
    };
  }

  /** What gallery.js renderParts needs: the candidate's colors as its model, and its token rules. */
  function galleryContext(colors, tokens) {
    const byKey = new Map();
    for (const [key, value] of Object.entries(colors)) {
      const rgba = parseColor(value);
      if (rgba) byKey.set(key, { key, prop: varFor(key), value, rgba, hex: toHex(rgba), source: 'theme' });
    }
    const rules = tokens.map(r => ({ scope: r.scope.join(', '), foreground: r.settings.foreground, fontStyle: r.settings.fontStyle, origin: 'candidate' }));
    return { model: { byKey, tokens: rules }, tokens: rules };
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

  /** Shrinks a wide drawing to fit its frame, so the whole window shows without scrolling. */
  function fitToWidth(frame) {
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      const inner = /** @type {HTMLElement | null} */ (frame.firstElementChild);
      if (!inner) return;
      inner.style.zoom = '';
      const need = inner.scrollWidth;
      const have = frame.clientWidth;
      inner.style.zoom = need > have && have > 0 ? String(Math.max(0.45, have / need)) : '';
    });
    ro.observe(frame);
  }

  /** The part that was clicked: its card, its position among the card's parts, and its keys. */
  let picked = null;
  /** Which disclosures in the edit panel are open, so a redraw keeps them. */
  const openDetails = new Set();

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

  /** Text and accent contrast for the chrome, as badges. */
  function chromeReadout(colors) {
    const checks = [
      ['Title bar text', 'titleBar.activeForeground', 'titleBar.activeBackground'],
      ['Activity bar icons', 'activityBar.foreground', 'activityBar.background'],
      ['Status bar text', 'statusBar.foreground', 'statusBar.background'],
      ['Active tab line', 'tab.activeBorderTop', 'editor.background'],
      ['Chat input border', 'inlineChatInput.border', 'sideBar.background'],
    ];
    return h('div', { class: 'gb-ch-readout' }, checks.map(([label, fg, bg]) => {
      const ratio = contrastRatio(parseColor(colors[fg]), parseColor(colors[bg]));
      const [cls, words] = contrastGrade(ratio);
      return h('span', { class: 'gb-ch-check', 'data-check': fg },
        `${label} `, h('span', { class: `badge ${cls}`, title: `${ratio.toFixed(2)}:1 (${words})` }, `${ratio.toFixed(1)}:1`));
    }));
  }

  // ------------------------------------------------------------------- editing

  /**
   * The edit panel for the picked part: each key that draws it, the role (swatch) the key
   * takes with a color input that changes the whole role, and behind a disclosure a color
   * input for that key alone. Below: the edits made so far and every role, so a color can be
   * changed without pointing at the preview.
   */
  function editPanel(theme, ctx, info, edit) {
    const s = stateOf(ctx);
    const B = Builder();
    const keyCount = swatch => (B.KEY_GROUPS[swatch] || []).length;
    const roleName = swatch => (B.SWATCHES[swatch] ? B.SWATCHES[swatch][0] : swatch);
    const details = (id, summary, ...kids) => {
      const el = h('details', { class: `gb-pl-disclose gb-pl-${id.split(':')[0]}`, 'data-disclose': id }, h('summary', null, summary), ...kids);
      el.open = openDetails.has(id);
      el.addEventListener('toggle', () => { if (el.open) openDetails.add(id); else openDetails.delete(id); });
      return el;
    };
    const colorInput = (label, current, apply) => {
      const input = h('input', {
        type: 'color', class: 'gb-pl-color', 'aria-label': label, title: label,
        oninput: ev => apply(ev.target.value, false),
        onchange: ev => apply(ev.target.value, true),
      });
      input.value = String(current || '#000000').slice(0, 7);
      return input;
    };
    const reset = (label, clear) => h('button', { class: 'secondary gb-pl-reset', title: label, onclick: () => edit(clear, true) }, 'Reset');
    const setRole = swatch => (value, done) => edit(e => { e.swatches[swatch] = value; }, done);
    const setKey = key => (value, done) => edit(e => { e.keys[key] = value; }, done);

    function keyRow(key) {
      const value = theme.colors[key];
      const swatch = B.SWATCH_OF[key];
      const pair = info ? info.pairs.filter(p => p.fg === key).reduce((a, p) => (!a || p.ratio < a.ratio ? p : a), null) : null;
      const row = h('div', { class: 'gb-pl-key', 'data-key': key },
        h('div', { class: 'gb-pl-key-head' },
          value ? dot(value) : h('span', { class: 'gb-pl-dot gb-pl-dot-none' }),
          h('code', null, key),
          h('span', { class: 'muted' }, value || 'unset'),
          pair ? (() => {
            const [cls, words] = contrastGrade(pair.ratio);
            return h('span', { class: `badge ${cls}`, title: `${pair.ratio.toFixed(2)}:1 on ${pair.bg} (${words})` }, `${pair.ratio.toFixed(1)}:1`);
          })() : null));
      if (swatch) {
        row.append(h('div', { class: 'gb-pl-key-role' },
          h('span', null, 'Role: ', h('b', null, roleName(swatch)), h('span', { class: 'muted' }, ` (${keyCount(swatch)} keys)`)),
          colorInput(`${roleName(swatch)}: every key in this role`, theme.sw[swatch], setRole(swatch)),
          s.edits.swatches[swatch] ? reset(`Undo the edit to ${roleName(swatch)}`, e => { delete e.swatches[swatch]; }) : null));
      } else if (key in Builder().UNSET_KEYS) {
        row.append(h('p', { class: 'muted gb-pl-key-note' }, `Not set by the theme: ${Builder().UNSET_KEYS[key]}`));
      }
      row.append(details(`key:${key}`, s.edits.keys[key] ? 'This key only (edited)' : 'This key only',
        h('div', { class: 'gb-pl-key-role' },
          colorInput(`${key} only`, s.edits.keys[key] || value, setKey(key)),
          s.edits.keys[key] ? reset(`Undo the edit to ${key}`, e => { delete e.keys[key]; }) : null)));
      return row;
    }

    const box = h('div', { class: 'gb-pl-edit gb-box' }, h('h4', null, 'Edit colors'));
    if (!picked) {
      box.append(h('p', { class: 'muted' }, 'Click any part of the preview to see the colors that draw it and change them.'));
    } else {
      const regionOnly = !picked.label && picked.region && REGION_NAMES[picked.region];
      box.append(h('p', { class: 'gb-pl-edit-what' },
        regionOnly ? `The whole of ${REGION_NAMES[picked.region]}` : picked.label ? `"${picked.label}"` : 'The selected part',
        regionOnly ? null :
        picked.region && REGION_NAMES[picked.region] ? h('span', { class: 'muted' }, ` in ${REGION_NAMES[picked.region]}`) : null));
      if (picked.fixed) {
        box.append(h('p', { class: 'muted gb-pl-key-note' }, `Its border is ${picked.fixed}, set by the extension itself. No theme key changes it.`));
      }
      box.append(...picked.keys.map(keyRow));
      // A click usually lands on text, so the box around it (its background and border) is
      // listed too, open: that is often the color the user meant.
      if (picked.around.length) {
        box.append(h('h5', { class: 'gb-pl-around-head' }, 'Around it'), ...picked.around.map(keyRow));
      }
    }

    const edits = s.edits;
    const count = editCount(edits);
    const editRow = (label, value, clear) => h('li', null, dot(value), ` ${label} `, reset(`Undo the edit to ${label}`, clear));
    box.append(h('div', { class: 'gb-pl-edits' },
      h('h4', null, `Your edits (${count})`),
      count ? h('ul', null,
        ...Object.entries(edits.swatches).map(([sw, v]) => editRow(`${roleName(sw)} (role)`, v, e => { delete e.swatches[sw]; })),
        ...Object.entries(edits.keys).map(([k, v]) => editRow(k, v, e => { delete e.keys[k]; }))) : h('p', { class: 'muted' }, 'None yet. Try in VS Code applies them with the palette.'),
      count ? h('button', { class: 'secondary', onclick: () => edit(e => { e.swatches = {}; e.keys = {}; }, true) }, 'Reset all edits') : null));

    const roles = Object.keys(B.SWATCHES).filter(sw => keyCount(sw) || sw === 'kw');
    // Frame roles first, then Editor roles, each under its own heading.
    const roleRows = group => roles.filter(sw => B.SWATCHES[sw][2] === group).map(sw => h('div', { class: 'gb-pl-role', 'data-swatch': sw, 'data-group': group },
      colorInput(`${roleName(sw)}: every key in this role`, theme.sw[sw], setRole(sw)),
      h('span', null, h('b', null, roleName(sw)), h('span', { class: 'muted' }, ` ${B.SWATCHES[sw][1]}`)),
      edits.swatches[sw] ? reset(`Undo the edit to ${roleName(sw)}`, e => { delete e.swatches[sw]; }) : null));
    box.append(details('roles', `Every role (${roles.length})`,
      h('h5', { class: 'gb-pl-around-head gb-pl-role-group' }, 'Frame'),
      h('div', { class: 'gb-pl-roles' }, roleRows('frame')),
      h('h5', { class: 'gb-pl-around-head gb-pl-role-group' }, 'Editor'),
      h('div', { class: 'gb-pl-roles' }, roleRows('editor'))));
    return box;
  }

  // ----------------------------------------------------------------- the stages

  /**
   * The Workbench and Widgets tabs. Each holds a preview stage (the drawing and the edit
   * panel) that is redrawn on its own while a color input is being dragged, so the input
   * stays open; everything else redraws with the candidate.
   */
  function stages(candidate, ctx, redrawAll) {
    const s = stateOf(ctx);
    const workbenchStage = h('div', { class: 'gb-pl-stage' });
    const widgetsStage = h('div', { class: 'gb-pl-stage' });
    let frame = 0;

    function edit(apply, done) {
      const next = { swatches: { ...s.edits.swatches }, keys: { ...s.edits.keys } };
      apply(next);
      s.edits = next;
      save(ctx);
      if (done) {
        redrawAll();
        return;
      }
      // Dragging a color input: redraw the drawings only, at most once a frame.
      const run = () => { frame = 0; draw(false); };
      if (frame) return;
      frame = typeof requestAnimationFrame === 'function' ? requestAnimationFrame(run) : setTimeout(run, 16);
    }

    function pick(part) {
      picked = part;
      draw(true);
      const panel = (s.previewTab === 'widgets' ? widgetsStage : workbenchStage).querySelector('.gb-pl-edit');
      if (panel && typeof panel.scrollIntoView === 'function') panel.scrollIntoView({ block: 'nearest' });
    }

    function workbench(theme, gctx) {
      const [part] = Gallery().renderParts(gctx, ['workbench']);
      const scope = scoped(theme.colors, part.preview);
      pickable(scope, 'workbench', pick);
      const fit = h('div', { class: 'gb-pl-fit' }, scope);
      fitToWidth(fit);
      return { node: h('div', { class: 'gb-pl-stage-main' }, fit, chromeReadout(theme.colors)), info: part.info };
    }

    function widgets(theme, gctx) {
      const chosen = Array.isArray(s.widgets) ? s.widgets : DEFAULT_WIDGETS;
      const parts = Gallery().renderParts(gctx, chosen);
      const infos = {};
      const cards = parts.map(p => {
        infos[p.id] = p.info;
        const scope = scoped(theme.colors, p.preview);
        pickable(scope, p.id, pick);
        const worst = p.info.worst;
        return h('section', { class: 'gb-pl-widget', 'data-card': p.id },
          h('div', { class: 'gb-pl-widget-head' },
            h('h4', null, p.title),
            worst ? (() => {
              const [cls, words] = contrastGrade(worst.ratio);
              return h('span', { class: 'muted', title: `${worst.fg} on ${worst.bg} (${words})` }, 'lowest ', h('span', { class: `badge ${cls}` }, `${worst.ratio.toFixed(1)}:1`));
            })() : null),
          p.blurb ? h('p', { class: 'muted gb-pl-widget-blurb' }, p.blurb) : null,
          h('div', { class: 'gb-pl-widget-preview' }, scope));
      });
      return { node: h('div', { class: 'gb-pl-stage-main gb-pl-widget-list' }, cards.length ? cards : h('p', { class: 'muted' }, 'Pick a widget family above.')), info: picked ? infos[picked.card] : null };
    }

    /** Draws the active tab's stage; withPanel false keeps the edit panel and its open input. */
    function draw(withPanel) {
      if (s.previewTab !== 'chrome' && s.previewTab !== 'widgets') return;
      const theme = themeOf(candidate, s);
      const gctx = galleryContext(theme.colors, theme.tokens);
      const stage = s.previewTab === 'widgets' ? widgetsStage : workbenchStage;
      const { node, info } = s.previewTab === 'widgets' ? widgets(theme, gctx) : workbench(theme, gctx);
      const old = stage.querySelector('.gb-pl-stage-main');
      const oldPanel = stage.querySelector('.gb-pl-edit');
      const panel = withPanel || !oldPanel ? editPanel(theme, ctx, info, edit) : oldPanel;
      if (old && !withPanel) old.replaceWith(node);
      else stage.replaceChildren(node, panel);
    }

    return { workbenchStage, widgetsStage, draw };
  }

  /** The frame's hex color: its custom color, or the palette color its index picks. */
  function frameColor(candidate, frame) {
    if (frame.color) return frame.color;
    return candidate.colors[Math.min(Number(frame.index) || 0, candidate.colors.length - 1)];
  }

  /** The Workbench tab: the Frame and Editor choices, then the stage. */
  function workbenchSection(candidate, ctx, stageApi, redrawAll) {
    const s = stateOf(ctx);
    const index = Math.min(Number(s.chromeIndex) || 0, candidate.colors.length - 1);
    const frame = s.frame;
    const custom = Boolean(frame.color);
    const frameIndex = custom ? -1 : Math.min(Number(frame.index) || 0, candidate.colors.length - 1);
    const color = frameColor(candidate, frame);
    const change = apply => ev => { apply(ev); save(ctx); redrawAll(); };
    const radio = (cls, label, i, picked, onclick, ...kids) => {
      const b = h('button', {
        class: `${cls} secondary`, role: 'radio', 'aria-checked': String(picked), title: label, 'data-index': String(i), onclick,
      }, ...kids);
      b.classList.toggle('gb-ch-picked', picked);
      return b;
    };

    // Frame: one palette color, or a custom one, and a style.
    const customInput = h('input', {
      type: 'color', class: 'gb-fr-custom-color', 'aria-label': 'Custom frame color', title: 'Custom frame color',
      onchange: change(ev => { s.frame = { color: ev.target.value.toLowerCase(), style: frame.style }; }),
    });
    customInput.value = color;
    const framePicks = h('div', { class: 'gb-ch-picks', role: 'radiogroup', 'aria-label': 'Frame color' },
      candidate.colors.map((hex, i) => radio('gb-fr-pick', `Frame color ${i + 1} ${hex}`, i, i === frameIndex,
        change(() => { s.frame = { index: i, style: frame.style }; }), dot(hex), ` ${i + 1}`)),
      radio('gb-fr-pick', 'Custom frame color', 'custom', custom,
        change(() => { s.frame = { color: customInput.value.toLowerCase(), style: frame.style }; }), 'Custom'),
      customInput);
    const style = h('select', { class: 'gb-fr-style', 'aria-label': 'Frame style', onchange: change(ev => { s.frame = { ...frame, style: ev.target.value }; }) },
      h('option', { value: 'filled', selected: frame.style === 'filled' }, 'Filled'),
      h('option', { value: 'dark', selected: frame.style === 'dark' }, 'Dark'));
    // Hands the frame color to the per-folder color feature, which pins it for this folder.
    const useForFolder = h('button', {
      class: 'gb-fr-use secondary',
      title: `Sets ${color} as this folder's color, kept as entered under every theme`,
      onclick: () => ctx.post({ type: 'useAsIdentity', color }),
    }, 'Use the frame color for this folder');

    // Editor: the accent color and the surface tint.
    const accentPicks = h('div', { class: 'gb-ch-picks', role: 'radiogroup', 'aria-label': 'Editor accent' },
      candidate.colors.map((hex, i) => radio('gb-ch-pick', `Editor accent ${i + 1} ${hex}`, i, i === index,
        change(() => { s.chromeIndex = i; }), dot(hex), ` ${i + 1}`)));
    const surfaces = h('select', { class: 'gb-ch-surfaces', 'aria-label': 'Surfaces', onchange: change(ev => { s.surfaces = ev.target.value; }) },
      Object.entries(CHROME_SURFACES).map(([id, def]) => h('option', { value: id, selected: s.surfaces === id }, def.name)));

    return h('div', { class: 'gb-ch' },
      h('p', { class: 'muted' }, 'The whole theme Try in VS Code applies, drawn on ', THEME_BACKGROUND, '. Click any part to edit its colors.'),
      h('div', { class: 'gb-ch-boxes' },
        h('fieldset', { class: 'gb-box gb-ch-choices gb-fr-box' },
          h('legend', null, 'Frame'),
          h('p', { class: 'muted' }, 'Title bar, activity bar, status bar and window border.'),
          fieldRow('Color', [framePicks], 'div'),
          fieldRow('Style', [style]),
          ctx.identityFill
            ? h('p', { class: 'muted gb-fr-note' }, "This folder has its own color, which VS Code draws over any theme's frame.")
            : null,
          h('div', { class: 'gb-ch-actions' }, useForFolder)),
        h('fieldset', { class: 'gb-box gb-ch-choices gb-ed-box' },
          h('legend', null, 'Editor'),
          h('p', { class: 'muted' }, 'Everything else: editor, side bar, tabs, panel, inputs and widgets.'),
          fieldRow('Accent', [accentPicks], 'div'),
          fieldRow('Surfaces', [surfaces]))),
      stageApi.workbenchStage);
  }

  /** The Widgets tab: which widget families to draw, then the stage. */
  function widgetsSection(ctx, stage, redrawAll) {
    const s = stateOf(ctx);
    const chosen = new Set(Array.isArray(s.widgets) ? s.widgets : DEFAULT_WIDGETS);
    const boxes = Gallery().cards.filter(c => c.id !== 'workbench').map(c => {
      const box = h('input', {
        type: 'checkbox', 'data-widget': c.id,
        onchange: ev => {
          if (ev.target.checked) chosen.add(c.id); else chosen.delete(c.id);
          s.widgets = Gallery().cards.map(x => x.id).filter(id => chosen.has(id));
          save(ctx);
          redrawAll();
        },
      });
      box.checked = chosen.has(c.id);
      return h('label', null, box, ` ${c.title}`);
    });
    return h('div', { class: 'gb-pl-widgets' },
      h('p', { class: 'muted' }, 'The same widgets the Palette Inspector draws, in the candidate\'s colors. Click any part to edit its colors.'),
      h('div', { class: 'gb-box gb-pl-widget-picker' },
        h('h4', null, 'Widget families'),
        h('details', null, h('summary', null, `${chosen.size} of ${boxes.length} shown`), h('div', { class: 'gb-ch-controls' }, boxes))),
      stage);
  }

  /**
   * The candidate as a saved theme's design (src/themeLibrary.ts Design): its palette and
   * the settings that made it, the Editor and Frame choices, and the color edits.
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
      surfaces: s.surfaces,
      frame: { ...s.frame },
      edits: Builder().cleanEdits(s.edits),
    };
  }

  function decisionControls(candidate, ctx, rerender) {
    const id = paletteId(candidate);
    if (draft.id !== id) draft = { id, name: defaultName(candidate), note: '' };
    const s = stateOf(ctx);
    // A shipped palette loaded by startFrom() and not yet changed: saving it would replace
    // its own catalog entry, since the id comes from the settings, not the name.
    const asShipped = Boolean(s.baseId) && s.baseId === id;
    const disabled = !ctx.catalogPath || asShipped;
    const name = h('input', { type: 'text', class: 'gb-pl-name', 'aria-label': 'Palette name', value: draft.name, oninput: ev => { draft.name = ev.target.value; } });
    const note = h('textarea', { class: 'gb-pl-note', rows: 2, 'aria-label': 'Note', placeholder: 'Why it is in or out', oninput: ev => { draft.note = ev.target.value; } });
    note.value = draft.note;
    const decide = status => () => {
      const entry = {
        id,
        name: draft.name.trim() || defaultName(candidate),
        source: candidate.source,
        ...(candidate.source === 'generated'
          ? { rule: candidate.rule, baseHue: candidate.baseHue, lightness: candidate.lightness, chroma: candidate.chroma }
          : {}),
        colors: candidate.colors.slice(),
        status,
        note: draft.note,
        decidedAt: new Date().toISOString(),
      };
      ctx.post({ type: 'paletteDecision', entry });
    };
    const btn = (status, label, cls) => h('button', { class: cls, 'data-status': status, disabled, onclick: decide(status) }, label);
    // Applies the candidate, with its Editor and Frame choices, as the GigglyBits Dark (Lab)
    // theme. Needs no catalog: it writes settings, not palettes/catalog.json.
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
          chromeIndex, surfaces: s.surfaces, frame: { ...s.frame },
          ...(editCount(s.edits) ? { edits: s.edits } : {}),
          ...(s.baseId ? { baseId: s.baseId } : {}),
          ...(s.baseName ? { baseName: s.baseName } : {}),
        };
        ctx.post({
          type: 'applyPalette',
          entry: { name: draft.name.trim() || defaultName(candidate), colors: candidate.colors.slice() },
          chrome: { index: chromeIndex, surfaces: s.surfaces, frame: { ...s.frame } },
          edits: s.edits,
          settings,
        });
      },
    }, 'Try in VS Code');
    // Saves the design, everything the Lab holds, to your saved themes (gigglybits.library).
    const saveTheme = h('button', {
      class: 'gb-pl-save-theme secondary',
      title: 'Saves this design under its name to your saved themes, which every VS Code window can use',
      onclick: () => ctx.post({ type: 'saveTheme', name: draft.name.trim() || defaultName(candidate), design: designOf(candidate, stateOf(ctx)) }),
    }, 'Save theme');
    // The palette catalog (palettes/catalog.json) is this repository's: its decisions and
    // the decided list show only when it is open.
    const catalog = ctx.catalogPath ? h('fieldset', { class: 'gb-box gb-pl-catalog' },
      h('legend', null, 'Catalog'),
      fieldRow('Note', [note]),
      h('div', { class: 'gb-pl-field' },
        h('span', { class: 'gb-pl-field-name' }),
        h('div', { class: 'gb-pl-field-control gb-pl-buttons' },
          btn('include', 'Include', 'secondary'),
          btn('maybe', 'Maybe', 'secondary'),
          btn('exclude', 'Exclude', 'secondary'),
          editCount(s.edits) && !disabled ? h('span', { class: 'gb-pl-edits-note muted' }, `Include, Maybe and Exclude save the palette without your ${editCount(s.edits)} color edits; Try in VS Code and Save theme keep them.`) : null,
          asShipped ? h('span', { class: 'gb-pl-shipped muted' }, `This is ${s.baseName} as shipped. Change a setting to save it as a new palette.`) : null,
          h('span', { class: 'gb-pl-path muted', title: ctx.catalogPath }, 'Saves to palettes/catalog.json'))),
      savedList(ctx, rerender)) : null;
    // The buttons sit in the control column, under the Name field.
    return h('div', { class: 'gb-pl-decide' },
      fieldRow('Name', [name]),
      h('div', { class: 'gb-pl-field' },
        h('span', { class: 'gb-pl-field-name' }),
        h('div', { class: 'gb-pl-field-control gb-pl-buttons' }, apply, saveTheme)),
      catalog);
  }

  /**
   * Start from > Saved: your saved themes (src/themeLibrary.ts), each with Load, Use in this
   * project (only with a folder open), Use everywhere and Delete. The host does the using
   * and deleting; Delete asks there first.
   */
  function libraryList(ctx, rerender) {
    const themes = Array.isArray(ctx.library) ? ctx.library : [];
    if (!themes.length) {
      return h('p', { class: 'muted gb-pl-lib-empty' }, 'No saved themes yet. Name a design and click Save theme to keep it here, ready to use in any window.');
    }
    const load = theme => () => {
      loadSaved(ctx.ui, theme);
      save(ctx);
      rerender(true);
    };
    const act = (label, action, onclick) => h('button', { class: 'secondary', 'data-action': action, onclick }, label);
    const use = (theme, where) => () => ctx.post({ type: 'useTheme', id: theme.id, where });
    return h('div', { class: 'gb-pl-library' },
      h('p', { class: 'muted gb-pl-lib-note' }, 'Use everywhere applies a theme\'s Editor colors to every window. Each project keeps its own frame, which Use in this project sets.'),
      themes.map(t => h('div', { class: 'gb-pl-row gb-pl-lib-row', 'data-id': t.id },
      h('div', { class: 'gb-pl-mini' }, (t.design && Array.isArray(t.design.colors) ? t.design.colors : []).map(dot)),
      h('span', { class: 'gb-pl-row-name' }, t.name),
      h('span', { class: 'gb-pl-row-slot muted' }, t.slot ? `Theme ${t.slot}` : 'No slot'),
      h('div', { class: 'gb-pl-lib-actions' },
        act('Load', 'load', load(t)),
        ctx.hasFolder ? act('Use in this project', 'project', use(t, 'project')) : null,
        act('Use everywhere', 'everywhere', use(t, 'everywhere')),
        act('Delete', 'delete', () => ctx.post({ type: 'deleteTheme', id: t.id }))))));
  }

  function savedList(ctx, rerender) {
    const palettes = ctx.catalog && Array.isArray(ctx.catalog.palettes) ? ctx.catalog.palettes : [];
    if (!palettes.length) return h('p', { class: 'muted' }, 'No palettes decided yet.');
    const s = stateOf(ctx);
    const load = p => () => {
      if (p.source === 'generated') {
        Object.assign(s, { mode: 'generated', rule: p.rule, hue: p.baseHue, lightness: p.lightness, chroma: p.chroma });
      } else {
        Object.assign(s, { mode: 'pasted', pasted: p.colors.slice(), paste: p.colors.join(' ') });
      }
      // A saved palette is the user's own, so it saves normally even when it is a shipped one.
      s.baseId = null;
      s.baseName = null;
      // A loaded palette is a new design: edits are not saved with it, so they start empty.
      s.edits = noEdits();
      picked = null;
      draft = { id: p.id, name: p.name, note: p.note || '' };
      lastParse = null;
      save(ctx);
      rerender(true);
    };
    return h('div', { class: 'gb-pl-saved' }, STATUS_HEADINGS.map(([status, heading]) => {
      const group = palettes.filter(p => p.status === status);
      if (!group.length) return null;
      return h('div', { class: `gb-pl-group gb-pl-group-${status}` },
        h('h4', null, heading),
        group.map(p => h('div', { class: 'gb-pl-row', 'data-id': p.id },
          h('div', { class: 'gb-pl-mini' }, p.colors.map(dot)),
          h('span', { class: 'gb-pl-row-name' }, p.name),
          h('span', { class: 'gb-pl-row-note muted' }, p.note || ''),
          h('button', { class: 'secondary', onclick: load(p) }, 'Load'))));
    }));
  }

  // ------------------------------------------------------------------ render

  function render(ctx) {
    const s = stateOf(ctx);
    const root = h('div', { class: 'gb-palette' });

    // The candidate's parts live in the summary and in the preview panels. A change
    // redraws their contents; the controls and tablists stay, so focus and tabs hold.
    const summaryArea = h('div', { class: 'gb-pl-summary gb-box' });
    const chromePanel = h('div', { class: 'gb-pl-chrome' });
    const widgetsPanel = h('div', { class: 'gb-pl-widgets-wrap' });
    /** The active Workbench or Widgets stage; replaced with each candidate. */
    let stage = null;
    const contrastPanel = h('div', { class: 'gb-pl-contrast-wrap' });
    function drawCandidate() {
      const candidate = candidateOf(s);
      const columns = columnsOf(ctx);
      summaryArea.replaceChildren(
        h('h3', null, candidate.source === 'generated' ? defaultName(candidate) : `Pasted palette (${candidate.colors.length} colors)`),
        swatches(candidate.colors, candidate.details, ctx),
        lowestLine(candidate.colors, columns),
        decisionControls(candidate, ctx, rerender));
      stage = stages(candidate, ctx, drawCandidate);
      chromePanel.replaceChildren(workbenchSection(candidate, ctx, stage, drawCandidate));
      widgetsPanel.replaceChildren(widgetsSection(ctx, stage.widgetsStage, drawCandidate));
      stage.draw(true);
      contrastPanel.replaceChildren(contrastTable(candidate.colors, columns), contrastLegend());
    }

    function rerender(full) {
      if (full) root.replaceChildren(...build());
      else drawCandidate();
    }

    function generatedChange(apply) {
      return ev => {
        apply(ev.target.value);
        s.mode = 'generated';
        save(ctx);
        syncControls();
        drawCandidate();
      };
    }

    const ruleSelect = h('select', { 'aria-label': 'Harmony rule', class: 'gb-pl-rule', onchange: generatedChange(v => { s.rule = v; }) },
      Object.entries(HARMONY_RULES).map(([id, def]) => h('option', { value: id, selected: s.rule === id }, def.name)));
    const hueRange = h('input', { type: 'range', min: 0, max: 359, step: 1, value: s.hue, 'aria-label': 'Base hue', class: 'gb-pl-hue', oninput: generatedChange(v => { s.hue = Number(v); }) });
    const hueNumber = h('input', { type: 'number', min: 0, max: 359, step: 1, value: s.hue, 'aria-label': 'Base hue value', class: 'gb-pl-hue-number', onchange: generatedChange(v => { s.hue = ((Math.round(Number(v)) % 360) + 360) % 360; }) });
    const lightRange = h('input', { type: 'range', min: 0.3, max: 0.95, step: 0.01, value: s.lightness, 'aria-label': 'Lightness', class: 'gb-pl-lightness', oninput: generatedChange(v => { s.lightness = Number(v); }) });
    const chromaRange = h('input', { type: 'range', min: 0, max: 0.3, step: 0.005, value: s.chroma, 'aria-label': 'Chroma', class: 'gb-pl-chroma', oninput: generatedChange(v => { s.chroma = Number(v); }) });
    const lightValue = h('span', { class: 'gb-pl-value' });
    const chromaValue = h('span', { class: 'gb-pl-value' });

    // Base color picker: picking a color sets hue, lightness and chroma from its OKLCH
    // values, clamped to the slider ranges; moving a slider moves the picker.
    let picking = false;
    const picker = h('input', {
      type: 'color', class: 'gb-pl-picker', 'aria-label': 'Base color',
      title: 'Pick a base color; sets hue, lightness and chroma',
      oninput: ev => {
        const o = GBO(ev.target.value);
        if (!o) return;
        // A grey has no meaningful hue, so keep the current one.
        if (o.c >= 0.01) s.hue = Math.round(o.h) % 360;
        s.lightness = Math.min(0.95, Math.max(0.3, round(o.l, 2)));
        s.chroma = Math.min(0.3, Math.max(0, round(o.c, 3)));
        s.mode = 'generated';
        save(ctx);
        picking = true;
        syncControls();
        picking = false;
        drawCandidate();
      },
    });

    function syncControls() {
      // Leave the picker alone while it is the control being moved, so it does not jump
      // to the slider-rounded color mid-drag.
      if (!picking) picker.value = window.GB.oklchToHex({ l: Number(s.lightness), c: Number(s.chroma), h: Number(s.hue) });
      ruleSelect.value = s.rule;
      lightRange.value = String(s.lightness);
      chromaRange.value = String(s.chroma);
      paste.value = s.paste;
      hueRange.value = String(s.hue);
      hueNumber.value = String(s.hue);
      lightValue.textContent = Number(s.lightness).toFixed(2);
      chromaValue.textContent = Number(s.chroma).toFixed(3);
    }

    const paste = h('textarea', { class: 'gb-pl-paste', rows: 4, 'aria-label': 'Pasted colors', placeholder: 'Paste hex colors, e.g. from Adobe Color: #ff8800, #336699 ...', oninput: ev => { s.paste = ev.target.value; save(ctx); } });
    paste.value = s.paste;
    const parseNote = h('div', { class: 'gb-pl-parse' });
    function drawParse() {
      if (!lastParse) return parseNote.replaceChildren();
      parseNote.replaceChildren(
        lastParse.invalid.length ? h('p', { class: 'gb-pl-invalid' }, 'Not colors, ignored: ', lastParse.invalid.join(', ')) : null,
        lastParse.error ? h('p', { class: 'gb-pl-error' }, lastParse.error, ' The current candidate is unchanged.') : null);
    }
    const judge = h('button', {
      class: 'gb-pl-judge secondary',
      onclick: () => {
        lastParse = parseHexList(paste.value);
        s.paste = paste.value;
        if (!lastParse.error) {
          s.mode = 'pasted';
          s.pasted = lastParse.colors;
        }
        save(ctx);
        drawParse();
        drawCandidate();
      },
    }, 'Judge pasted colors');

    const controls = h('div', { class: 'gb-pl-controls' },
      fieldRow('Base color', [picker]),
      fieldRow('Rule', [ruleSelect]),
      fieldRow('Hue', [hueRange, hueNumber]),
      fieldRow('Lightness', [lightRange, lightValue]),
      fieldRow('Chroma', [chromaRange, chromaValue]));
    const pasteRow = h('div', { class: 'gb-pl-paste-row' }, paste, judge);

    function build() {
      syncControls();
      drawParse();
      drawCandidate();
      const library = Array.isArray(ctx.library) ? ctx.library : [];
      const shipped = typeof Node !== 'undefined' && ctx.shipped instanceof Node
        ? ctx.shipped
        : h('p', { class: 'muted' }, 'Reading the installed themes...');
      const startFrom = window.GB.tabs({
        label: 'Start from',
        selected: s.startTab,
        onSelect: id => { s.startTab = id; save(ctx); },
        tabs: [
          { id: 'wheel', label: 'Wheel', panel: controls },
          { id: 'paste', label: 'Paste', panel: h('div', null, pasteRow, parseNote) },
          { id: 'shipped', label: 'Shipped', panel: shipped },
          { id: 'saved', label: h('span', null, 'Saved', h('span', { class: 'count' }, String(library.length))), panel: libraryList(ctx, rerender) },
        ],
      });
      const previews = window.GB.tabs({
        label: 'Previews',
        selected: s.previewTab,
        onSelect: id => { s.previewTab = id; save(ctx); if (stage) stage.draw(true); },
        tabs: [
          { id: 'chrome', label: 'Workbench', panel: chromePanel },
          { id: 'widgets', label: 'Widgets', panel: widgetsPanel },
          { id: 'contrast', label: 'Contrast', panel: contrastPanel },
        ],
      });
      // startNote: why a fresh Theme Lab opened on the defaults (src/labStart.ts startConfig).
      const note = ctx.startNote ? h('p', { class: 'gb-pl-start-note muted' }, ctx.startNote) : null;
      return [
        h('div', { class: 'gb-pl-rail gb-box' }, h('h2', null, 'Start from'), note, startFrom),
        h('div', { class: 'gb-pl-main gb-pl-candidate' },
          summaryArea,
          h('div', { class: 'gb-pl-previews-box gb-box' }, h('h3', null, 'Previews'), previews)),
      ];
    }

    root.replaceChildren(...build());
    return root;
  }

  /**
   * Makes a shipped theme's palette the candidate, as a starting point for a new design.
   * `ui` is the Palette Lab ui state (ctx.ui); `base` is one entry of the Theme Lab's
   * `bases` (src/themeList.ts themeBases). The Editor and Frame choices go back to the
   * defaults the shipped themes were built with, a Dark frame following the accent. The
   * base's id and name are recorded so the unchanged copy cannot be saved.
   * @param {any} ui
   * @param {{ id: string, name: string, source: 'generated' | 'pasted', rule?: string, baseHue?: number, lightness?: number, chroma?: number, colors?: string[] }} base
   */
  function startFrom(ui, base) {
    if (base.source === 'pasted' && Array.isArray(base.colors)) {
      Object.assign(ui, { mode: 'pasted', pasted: base.colors.slice(), paste: base.colors.join(' ') });
    } else {
      Object.assign(ui, { mode: 'generated', rule: base.rule, hue: base.baseHue, lightness: base.lightness, chroma: base.chroma });
    }
    ui.chromeIndex = DEFAULTS.chromeIndex;
    ui.surfaces = DEFAULTS.surfaces;
    ui.frame = darkFrame(DEFAULTS.chromeIndex);
    ui.edits = noEdits();
    picked = null;
    ui.baseId = base.id;
    ui.baseName = base.name;
    lastParse = null;
  }

  /**
   * Makes the last Try in VS Code the candidate again, Editor and Frame choices included.
   * `record` is the host's stored TryRecord (src/labStart.ts); a record from before the Frame
   * existed gets the Dark frame it was tried with.
   * @param {any} ui
   * @param {{ mode: 'generated' | 'pasted', rule?: string, hue?: number, lightness?: number, chroma?: number, pasted?: string[], chromeIndex: number, surfaces: string, baseId?: string, baseName?: string }} record
   */
  function restoreTry(ui, record) {
    if (record.mode === 'pasted' && Array.isArray(record.pasted)) {
      Object.assign(ui, { mode: 'pasted', pasted: record.pasted.slice(), paste: record.pasted.join(' ') });
    } else {
      Object.assign(ui, { mode: 'generated', rule: record.rule, hue: record.hue, lightness: record.lightness, chroma: record.chroma });
    }
    ui.chromeIndex = record.chromeIndex;
    ui.surfaces = record.surfaces;
    ui.frame = record.frame ? { ...record.frame } : darkFrame(record.chromeIndex);
    ui.edits = record.edits ? Builder().cleanEdits(record.edits) : noEdits();
    picked = null;
    if (record.baseId) ui.baseId = record.baseId; else delete ui.baseId;
    if (record.baseName) ui.baseName = record.baseName; else delete ui.baseName;
    lastParse = null;
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
      Object.assign(ui, { mode: 'pasted', pasted: d.pasted.slice(), paste: d.pasted.join(' ') });
    } else {
      Object.assign(ui, { mode: 'generated', rule: d.rule, hue: d.hue, lightness: d.lightness, chroma: d.chroma });
    }
    ui.chromeIndex = d.chromeIndex;
    ui.surfaces = d.surfaces;
    ui.frame = { ...d.frame };
    ui.edits = Builder().cleanEdits(d.edits);
    picked = null;
    delete ui.baseId;
    delete ui.baseName;
    lastParse = null;
    draft = { id: paletteId(candidateOf(stateOf({ ui }))), name: saved.name, note: '' };
  }

  // @ts-ignore
  window.GBPalette = { render, startFrom, restoreTry, loadSaved };
})();
