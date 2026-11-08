// @ts-check
// Theme Preview webview: the Theme Lab's only preview, in a window of its own that the
// extension opens (src/themePreviewPanel.ts). One scrolling page: the Workbench,
// then the widget families the Lab chose. It draws nothing of its own: each
// { type: 'state', palette, syntaxSets } message from the host carries the Lab's Palette Lab
// state and the syntax sets, and palette.js renderPreview() draws them. A part clicked here is posted as
// { type: 'pickPart', part } and opens in the Lab's Edit panel.
(function () {
  // @ts-ignore acquireVsCodeApi is provided by the webview host
  const vscode = acquireVsCodeApi();
  // @ts-ignore provided by shared.js
  const { h } = window.GB;
  // @ts-ignore provided by palette.js
  const PaletteLab = window.GBPalette;

  /** The state drawn last, so a 'modernUI' message can redraw it. */
  let current = null;
  /** The syntax sets drawn last, for the same reason. */
  let currentSets = [];
  /** VS Code's modern UI settings from the latest 'modernUI' message; null draws the classic workbench. */
  let modernUI = null;
  /** The keys of the role the Theme Lab's Roles step points at, from 'highlight'; kept across redraws. */
  let highlightKeys = [];

  /**
   * Outlines every drawn part whose data-keys name one of highlightKeys, and scrolls the first
   * into view when asked; with no keys, removes the outlines.
   */
  function applyHighlight(scroll) {
    const want = new Set(highlightKeys);
    let first = null;
    document.querySelectorAll('[data-keys]').forEach(el => {
      const on = want.size > 0 && (el.getAttribute('data-keys') || '').split(' ').some(k => want.has(k));
      el.classList.toggle('gb-pl-role-hl', on);
      if (on && !first) first = el;
    });
    if (scroll && first && typeof first.scrollIntoView === 'function') first.scrollIntoView({ block: 'nearest' });
  }

  function draw(palette, syntaxSets) {
    current = palette && typeof palette === 'object' ? palette : {};
    currentSets = Array.isArray(syntaxSets) ? syntaxSets : [];
    const app = document.getElementById('app');
    if (!app) return;
    // A redraw keeps the page where it was scrolled.
    const top = document.scrollingElement ? document.scrollingElement.scrollTop : 0;
    app.replaceChildren(PaletteLab.renderPreview({
      ui: current,
      syntaxSets: currentSets,
      modernUI,
      post: message => vscode.postMessage(message),
    }));
    if (document.scrollingElement) document.scrollingElement.scrollTop = top;
    applyHighlight(false);
  }

  window.addEventListener('message', ev => {
    const msg = ev.data;
    if (msg && msg.type === 'state') draw(msg.palette, msg.syntaxSets);
    else if (msg && msg.type === 'highlight') {
      highlightKeys = Array.isArray(msg.keys) ? msg.keys.filter(k => typeof k === 'string') : [];
      // Only Show where asks to scroll; opening a role outlines its parts where the page sits.
      applyHighlight(msg.scroll === true);
    }
    else if (msg && msg.type === 'modernUI') {
      modernUI = msg.modernUI && typeof msg.modernUI === 'object' ? msg.modernUI : null;
      if (current) draw(current, currentSets);
    }
  });

  const app = document.getElementById('app');
  if (app) app.replaceChildren(h('p', { class: 'muted' }, 'Waiting for the Theme Lab...'));
  vscode.postMessage({ type: 'ready' });
})();
