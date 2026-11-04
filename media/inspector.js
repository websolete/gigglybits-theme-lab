// @ts-check
// Palette Inspector webview. VS Code injects every resolved workbench color into this
// page as a --vscode-* CSS variable on <html>, so the list of colors comes from the
// page itself. The extension host sends a snapshot of what the theme files, user
// settings and extensions declare, which is how each color gets its source label.
//
// It is a debugging view. Building, trying and picking themes happens in the Theme Lab,
// which a button in the controls opens.
//
// Layout: the element gallery (gallery.js) comes first and open; every other section
// starts collapsed. Open/closed choices persist through vscode.setState.
(function () {
  // @ts-ignore acquireVsCodeApi is provided by the webview host
  const vscode = acquireVsCodeApi();
  // @ts-ignore provided by shared.js and gallery.js
  const { VAR_PREFIX, h, varFor, parseColor, toHex, over, contrastRatio, contrastGrade } = window.GB;
  // @ts-ignore
  const Gallery = window.GBGallery;

  const saved = vscode.getState() || {};
  const ui = {
    filter: saved.filter || '',
    source: saved.source || 'all',
    lowContrast: !!saved.lowContrast,
    groupBy: saved.groupBy || 'area',
    /** @type {Record<string, boolean>} */
    open: saved.open || {},
  };

  /** @type {any} */
  let snapshot = null;
  /** @type {ReturnType<typeof buildModel> | null} */
  let model = null;

  // ------------------------------------------------------------------ helpers

  function saveState() {
    vscode.setState(ui);
  }

  /** Remembers whether a <details> is open across re-renders and reloads. */
  function trackOpen(details, id, defaultOpen) {
    details.open = id in ui.open ? ui.open[id] : defaultOpen;
    details.addEventListener('toggle', () => {
      ui.open[id] = details.open;
      saveState();
    });
    return details;
  }

  function section(id, defaultOpen, title, count, ...body) {
    return trackOpen(h('details', { class: 'section' },
      h('summary', null, title, count !== undefined ? h('span', { class: 'count' }, count) : null),
      ...body), id, defaultOpen);
  }

  let toastTimer;
  function toast(text) {
    let el = document.getElementById('toast');
    if (!el) {
      el = h('div', { id: 'toast', class: 'toast' });
      document.body.append(el);
    }
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el && el.classList.remove('show'), 1600);
  }

  function copy(text) {
    vscode.postMessage({ type: 'copy', text });
    toast(`Copied ${text}`);
  }

  function contrastBadge(ratio, against) {
    if (ratio === undefined) return null;
    const [cls, words] = contrastGrade(ratio);
    return h('span', { class: `badge ${cls}`, title: `Contrast ${ratio.toFixed(2)}:1 against ${against} (${words})` }, `${ratio.toFixed(1)}:1`);
  }

  function sourceBadge(source, origin) {
    const label = source === 'user' ? 'user override' : source === 'theme' ? 'theme' : 'VS Code default';
    const title = origin ? `Declared in ${origin}` : 'Not declared by the theme or your settings; VS Code supplied this value';
    return h('span', { class: `badge ${source}`, title }, label);
  }

  // ------------------------------------------------------------------ grouping

  /** Ordered: the first matching area wins, so specific patterns sit above general ones. */
  const AREAS = [
    ['Editor: text, cursor & guides', /^editor\.|^editorCursor|^editorWhitespace|^editorIndentGuide|^editorLineNumber|^editorRuler|^editorBracket|^editorUnicodeHighlight|^editorInlayHint|^editorCodeLens|^editorLink|^editorGhostText|^editorMultiCursor|^editorUnnecessaryCode|^editorLightBulb/],
    ['Editor: diagnostics', /^editor(Error|Warning|Info|Hint)\.|^problems/],
    ['Editor: gutter, minimap & overview ruler', /^editorGutter|^editorOverviewRuler|^minimap/],
    ['Editor: widgets (suggest, hover, find, peek)', /^editor(Widget|Suggest|Hover|Marker|StickyScroll|ActionList|CommentsWidget)|^peekView|^editorFind|^inlineEdit|^debugExceptionWidget/],
    ['Diff & merge', /^diffEditor|^merge|^multiDiffEditor/],
    ['Editor groups, tabs & breadcrumbs', /^editorGroup|^tab\.|^breadcrumb|^editorPane|^sideBySideEditor/],
    ['Activity bar', /^activity/],
    ['Side bar & views', /^sideBar|^tree\.|^welcomePage|^walkThrough|^profileBadge/],
    ['Lists, quick input & keybindings', /^list\.|^quickInput|^pickerGroup|^keybinding/],
    ['Panel & terminal', /^panel|^terminal|^outputView/],
    ['Status bar', /^statusBar/],
    ['Title bar, menus & command center', /^titleBar|^menu|^menubar|^commandCenter|^window\./],
    ['Inputs, buttons & controls', /^input|^button|^dropdown|^checkbox|^radio|^toggle|^extensionButton|^settings\./],
    ['Notifications & banners', /^notification|^banner/],
    ['Source control', /^scm|^gitDecoration|^git/],
    ['Debug & testing', /^debug|^testing/],
    ['Notebooks', /^notebook/],
    ['Chat & inline chat', /^chat|^interactive|^inlineChat/],
    ['Charts & symbol icons', /^charts|^symbolIcon|^ports/],
    ['Base: text, borders, focus & scrollbars', /^(foreground|descriptionForeground|errorForeground|disabledForeground|focusBorder|contrastBorder|contrastActiveBorder|selection\.|widget\.|sash\.|icon\.|textLink|textBlockQuote|textCodeBlock|textPreformat|textSeparator|toolbar\.|badge\.|progressBar\.|scrollbar)/],
  ];
  const OTHER_AREA = 'Extensions & everything else';

  function groupOf(key) {
    if (ui.groupBy === 'prefix') return key.split('.')[0];
    for (const [name, re] of AREAS) if (re.test(key)) return name;
    return OTHER_AREA;
  }

  function groupOrder(name) {
    const i = AREAS.findIndex(a => a[0] === name);
    return i === -1 ? AREAS.length : i;
  }

  // --------------------------------------------------- foreground / background

  function needsContrast(key) {
    return /foreground$/i.test(key) || /^terminal\.ansi/.test(key) || /^editorBracketHighlight\.foreground\d$/.test(key);
  }

  /** Guesses which background a foreground color is drawn on. */
  function pairedBackground(key, byKey) {
    const candidates = [];
    if (/^terminal\.ansi/.test(key)) {
      candidates.push('terminal.background', 'panel.background');
    } else {
      const dot = key.indexOf('.');
      if (dot > 0) {
        const prefix = key.slice(0, dot);
        const prop = key.slice(dot + 1);
        candidates.push(prefix + '.' + prop.replace(/Foreground$/, 'Background').replace(/^foreground$/, 'background'));
        candidates.push(prefix + '.background');
        // sideBarSectionHeader -> sideBar, statusBarItem -> statusBar
        let p = prefix;
        for (;;) {
          const shorter = p.replace(/[A-Z][a-z0-9]*$/, '');
          if (!shorter || shorter === p) break;
          p = shorter;
          candidates.push(p + '.background');
        }
      }
    }
    candidates.push('editor.background');
    return candidates.find(c => c !== key && byKey.has(c));
  }

  /**
   * The surface a translucent color is usually laid over, so a swatch can show what
   * the color actually does instead of how it looks on a checkerboard.
   */
  const SURFACES = [
    [/^(commandCenter|titleBar|menubar)\./, 'titleBar.activeBackground'],
    [/^(list|tree)\.|^sideBar|^scm|^gitDecoration/, 'sideBar.background'],
    [/^tab\.|^editorGroupHeader/, 'editorGroupHeader.tabsBackground'],
    [/^statusBar/, 'statusBar.background'],
    [/^activityBar/, 'activityBar.background'],
    [/^terminal/, 'terminal.background'],
    [/^terminal|^panel/, 'panel.background'],
    [/^menu\./, 'menu.background'],
    [/^quickInput|^pickerGroup/, 'quickInput.background'],
    [/^notification/, 'notifications.background'],
    [/^editorSuggestWidget/, 'editorSuggestWidget.background'],
    [/^editorHoverWidget/, 'editorHoverWidget.background'],
    [/^editorWidget|^editorFind/, 'editorWidget.background'],
    [/^peekViewResult/, 'peekViewResult.background'],
    [/^peekViewEditor/, 'peekViewEditor.background'],
    [/^breadcrumb/, 'breadcrumb.background'],
  ];

  function surfaceFor(key, byKey) {
    for (const [re, surface] of SURFACES) {
      if (re.test(key) && surface !== key && byKey.has(surface)) return surface;
    }
    return key !== 'editor.background' && byKey.has('editor.background') ? 'editor.background' : undefined;
  }

  /**
   * CSS background that stacks the given variables, top first, over editor.background,
   * so translucent layers composite the way the workbench draws them.
   */
  function layered(...props) {
    const layers = props.filter(Boolean).map(p => `linear-gradient(var(${p}), var(${p}))`);
    return [...layers, `var(${varFor('editor.background')})`].join(', ');
  }

  // -------------------------------------------------------------------- model

  function buildModel() {
    const style = document.documentElement.style;
    const known = new Map();
    if (snapshot) {
      for (const k of [...Object.keys(snapshot.themeColors), ...Object.keys(snapshot.userColors), ...Object.keys(snapshot.contributions || {})]) {
        known.set(varFor(k), k);
      }
    }

    /** @type {Map<string, any>} */
    const byKey = new Map();
    const other = [];
    for (let i = 0; i < style.length; i++) {
      const prop = style.item(i);
      if (!prop.startsWith(VAR_PREFIX)) continue;
      const value = style.getPropertyValue(prop).trim();
      const rgba = parseColor(value);
      if (!rgba) {
        other.push({ prop, value });
        continue;
      }
      const key = known.get(prop) || prop.slice(VAR_PREFIX.length).replace(/-/g, '.');
      byKey.set(key, { key, prop, value, rgba, hex: toHex(rgba) });
    }

    const editorBg = byKey.get('editor.background');
    const fallbackBg = editorBg ? editorBg.rgba : { r: 30, g: 30, b: 30, a: 1 };
    const user = snapshot ? snapshot.userColors : {};
    const theme = snapshot ? snapshot.themeColors : {};

    for (const e of byKey.values()) {
      e.source = user[e.key] ? 'user' : theme[e.key] ? 'theme' : 'default';
      e.origin = (user[e.key] || theme[e.key] || {}).origin;
      if (user[e.key] && theme[e.key]) e.themeValue = theme[e.key].value;
      if (needsContrast(e.key)) {
        const bgKey = pairedBackground(e.key, byKey);
        const bgEntry = bgKey ? byKey.get(bgKey) : undefined;
        const bg = bgEntry ? (bgEntry.rgba.a < 1 ? over(bgEntry.rgba, fallbackBg) : bgEntry.rgba) : fallbackBg;
        e.bgKey = bgKey || 'editor.background';
        e.bgProp = bgEntry ? bgEntry.prop : varFor('editor.background');
        e.contrast = contrastRatio(over(e.rgba, bg), bg);
      }
      if (e.rgba.a < 1) {
        // Text colors sit on their paired background; everything else on its usual surface.
        const surface = e.bgKey || surfaceFor(e.key, byKey);
        e.surfaceKey = surface;
        e.surfaceProp = surface ? byKey.get(surface).prop : undefined;
      }
    }

    const unrecognized = [];
    for (const [key, entry] of [...Object.entries(theme), ...Object.entries(user)]) {
      if (!byKey.has(key)) unrecognized.push({ key, value: entry.value, origin: entry.origin, source: user[key] === entry ? 'user' : 'theme' });
    }

    const withContrast = r => {
      const fg = r.foreground ? parseColor(r.foreground) : null;
      return { ...r, contrast: fg ? contrastRatio(over(fg, fallbackBg), fallbackBg) : undefined };
    };
    const tokens = (snapshot ? snapshot.tokenRules : []).map(withContrast);
    const semantic = (snapshot ? snapshot.semanticRules : []).map(withContrast);

    return { byKey, other, unrecognized, tokens, semantic };
  }

  // ---------------------------------------------------------------- filtering

  function matchesText(...fields) {
    const q = ui.filter.trim().toLowerCase();
    if (!q) return true;
    return fields.some(f => f && String(f).toLowerCase().includes(q));
  }

  const colorVisible = e =>
    (ui.source === 'all' || ui.source === e.source) &&
    (!ui.lowContrast || (e.contrast !== undefined && e.contrast < 4.5)) &&
    matchesText(e.key, e.value, e.hex, e.origin);

  const ruleVisible = r =>
    (ui.source === 'all' || ui.source === r.source) &&
    (!ui.lowContrast || (r.contrast !== undefined && r.contrast < 4.5)) &&
    matchesText(r.scope, r.selector, r.name, r.foreground, r.fontStyle, r.origin);

  // ---------------------------------------------------------------- rendering

  function renderSummary() {
    const el = document.getElementById('summary');
    if (!el || !model) return;
    const all = [...model.byKey.values()];
    const count = s => all.filter(e => e.source === s).length;
    const low = all.filter(e => e.contrast !== undefined && e.contrast < 4.5).length;
    const s = snapshot || {};
    const sh = s.semanticHighlighting || {};

    el.replaceChildren(
      h('h1', null, s.label || 'Unknown theme'),
      h('div', { class: 'muted' },
        s.extensionName ? `${s.extensionName} (${s.extensionId})` : 'Theme source not found',
        s.uiTheme ? ` · base ${s.uiTheme}` : '',
        ` · semantic highlighting ${sh.effective ? 'on' : 'off'}`,
        sh.setting !== undefined ? ` (editor.semanticHighlighting.enabled: ${JSON.stringify(sh.setting)})` : ''),
      s.files && s.files.length ? h('div', { class: 'muted files' }, 'Theme files, base first: ', s.files.join('  >  ')) : null,
      h('div', { class: 'chips' },
        h('span', { class: 'chip' }, `${all.length} colors in effect`),
        h('span', { class: 'chip' }, `${count('theme')} from theme`),
        h('span', { class: 'chip' }, `${count('user')} user overrides`),
        h('span', { class: 'chip' }, `${count('default')} VS Code defaults`),
        h('span', { class: 'chip' }, `${model.tokens.length} token rules`),
        h('span', { class: 'chip warn-chip' }, `${low} foregrounds under 4.5:1`),
        model.unrecognized.length ? h('span', { class: 'chip warn-chip' }, `${model.unrecognized.length} declared but not in effect`) : null),
      ...(s.warnings || []).map(w => h('div', { class: 'warn' }, w)),
    );
  }

  function colorCard(e) {
    const translucent = e.rgba.a < 1;
    const swatch = h('div', { class: 'swatch' });
    if (translucent) {
      // A strip of the bare surface beside the surface with the color laid over it,
      // so a faint tint or shadow is visible as a difference rather than lost.
      const bare = h('div', { class: 'bare', title: `${e.surfaceKey || 'editor.background'} alone` });
      bare.style.background = layered(e.surfaceProp);
      const fill = h('div', { class: 'fill', title: `${e.key} over ${e.surfaceKey || 'editor.background'}` });
      fill.style.background = layered(e.prop, e.surfaceProp);
      swatch.append(bare, fill);
    } else {
      const fill = h('div', { class: 'fill' });
      fill.style.background = `var(${e.prop})`;
      swatch.append(fill);
    }
    if (e.contrast !== undefined) {
      const sample = h('div', { class: 'sample', title: `Drawn on ${e.bgKey}` }, 'Aa');
      sample.style.background = layered(e.bgProp);
      sample.style.color = `var(${e.prop})`;
      swatch.append(sample);
    }
    const snippet = `"${e.key}": "${e.hex}"`;
    return h('div', { class: 'card', title: `Click to copy ${snippet}`, onclick: () => copy(snippet) },
      swatch,
      h('div', { class: 'meta' },
        h('div', { class: 'key' }, e.key),
        h('div', { class: 'value' },
          e.hex,
          sourceBadge(e.source, e.origin),
          contrastBadge(e.contrast, e.bgKey)),
        translucent ? h('div', { class: 'value' }, `${Math.round(e.rgba.a * 100)}% opaque, shown over ${e.surfaceKey || 'editor.background'}`) : null,
        e.themeValue ? h('div', { class: 'value' }, 'theme had ', h('span', { class: 'overridden' }, e.themeValue)) : null));
  }

  /** The original per-area color catalog, now nested inside one collapsed section. */
  function allColorsSection() {
    const groups = new Map();
    let shown = 0;
    for (const e of model.byKey.values()) {
      if (!colorVisible(e)) continue;
      shown++;
      const g = groupOf(e.key);
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(e);
    }
    const names = [...groups.keys()].sort((a, b) =>
      ui.groupBy === 'area' ? groupOrder(a) - groupOrder(b) || a.localeCompare(b) : a.localeCompare(b));
    const areas = names.map(name => {
      const items = groups.get(name).sort((a, b) => a.key.localeCompare(b.key));
      return section(`area:${name}`, true, name, String(items.length), h('div', { class: 'grid' }, items.map(colorCard)));
    });
    return section('colors', false, 'All workbench colors', String(shown),
      areas.length ? areas : h('p', { class: 'muted' }, 'Nothing matches the current filters.'));
  }

  function styledSample(text, fg, fontStyle) {
    const el = h('span', { class: 'token-sample' }, text);
    if (fg) el.style.color = fg;
    const fs = (fontStyle || '').toLowerCase();
    if (fs.includes('italic')) el.style.fontStyle = 'italic';
    if (fs.includes('bold')) el.style.fontWeight = 'bold';
    const deco = [fs.includes('underline') && 'underline', fs.includes('strikethrough') && 'line-through'].filter(Boolean).join(' ');
    if (deco) el.style.textDecoration = deco;
    return el;
  }

  function ruleTable(id, title, rows, kind) {
    const visible = rows.filter(ruleVisible);
    if (!visible.length) return null;
    return section(id, false, title, String(visible.length),
      h('p', { class: 'muted' }, kind === 'token'
        ? 'TextMate rules in load order. When two rules match the same scope equally well, the later one wins. Contrast is measured against editor.background.'
        : 'Semantic token rules. These win over TextMate rules when semantic highlighting is on.'),
      h('table', { class: 'rules' },
        h('thead', null, h('tr', null,
          h('th', null, 'Sample'), h('th', null, kind === 'token' ? 'Scope' : 'Selector'),
          h('th', null, 'Foreground'), h('th', null, 'Style'), h('th', null, 'Source'), h('th', null, 'Contrast'))),
        h('tbody', null, visible.map(r => {
          const label = kind === 'token' ? r.scope : r.selector;
          const snippet = r.foreground ? `"${r.foreground}"` : label;
          return h('tr', { title: `Click to copy ${snippet}`, onclick: () => copy(snippet) },
            h('td', null, styledSample(r.name || label.split(',')[0], r.foreground, r.fontStyle)),
            h('td', { class: 'mono' }, label),
            h('td', { class: 'mono' }, r.foreground || ''),
            h('td', null, r.fontStyle || ''),
            h('td', null, sourceBadge(r.source, r.origin)),
            h('td', null, contrastBadge(r.contrast, 'editor.background')));
        }))));
  }

  function typographySection() {
    const rows = model.other.filter(o => matchesText(o.prop, o.value));
    if (!rows.length || ui.source !== 'all' || ui.lowContrast) return null;
    return section('typography', false, 'Typography & other variables', String(rows.length),
      h('table', { class: 'rules' }, h('tbody', null, rows.map(o => {
        const sample = h('span', null, 'The quick brown fox 0O 1lI {}');
        if (/font-family$/.test(o.prop)) sample.style.fontFamily = `var(${o.prop})`;
        return h('tr', null, h('td', { class: 'mono' }, o.prop), h('td', { class: 'mono' }, o.value),
          h('td', null, /font-family$/.test(o.prop) ? sample : ''));
      }))));
  }

  function unrecognizedSection() {
    const rows = model.unrecognized.filter(u => (ui.source === 'all' || ui.source === u.source) && matchesText(u.key, u.value, u.origin));
    if (!rows.length || ui.lowContrast) return null;
    return section('unrecognized', false, 'Declared but not in effect', String(rows.length),
      h('p', { class: 'muted' }, 'These keys are set by the theme or your settings, but VS Code did not produce a color for them. Usually the key is misspelled, retired, or belongs to an extension that is not installed, or the value is not a valid color.'),
      h('table', { class: 'rules' }, h('tbody', null, rows.map(u =>
        h('tr', null, h('td', { class: 'mono' }, u.key), h('td', { class: 'mono' }, u.value), h('td', null, sourceBadge(u.source, u.origin)), h('td', { class: 'muted' }, u.origin || ''))))));
  }

  function galleryContext() {
    return { model, snapshot, ui, tokens: model.tokens, copy, sourceBadge, contrastBadge, trackOpen };
  }

  function gallerySection() {
    const g = Gallery.render(galleryContext());
    const count = g.shown === g.total ? String(g.total) : `${g.shown} of ${g.total}`;
    return section('gallery', true, 'Element gallery', count,
      h('p', { class: 'muted' }, 'VS Code widgets drawn with the colors in effect. Hover a part to light up its keys, or a key to outline what it paints. Open Definitions for values, sources and contributors.'),
      g.shown ? g.node : h('p', { class: 'muted' }, 'No elements match the current filters.'));
  }

  function contributionsSection() {
    if (ui.lowContrast) return null;
    const c = Gallery.renderContributions(galleryContext());
    if (!c.count) return null;
    return section('contrib', false, 'Extension-contributed colors', `${c.count} from ${c.extensions} extensions`,
      h('p', { class: 'muted' }, 'Color keys that installed extensions register. Your theme can set any of them; unset means the extension supplies no default for this kind of theme.'),
      ...c.nodes);
  }

  function renderResults() {
    const el = document.getElementById('results');
    if (!el || !model) return;
    const sections = [
      gallerySection(),
      contributionsSection(),
      allColorsSection(),
      ruleTable('tokens', 'Token colors (TextMate)', model.tokens, 'token'),
      ruleTable('semantic', 'Semantic token colors', model.semantic, 'semantic'),
      typographySection(),
      unrecognizedSection(),
    ].filter(Boolean);
    el.replaceChildren(...sections);
  }

  function renderAll() {
    model = buildModel();
    renderSummary();
    renderResults();
  }

  function renderShell() {
    const search = h('input', {
      type: 'search', placeholder: 'Filter by element, key, value or origin', value: ui.filter, 'aria-label': 'Filter',
      oninput: ev => { ui.filter = ev.target.value; saveState(); renderResults(); },
    });
    const sourceSelect = h('select', { 'aria-label': 'Source', onchange: ev => { ui.source = ev.target.value; saveState(); renderResults(); } },
      ...[['all', 'All sources'], ['theme', 'Theme'], ['user', 'User overrides'], ['default', 'VS Code defaults']]
        .map(([v, label]) => h('option', { value: v, selected: ui.source === v }, label)));
    const groupSelect = h('select', { 'aria-label': 'Grouping', onchange: ev => { ui.groupBy = ev.target.value; saveState(); renderResults(); } },
      h('option', { value: 'area', selected: ui.groupBy === 'area' }, 'Group colors by area'),
      h('option', { value: 'prefix', selected: ui.groupBy === 'prefix' }, 'Group colors by key prefix'));
    const lowContrast = h('label', { class: 'check' },
      h('input', { type: 'checkbox', checked: ui.lowContrast, onchange: ev => { ui.lowContrast = ev.target.checked; saveState(); renderResults(); } }),
      'Under 4.5:1 only');
    const exportBtn = h('button', {
      title: 'Open every color in effect, plus the token rules, as an untitled theme file',
      onclick: () => {
        if (!model) return;
        const colors = {};
        for (const e of model.byKey.values()) colors[e.key] = e.hex;
        vscode.postMessage({ type: 'exportTheme', colors });
      },
    }, 'Export as theme JSON');
    const refreshBtn = h('button', { class: 'secondary', onclick: () => vscode.postMessage({ type: 'refresh' }) }, 'Refresh');
    const themeLabBtn = h('button', {
      class: 'secondary',
      title: 'Open the Theme Lab, where themes are built, tried and picked',
      onclick: () => vscode.postMessage({ type: 'openThemeLab' }),
    }, 'Open Theme Lab');

    document.getElementById('app').replaceChildren(
      h('header', { id: 'summary', class: 'summary' }, h('p', { class: 'muted' }, 'Reading the active theme...')),
      h('div', { class: 'controls' }, search, sourceSelect, groupSelect, lowContrast, h('span', { class: 'spacer' }), themeLabBtn, refreshBtn, exportBtn),
      h('main', { id: 'results' }),
    );
  }

  // ------------------------------------------------------------------- wiring

  let renderTimer;
  function scheduleRender() {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(renderAll, 60);
  }

  window.addEventListener('message', ev => {
    const msg = ev.data;
    if (!msg) return;
    if (msg.type === 'snapshot') {
      snapshot = msg.snapshot;
      scheduleRender();
    }
  });

  // VS Code rewrites the variables on <html> and the theme class on <body> when the theme changes.
  new MutationObserver(scheduleRender).observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
  new MutationObserver(scheduleRender).observe(document.body, { attributes: true, attributeFilter: ['class'] });

  renderShell();
  renderAll();
  vscode.postMessage({ type: 'ready' });
})();
