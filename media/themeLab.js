// @ts-check
// Theme Lab webview: the place to build, try and pick a GigglyBits theme. It draws the
// Palette Lab (palette.js), whose Start step offers Wheel and Saved, and asks the extension
// host for your saved themes. The page has no header.
//
// The Palette Lab's ui state persists through vscode.setState. On a fresh open (no saved
// state) the host's first 'start' message picks the starting palette; a tab restored by a
// reload keeps its edits. 'identity' messages carry this folder's own color, if any, which the
// Frame box mentions because VS Code draws it over any theme's frame.
//
// Every saved change also goes to the host as 'previewState', which the floating Theme Preview
// window, the Lab's only preview, draws; a 'pickPart' from that window opens the part in the
// Edit panel. 'previewDetached' says whether that window is open, which the Preview card shows.
(function () {
  // @ts-ignore acquireVsCodeApi is provided by the webview host
  const vscode = acquireVsCodeApi();
  // @ts-ignore provided by shared.js
  const { h, parseColor, toHex } = window.GB;
  // @ts-ignore provided by palette.js
  const PaletteLab = window.GBPalette;

  const restored = vscode.getState();
  /** A fresh open: no saved state, so the host's start may set the palette. */
  const fresh = !restored;
  const saved = restored || {};
  const ui = {
    /** Palette Lab: rule, hue, lightness, chroma and the current candidate. */
    palette: saved.palette || {},
  };

  /** Set once the first 'start' of a fresh open is applied; later ones change nothing. */
  let startApplied = false;
  /** This folder's own color, for the Frame box's note; never saved to state. @type {string | null} */
  let identityFill = null;
  /** Why the Lab opened on the defaults, from the 'start' message. @type {string | null} */
  let startNote = null;
  /**
   * VS Code's modern UI settings from the latest 'modernUI' message, which the Workbench preview
   * draws with; never saved to state. Null draws the classic workbench.
   * @type {{ modern: boolean, uppercase: boolean, tabStyle: string } | null}
   */
  let modernUI = null;
  /**
   * Whether the Theme Preview window, the Lab's only preview, is open, from the host's
   * 'previewDetached' messages; the Preview card says so. Never saved: the window does not
   * survive a reload.
   */
  let detached = false;
  /**
   * The installed dark themes' syntax set starters from the latest 'installedStarters' message
   * (src/themeSource.ts InstalledSyntaxStarter), offered under Start set from. Never saved.
   * @type {any[]}
   */
  let installedStarters = [];
  /**
   * The latest 'themeScope' message (src/themeLabPanel.ts ThemeScope): this window's theme, where
   * it is set, and the default, for step 1's theme-scope line. Never saved; null draws no line.
   * @type {{ window: { label: string | null, source: string }, defaultTheme: string | null } | null}
   */
  let themeScope = null;
  /**
   * The latest 'leftovers' message: the user-level color and token keys not tied to any theme,
   * for step 1's leftover-color note. Never saved; null draws no note.
   * @type {{ colors: string[], tokens: string[] } | null}
   */
  let leftovers = null;
  /**
   * The latest 'overrides' message's items: the settings that can change a GigglyBits theme's
   * colors (src/labSettings.ts ColorOverride), for step 1's overrides note. Never saved; null
   * until one arrives.
   * @type {any[] | null}
   */
  let overrides = null;

  /**
   * Latest 'library' message: your saved themes (src/themeLibrary.ts SavedTheme), your syntax
   * sets (SyntaxSet), and whether a folder is open, which decides whether Use in this
   * project is offered.
   * @type {{ themes: any[], syntaxSets: any[], hasFolder: boolean }}
   */
  let libraryState = { themes: [], syntaxSets: [], hasFolder: false };

  /**
   * Hands the Palette Lab state and the syntax sets to the host, which passes them to the
   * floating Theme Preview window, so it follows every change, a color drag included.
   */
  function postPreviewState() {
    vscode.postMessage({ type: 'previewState', palette: ui.palette, syntaxSets: libraryState.syntaxSets });
  }

  function saveState() {
    vscode.setState(ui);
    postPreviewState();
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

  function paletteSection() {
    const lab = PaletteLab.render({
      liveBackground: liveBackground(),
      ui: ui.palette,
      save: saveState,
      post: message => vscode.postMessage(message),
      copy,
      library: libraryState.themes,
      syntaxSets: libraryState.syntaxSets,
      hasFolder: libraryState.hasFolder,
      identityFill,
      startNote,
      modernUI,
      detached,
      installedStarters,
      themeScope,
      leftovers,
      overrides,
    });
    return h('section', { id: 'section-palette' },
      h('div', { class: 'gb-lab' }, lab));
  }

  /** Redraws only the Palette Lab, so a host message leaves the rest of the page alone. */
  function renderPalette() {
    const current = document.getElementById('section-palette');
    if (current) current.replaceWith(paletteSection());
    postPreviewState();
  }

  /** The page is the Lab alone, with no header. */
  function renderShell() {
    document.getElementById('app').replaceChildren(h('main', { id: 'results' }, paletteSection()));
  }

  /**
   * Applies a fresh open's first 'start': the last Try, a saved theme, or a note. A last Try
   * of pasted colors opens on Wheel, since Start has no Paste tab.
   */
  function applyStart(start) {
    if (!fresh || startApplied) return;
    startApplied = true;
    const s = start || {};
    if (s.lastTry) {
      PaletteLab.restoreTry(ui.palette, s.lastTry);
      ui.palette.startTab = 'wheel';
    } else if (s.saved) {
      PaletteLab.loadSaved(ui.palette, s.saved);
      ui.palette.startTab = 'saved';
    } else if (s.note) {
      startNote = s.note;
    }
    // The default palette start (no Try record, no saved theme) takes its code colors from your
    // default syntax set; a loaded Try or saved theme keeps its own choice.
    if (!s.lastTry && !s.saved) {
      const def = libraryState.syntaxSets.find(t => t && t.isDefault === true && typeof t.id === 'string');
      if (def) ui.palette.syntaxSet = def.id;
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
    if (msg.type === 'library') {
      libraryState = {
        themes: Array.isArray(msg.themes) ? msg.themes : [],
        syntaxSets: Array.isArray(msg.syntaxSets) ? msg.syntaxSets : [],
        hasFolder: msg.hasFolder === true,
      };
      renderPalette();
    } else if (msg.type === 'start') {
      applyStart(msg.start);
    } else if (msg.type === 'identity') {
      applyIdentity(msg.identity);
    } else if (msg.type === 'modernUI') {
      modernUI = msg.modernUI && typeof msg.modernUI === 'object' ? msg.modernUI : null;
      renderPalette();
    } else if (msg.type === 'frameSeed') {
      // Make project theme, from a folder's old color: that color as the frame, the folder's name.
      if (msg.frame && typeof msg.frame === 'object' && typeof msg.name === 'string') {
        PaletteLab.seedFrame(ui.palette, { frame: msg.frame, name: msg.name });
        saveState();
        renderPalette();
      }
    } else if (msg.type === 'previewDetached') {
      detached = msg.detached === true;
      renderPalette();
    } else if (msg.type === 'themeScope') {
      themeScope = msg.window && typeof msg.window === 'object' ? { window: msg.window, defaultTheme: msg.defaultTheme ?? null } : null;
      renderPalette();
    } else if (msg.type === 'leftovers') {
      const strings = list => (Array.isArray(list) ? list.filter(k => typeof k === 'string') : []);
      leftovers = { colors: strings(msg.colors), tokens: strings(msg.tokens) };
      renderPalette();
    } else if (msg.type === 'overrides') {
      overrides = Array.isArray(msg.items) ? msg.items.filter(i => i && typeof i === 'object' && typeof i.key === 'string') : [];
      renderPalette();
    } else if (msg.type === 'installedStarters') {
      installedStarters = Array.isArray(msg.starters) ? msg.starters : [];
      renderPalette();
    } else if (msg.type === 'pickPart') {
      // A part clicked in the Theme Preview window: open its colors in step 5, Edit. Only step 5
      // opens; the other steps stay as the user left them.
      PaletteLab.setPicked(ui.palette, msg.part);
      saveState();
      renderPalette();
      // Bring step 5 into view, in whichever column or pane it sits.
      const edit = document.querySelector('.gb-s4');
      if (edit && typeof edit.scrollIntoView === 'function') edit.scrollIntoView({ block: 'nearest' });
    }
  });

  // VS Code rewrites the variables on <html> and the theme class on <body> when the theme changes.
  new MutationObserver(scheduleRender).observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
  new MutationObserver(scheduleRender).observe(document.body, { attributes: true, attributeFilter: ['class'] });

  renderShell();
  vscode.postMessage({ type: 'ready' });
})();
