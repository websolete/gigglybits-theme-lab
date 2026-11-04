// @ts-check
// Theme Lab webview: the place to build, try and pick a GigglyBits theme. It draws the
// Palette Lab (palette.js) and hands it the installed theme list (themeList.js) for its
// Start from > Shipped tab; the header names the active theme. It asks the extension host
// for both the theme list and the palette catalog. The Palette Inspector is the separate
// debugging view; a header button opens it.
//
// The Palette Lab's ui state persists through vscode.setState. On a fresh open (no saved
// state) the host's first 'start' message picks the starting palette; a tab restored by a
// reload keeps its edits. 'identity' messages carry this folder's own color, if any, which the
// Frame box mentions because VS Code draws it over any theme's frame.
(function () {
  // @ts-ignore acquireVsCodeApi is provided by the webview host
  const vscode = acquireVsCodeApi();
  // @ts-ignore provided by shared.js
  const { h, parseColor, toHex } = window.GB;
  // @ts-ignore provided by palette.js
  const PaletteLab = window.GBPalette;
  // @ts-ignore provided by themeList.js
  const ThemeList = window.GBThemeList;

  const restored = vscode.getState();
  /** A fresh open: no saved state, so the host's start may set the palette. */
  const fresh = !restored;
  const saved = restored || {};
  const ui = {
    /** Palette Lab: rule, hue, lightness, chroma, paste text and the current candidate. */
    palette: saved.palette || {},
  };

  /** Set once the first 'start' of a fresh open is applied; later ones change nothing. */
  let startApplied = false;
  /** This folder's own color, for the Frame box's note; never saved to state. @type {string | null} */
  let identityFill = null;
  /** Why the Lab opened on the defaults, from the 'start' message. @type {string | null} */
  let startNote = null;

  /** Latest 'catalog' message from the host. @type {{ catalog: any, path: string | null, reason?: string }} */
  let catalogState = { catalog: null, path: null, reason: 'Waiting for the extension to send the palette catalog.' };
  /** Latest 'catalogError' message, cleared by the next catalog. @type {string | null} */
  let catalogError = null;
  /**
   * Latest 'themes' message from the host; null until it arrives. `bases` holds each listed
   * theme's palette by label (src/themeList.ts themeBases).
   * @type {{ themes: string[], active: string | null, bases: Record<string, any> } | null}
   */
  let themesState = null;
  /**
   * Latest 'library' message: your saved themes (src/themeLibrary.ts SavedTheme) and whether a
   * folder is open, which decides whether Use in this project is offered.
   * @type {{ themes: any[], hasFolder: boolean }}
   */
  let libraryState = { themes: [], hasFolder: false };

  function saveState() {
    vscode.setState(ui);
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

  /** editor.background as #rrggbb; an 8-digit (translucent) value keeps its first 7 characters. */
  function liveBackground() {
    const rgba = parseColor(document.documentElement.style.getPropertyValue('--vscode-editor-background').trim());
    return rgba ? toHex(rgba).slice(0, 7) : '#1e1e1e';
  }

  /**
   * Use on a shipped theme also loads its palette into the Palette Lab as a starting point.
   * A label with no base (none is sent for a file name that encodes no palette) only switches.
   */
  function startFromTheme(label) {
    const base = themesState && themesState.bases[label];
    if (!base) return;
    PaletteLab.startFrom(ui.palette, base);
    saveState();
    renderPalette();
  }

  /** The installed theme list for the Start from > Shipped tab; null until the host sends it. */
  function themeList() {
    if (!themesState) return null;
    const post = message => {
      if (message && message.type === 'selectTheme') startFromTheme(message.label);
      vscode.postMessage(message);
    };
    return ThemeList.render({ themes: themesState.themes, active: themesState.active, post });
  }

  /** Names the active theme in the header once the host has said which it is. */
  function renderActive() {
    const slot = document.getElementById('lab-active');
    if (!slot) return;
    slot.replaceChildren(themesState && themesState.active
      ? h('span', { class: 'gb-lab-active' }, `Active: ${themesState.active}`)
      : '');
  }

  function paletteSection() {
    const lab = PaletteLab.render({
      catalog: catalogState.catalog,
      catalogPath: catalogState.path,
      catalogReason: catalogState.reason || '',
      liveBackground: liveBackground(),
      ui: ui.palette,
      save: saveState,
      post: message => vscode.postMessage(message),
      copy,
      shipped: themeList(),
      library: libraryState.themes,
      hasFolder: libraryState.hasFolder,
      identityFill,
      startNote,
    });
    return h('section', { id: 'section-palette' },
      catalogError ? h('p', { class: 'gb-pl-error' }, `Palette catalog error: ${catalogError}`) : null,
      h('div', { class: 'gb-lab' }, lab));
  }

  /** Redraws only the Palette Lab, so a catalog update leaves the rest of the page alone. */
  function renderPalette() {
    const current = document.getElementById('section-palette');
    if (current) current.replaceWith(paletteSection());
  }

  function renderShell() {
    const inspectorBtn = h('button', {
      class: 'secondary',
      title: 'Open the Palette Inspector, the debugging view of every color in effect',
      onclick: () => vscode.postMessage({ type: 'openPaletteInspector' }),
    }, 'Open Palette Inspector');

    document.getElementById('app').replaceChildren(
      h('header', { class: 'summary lab-header' },
        h('div', null,
          h('h1', null, 'Theme Lab'),
          h('div', { class: 'muted' }, 'Build a palette, try it in VS Code, and save the ones worth keeping.')),
        h('span', { class: 'spacer' }),
        h('div', { id: 'lab-active', class: 'muted' }),
        inspectorBtn),
      h('main', { id: 'results' }, paletteSection()),
    );
    renderActive();
  }

  /** Applies a fresh open's first 'start': a shipped base, the last Try, a saved theme, or a note. */
  function applyStart(start) {
    if (!fresh || startApplied) return;
    startApplied = true;
    const s = start || {};
    if (s.base) {
      PaletteLab.startFrom(ui.palette, s.base);
      ui.palette.startTab = s.base.source === 'pasted' ? 'paste' : 'wheel';
    } else if (s.lastTry) {
      PaletteLab.restoreTry(ui.palette, s.lastTry);
      ui.palette.startTab = s.lastTry.mode === 'pasted' ? 'paste' : 'wheel';
    } else if (s.saved) {
      PaletteLab.loadSaved(ui.palette, s.saved);
      ui.palette.startTab = 'saved';
    } else if (s.note) {
      startNote = s.note;
    }
    saveState();
    renderPalette();
  }

  /**
   * Keeps this folder's own color, if it has one, for the Frame box's note. The preview draws
   * the theme alone, so nothing else follows the identity.
   */
  function applyIdentity(identity) {
    identityFill = identity && identity.fill ? identity.fill : null;
    renderPalette();
  }

  // ------------------------------------------------------------------- wiring

  let renderTimer;
  function scheduleRender() {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(renderPalette, 60);
  }

  window.addEventListener('message', ev => {
    const msg = ev.data;
    if (!msg) return;
    if (msg.type === 'themes') {
      themesState = {
        themes: Array.isArray(msg.themes) ? msg.themes : [],
        active: msg.active || null,
        bases: msg.bases && typeof msg.bases === 'object' ? msg.bases : {},
      };
      renderActive();
      renderPalette();
    } else if (msg.type === 'catalog') {
      catalogState = { catalog: msg.catalog, path: msg.path, reason: msg.reason };
      catalogError = null;
      renderPalette();
    } else if (msg.type === 'catalogError') {
      catalogError = msg.message;
      renderPalette();
    } else if (msg.type === 'library') {
      libraryState = { themes: Array.isArray(msg.themes) ? msg.themes : [], hasFolder: msg.hasFolder === true };
      renderPalette();
    } else if (msg.type === 'start') {
      applyStart(msg.start);
    } else if (msg.type === 'identity') {
      applyIdentity(msg.identity);
    }
  });

  // VS Code rewrites the variables on <html> and the theme class on <body> when the theme changes.
  new MutationObserver(scheduleRender).observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
  new MutationObserver(scheduleRender).observe(document.body, { attributes: true, attributeFilter: ['class'] });

  renderShell();
  vscode.postMessage({ type: 'ready' });
})();
