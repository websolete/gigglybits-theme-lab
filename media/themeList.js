// @ts-check
// Theme list for the Theme Lab: one row per installed GigglyBits Dark theme, with a button
// that asks the extension host to switch to it. The active theme's row is marked and its
// button disabled. Loads as window.GBThemeList; needs window.GB from shared.js.
(function () {
  // @ts-ignore provided by shared.js
  const { h } = window.GB;

  /**
   * @param {{ themes: string[], active: string | null | undefined, post: (message: any) => void }} ctx
   * @returns {HTMLElement}
   */
  function render(ctx) {
    const rows = (ctx.themes || []).map(label => {
      const isActive = label === ctx.active;
      const button = isActive
        ? h('button', { class: 'secondary', disabled: true, title: `${label} is the active theme` }, 'Active')
        : h('button', { class: 'secondary', title: `Switch VS Code to ${label}`, onclick: () => ctx.post({ type: 'selectTheme', label }) }, 'Use');
      return h('li', { class: isActive ? 'gb-tl-row gb-tl-active' : 'gb-tl-row', 'aria-current': isActive ? 'true' : undefined },
        h('span', { class: 'gb-tl-name' }, label),
        button);
    });
    return h('ul', { class: 'gb-tl', 'aria-label': 'Installed GigglyBits themes' }, ...rows);
  }

  // @ts-ignore
  window.GBThemeList = { render };
})();
