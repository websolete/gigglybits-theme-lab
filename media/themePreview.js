// @ts-check
// Theme Preview webview: the Theme Lab's only preview, in a window of its own that the
// extension opens (src/themePreviewPanel.ts). One scrolling page: the Workbench,
// then the widget families the Lab chose. It draws nothing of its own: each
// { type: 'state', palette, groups } message from the host carries the Lab's Palette Lab state
// and style groups, and palette.js renderPreview() draws them. A part clicked here is posted as
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
  /** The groups drawn last, for the same reason. */
  let currentGroups = [];
  /** VS Code's modern UI settings from the latest 'modernUI' message; null draws the classic workbench. */
  let modernUI = null;

  function draw(palette, groups) {
    current = palette && typeof palette === 'object' ? palette : {};
    currentGroups = Array.isArray(groups) ? groups : [];
    const app = document.getElementById('app');
    if (!app) return;
    // A redraw keeps the page where it was scrolled.
    const top = document.scrollingElement ? document.scrollingElement.scrollTop : 0;
    app.replaceChildren(PaletteLab.renderPreview({
      ui: current,
      groups: currentGroups,
      modernUI,
      post: message => vscode.postMessage(message),
    }));
    if (document.scrollingElement) document.scrollingElement.scrollTop = top;
  }

  window.addEventListener('message', ev => {
    const msg = ev.data;
    if (msg && msg.type === 'state') draw(msg.palette, msg.groups);
    else if (msg && msg.type === 'modernUI') {
      modernUI = msg.modernUI && typeof msg.modernUI === 'object' ? msg.modernUI : null;
      if (current) draw(current, currentGroups);
    }
  });

  const app = document.getElementById('app');
  if (app) app.replaceChildren(h('p', { class: 'muted' }, 'Waiting for the Theme Lab...'));
  vscode.postMessage({ type: 'ready' });
})();
