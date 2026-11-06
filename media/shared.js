// @ts-check
// Helpers shared by the Theme Lab and Palette Inspector webview scripts. Loads as window.GB
// in the webview and as a CommonJS module under Jest, so the pure functions are unit-tested.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.GB = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  const VAR_PREFIX = '--vscode-';

  /** Small DOM builder. Text goes through text nodes, never innerHTML. */
  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : String(v));
    }
    for (const c of children.flat()) {
      if (c === null || c === undefined || c === false) continue;
      el.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return el;
  }

  let tabsCount = 0;

  /**
   * A tab set following the ARIA tabs pattern: one tablist of buttons and one panel per tab.
   * Inactive panels stay in the document with the hidden attribute, so their inputs keep
   * their values. Arrow keys wrap, Home and End jump, and selecting moves focus to the tab.
   * @param {{ label: string, tabs: Array<{ id: string, label: string | Node, panel: Node }>, selected?: string, onSelect?: (id: string) => void }} opts
   * @returns {HTMLElement}
   */
  function tabs(opts) {
    const prefix = `gb-tabs-${++tabsCount}`;
    const items = opts.tabs || [];
    let current = items.some(t => t.id === opts.selected) ? opts.selected : (items[0] && items[0].id);
    const buttons = [];
    const panels = [];
    items.forEach(t => {
      const tabId = `${prefix}-tab-${t.id}`;
      const panelId = `${prefix}-panel-${t.id}`;
      buttons.push(h('button', {
        type: 'button', class: 'gb-tab', role: 'tab', id: tabId, 'aria-controls': panelId, 'data-tab': t.id,
        onclick: () => select(t.id, false),
      }, t.label));
      panels.push(h('div', { class: 'gb-tabpanel', role: 'tabpanel', id: panelId, 'aria-labelledby': tabId, 'data-tab': t.id }, t.panel));
    });

    function sync() {
      items.forEach((t, i) => {
        const on = t.id === current;
        buttons[i].setAttribute('aria-selected', on ? 'true' : 'false');
        buttons[i].setAttribute('tabindex', on ? '0' : '-1');
        if (on) panels[i].removeAttribute('hidden'); else panels[i].setAttribute('hidden', '');
      });
    }

    function select(id, focus) {
      const i = items.findIndex(t => t.id === id);
      if (i < 0) return;
      if (focus) buttons[i].focus();
      if (id === current) return;
      current = id;
      sync();
      if (typeof opts.onSelect === 'function') opts.onSelect(id);
    }

    const list = h('div', {
      class: 'gb-tablist', role: 'tablist', 'aria-label': opts.label,
      onkeydown: ev => {
        const i = buttons.indexOf(ev.target);
        if (i < 0) return;
        let next = -1;
        if (ev.key === 'ArrowRight') next = (i + 1) % buttons.length;
        else if (ev.key === 'ArrowLeft') next = (i - 1 + buttons.length) % buttons.length;
        else if (ev.key === 'Home') next = 0;
        else if (ev.key === 'End') next = buttons.length - 1;
        if (next < 0) return;
        ev.preventDefault();
        select(items[next].id, true);
      },
    }, buttons);
    sync();
    return h('div', { class: 'gb-tabs' }, list, panels);
  }

  const varFor = key => VAR_PREFIX + key.replace(/\./g, '-');

  function parseColor(input) {
    const s = String(input).trim().toLowerCase();
    let m = /^#([0-9a-f]{3,8})$/.exec(s);
    if (m) {
      let hex = m[1];
      if (hex.length === 3 || hex.length === 4) hex = hex.split('').map(c => c + c).join('');
      if (hex.length !== 6 && hex.length !== 8) return null;
      const n = i => parseInt(hex.slice(i, i + 2), 16);
      return { r: n(0), g: n(2), b: n(4), a: hex.length === 8 ? n(6) / 255 : 1 };
    }
    m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/.exec(s);
    if (m) {
      const a = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
      return { r: +m[1], g: +m[2], b: +m[3], a };
    }
    if (s === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
    return null;
  }

  function toHex(c) {
    const x = v => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0');
    return '#' + x(c.r) + x(c.g) + x(c.b) + (c.a < 1 ? x(c.a * 255) : '');
  }

  /** Composites a translucent color over an opaque one. */
  function over(top, bottom) {
    const a = top.a;
    return { r: top.r * a + bottom.r * (1 - a), g: top.g * a + bottom.g * (1 - a), b: top.b * a + bottom.b * (1 - a), a: 1 };
  }

  function luminance(c) {
    const ch = v => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * ch(c.r) + 0.7152 * ch(c.g) + 0.0722 * ch(c.b);
  }

  function contrastRatio(fg, bg) {
    const a = luminance(fg);
    const b = luminance(bg);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  }

  /** WCAG grade for a contrast ratio: [css class, words]. */
  function contrastGrade(ratio) {
    if (ratio >= 7) return ['aaa', 'AAA'];
    if (ratio >= 4.5) return ['aa', 'AA'];
    if (ratio >= 3) return ['large', 'large text only'];
    return ['fail', 'fails'];
  }

  /**
   * Picks the TextMate rules that color a token scope, the way a theme resolves it:
   * the most specific matching selector wins, and a later rule wins a tie. Foreground
   * and font style resolve separately, as in VS Code. Only the last segment of a
   * descendant selector is compared, and exclusions ("a - b") are ignored, so this is
   * an approximation for preview purposes.
   */
  function resolveTokenStyle(rules, scope) {
    let fg = null;
    let fgScore = -1;
    let style = null;
    let styleScore = -1;
    for (const rule of rules) {
      if (!rule.scope || rule.scope === '(editor default)') continue;
      for (const raw of rule.scope.split(',')) {
        const sel = raw.split(' - ')[0].trim().split(/\s+/).pop();
        if (!sel || !(scope === sel || scope.startsWith(sel + '.'))) continue;
        const score = sel.split('.').length;
        if (rule.foreground && score >= fgScore) {
          fg = rule;
          fgScore = score;
        }
        if (rule.fontStyle !== undefined && score >= styleScore) {
          style = rule;
          styleScore = score;
        }
      }
    }
    return {
      foreground: fg ? fg.foreground : undefined,
      fontStyle: style ? style.fontStyle : undefined,
      foregroundRule: fg,
      fontStyleRule: style,
    };
  }

  // ---- OKLCH (Bjorn Ottosson's OKLab, https://bottosson.github.io/posts/oklab/) ----

  const toLinear = v => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  const toGamma = v => (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);

  /** '#rrggbb' to { l, c, h }, h in degrees 0-360. */
  function hexToOklch(hex) {
    const p = parseColor(hex);
    if (!p) return null;
    const r = toLinear(p.r / 255);
    const g = toLinear(p.g / 255);
    const b = toLinear(p.b / 255);
    const l_ = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m_ = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s_ = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
    const A = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
    const B = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;
    let hue = (Math.atan2(B, A) * 180) / Math.PI;
    if (hue < 0) hue += 360;
    return { l: L, c: Math.sqrt(A * A + B * B), h: hue };
  }

  /** OKLCH to linear sRGB channels, unclipped. */
  function oklchToLinear(l, c, hue) {
    const rad = (hue * Math.PI) / 180;
    const A = c * Math.cos(rad);
    const B = c * Math.sin(rad);
    const l3 = Math.pow(l + 0.3963377774 * A + 0.2158037573 * B, 3);
    const m3 = Math.pow(l - 0.1055613458 * A - 0.0638541728 * B, 3);
    const s3 = Math.pow(l - 0.0894841775 * A - 1.291485548 * B, 3);
    return [
      4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3,
      -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3,
      -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3,
    ];
  }

  /** Whether linear sRGB channels all fit 0-1, within a rounding allowance. */
  const inGamut = rgb => rgb.every(v => v >= -1e-6 && v <= 1 + 1e-6);

  /**
   * Whether { l, c, h } fits sRGB as it is, by the channel check oklchToHex makes before it
   * reduces chroma: true means oklchToHex keeps the chroma, false means it lowers it.
   */
  function oklchInGamut({ l, c, h: hue }) {
    return inGamut(oklchToLinear(l, Math.max(0, c), hue));
  }

  /**
   * { l, c, h } to '#rrggbb'. Out-of-gamut colors lose chroma in steps of 0.005 until
   * they fit sRGB, so lightness and hue are kept (clipping each channel would shift both).
   */
  function oklchToHex({ l, c, h: hue }) {
    let chroma = Math.max(0, c);
    let rgb = oklchToLinear(l, chroma, hue);
    while (!inGamut(rgb) && chroma > 0) {
      chroma = Math.max(0, chroma - 0.005);
      rgb = oklchToLinear(l, chroma, hue);
    }
    const x = v => Math.round(Math.min(1, Math.max(0, toGamma(Math.min(1, Math.max(0, v))))) * 255).toString(16).padStart(2, '0');
    return '#' + x(rgb[0]) + x(rgb[1]) + x(rgb[2]);
  }

  // ---- Harmony rules (Adobe Color's rule set, in OKLCH) ----

  /** One slot: [hue offset, lightness offset, chroma factor]. ALT is alt(x) in the work order. */
  const ALT = [0.08, 0.8];
  const HARMONY_RULES = {
    analogous: { name: 'Analogous', slots: [[-60, 0, 1], [-30, 0, 1], [0, 0, 1], [30, 0, 1], [60, 0, 1]] },
    monochromatic: { name: 'Monochromatic', slots: [[0, -0.12, 0.6], [0, -0.06, 0.8], [0, 0, 1], [0, 0.06, 0.8], [0, 0.12, 0.6]] },
    triad: { name: 'Triad', slots: [[0, 0, 1], [120, 0, 1], [240, 0, 1], [0, ...ALT], [120, ...ALT]] },
    complementary: { name: 'Complementary', slots: [[0, 0, 1], [0, ...ALT], [180, 0, 1], [180, ...ALT], [0, 0, 0.5]] },
    'split-complementary': { name: 'Split Complementary', slots: [[0, 0, 1], [150, 0, 1], [210, 0, 1], [0, ...ALT], [150, ...ALT]] },
    square: { name: 'Square', slots: [[0, 0, 1], [90, 0, 1], [180, 0, 1], [270, 0, 1], [0, ...ALT]] },
    compound: { name: 'Compound', slots: [[0, 0, 1], [30, 0, 1], [165, 0, 1], [195, 0, 1], [0, ...ALT]] },
    shades: { name: 'Shades', slots: [[0, -0.16, 1], [0, -0.08, 1], [0, 0, 1], [0, 0.08, 1], [0, 0.16, 1]] },
  };

  const wrapHue = x => ((x % 360) + 360) % 360;

  /** Five colors { hex, l, c, h } for a rule; l, c, h are measured from the hex. */
  function harmony(rule, { hue, lightness, chroma }) {
    const def = HARMONY_RULES[rule];
    if (!def) throw new Error(`Unknown harmony rule: ${rule}`);
    return def.slots.map(([dh, dl, cf]) => {
      const hex = oklchToHex({ l: Math.min(0.95, Math.max(0.3, lightness + dl)), c: chroma * cf, h: wrapHue(hue + dh) });
      return { hex, ...hexToOklch(hex) };
    });
  }

  /** Stable id: derived from the generator inputs, or from the colors of a pasted palette. */
  function paletteId(entry) {
    if (entry.source === 'generated' || (entry.source === undefined && entry.rule)) {
      return `${entry.rule}-h${Math.round(wrapHue(entry.baseHue))}-l${Number(entry.lightness).toFixed(2)}-c${Number(entry.chroma).toFixed(3)}`;
    }
    return 'pasted-' + entry.colors.map(c => c.replace(/^#/, '').toLowerCase()).join('-');
  }

  /** Splits pasted text into '#rrggbb' colors; tokens that are not 3 or 6 hex digits go to invalid. */
  function parseHexList(text) {
    const colors = [];
    const invalid = [];
    for (const token of String(text || '').split(/[\s,;]+/)) {
      if (!token) continue;
      const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(token);
      if (!m) {
        invalid.push(token);
        continue;
      }
      let hex = m[1].toLowerCase();
      if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
      colors.push('#' + hex);
    }
    let error;
    if (colors.length < 2) error = `Need at least 2 colors, found ${colors.length}.`;
    else if (colors.length > 10) error = `At most 10 colors, found ${colors.length}.`;
    return { colors, invalid, error };
  }

  // ---- IDE chrome ----

  /** Black or white, whichever reads better on the color. */
  function textOn(hex) {
    const c = parseColor(hex);
    return contrastRatio({ r: 0, g: 0, b: 0, a: 1 }, c) >= contrastRatio({ r: 255, g: 255, b: 255, a: 1 }, c) ? '#000000' : '#ffffff';
  }

  /** Raises OKLCH lightness in 0.01 steps, keeping hue and chroma, until hex reads `ratio`:1 on bg. */
  function liftTo(hex, bg, ratio) {
    const o = hexToOklch(hex);
    const back = parseColor(bg);
    let l = o.l;
    let out = toHex(parseColor(hex));
    while (contrastRatio(parseColor(out), back) < ratio && l < 0.95) {
      l = Math.min(0.95, Math.round((l + 0.01) * 1000) / 1000);
      out = oklchToHex({ l, c: o.c, h: o.h });
    }
    return out;
  }

  /** Surface chroma per style: neutral is what the 0.0.5 theme builder ships. */
  const CHROME_SURFACES = {
    neutral: { name: 'Neutral', chroma: 0.01 },
    tinted: { name: 'Tinted', chroma: 0.03 },
    rich: { name: 'Rich', chroma: 0.06 },
  };

  /** Regions a workspace identity color can fill, in the order Peacock users expect. */
  const CHROME_REGIONS = {
    titleBar: 'Title bar and window border',
    activityBar: 'Activity bar',
    statusBar: 'Status bar',
    borders: 'Tabs and borders',
  };

  /**
   * Workbench colors for the IDE chrome from one palette color.
   *
   * base is what a theme variant would set: surfaces stepped from the editor background
   * and tinted toward the color's hue, with the color (lifted to 4.5:1) as the accent.
   * overlay is what a per-workspace identity would write to workbench.colorCustomizations,
   * Peacock style: the color itself fills the chosen regions, with black or white text.
   * colors is base with overlay on top, which is what VS Code would show. fill, when given,
   * fills the overlay instead of color, as a workspace identity color would; base is unchanged.
   */
  function chromeColors({ color, background = '#1e1e1e', surfaces = 'neutral', regions = [], fill: identityFill = undefined }) {
    const style = CHROME_SURFACES[surfaces] || CHROME_SURFACES.neutral;
    const accent = liftTo(color, background, 4.5);
    // Hue from the lifted accent, as scripts/theme-builder.js does, so Neutral matches it.
    const hue = hexToOklch(accent).h;
    const bgL = hexToOklch(background).l;
    const surface = (dl, c = style.chroma) => oklchToHex({ l: bgL + dl, c, h: hue });
    const ink = l => oklchToHex({ l, c: 0.01, h: hue });
    const deep = surface(-0.025);
    const divider = surface(0.04);

    const base = {
      'titleBar.activeBackground': deep, 'titleBar.activeForeground': ink(0.87), 'titleBar.border': divider,
      'activityBar.background': deep, 'activityBar.foreground': ink(0.87), 'activityBar.inactiveForeground': ink(0.68),
      'activityBar.activeBorder': accent, 'activityBar.border': divider,
      'activityBarBadge.background': accent, 'activityBarBadge.foreground': textOn(accent),
      'sideBar.background': deep, 'sideBar.foreground': ink(0.87), 'sideBar.border': divider,
      'sideBarSectionHeader.background': deep, 'list.activeSelectionBackground': surface(0.09, Math.max(0.04, style.chroma)),
      'editorGroupHeader.tabsBackground': deep, 'tab.inactiveBackground': deep, 'tab.inactiveForeground': ink(0.68),
      'tab.activeBackground': background, 'tab.activeForeground': ink(0.95), 'tab.activeBorder': background,
      'tab.activeBorderTop': accent, 'tab.border': divider, 'editorGroup.border': divider,
      'editor.background': background, 'editor.foreground': ink(0.87),
      'panel.background': deep, 'panel.border': divider,
      'statusBar.background': deep, 'statusBar.foreground': ink(0.87), 'statusBar.border': divider,
      'statusBarItem.remoteBackground': accent, 'statusBarItem.remoteForeground': textOn(accent),
    };

    const fill = toHex(parseColor(identityFill || color));
    const fg = textOn(fill);
    const fillL = hexToOklch(fill);
    const shade = dl => oklchToHex({ l: Math.min(0.95, Math.max(0.05, fillL.l + dl)), c: fillL.c, h: fillL.h });
    const line = liftTo(fill, background, 3);
    const OVERLAY = {
      titleBar: {
        'titleBar.activeBackground': fill, 'titleBar.activeForeground': fg,
        'titleBar.inactiveBackground': fill + '99', 'titleBar.inactiveForeground': fg + '99',
        'titleBar.border': fill, 'window.activeBorder': fill, 'window.inactiveBorder': fill + '99',
        'commandCenter.border': fg + '4d',
      },
      activityBar: {
        'activityBar.background': fill, 'activityBar.activeBackground': fill,
        'activityBar.foreground': fg, 'activityBar.inactiveForeground': fg + '99',
        'activityBar.activeBorder': fg, 'activityBar.border': fill,
        'activityBarBadge.background': fg, 'activityBarBadge.foreground': fill,
      },
      statusBar: {
        'statusBar.background': fill, 'statusBar.foreground': fg, 'statusBar.border': fill,
        'statusBarItem.hoverBackground': shade(fillL.l > 0.6 ? -0.08 : 0.08),
        'statusBarItem.remoteBackground': shade(fillL.l > 0.6 ? -0.15 : 0.15),
        'statusBarItem.remoteForeground': fg,
      },
      borders: {
        'tab.activeBorderTop': line, 'tab.activeBorder': line,
        'editorGroup.border': line, 'sideBar.border': line, 'panel.border': line, 'sash.hoverBorder': line,
      },
    };
    const overlay = {};
    for (const region of Object.keys(CHROME_REGIONS)) {
      if (regions.includes(region)) Object.assign(overlay, OVERLAY[region]);
    }
    return { base, overlay, colors: { ...base, ...overlay } };
  }

  /**
   * VS Code's default for surface.border: foreground at 15% made opaque over surface.background.
   * makeOpaque mixes each channel as bg - a * (bg - fg) and truncates it, as VS Code's RGBA does.
   * Over a translucent background VS Code leaves the color translucent, and so does this.
   */
  function fadeOver(fgHex, alpha, bgHex) {
    const fg = parseColor(fgHex);
    const bg = parseColor(bgHex);
    if (!fg || !bg) return undefined;
    const a = fg.a * alpha;
    if (bg.a < 1) return toHex({ r: fg.r, g: fg.g, b: fg.b, a });
    const mix = ch => (bg[ch] - a * (bg[ch] - fg[ch])) | 0;
    return toHex({ r: mix('r'), g: mix('g'), b: mix('b'), a: 1 });
  }

  /**
   * VS Code's dark defaults for the modern UI color keys, in dependency order: each rule names
   * the keys it reads, which may be earlier rules' results, and how it combines them.
   */
  const MODERN_UI_RULES = [
    ['modernUI.shellBackground', ['titleBar.activeBackground'], ([c]) => c],
    ['surface.background', ['sideBar.background'], ([c]) => c],
    ['surface.border', ['foreground', 'surface.background'], ([fg, bg]) => fadeOver(fg, 0.15, bg)],
    ['modernPanel.border', ['surface.border'], ([c]) => c],
    ['modernTab.activeBackground', ['list.inactiveSelectionBackground'], ([c]) => c],
    ['modernTab.activeForeground', ['list.inactiveSelectionForeground', 'foreground'], ([a, b]) => a || b, true],
    ['modernEditorTab.activeBackground', ['modernTab.activeBackground'], ([c]) => c],
    ['modernEditorTab.activeForeground', ['modernTab.activeForeground'], ([c]) => c],
    ['modernActivityBarItem.activeBackground', ['modernTab.activeBackground'], ([c]) => c],
    ['modernActivityBarItem.activeForeground', ['modernTab.activeForeground'], ([c]) => c],
  ];

  /**
   * The modern UI keys `colors` leaves unset, each worked out from `colors` with VS Code's
   * default rule. A key `colors` already holds is left out, as is one whose source is missing.
   * `colors` maps color key to hex and is not changed.
   */
  function modernUIDefaults(colors) {
    const all = { ...colors };
    const out = {};
    for (const [key, sources, combine, anyOf] of MODERN_UI_RULES) {
      if (key in colors) continue;
      const values = sources.map(s => all[s]);
      if (anyOf ? !values.some(Boolean) : !values.every(Boolean)) continue;
      const value = combine(values);
      if (!value) continue;
      all[key] = value;
      out[key] = value;
    }
    return out;
  }

  return {
    VAR_PREFIX, h, tabs, varFor, parseColor, toHex, over, luminance, contrastRatio, contrastGrade, resolveTokenStyle,
    hexToOklch, oklchToHex, oklchInGamut, HARMONY_RULES, harmony, paletteId, parseHexList,
    textOn, liftTo, CHROME_SURFACES, CHROME_REGIONS, chromeColors, modernUIDefaults,
  };
});
