// @ts-check
// Element gallery: mock VS Code widgets drawn with the live --vscode-* variables, one card per
// widget family, each state drawn side by side. The Theme Preview window draws its Workbench
// and Widgets sections with renderParts; render, with key chips and definitions, backs the tests.
//
// Every painted part records the color keys it uses in data-keys, which drives the
// card's key chips, its definitions table, the hover linking between the two, and the
// contrast pairs (a part's data-fg against the nearest data-bg above it).
//
// Adding a widget means adding one CATALOG entry; nothing else needs to change.
(function () {
  // @ts-ignore provided by shared.js
  const { h, varFor, over, contrastRatio, resolveTokenStyle } = window.GB;

  /** Render context, set for the duration of each render() call. @type {any} */
  let ctx = null;

  // ------------------------------------------------------------------ painting

  /** Shorthand -> [style property, value prefix placed before var(...)]. */
  const PROPS = {
    bg: ['background', ''],
    fg: ['color', ''],
    bd: ['border', '1px solid '],
    bdT: ['borderTop', '1px solid '],
    bdB: ['borderBottom', '1px solid '],
    bdL: ['borderLeft', '1px solid '],
    bdR: ['borderRight', '1px solid '],
    bdT2: ['borderTop', '2px solid '],
    bdB2: ['borderBottom', '2px solid '],
    bdL2: ['borderLeft', '2px solid '],
    bdL4: ['borderLeft', '4px solid '],
    ol: ['outline', '1px solid '],
    olDash: ['outline', '1px dashed '],
    wavy: ['textDecoration', 'underline wavy '],
    dotted: ['textDecoration', 'underline dotted '],
    shadow: ['boxShadow', '0 0 8px 2px '],
  };

  /**
   * Paints an element from a spec such as { bg: 'button.background', fg: 'button.foreground' }.
   * A key VS Code has no value for is recorded but not painted, because VS Code draws
   * nothing for it either.
   */
  function paint(el, spec) {
    const keys = (el.getAttribute('data-keys') || '').split(' ').filter(Boolean);
    const painted = (el.getAttribute('data-painted') || '').split(' ').filter(Boolean);
    for (const [shorthand, key] of Object.entries(spec || {})) {
      const prop = PROPS[shorthand];
      if (!prop || !key) continue;
      keys.push(key);
      if (shorthand === 'fg') el.setAttribute('data-fg', key);
      if (shorthand === 'bg') el.setAttribute('data-bg', key);
      if (!ctx.model.byKey.has(key)) continue;
      el.style[prop[0]] = `${prop[1]}var(${varFor(key)})`;
      painted.push(key);
      if (shorthand === 'ol' || shorthand === 'olDash') el.style.outlineOffset = '-1px';
    }
    if (keys.length) el.setAttribute('data-keys', [...new Set(keys)].join(' '));
    // Which keys actually reached a style property; handy in the webview dev tools.
    if (painted.length) el.setAttribute('data-painted', [...new Set(painted)].join(' '));
    return el;
  }

  const P = (tag, cls, spec, ...kids) => paint(h(tag, cls ? { class: cls } : null, ...kids), spec);
  const I = (name, spec) => paint(h('span', { class: `codicon codicon-${name}`, 'aria-hidden': 'true' }), spec);
  const D = (cls, ...kids) => h('div', { class: cls }, ...kids);
  const S = (cls, ...kids) => h('span', { class: cls }, ...kids);

  /** One labeled state in a side-by-side strip. */
  const state = (label, ...kids) => h('figure', { class: 'gb-state' }, D('gb-state-body', ...kids), h('figcaption', null, label));
  const states = (...figs) => D('gb-states', ...figs);

  /** Rows of [mock, label] for widgets whose states stack vertically. */
  const labeled = (...rows) => D('gb-labeled', ...rows.flatMap(([label, el]) => [D('gb-labeled-mock', el), D('gb-labeled-label', label)]));

  function fontStyle(el, style) {
    const fs = (style || '').toLowerCase();
    if (fs.includes('italic')) el.style.fontStyle = 'italic';
    if (fs.includes('bold')) el.style.fontWeight = 'bold';
    const deco = [fs.includes('underline') && 'underline', fs.includes('strikethrough') && 'line-through'].filter(Boolean).join(' ');
    if (deco) el.style.textDecoration = deco;
  }

  /** A syntax token colored by the active theme's TextMate rules (approximate). */
  function T(text, scope) {
    const r = resolveTokenStyle(ctx.tokens, scope);
    const title = r.foregroundRule
      ? `${scope}\ncolored by rule "${r.foregroundRule.scope}" (${r.foregroundRule.origin})`
      : `${scope}\nno matching rule: drawn in editor.foreground`;
    const el = h('span', { class: 'gb-tok', title }, text);
    if (r.foreground) el.style.color = r.foreground;
    fontStyle(el, r.fontStyle);
    return el;
  }

  /** Bracket pair colorization, which overrides token colors for brackets. */
  const B = (ch, level, spec) => P('span', null, { fg: `editorBracketHighlight.foreground${level}`, ...spec }, ch);

  /** An editor line: gutter decoration, line number, then content. */
  function line(n, kids, opts = {}) {
    return P('div', 'gb-line', opts.spec,
      P('span', 'gb-gutter-mark', opts.gutter),
      P('span', 'gb-ln', { fg: opts.active ? 'editorLineNumber.activeForeground' : 'editorLineNumber.foreground' }, n == null ? '' : String(n)),
      D('gb-code', ...kids));
  }
  const editor = (...lines) => P('div', 'gb-editor', { bg: 'editor.background', fg: 'editor.foreground' }, ...lines);
  const guide = active => P('span', 'gb-guide', { bdL: active ? 'editorIndentGuide.activeBackground1' : 'editorIndentGuide.background1' }, '  ');
  const cursor = () => P('span', 'gb-cursor', { bg: 'editorCursor.foreground' });

  function treeRow(depth, icon, label, spec, opts = {}) {
    const indents = [];
    for (let i = 0; i < depth; i++) {
      indents.push(opts.guides ? P('span', 'gb-tree-indent', { bdL: 'tree.indentGuidesStroke' }) : S('gb-tree-indent'));
    }
    return P('div', 'gb-tree-row', spec,
      ...indents,
      opts.twistie ? I(opts.twistie) : S('gb-twistie-space'),
      icon ? I(icon, opts.iconSpec) : null,
      S('gb-tree-label', ...[].concat(label)),
      opts.trail ? S('gb-tree-trail', opts.trail) : null);
  }

  const button = (label, spec, cls) => P('div', `gb-button${cls ? ' ' + cls : ''}`, spec, label);
  const primary = { bg: 'button.background', fg: 'button.foreground', bd: 'button.border' };
  const secondary = { bg: 'button.secondaryBackground', fg: 'button.secondaryForeground', bd: 'button.secondaryBorder' };
  const inputSpec = { bg: 'input.background', fg: 'input.foreground', bd: 'input.border' };
  const widgetShadow = { shadow: 'widget.shadow' };

  /** Marks a part as one of the workbench regions, for tests and for the Lab's edit panel. */
  const region = (el, name) => {
    el.setAttribute('data-region', name);
    return el;
  };

  // Chat views: Copilot Chat and Claude Code read these keys. Claude Code draws its input's
  // focus ring from the permission mode, and in default mode from its own fixed orange.
  const CLAUDE_ORANGE = '#d97757';
  const chatRequest = () => P('div', 'gb-chat-req', { bg: 'chat.requestBackground', fg: 'foreground', bd: 'chat.requestBorder' },
    P('span', 'gb-chat-slash', { bg: 'chat.slashCommandBackground', fg: 'chat.slashCommandForeground' }, '/explain'),
    ' why is the input border red?');
  const chatResponse = () => D('gb-chat-resp',
    D('gb-chat-who', P('span', 'gb-chat-avatar', { bg: 'chat.avatarBackground', fg: 'chat.avatarForeground' }, I('sparkle')), ' Assistant'),
    D(null, 'Auto mode draws the focus ring in ', P('span', 'gb-preformat', { fg: 'textPreformat.foreground', bg: 'textPreformat.background' }, 'errorForeground'), '. ',
      P('span', null, { fg: 'textLink.foreground' }, 'Learn more')),
    P('div', 'gb-chat-file', { bg: 'textCodeBlock.background' }, I('file-code'),
      P('span', null, { fg: 'chat.editedFileForeground' }, ' palette.js'), S('wb-spacer'),
      P('span', null, { fg: 'chat.linesAddedForeground' }, '+12'), ' ',
      P('span', null, { fg: 'chat.linesRemovedForeground' }, '-3')));
  /** A chat input whose border comes from `ring`, a color key, or from the literal `fixed` color. */
  function chatInput(ring, fixed) {
    const el = P('div', 'gb-chat-input', { bg: 'input.background', fg: 'input.foreground', bd: ring || 'inlineChatInput.border' },
      P('span', 'gb-chat-text', { fg: 'input.placeholderForeground' }, 'Ask about this file'),
      P('span', 'gb-chat-send', { bg: 'button.background', fg: 'button.foreground' }, I('send')));
    if (fixed) {
      el.style.border = `1px solid ${fixed}`;
      el.setAttribute('data-fixed', fixed);
      el.title = `${fixed} is set by the extension; no theme key changes it.`;
    }
    return el;
  }

  // ------------------------------------------------------------------- catalog

  const ANSI = ['Black', 'Red', 'Green', 'Yellow', 'Blue', 'Magenta', 'Cyan', 'White'];

  const CATALOG = [
    {
      id: 'workbench',
      title: 'Workbench overview',
      blurb: 'The main surfaces in context, with a split editor and a chat view in the secondary side bar. Hover any part to see the keys that draw it.',
      wide: true,
      render: () => {
        // VS Code's modern UI floats the side bars, editor and panel as cards on the shell
        // background and colors the active tab, activity item and panel tab with its own keys.
        const m = modernOf(ctx);
        const modern = Boolean(m && m.modern);
        const activeTab = modern
          ? { bg: 'modernEditorTab.activeBackground', fg: 'modernEditorTab.activeForeground', bdB: 'tab.activeBorder', bdR: 'tab.border' }
          : { bg: 'tab.activeBackground', fg: 'tab.activeForeground', bdT: 'tab.activeBorderTop', bdB: 'tab.activeBorder', bdR: 'tab.border' };
        const activeAct = modern
          ? { fg: 'modernActivityBarItem.activeForeground', bg: 'modernActivityBarItem.activeBackground' }
          : { fg: 'activityBar.foreground', bg: 'activityBar.activeBackground', bdL2: 'activityBar.activeBorder' };
        const activePtab = modern
          ? { fg: 'modernTab.activeForeground', bg: 'modernTab.activeBackground' }
          : { fg: 'panelTitle.activeForeground', bdB: 'panelTitle.activeBorder' };
        // The icon row at the top or bottom of the side bar: the modern UI paints its active item
        // like a panel tab and hides activityBarTop.activeBackground and the activeBorder line.
        const activeRowItem = modern
          ? { fg: 'modernTab.activeForeground', bg: 'modernTab.activeBackground' }
          : { fg: 'activityBarTop.foreground', bg: 'activityBarTop.activeBackground', bdB2: 'activityBarTop.activeBorder' };
        const title = region(P('div', 'wb-title', { bg: 'titleBar.activeBackground', fg: 'titleBar.activeForeground', bdB: 'titleBar.border' },
          S('wb-menu', 'File   Edit   Selection   View'),
          P('div', 'wb-cc', { bg: 'commandCenter.background', fg: 'commandCenter.foreground', bd: 'commandCenter.border' }, I('search'), ' gigglybits-theme-lab'),
          S('wb-spacer')), 'titleBar');
        // workbench.activityBar.location: 'default' is the bar at the window's edge; 'top' and
        // 'bottom' put its icons in a row at that end of the side bar; 'hidden' draws none.
        const place = m && ['top', 'bottom', 'hidden'].includes(m.activityBar) ? m.activityBar : 'default';
        const activity = place !== 'default' ? null : region(P('div', 'wb-activity', { bg: 'activityBar.background', bdR: 'activityBar.border' },
          P('div', 'wb-act', activeAct, I('files')),
          P('div', 'wb-act', { fg: 'activityBar.inactiveForeground' }, I('search')),
          P('div', 'wb-act', { fg: 'activityBar.inactiveForeground' }, I('source-control'),
            P('span', 'wb-act-badge', { bg: 'activityBarBadge.background', fg: 'activityBarBadge.foreground' }, '3')),
          P('div', 'wb-act', { fg: 'activityBar.inactiveForeground' }, I('extensions'))), 'activityBar');
        const actRow = place === 'top' || place === 'bottom'
          // Part of the side bar region, as in VS Code, where the row sits in the side bar.
          ? (P('div', `wb-actrow wb-actrow-${place}`, { bg: 'activityBarTop.background', [place === 'top' ? 'bdB' : 'bdT']: 'sideBarActivityBarTop.border' },
            P('div', 'wb-actrow-item', activeRowItem, I('files')),
            P('div', 'wb-actrow-item', { fg: 'activityBarTop.inactiveForeground' }, I('search')),
            P('div', 'wb-actrow-item', { fg: 'activityBarTop.inactiveForeground' }, I('source-control'),
              P('span', 'wb-act-badge', { bg: 'activityBarBadge.background', fg: 'activityBarBadge.foreground' }, '3')),
            P('div', 'wb-actrow-item', { fg: 'activityBarTop.inactiveForeground' }, I('extensions'))))
          : null;
        const side = region(P('div', 'wb-side', { bg: 'sideBar.background', fg: 'sideBar.foreground', ...(modern ? { bd: 'surface.border' } : { bdR: 'sideBar.border' }) },
          // With the icons at the top, they take the title's place, as in VS Code.
          place === 'top' ? actRow : P('div', 'wb-side-title', { bg: 'sideBarTitle.background', fg: 'sideBarTitle.foreground', bdB: 'sideBarTitle.border' }, 'Explorer'),
          P('div', 'wb-section', { bg: 'sideBarSectionHeader.background', fg: 'sideBarSectionHeader.foreground', bdT: 'sideBarSectionHeader.border' }, I('chevron-down'), ' gigglybits'),
          D('wb-tree',
            treeRow(0, 'folder-opened', 'src', null, { twistie: 'chevron-down' }),
            treeRow(1, 'file-code', 'extension.ts', { bg: 'list.activeSelectionBackground', fg: 'list.activeSelectionForeground' }),
            treeRow(1, 'file-code', 'themePreviewPanel.ts', { fg: 'gitDecoration.modifiedResourceForeground' }, { trail: 'M' }),
            treeRow(1, 'file-code', 'themeSource.ts', { bg: 'list.hoverBackground', fg: 'list.hoverForeground' }),
            treeRow(0, 'folder', 'media', null, { twistie: 'chevron-right' }),
            treeRow(0, 'file', 'package.json', { fg: 'gitDecoration.untrackedResourceForeground' }, { trail: 'U' })),
          place === 'bottom' ? actRow : null), 'sideBar');
        const tabs = region(P('div', 'wb-tabs', { bg: 'editorGroupHeader.tabsBackground', bdB: 'editorGroupHeader.tabsBorder' },
          P('div', 'gb-tab gb-tab-active', activeTab, I('file-code'), ' extension.ts ', I('close')),
          P('div', 'gb-tab', { bg: 'tab.inactiveBackground', fg: 'tab.inactiveForeground', bdR: 'tab.border' }, I('file-code'), ' themeSource.ts ', I('circle-filled'))), 'tabs');
        // The second editor group of a split: unfocused tabs, and the line between the groups.
        const group2 = region(P('div', 'wb-group2', { bdL: 'editorGroup.border' },
          P('div', 'wb-tabs', { bg: 'editorGroupHeader.tabsBackground', bdB: 'editorGroupHeader.tabsBorder' },
            P('div', 'gb-tab', { bg: 'tab.unfocusedActiveBackground', fg: 'tab.unfocusedActiveForeground', bdT: 'tab.unfocusedActiveBorderTop', bdR: 'tab.border' }, I('json'), ' package.json ')),
          editor(
            line(1, [B('{', 1)]),
            line(2, ['  ', T('"name"', 'support.type.property-name.json'), ': ', T('"gigglybits"', 'string.quoted.double.json'), ',']),
            line(3, ['  ', T('"private"', 'support.type.property-name.json'), ': ', T('true', 'constant.language.json')]),
            line(4, [B('}', 1)]))), 'editorGroup');
        const aux = region(P('div', 'wb-aux', { bg: 'sideBar.background', fg: 'sideBar.foreground', ...(modern ? { bd: 'surface.border' } : { bdL: 'sideBar.border' }) },
          P('div', 'wb-side-title', { fg: 'sideBarTitle.foreground' }, 'Chat'),
          D('wb-chat', chatRequest(), chatResponse(),
            chatInput('errorForeground'),
            P('div', 'gb-chat-caption', { fg: 'descriptionForeground' }, 'Focused input, Claude Code auto mode'))), 'chat');
        const crumbs = P('div', 'gb-crumbs', { bg: 'breadcrumb.background', fg: 'breadcrumb.foreground' },
          'src', I('chevron-right'), 'extension.ts', I('chevron-right'), I('symbol-method', { fg: 'symbolIcon.functionForeground' }), 'activate');
        const code = editor(
          line(1, [T('import', 'keyword.control.import.ts'), ' ', T('*', 'constant.language.import-export-all.ts'), ' ', T('as', 'keyword.control.as.ts'), ' ', T('vscode', 'variable.other.readwrite.alias.ts'), ' ', T('from', 'keyword.control.from.ts'), ' ', T("'vscode'", 'string.quoted.single.ts'), ';']),
          line(2, []),
          line(3, [T('export', 'keyword.control.export.ts'), ' ', T('function', 'storage.type.function.ts'), ' ', T('activate', 'entity.name.function.ts'), B('(', 1), T('context', 'variable.parameter.ts'), B(')', 1), ' ', B('{', 1)]),
          line(4, [guide(true), T('context', 'variable.other.object.ts'), '.', T('subscriptions', 'variable.other.property.ts'), '.', T('push', 'entity.name.function.ts'), B('(', 2), T('register', 'entity.name.function.ts'), B('(', 3), B(')', 3), B(')', 2), ';', cursor()], { active: true, spec: { bg: 'editor.lineHighlightBackground', bd: 'editor.lineHighlightBorder' } }),
          line(5, [B('}', 1)]));
        const panel = region(P('div', 'wb-panel', { bg: 'panel.background', ...(modern ? { bd: 'modernPanel.border' } : { bdT: 'panel.border' }) },
          P('div', 'wb-panel-tabs', { bdB: 'panelTitle.border' },
            P('span', 'gb-ptab gb-ptab-active', activePtab, 'Terminal'),
            P('span', 'gb-ptab', { fg: 'panelTitle.inactiveForeground' }, 'Problems'),
            P('span', 'gb-ptab', { fg: 'panelTitle.inactiveForeground' }, 'Output')),
          P('div', 'wb-term', { bg: 'terminal.background', fg: 'terminal.foreground' },
            D(null, '$ npm test'),
            D(null, P('span', 'gb-term-badge', { bg: 'terminal.ansiGreen', fg: 'terminal.ansiBlack' }, ' PASS '), ' test/themeSource.test.ts'))), 'panel');
        const status = region(P('div', 'wb-status', { bg: 'statusBar.background', fg: 'statusBar.foreground', bdT: 'statusBar.border' },
          P('span', 'gb-sitem wb-remote', { bg: 'statusBarItem.remoteBackground', fg: 'statusBarItem.remoteForeground' }, I('remote')),
          S('gb-sitem', I('git-branch'), ' main'),
          S('gb-sitem', I('error'), ' 0 ', I('warning'), ' 2'),
          S('wb-spacer'),
          S('gb-sitem', 'Ln 4, Col 52'),
          S('gb-sitem', 'TypeScript'),
          S('gb-sitem', I('bell'))), 'statusBar');
        // The editor area is painted as a whole, so the space below a group's last line is the
        // editor's background, as in VS Code, rather than whatever sits behind the drawing.
        const editorArea = P('div', 'wb-editor', { bg: 'editor.background', ...(modern ? { bd: 'surface.border' } : null) },
          D('wb-group1', tabs, crumbs, code), group2);
        const cls = ['wb', modern && 'wb-modern', modern && m.tabStyle === 'pill' && 'wb-pill', !activity && 'wb-noact'].filter(Boolean).join(' ');
        return P('div', cls, { bd: 'window.activeBorder', ...(modern ? { bg: 'modernUI.shellBackground' } : null) }, title, activity, side,
          editorArea, panel, aux, status);
      },
    },

    {
      id: 'chat',
      title: 'Chat views',
      blurb: 'Copilot Chat and Claude Code. Claude Code picks its input\'s focus ring by permission mode; in default mode it is the extension\'s own orange, which no theme key changes.',
      render: () => P('div', 'gb-surface', { bg: 'sideBar.background', fg: 'sideBar.foreground' },
        chatRequest(),
        chatResponse(),
        D('gb-subhead', 'Request bubbles, checkpoints and search'),
        labeled(
          ['request bubble', P('div', 'gb-chat-bubble', { bg: 'chat.requestBubbleBackground', fg: 'foreground' }, 'Rename ',
            P('span', 'gb-preformat', { bd: 'chat.requestCodeBorder' }, 'total'), ' to count')],
          ['request bubble, hovered', P('div', 'gb-chat-bubble', { bg: 'chat.requestBubbleHoverBackground', fg: 'foreground' }, 'Rename total to count')],
          ['checkpoint', P('div', 'gb-chat-checkpoint', { bdT: 'chat.checkpointSeparator', fg: 'descriptionForeground' }, 'Restore checkpoint')],
          ['find in the transcript', D(null, 'the ', P('span', 'gb-mark', { bg: 'chat.findMatchBackground' }, 'palette'), ' and the ',
            P('span', 'gb-mark', { bg: 'chat.findMatchHighlightBackground' }, 'palette'), ' colors')],
          ['working', D(null, P('span', 'gb-chat-shimmer', { fg: 'chat.thinkingShimmer' }, 'Thinking...'), '  ',
            P('span', 'gb-chat-status', { bg: 'chat.statusBackground' }, I('loading'), ' 2 files'))],
          ['input while a request runs', P('div', 'gb-chat-input', { bg: 'input.background', fg: 'input.foreground', bd: 'chat.inputWorkingBorderColor1' },
            P('span', 'gb-chat-text', { fg: 'input.placeholderForeground' }, 'Working...'))]),
        D('gb-subhead', 'Chat editors: running, needs input, done and not yet seen'),
        P('div', 'gb-tabstrip', { bg: 'editorGroupHeader.tabsBackground' },
          ...[['Chat 1', 'chat.sessionStateIndicator.inProgressBorder'], ['Chat 2', 'chat.sessionStateIndicator.needsInputBorder'],
            ['Chat 3', 'chat.sessionStateIndicator.unvisitedBorder']].map(([label, key]) =>
            P('div', 'gb-tab', { bg: 'tab.inactiveBackground', fg: 'tab.inactiveForeground', bdT2: key }, I('comment-discussion'), ` ${label} `))),
        D('gb-subhead', 'Chat input'),
        labeled(
          ['not focused', chatInput()],
          ['Claude Code, plan mode', chatInput('focusBorder')],
          ['Claude Code, accept edits', chatInput('foreground')],
          ['Claude Code, auto or bypass', chatInput('errorForeground')],
          ['Claude Code, default mode (fixed)', chatInput(null, CLAUDE_ORANGE)],
          ['inline chat, focused', P('div', 'gb-chat-input', { bg: 'inlineChatInput.background', bd: 'inlineChatInput.focusBorder' },
            P('span', 'gb-chat-text', { fg: 'inlineChatInput.placeholderForeground' }, 'Edit the selection'))])),
    },

    {
      id: 'buttons',
      title: 'Buttons',
      blurb: 'Disabled buttons are drawn at reduced opacity; there is no disabled color key.',
      render: () => P('div', 'gb-surface', { bg: 'sideBar.background', fg: 'sideBar.foreground' },
        states(
          state('primary', button('Commit', primary)),
          state('hover', button('Commit', { ...primary, bg: 'button.hoverBackground' })),
          state('focus', button('Commit', { ...primary, ol: 'focusBorder' })),
          state('disabled', button('Commit', primary, 'gb-disabled')),
          state('split', P('div', 'gb-button gb-split', primary, 'Sync', P('span', 'gb-split-sep', { bdL: 'button.separator' }), I('chevron-down')))),
        states(
          state('secondary', button('Cancel', secondary)),
          state('secondary hover', button('Cancel', { ...secondary, bg: 'button.secondaryHoverBackground' })),
          state('extension', button('Install', { bg: 'extensionButton.background', fg: 'extensionButton.foreground' })),
          state('extension hover', button('Install', { bg: 'extensionButton.hoverBackground', fg: 'extensionButton.foreground' }))),
        states(
          state('toolbar icon', P('span', 'gb-iconbtn', null, I('refresh', { fg: 'icon.foreground' }))),
          state('toolbar hover', P('span', 'gb-iconbtn', { bg: 'toolbar.hoverBackground', olDash: 'toolbar.hoverOutline' }, I('refresh', { fg: 'icon.foreground' }))),
          state('toolbar pressed', P('span', 'gb-iconbtn', { bg: 'toolbar.activeBackground' }, I('refresh', { fg: 'icon.foreground' }))))),
    },

    {
      id: 'inputs',
      title: 'Text inputs and validation',
      render: () => P('div', 'gb-surface', { bg: 'sideBar.background', fg: 'sideBar.foreground' },
        states(
          state('empty', P('div', 'gb-input', inputSpec, P('span', null, { fg: 'input.placeholderForeground' }, 'Search'))),
          state('focused', P('div', 'gb-input', { ...inputSpec, ol: 'focusBorder' }, 'theme', P('span', 'gb-input-caret', { bg: 'input.foreground' })))),
        labeled(
          ['info', D('gb-validation',
            P('div', 'gb-input', { ...inputSpec, bd: 'inputValidation.infoBorder' }, 'my-folder'),
            P('div', 'gb-validation-msg', { bg: 'inputValidation.infoBackground', fg: 'inputValidation.infoForeground', bd: 'inputValidation.infoBorder' }, 'A folder with this name will be created.'))],
          ['warning', D('gb-validation',
            P('div', 'gb-input', { ...inputSpec, bd: 'inputValidation.warningBorder' }, '.hidden'),
            P('div', 'gb-validation-msg', { bg: 'inputValidation.warningBackground', fg: 'inputValidation.warningForeground', bd: 'inputValidation.warningBorder' }, 'Names starting with a dot are hidden.'))],
          ['error', D('gb-validation',
            P('div', 'gb-input', { ...inputSpec, bd: 'inputValidation.errorBorder' }, 'a/b'),
            P('div', 'gb-validation-msg', { bg: 'inputValidation.errorBackground', fg: 'inputValidation.errorForeground', bd: 'inputValidation.errorBorder' }, 'The name cannot contain "/".'))]),
        states(
          state('option toggles: off, on, hover', P('div', 'gb-input gb-input-options', inputSpec, 'greet',
            S('wb-spacer'),
            P('span', 'gb-toggle', null, I('case-sensitive')),
            P('span', 'gb-toggle', { bg: 'inputOption.activeBackground', fg: 'inputOption.activeForeground', bd: 'inputOption.activeBorder' }, I('whole-word')),
            P('span', 'gb-toggle', { bg: 'inputOption.hoverBackground' }, I('regex')))))),
    },

    {
      id: 'controls',
      title: 'Dropdowns, checkboxes and radios',
      render: () => P('div', 'gb-surface', { bg: 'editor.background', fg: 'editor.foreground' },
        states(
          state('dropdown', P('div', 'gb-dropdown', { bg: 'dropdown.background', fg: 'dropdown.foreground', bd: 'dropdown.border' }, 'afterDelay', S('wb-spacer'), I('chevron-down'))),
          state('dropdown open', D(null,
            P('div', 'gb-dropdown', { bg: 'dropdown.background', fg: 'dropdown.foreground', bd: 'dropdown.border', ol: 'focusBorder' }, 'afterDelay', S('wb-spacer'), I('chevron-down')),
            P('div', 'gb-dropdown-list', { bg: 'dropdown.listBackground', fg: 'dropdown.foreground', bd: 'dropdown.border' },
              D('gb-dropdown-opt', 'off'),
              P('div', 'gb-dropdown-opt', { bg: 'list.activeSelectionBackground', fg: 'list.activeSelectionForeground' }, 'afterDelay'),
              D('gb-dropdown-opt', 'onFocusChange'))))),
        states(
          state('checkbox', P('span', 'gb-check', { bg: 'checkbox.background', fg: 'checkbox.foreground', bd: 'checkbox.border' })),
          state('checked', P('span', 'gb-check', { bg: 'checkbox.background', fg: 'checkbox.foreground', bd: 'checkbox.border' }, I('check'))),
          state('in a selected row', P('div', 'gb-check-row', { bg: 'list.activeSelectionBackground', fg: 'list.activeSelectionForeground' },
            P('span', 'gb-check', { bg: 'checkbox.selectBackground', fg: 'checkbox.foreground', bd: 'checkbox.selectBorder' }, I('check')), ' Format on save'))),
        states(
          state('radio on', P('span', 'gb-radio', { bg: 'radio.activeBackground', fg: 'radio.activeForeground', bd: 'radio.activeBorder' }, 'Tabs')),
          state('radio off', P('span', 'gb-radio', { bg: 'radio.inactiveBackground', fg: 'radio.inactiveForeground', bd: 'radio.inactiveBorder' }, 'Spaces')),
          state('radio off, hover', P('span', 'gb-radio', { bg: 'radio.inactiveHoverBackground', fg: 'radio.inactiveForeground', bd: 'radio.inactiveBorder' }, 'Spaces'))),
        states(
          state('setting, modified', P('div', 'gb-setting', { bdL2: 'settings.modifiedItemIndicator' },
            P('div', 'gb-setting-title', { fg: 'settings.headerForeground' }, 'Editor: ', h('b', null, 'Font Size')),
            P('div', 'gb-setting-desc', { fg: 'descriptionForeground' }, 'Controls the font size in pixels.'))))),
    },

    {
      id: 'badges',
      title: 'Badges, progress and keybindings',
      render: () => P('div', 'gb-surface', { bg: 'sideBar.background', fg: 'sideBar.foreground' },
        states(
          state('badge', P('span', 'gb-badge', { bg: 'badge.background', fg: 'badge.foreground' }, '12')),
          state('activity badge', P('span', 'gb-badge', { bg: 'activityBarBadge.background', fg: 'activityBarBadge.foreground' }, '3')),
          state('error badge', P('span', 'gb-badge', { bg: 'activityErrorBadge.background', fg: 'activityErrorBadge.foreground' }, '2')),
          state('warning badge', P('span', 'gb-badge', { bg: 'activityWarningBadge.background', fg: 'activityWarningBadge.foreground' }, '5')),
          state('panel tab badge', P('span', 'gb-badge', { bg: 'panelTitleBadge.background', fg: 'panelTitleBadge.foreground' }, '7'))),
        states(
          state('progress', D('gb-progress', P('span', 'gb-progress-bar', { bg: 'progressBar.background' }))),
          state('keybinding', D('gb-keys',
            ...['Ctrl', 'Shift', 'P'].flatMap((k, i) => [i ? '+' : null,
              P('span', 'gb-key', { bg: 'keybindingLabel.background', fg: 'keybindingLabel.foreground', bd: 'keybindingLabel.border', bdB: 'keybindingLabel.bottomBorder' }, k)]))))),
    },

    {
      id: 'activity',
      title: 'Activity bar',
      render: () => labeled(
        ['active', P('div', 'gb-actbar', { bg: 'activityBar.background', bdR: 'activityBar.border' },
          P('div', 'wb-act', { fg: 'activityBar.foreground', bg: 'activityBar.activeBackground', bdL2: 'activityBar.activeBorder' }, I('files')))],
        ['active, keyboard focus', P('div', 'gb-actbar', { bg: 'activityBar.background', bdR: 'activityBar.border' },
          P('div', 'wb-act', { fg: 'activityBar.foreground', bg: 'activityBar.activeBackground', bdL2: 'activityBar.activeBorder', ol: 'activityBar.activeFocusBorder' }, I('files')))],
        ['inactive', P('div', 'gb-actbar', { bg: 'activityBar.background', bdR: 'activityBar.border' },
          P('div', 'wb-act', { fg: 'activityBar.inactiveForeground' }, I('search')))],
        ['with badge', P('div', 'gb-actbar', { bg: 'activityBar.background', bdR: 'activityBar.border' },
          P('div', 'wb-act', { fg: 'activityBar.inactiveForeground' }, I('source-control'),
            P('span', 'wb-act-badge', { bg: 'activityBarBadge.background', fg: 'activityBarBadge.foreground' }, '3')))],
        ['drop target', P('div', 'gb-actbar', { bg: 'activityBar.background', bdR: 'activityBar.border' },
          P('div', 'wb-act', { fg: 'activityBar.inactiveForeground', bdT2: 'activityBar.dropBorder' }, I('extensions')))],
        ['at the top or bottom, drop target', P('div', 'wb-actrow', { bg: 'activityBarTop.background' },
          P('div', 'wb-actrow-item', { fg: 'activityBarTop.foreground', bg: 'activityBarTop.activeBackground', bdB2: 'activityBarTop.activeBorder' }, I('files')),
          P('div', 'wb-actrow-item', { fg: 'activityBarTop.inactiveForeground', bdL2: 'activityBarTop.dropBorder' }, I('extensions')))]),
    },

    {
      id: 'lists',
      title: 'Lists and trees',
      blurb: 'Explorer, search results, outline and every other tree view share these keys.',
      render: () => P('div', 'gb-surface gb-surface-flush', { bg: 'sideBar.background', fg: 'sideBar.foreground' },
        labeled(
          ['section header', P('div', 'wb-section', { bg: 'sideBarSectionHeader.background', fg: 'sideBarSectionHeader.foreground', bdT: 'sideBarSectionHeader.border' }, I('chevron-down'), ' Outline')],
          ['normal', treeRow(1, 'symbol-class', 'ThemePreviewPanel', null, { guides: true, iconSpec: { fg: 'symbolIcon.classForeground' } })],
          ['hover', treeRow(2, 'symbol-method', 'show', { bg: 'list.hoverBackground', fg: 'list.hoverForeground' }, { guides: true, iconSpec: { fg: 'symbolIcon.methodForeground' } })],
          ['focused', treeRow(2, 'symbol-method', 'revive', { bg: 'list.focusBackground', fg: 'list.focusForeground', ol: 'list.focusOutline' }, { guides: true, iconSpec: { fg: 'symbolIcon.methodForeground' } })],
          ['selected', treeRow(2, 'symbol-method', 'refresh', { bg: 'list.activeSelectionBackground', fg: 'list.activeSelectionForeground', ol: 'list.focusAndSelectionOutline' }, { guides: true, iconSpec: { fg: 'list.activeSelectionIconForeground' } })],
          ['selected, view unfocused', treeRow(2, 'symbol-method', 'refresh', { bg: 'list.inactiveSelectionBackground', fg: 'list.inactiveSelectionForeground', ol: 'list.inactiveFocusOutline' }, { guides: true, iconSpec: { fg: 'list.inactiveSelectionIconForeground' } })],
          ['filter match', treeRow(2, 'symbol-field', ['current', P('span', 'gb-hlmatch', { fg: 'list.highlightForeground' }, 'Pan'), 'el'], null, { guides: true, iconSpec: { fg: 'symbolIcon.fieldForeground' } })],
          ['filter match, selected', treeRow(2, 'symbol-field', ['current', P('span', 'gb-hlmatch', { fg: 'list.focusHighlightForeground' }, 'Pan'), 'el'], { bg: 'list.activeSelectionBackground', fg: 'list.activeSelectionForeground' }, { guides: true })],
          ['drop target', treeRow(1, 'folder', 'media', { bg: 'list.dropBackground' }, { guides: true })],
          ['error', treeRow(1, 'file-code', 'broken.ts', { fg: 'list.errorForeground' }, { guides: true, trail: '2' })],
          ['warning', treeRow(1, 'file-code', 'shaky.ts', { fg: 'list.warningForeground' }, { guides: true, trail: '1' })],
          ['deemphasized', treeRow(1, 'file', 'out.log', { fg: 'list.deemphasizedForeground' }, { guides: true })],
          ['invalid', treeRow(1, 'file', 'missing.ts', { fg: 'list.invalidItemForeground' }, { guides: true })],
          ['inactive indent guide', treeRow(2, 'file', 'nested.json', null, { guides: false })],
          ['focused, view unfocused', treeRow(2, 'symbol-method', 'dispose', { bg: 'list.inactiveFocusBackground' }, { guides: true })],
          ['drop between rows', treeRow(1, 'file', 'shared.js', { bdT2: 'list.dropBetweenBackground' }, { guides: true })],
          ['type-to-filter match', treeRow(1, 'file-code', ['the', P('span', 'gb-hlmatch', { bg: 'list.filterMatchBackground', bd: 'list.filterMatchBorder' }, 'meS'), 'ource.ts'], null, { guides: true })],
          ['sticky folder while scrolling', P('div', 'gb-sticky', { bg: 'sideBarStickyScroll.background', bdB: 'sideBarStickyScroll.border', shadow: 'sideBarStickyScroll.shadow' },
            treeRow(0, 'folder-opened', 'src', null, { twistie: 'chevron-down' }))],
          ['search results message', P('div', 'gb-tree-row', { fg: 'search.resultsInfoForeground' }, '12 results in 3 files')]),
        D('gb-subhead', 'Type to filter'),
        states(
          state('filter box', P('div', 'gb-widget gb-listfilter', { bg: 'listFilterWidget.background', ol: 'listFilterWidget.outline', shadow: 'listFilterWidget.shadow' }, I('filter'), ' theme')),
          state('no matches', P('div', 'gb-widget gb-listfilter', { bg: 'listFilterWidget.background', ol: 'listFilterWidget.noMatchesOutline', shadow: 'listFilterWidget.shadow' }, I('filter'), ' zzz'))),
        D('gb-subhead', 'Table (Keyboard Shortcuts, Ports)'),
        D('gb-table',
          ...[['Copy', 'Ctrl+C'], ['Paste', 'Ctrl+V'], ['Find', 'Ctrl+F']].map(([a, b], i) =>
            P('div', 'gb-table-row', i % 2 ? { bg: 'tree.tableOddRowsBackground' } : null,
              P('span', 'gb-table-cell', { bdR: 'tree.tableColumnsBorder' }, a), S('gb-table-cell', b))))),
    },

    {
      id: 'scm',
      title: 'Source control decorations',
      blurb: 'File colors in the Explorer, tabs and Source Control view.',
      render: () => P('div', 'gb-surface gb-surface-flush', { bg: 'sideBar.background', fg: 'sideBar.foreground' },
        labeled(
          ['modified', treeRow(1, 'file-code', 'extension.ts', { fg: 'gitDecoration.modifiedResourceForeground' }, { trail: 'M' })],
          ['staged modified', treeRow(1, 'file-code', 'gallery.js', { fg: 'gitDecoration.stageModifiedResourceForeground' }, { trail: 'M' })],
          ['added', treeRow(1, 'file-code', 'shared.js', { fg: 'gitDecoration.addedResourceForeground' }, { trail: 'A' })],
          ['untracked', treeRow(1, 'file', 'notes.md', { fg: 'gitDecoration.untrackedResourceForeground' }, { trail: 'U' })],
          ['renamed', treeRow(1, 'file', 'theme.json', { fg: 'gitDecoration.renamedResourceForeground' }, { trail: 'R' })],
          ['deleted', treeRow(1, 'file', P('span', 'gb-strike', null, 'old.ts'), { fg: 'gitDecoration.deletedResourceForeground' }, { trail: 'D' })],
          ['staged deleted', treeRow(1, 'file', P('span', 'gb-strike', null, 'gone.ts'), { fg: 'gitDecoration.stageDeletedResourceForeground' }, { trail: 'D' })],
          ['conflict', treeRow(1, 'file-code', 'merge.ts', { fg: 'gitDecoration.conflictingResourceForeground' }, { trail: '!' })],
          ['ignored', treeRow(1, 'folder', 'node_modules', { fg: 'gitDecoration.ignoredResourceForeground' })],
          ['submodule', treeRow(1, 'folder', 'vendor', { fg: 'gitDecoration.submoduleResourceForeground' }, { trail: 'S' })])),
    },

    {
      id: 'tabs',
      title: 'Editor tabs and breadcrumbs',
      wide: true,
      render: () => {
        const strip = (...tabs) => P('div', 'gb-tabstrip', { bg: 'editorGroupHeader.tabsBackground', bdB: 'editorGroupHeader.tabsBorder' }, ...tabs);
        const tab = (label, spec, trailing = 'close') => P('div', 'gb-tab', { bdR: 'tab.border', ...spec }, I('file-code'), ` ${label} `, I(trailing));
        return D(null,
          D('gb-subhead', 'Focused editor group'),
          states(
            state('active', strip(tab('extension.ts', { bg: 'tab.activeBackground', fg: 'tab.activeForeground', bdT: 'tab.activeBorderTop', bdB: 'tab.activeBorder' }))),
            state('active, unsaved', strip(tab('extension.ts', { bg: 'tab.activeBackground', fg: 'tab.activeForeground', bdT: 'tab.activeModifiedBorder', bdB: 'tab.activeBorder' }, 'circle-filled'))),
            state('inactive', strip(tab('themeSource.ts', { bg: 'tab.inactiveBackground', fg: 'tab.inactiveForeground' }))),
            state('inactive, unsaved', strip(tab('themeSource.ts', { bg: 'tab.inactiveBackground', fg: 'tab.inactiveForeground', bdT: 'tab.inactiveModifiedBorder' }, 'circle-filled'))),
            state('hover', strip(tab('shared.js', { bg: 'tab.hoverBackground', fg: 'tab.hoverForeground', bdB: 'tab.hoverBorder' }))),
            state('multi-selected', strip(tab('gallery.js', { bg: 'tab.selectedBackground', fg: 'tab.selectedForeground', bdT: 'tab.selectedBorderTop' }))),
            state('pinned, then a divider', P('div', 'gb-tabstrip', { bg: 'editorGroupHeader.tabsBackground', bdB: 'editorGroupHeader.border' },
              tab('README.md', { bg: 'tab.inactiveBackground', fg: 'tab.inactiveForeground', bdR: 'tab.lastPinnedBorder' }, 'pinned'),
              tab('theme.json', { bg: 'tab.inactiveBackground', fg: 'tab.inactiveForeground', bdR: 'tab.divider' }))),
            state('dragging a tab between two', strip(tab('shared.js', { bg: 'tab.inactiveBackground', fg: 'tab.inactiveForeground', bdL2: 'tab.dragAndDropBorder' })))),
          D('gb-subhead', 'Unfocused editor group'),
          states(
            state('active', strip(tab('extension.ts', { bg: 'tab.unfocusedActiveBackground', fg: 'tab.unfocusedActiveForeground', bdT: 'tab.unfocusedActiveBorderTop', bdB: 'tab.unfocusedActiveBorder' }))),
            state('active, unsaved', strip(tab('extension.ts', { bg: 'tab.unfocusedActiveBackground', fg: 'tab.unfocusedActiveForeground', bdT: 'tab.unfocusedActiveModifiedBorder' }, 'circle-filled'))),
            state('inactive', strip(tab('themeSource.ts', { bg: 'tab.unfocusedInactiveBackground', fg: 'tab.unfocusedInactiveForeground' }))),
            state('inactive, unsaved', strip(tab('themeSource.ts', { bg: 'tab.unfocusedInactiveBackground', fg: 'tab.unfocusedInactiveForeground', bdT: 'tab.unfocusedInactiveModifiedBorder' }, 'circle-filled'))),
            state('hover', strip(tab('shared.js', { bg: 'tab.unfocusedHoverBackground', fg: 'tab.unfocusedHoverForeground', bdB: 'tab.unfocusedHoverBorder' })))),
          D('gb-subhead', 'Breadcrumbs'),
          states(
            state('normal, focused item, picker open', P('div', 'gb-crumbs', { bg: 'breadcrumb.background', fg: 'breadcrumb.foreground' },
              'src', I('chevron-right'),
              P('span', null, { fg: 'breadcrumb.focusForeground' }, 'extension.ts'), I('chevron-right'),
              P('span', null, { fg: 'breadcrumb.activeSelectionForeground' }, 'activate'))),
            state('picker', P('div', 'gb-crumb-picker', { bg: 'breadcrumbPicker.background', fg: 'editorWidget.foreground', bd: 'editorWidget.border' },
              D('gb-dropdown-opt', I('symbol-method', { fg: 'symbolIcon.functionForeground' }), ' activate'),
              D('gb-dropdown-opt', I('symbol-method', { fg: 'symbolIcon.functionForeground' }), ' deactivate')))),
          D('gb-subhead', 'Editor groups'),
          states(
            state('empty group', P('div', 'gb-group-demo', { bg: 'editorGroup.emptyBackground' }, 'No editor open')),
            state('empty group, focused', P('div', 'gb-group-demo', { bg: 'editorGroup.emptyBackground', ol: 'editorGroup.focusedEmptyBorder' }, 'No editor open')),
            state('dragging an editor over a group', P('div', 'gb-group-demo', { bg: 'editor.background' },
              P('div', 'gb-group-drop', { bg: 'editorGroup.dropBackground' },
                P('span', 'gb-group-prompt', { bd: 'editorGroup.dropIntoPromptBorder' }, 'Hold Shift to drop into the editor'))))));
      },
    },

    {
      id: 'editor-text',
      title: 'Editor: text, cursor and guides',
      blurb: 'Syntax colors come from the theme\'s TextMate rules, matched approximately; hover a token for its scope and rule.',
      wide: true,
      render: () => editor(
        line(1, [T('// Greets someone by name', 'comment.line.double-slash.ts')]),
        line(2, [T('import', 'keyword.control.import.ts'), ' ', B('{', 1), ' ', T('readFile', 'variable.other.readwrite.alias.ts'), ' ', B('}', 1), ' ', T('from', 'keyword.control.from.ts'), ' ', T("'fs/promises'", 'string.quoted.single.ts'), ';']),
        P('div', 'gb-line gb-codelens-line', null, S('gb-gutter-mark'), S('gb-ln'), P('span', 'gb-code gb-codelens', { fg: 'editorCodeLens.foreground' }, '2 references')),
        line(3, [T('export', 'keyword.control.export.ts'), ' ', T('async', 'storage.modifier.async.ts'), ' ', T('function', 'storage.type.function.ts'), ' ', T('greet', 'entity.name.function.ts'), B('(', 1),
          T('name', 'variable.parameter.ts'), ': ', T('string', 'support.type.primitive.ts'), ', ', T('times', 'variable.parameter.ts'),
          P('span', 'gb-inlay', { bg: 'editorInlayHint.background', fg: 'editorInlayHint.foreground' }, ': number'), ' = ', T('3', 'constant.numeric.decimal.ts'), B(')', 1), ' ', B('{', 1)]),
        line(4, [guide(true), T('for', 'keyword.control.loop.ts'), ' ', B('(', 2), T('let', 'storage.type.ts'), ' ', T('i', 'variable.other.readwrite.ts'), ' ', T('=', 'keyword.operator.assignment.ts'), ' ', T('0', 'constant.numeric.decimal.ts'), '; ',
          T('i', 'variable.other.readwrite.ts'), ' ', T('<', 'keyword.operator.relational.ts'), ' ', T('times', 'variable.other.readwrite.ts'), '; ', T('i', 'variable.other.readwrite.ts'), T('++', 'keyword.operator.increment.ts'), B(')', 2), ' ',
          P('span', 'gb-bracket-match', { bg: 'editorBracketMatch.background', bd: 'editorBracketMatch.border' }, B('{', 2))],
        { active: true, spec: { bg: 'editor.lineHighlightBackground', bd: 'editor.lineHighlightBorder' } }),
        line(5, [guide(true), guide(false), P('span', 'gb-ws', { fg: 'editorWhitespace.foreground' }, '··'), T('console', 'support.class.console.ts'), '.', T('log', 'support.function.console.ts'), B('(', 3),
          T('`Hello, ', 'string.template.ts'), T('${', 'punctuation.definition.template-expression.begin.ts'), T('name', 'variable.other.readwrite.ts'), T('}', 'punctuation.definition.template-expression.end.ts'), T('!`', 'string.template.ts'), B(')', 3), ';']),
        line(6, [guide(true), P('span', 'gb-bracket-match', { bg: 'editorBracketMatch.background', bd: 'editorBracketMatch.border' }, B('}', 2))]),
        line(7, [guide(false), T('return', 'keyword.control.flow.ts'), ' ', T('name', 'variable.other.readwrite.ts'), '.', T('length', 'support.variable.property.ts'), cursor(),
          P('span', 'gb-ghost', { fg: 'editorGhostText.foreground', bg: 'editorGhostText.background', bd: 'editorGhostText.border' }, " > 0 ? name : 'friend';")]),
        line(8, [B('}', 1)]),
        line(9, [P('span', 'gb-ruler', { bdL: 'editorRuler.foreground' }), T('// a ruler sits at the configured column', 'comment.line.double-slash.ts')])),
    },

    {
      id: 'editor-selection',
      title: 'Editor: selection and search highlights',
      wide: true,
      render: () => {
        const text = (...kids) => editor(line(12, [T('const', 'storage.type.ts'), ' ', T('total', 'variable.other.constant.ts'), ' = ', ...kids, ';']));
        const items = (spec) => P('span', 'gb-mark', spec, T('items', 'variable.other.readwrite.ts'), '.', T('length', 'support.variable.property.ts'));
        return labeled(
          ['selection', text(items({ bg: 'editor.selectionBackground', fg: 'editor.selectionForeground' }))],
          ['selection, editor not focused', text(items({ bg: 'editor.inactiveSelectionBackground' }))],
          ['same text as the selection', text(items({ bg: 'editor.selectionHighlightBackground', bd: 'editor.selectionHighlightBorder' }))],
          ['symbol under cursor (read)', text(items({ bg: 'editor.wordHighlightBackground', bd: 'editor.wordHighlightBorder' }))],
          ['symbol under cursor (write)', text(items({ bg: 'editor.wordHighlightStrongBackground', bd: 'editor.wordHighlightStrongBorder' }))],
          ['current find match', text(items({ bg: 'editor.findMatchBackground', fg: 'editor.findMatchForeground', bd: 'editor.findMatchBorder' }))],
          ['other find matches', text(items({ bg: 'editor.findMatchHighlightBackground', fg: 'editor.findMatchHighlightForeground', bd: 'editor.findMatchHighlightBorder' }))],
          ['find in selection range', text(P('span', 'gb-mark', { bg: 'editor.findRangeHighlightBackground', bd: 'editor.findRangeHighlightBorder' }, T('items', 'variable.other.readwrite.ts'), '.', T('length', 'support.variable.property.ts')))],
          ['range highlight (Go to Symbol)', editor(line(12, [T('const', 'storage.type.ts'), ' ', T('total', 'variable.other.constant.ts'), ' = ', T('items', 'variable.other.readwrite.ts'), ';'], { spec: { bg: 'editor.rangeHighlightBackground', bd: 'editor.rangeHighlightBorder' } }))],
          ['folded region', editor(line(12, [T('function', 'storage.type.function.ts'), ' ', T('setup', 'entity.name.function.ts'), '() ', P('span', 'gb-mark', { bg: 'editor.foldBackground' }, '{ … }'), P('span', 'gb-mark', { fg: 'editor.foldPlaceholderForeground' }, ' ⋯')]))]);
      },
    },

    {
      id: 'editor-highlights',
      title: 'Editor: symbols, snippets, links and cursor',
      wide: true,
      render: () => {
        const text = (...kids) => editor(line(14, [T('const', 'storage.type.ts'), ' ', ...kids, ' = ', T('load', 'entity.name.function.ts'), '();']));
        const name = spec => P('span', 'gb-mark', spec, T('config', 'variable.other.constant.ts'));
        return labeled(
          ['word under the hover', text(name({ bg: 'editor.hoverHighlightBackground' }))],
          ['symbol, after Go to Definition', text(name({ bg: 'editor.symbolHighlightBackground', bd: 'editor.symbolHighlightBorder' }))],
          ['rename on type (linked editing)', text(name({ bg: 'editor.linkedEditingBackground' }))],
          ['snippet placeholder', text(name({ bg: 'editor.snippetTabstopHighlightBackground', bd: 'editor.snippetTabstopHighlightBorder' }))],
          ['snippet end', text(name({ bg: 'editor.snippetFinalTabstopHighlightBackground', bd: 'editor.snippetFinalTabstopHighlightBorder' }))],
          ['unexpected bracket', editor(line(15, [T('call', 'entity.name.function.ts'), B('(', 1), T('x', 'variable.other.readwrite.ts'), B(')', 1), P('span', null, { fg: 'editorBracketHighlight.unexpectedBracket.foreground' }, ')'), ';']))],
          ['link under Ctrl+hover', editor(line(16, [T('// see ', 'comment.line.double-slash.ts'), P('span', 'gb-link-active', { fg: 'editorLink.activeForeground' }, 'https://code.visualstudio.com')]))],
          ['unused code', editor(line(17, [P('span', 'gb-unnecessary', { bd: 'editorUnnecessaryCode.border' }, T('let', 'storage.type.ts'), ' ', T('unused', 'variable.other.readwrite.ts'), ';')]))],
          ['block cursor', editor(line(18, [T('retur', 'keyword.control.flow.ts'), P('span', 'gb-block-cursor', { bg: 'editorCursor.foreground', fg: 'editorCursor.background' }, 'n')]))],
          ['cursor line, editor not focused', editor(line(19, [T('return', 'keyword.control.flow.ts'), ';'], { spec: { bg: 'editor.inactiveLineHighlightBackground' } }))],
          ['final line, dimmed', editor(line(20, [T('}', 'punctuation.definition.block.ts')]),
            P('div', 'gb-line', null, S('gb-gutter-mark'), P('span', 'gb-ln', { fg: 'editorLineNumber.dimmedForeground' }, '21'), D('gb-code')))],
          ['sticky scroll', P('div', 'gb-sticky', { bg: 'editor.background', bdB: 'editorStickyScroll.border' },
            line(3, [T('export', 'keyword.control.export.ts'), ' ', T('function', 'storage.type.function.ts'), ' ', T('activate', 'entity.name.function.ts'), '() {']))],
          ['sticky scroll, hovered', P('div', 'gb-sticky', { bg: 'editorStickyScrollHover.background', bdB: 'editorStickyScroll.border' },
            line(3, [T('export', 'keyword.control.export.ts'), ' ', T('function', 'storage.type.function.ts'), ' ', T('activate', 'entity.name.function.ts'), '() {']))]);
      },
    },

    {
      id: 'editor-scroll',
      title: 'Editor: scrollbar, minimap and overview ruler',
      blurb: 'The overview ruler is the strip beside the scrollbar; each mark shows where something is in the file.',
      wide: true,
      render: () => {
        const RULER = [
          ['error', 'editorOverviewRuler.errorForeground'], ['warning', 'editorOverviewRuler.warningForeground'],
          ['info', 'editorOverviewRuler.infoForeground'], ['find match', 'editorOverviewRuler.findMatchForeground'],
          ['selection', 'editorOverviewRuler.selectionHighlightForeground'], ['symbol', 'editorOverviewRuler.wordHighlightForeground'],
          ['symbol, written', 'editorOverviewRuler.wordHighlightStrongForeground'], ['same text', 'editorOverviewRuler.wordHighlightTextForeground'],
          ['range', 'editorOverviewRuler.rangeHighlightForeground'], ['bracket match', 'editorOverviewRuler.bracketMatchForeground'],
          ['added', 'editorOverviewRuler.addedForeground'], ['modified', 'editorOverviewRuler.modifiedForeground'],
          ['deleted', 'editorOverviewRuler.deletedForeground'], ['merge: current', 'editorOverviewRuler.currentContentForeground'],
          ['merge: incoming', 'editorOverviewRuler.incomingContentForeground'], ['merge: common', 'editorOverviewRuler.commonContentForeground'],
          ['comment', 'editorOverviewRuler.commentForeground'], ['comment, unresolved', 'editorOverviewRuler.commentUnresolvedForeground'],
          ['comment, draft', 'editorOverviewRuler.commentDraftForeground'], ['inline chat, inserted', 'editorOverviewRuler.inlineChatInserted'],
          ['inline chat, removed', 'editorOverviewRuler.inlineChatRemoved'],
        ];
        const MINIMAP = [['error', 'minimap.errorHighlight'], ['warning', 'minimap.warningHighlight'], ['info', 'minimap.infoHighlight'], ['find match', 'minimap.findMatchHighlight']];
        const code = editor(
          line(1, [T('import', 'keyword.control.import.ts'), ' ', T("'vscode'", 'string.quoted.single.ts'), ';']),
          line(2, [T('const', 'storage.type.ts'), ' ', T('total', 'variable.other.constant.ts'), ' = ', T('0', 'constant.numeric.decimal.ts'), ';']),
          line(3, [T('export', 'keyword.control.export.ts'), ' ', T('function', 'storage.type.function.ts'), ' ', T('run', 'entity.name.function.ts'), '() {}']));
        const minimap = P('div', 'gb-minimap', { bg: 'minimap.background' },
          P('span', 'gb-minimap-slider', { bg: 'minimapSlider.background' }),
          ...MINIMAP.map(([label, key], i) => {
            const mark = P('span', 'gb-minimap-mark', { bg: key });
            mark.title = `minimap: ${label}`;
            mark.style.top = `${8 + i * 14}px`;
            return mark;
          }));
        const ruler = P('div', 'gb-ruler-strip', { bg: 'editorOverviewRuler.background', bdL: 'editorOverviewRuler.border' },
          ...RULER.map(([label, key]) => {
            const mark = P('span', 'gb-ruler-mark', { bg: key });
            mark.title = `overview ruler: ${label}`;
            return mark;
          }));
        const track = P('div', 'gb-scroll-track', { bg: 'scrollbar.background' }, P('span', 'gb-slider', { bg: 'scrollbarSlider.background' }));
        return D(null,
          D('gb-scroll-editor', D('gb-scroll-code', code), minimap, track, ruler),
          states(
            state('minimap slider: normal, hover, dragged', D('gb-scroll-demo',
              P('span', 'gb-slider gb-slider-wide', { bg: 'minimapSlider.background' }),
              P('span', 'gb-slider gb-slider-wide', { bg: 'minimapSlider.hoverBackground' }),
              P('span', 'gb-slider gb-slider-wide', { bg: 'minimapSlider.activeBackground' })))));
      },
    },

    {
      id: 'editor-diagnostics',
      title: 'Editor: diagnostics and gutter',
      wide: true,
      render: () => {
        const sq = (shorthand, prefix, text) => P('span', 'gb-squiggle', { [shorthand]: `${prefix}.foreground`, bg: `${prefix}.background`, bd: `${prefix}.border` }, text);
        return D(null,
          labeled(
            ['error', editor(line(20, [T('const', 'storage.type.ts'), ' x: ', T('number', 'support.type.primitive.ts'), ' = ', sq('wavy', 'editorError', T("'one'", 'string.quoted.single.ts')), ';']))],
            ['warning', editor(line(21, [T('let', 'storage.type.ts'), ' ', sq('wavy', 'editorWarning', T('unused', 'variable.other.readwrite.ts')), ' = ', T('1', 'constant.numeric.decimal.ts'), ';']))],
            ['info', editor(line(22, [sq('wavy', 'editorInfo', T('fetchData', 'entity.name.function.ts')), '();']))],
            ['hint', editor(line(23, [P('span', 'gb-squiggle', { dotted: 'editorHint.foreground', bd: 'editorHint.border' }, T('var', 'storage.type.ts')), ' ', T('legacy', 'variable.other.readwrite.ts'), ';']))],
            ['added line (gutter)', editor(line(24, [T('return', 'keyword.control.flow.ts'), ' ', T('true', 'constant.language.boolean.true.ts'), ';'], { gutter: { bg: 'editorGutter.addedBackground' } }))],
            ['modified line (gutter)', editor(line(25, [T('return', 'keyword.control.flow.ts'), ' ', T('false', 'constant.language.boolean.false.ts'), ';'], { gutter: { bg: 'editorGutter.modifiedBackground' } }))],
            ['deleted lines (gutter)', editor(line(26, [B('}', 1)], { gutter: { bdB2: 'editorGutter.deletedBackground' } }))],
            ['light bulbs: fix, auto fix', editor(line(27, [I('lightbulb', { fg: 'editorLightBulb.foreground' }), ' ', I('lightbulb-autofix', { fg: 'editorLightBulbAutoFix.foreground' }), ' ', T('doThing', 'entity.name.function.ts'), '();']))],
            ['staged changes (gutter): added, modified, deleted', editor(
              line(28, [T('a', 'variable.other.readwrite.ts'), ';'], { gutter: { bg: 'editorGutter.addedSecondaryBackground' } }),
              line(29, [T('b', 'variable.other.readwrite.ts'), ';'], { gutter: { bg: 'editorGutter.modifiedSecondaryBackground' } }),
              line(30, [B('}', 1)], { gutter: { bdB2: 'editorGutter.deletedSecondaryBackground' } }))]),
          D('gb-subhead', 'Go to Next Problem'),
          ...[['error', 'editorMarkerNavigationError', "Type 'string' is not assignable to type 'number'."],
            ['warning', 'editorMarkerNavigationWarning', "'unused' is declared but never read."],
            ['info', 'editorMarkerNavigationInfo', 'This may be converted to an async function.']].map(([icon, prefix, msg]) =>
            P('div', 'gb-marker-nav', { bdT2: `${prefix}.background`, bdB2: `${prefix}.background`, bg: 'editor.background' },
              P('div', 'gb-marker-nav-head', { bg: `${prefix}.headerBackground` }, I(icon, { fg: `problems${icon[0].toUpperCase()}${icon.slice(1)}Icon.foreground` }), ` ${msg}`))),
          D('gb-subhead', 'Problems panel'),
          P('div', 'gb-problems', { bg: 'panel.background', fg: 'foreground' },
            D('gb-problem', I('error', { fg: 'problemsErrorIcon.foreground' }), " Type 'string' is not assignable to type 'number'.", P('span', null, { fg: 'descriptionForeground' }, ' ts(2322) [Ln 20]')),
            D('gb-problem', I('warning', { fg: 'problemsWarningIcon.foreground' }), " 'unused' is declared but never read.", P('span', null, { fg: 'descriptionForeground' }, ' [Ln 21]')),
            D('gb-problem', I('info', { fg: 'problemsInfoIcon.foreground' }), ' This may be converted to an async function.', P('span', null, { fg: 'descriptionForeground' }, ' [Ln 22]'))));
      },
    },

    {
      id: 'editor-widgets',
      title: 'Suggestions and hovers',
      render: () => P('div', 'gb-surface', { bg: 'editor.background', fg: 'editor.foreground' },
        D('gb-subhead', 'Suggest widget'),
        P('div', 'gb-widget gb-suggest', { bg: 'editorSuggestWidget.background', fg: 'editorSuggestWidget.foreground', bd: 'editorSuggestWidget.border', ...widgetShadow },
          P('div', 'gb-suggest-row', { bg: 'editorSuggestWidget.selectedBackground', fg: 'editorSuggestWidget.selectedForeground' },
            I('symbol-method', { fg: 'editorSuggestWidget.selectedIconForeground' }), ' to',
            P('span', 'gb-hlmatch', { fg: 'editorSuggestWidget.focusHighlightForeground' }, 'Lo'), 'werCase', S('wb-spacer'), S('gb-suggest-detail', '(): string')),
          D('gb-suggest-row', I('symbol-method', { fg: 'symbolIcon.methodForeground' }), ' to', P('span', 'gb-hlmatch', { fg: 'editorSuggestWidget.highlightForeground' }, 'Lo'), 'caleString'),
          D('gb-suggest-row', I('symbol-variable', { fg: 'symbolIcon.variableForeground' }), ' ', P('span', 'gb-hlmatch', { fg: 'editorSuggestWidget.highlightForeground' }, 'lo'), 'calName'),
          D('gb-suggest-row', I('symbol-class', { fg: 'symbolIcon.classForeground' }), ' ', P('span', 'gb-hlmatch', { fg: 'editorSuggestWidget.highlightForeground' }, 'Lo'), 'gger'),
          P('div', 'gb-suggest-status', { fg: 'editorSuggestWidgetStatus.foreground', bdT: 'editorSuggestWidget.border' }, 'Ctrl+Space to show more')),
        D('gb-subhead', 'Hover'),
        P('div', 'gb-widget gb-hover', { bg: 'editorHoverWidget.background', fg: 'editorHoverWidget.foreground', bd: 'editorHoverWidget.border', ...widgetShadow },
          P('div', 'gb-hover-code', { bg: 'textCodeBlock.background' }, T('function', 'storage.type.function.ts'), ' ', T('greet', 'entity.name.function.ts'), '(', T('name', 'variable.parameter.ts'), ': ', T('string', 'support.type.primitive.ts'), '): ', T('void', 'support.type.primitive.ts')),
          D('gb-hover-text', 'Greets someone by name. See ', P('span', null, { fg: 'textLink.foreground' }, 'the docs'), '.'),
          P('div', 'gb-hover-status', { bg: 'editorHoverWidget.statusBarBackground', bdT: 'editorHoverWidget.border' }, P('span', null, { fg: 'textLink.foreground' }, 'View Problem'), '   ', P('span', null, { fg: 'textLink.foreground' }, 'Quick Fix...')))),
    },

    {
      id: 'find-peek',
      title: 'Find widget and peek view',
      wide: true,
      render: () => {
        const find = (inputExtra, result) => P('div', 'gb-widget gb-find', { bg: 'editorWidget.background', fg: 'editorWidget.foreground', bd: 'editorWidget.border', bdL2: 'editorWidget.resizeBorder', ...widgetShadow },
          I('chevron-right'),
          P('div', 'gb-input gb-input-options', { ...inputSpec, ...inputExtra }, 'greet', S('wb-spacer'),
            P('span', 'gb-toggle', null, I('case-sensitive')),
            P('span', 'gb-toggle', { bg: 'inputOption.activeBackground', fg: 'inputOption.activeForeground', bd: 'inputOption.activeBorder' }, I('whole-word')),
            P('span', 'gb-toggle', null, I('regex'))),
          result, I('arrow-up'), I('arrow-down'), I('close'));
        const peek = P('div', 'gb-peek', { bdT2: 'peekView.border', bdB2: 'peekView.border' },
          P('div', 'gb-peek-title', { bg: 'peekViewTitle.background' },
            P('span', null, { fg: 'peekViewTitleLabel.foreground' }, 'people.ts'),
            P('span', null, { fg: 'peekViewTitleDescription.foreground' }, '  src - 2 references'), S('wb-spacer'), I('close')),
          D('gb-peek-body',
            P('div', 'gb-peek-editor', { bg: 'peekViewEditor.background', fg: 'editor.foreground' },
              P('div', 'gb-line', null, P('span', 'gb-ln', { bg: 'peekViewEditorGutter.background', fg: 'editorLineNumber.foreground' }, '8'),
                D('gb-code', T('export', 'keyword.control.export.ts'), ' ', T('function', 'storage.type.function.ts'), ' ',
                  P('span', 'gb-mark', { bg: 'peekViewEditor.matchHighlightBackground', bd: 'peekViewEditor.matchHighlightBorder' }, T('greet', 'entity.name.function.ts')), '() {}'))),
            P('div', 'gb-peek-results', { bg: 'peekViewResult.background' },
              P('div', 'gb-peek-row', { fg: 'peekViewResult.fileForeground' }, I('chevron-down'), ' people.ts'),
              P('div', 'gb-peek-row gb-peek-indent', { bg: 'peekViewResult.selectionBackground', fg: 'peekViewResult.selectionForeground' }, 'export function ', P('span', 'gb-mark', { bg: 'peekViewResult.matchHighlightBackground' }, 'greet')),
              P('div', 'gb-peek-row gb-peek-indent', { fg: 'peekViewResult.lineForeground' }, P('span', 'gb-mark', { bg: 'peekViewResult.matchHighlightBackground' }, 'greet'), "('Ada')"))));
        return P('div', 'gb-surface', { bg: 'editor.background', fg: 'editor.foreground' },
          states(
            state('find, with matches', find({ ol: 'focusBorder' }, S('gb-find-count', '2 of 5'))),
            state('find, no results', find({ bd: 'inputValidation.errorBorder' }, P('span', 'gb-find-count', { fg: 'errorForeground' }, 'No results'))),
            state('find in a terminal or webview, resize edge', P('div', 'gb-widget gb-find', { bg: 'editorWidget.background', fg: 'editorWidget.foreground', bdL2: 'simpleFindWidget.sashBorder', ...widgetShadow },
              P('div', 'gb-input', { ...inputSpec, ol: 'focusBorder' }, 'verify'), S('gb-find-count', '1 of 3'), I('close')))),
          D('gb-subhead', 'Peek view'),
          peek);
      },
    },

    {
      id: 'diff',
      title: 'Diff editor',
      wide: true,
      render: () => {
        const side = (n, kids, lineBg, gutterBg) => line(n, kids, { spec: lineBg ? { bg: lineBg } : null, gutter: gutterBg ? { bg: gutterBg } : null });
        const original = editor(
          side(4, [T('const', 'storage.type.ts'), ' greeting = ', P('span', 'gb-mark', { bg: 'diffEditor.removedTextBackground', bd: 'diffEditor.removedTextBorder' }, T("'Hi'", 'string.quoted.single.ts')), ';'], 'diffEditor.removedLineBackground', 'diffEditorGutter.removedLineBackground'),
          side(5, [T('log', 'entity.name.function.ts'), '(greeting);']));
        const modified = editor(
          side(4, [T('const', 'storage.type.ts'), ' greeting = ', P('span', 'gb-mark', { bg: 'diffEditor.insertedTextBackground', bd: 'diffEditor.insertedTextBorder' }, T("'Hello'", 'string.quoted.single.ts')), ';'], 'diffEditor.insertedLineBackground', 'diffEditorGutter.insertedLineBackground'),
          side(5, [T('log', 'entity.name.function.ts'), '(greeting);']));
        return D(null,
          P('div', 'gb-diff', { bdT: 'diffEditor.border', bdB: 'diffEditor.border' },
            P('div', 'gb-diff-side', { bdR: 'diffEditor.border' }, original),
            D('gb-diff-side', modified)),
          P('div', 'gb-unchanged', { bg: 'diffEditor.unchangedRegionBackground', fg: 'diffEditor.unchangedRegionForeground', shadow: 'diffEditor.unchangedRegionShadow' }, I('fold'), ' 12 hidden lines'),
          D('gb-subhead', 'Lines on one side only, and unchanged code'),
          P('div', 'gb-diff', { bdT: 'diffEditor.border', bdB: 'diffEditor.border' },
            P('div', 'gb-diff-side', { bdR: 'diffEditor.border' }, P('div', 'gb-diagonal', { bg: 'diffEditor.diagonalFill' })),
            D('gb-diff-side', editor(line(9, [T('log', 'entity.name.function.ts'), '(total);'], { spec: { bg: 'diffEditor.unchangedCodeBackground' } })))));
      },
    },

    {
      id: 'title-bar',
      title: 'Title bar and window focus',
      blurb: 'VS Code dims the title bar and status bar while another window has focus.',
      render: () => {
        const bar = (spec, ccSpec, text) => P('div', 'gb-titlebar', spec,
          S('wb-menu', 'File   Edit'),
          P('div', 'wb-cc', ccSpec, I('search'), ` ${text}`), S('wb-spacer'));
        const cc = { bg: 'commandCenter.background', fg: 'commandCenter.foreground', bd: 'commandCenter.border' };
        return labeled(
          ['focused', bar({ bg: 'titleBar.activeBackground', fg: 'titleBar.activeForeground', bdB: 'titleBar.border' }, cc, 'gigglybits')],
          ['command center pressed', bar({ bg: 'titleBar.activeBackground', fg: 'titleBar.activeForeground', bdB: 'titleBar.border' },
            { ...cc, bg: 'commandCenter.activeBackground', bd: 'commandCenter.activeBorder' }, 'gigglybits')],
          ['window not focused', P('div', 'gb-window-frame', { bd: 'window.inactiveBorder' },
            bar({ bg: 'titleBar.inactiveBackground', fg: 'titleBar.inactiveForeground', bdB: 'titleBar.border' }, cc, 'gigglybits'))]);
      },
    },

    {
      id: 'menus',
      title: 'Menus',
      blurb: 'Disabled menu items are drawn at reduced opacity; there is no disabled color key.',
      render: () => D(null,
        P('div', 'gb-menubar', { bg: 'titleBar.activeBackground', fg: 'titleBar.activeForeground' },
          S('gb-menubar-item', 'File'),
          P('span', 'gb-menubar-item', { bg: 'menubar.selectionBackground', fg: 'menubar.selectionForeground', bd: 'menubar.selectionBorder' }, 'Edit'),
          S('gb-menubar-item', 'Selection')),
        P('div', 'gb-widget gb-menu', { bg: 'menu.background', fg: 'menu.foreground', bd: 'menu.border', ...widgetShadow },
          D('gb-menu-item gb-disabled', S(null, 'Undo'), S('gb-menu-key', 'Ctrl+Z')),
          P('div', 'gb-menu-sep', { bg: 'menu.separatorBackground' }),
          D('gb-menu-item', S(null, 'Cut'), S('gb-menu-key', 'Ctrl+X')),
          P('div', 'gb-menu-item', { bg: 'menu.selectionBackground', fg: 'menu.selectionForeground', bd: 'menu.selectionBorder' }, S(null, 'Copy'), S('gb-menu-key', 'Ctrl+C')),
          D('gb-menu-item', S(null, 'Paste'), S('gb-menu-key', 'Ctrl+V')))),
    },

    {
      id: 'quick-input',
      title: 'Quick input (Command Palette and pickers)',
      render: () => P('div', 'gb-widget gb-quick', { bg: 'quickInput.background', fg: 'quickInput.foreground', ...widgetShadow },
        P('div', 'gb-quick-title', { bg: 'quickInputTitle.background' }, 'Select Color Theme'),
        D('gb-quick-input', P('div', 'gb-input', { ...inputSpec, ol: 'focusBorder' }, 'dark')),
        P('div', 'gb-quick-row', { bg: 'quickInputList.focusBackground', fg: 'quickInputList.focusForeground' },
          I('color-mode', { fg: 'quickInputList.focusIconForeground' }), ' ', P('span', 'gb-hlmatch', { fg: 'list.focusHighlightForeground' }, 'Dark'), ' Modern',
          S('wb-spacer'), P('span', null, { fg: 'pickerGroup.foreground' }, 'dark themes')),
        D('gb-quick-row', I('color-mode'), ' ', P('span', 'gb-hlmatch', { fg: 'list.highlightForeground' }, 'Dark'), '+', P('span', 'gb-quick-desc', { fg: 'descriptionForeground' }, '  default')),
        P('div', 'gb-quick-row', { bdT: 'pickerGroup.border' }, I('color-mode'), ' Light Modern',
          S('wb-spacer'), P('span', null, { fg: 'pickerGroup.foreground' }, 'light themes')),
        D('gb-quick-row', I('settings-gear'), ' Preferences: Open Settings', S('wb-spacer'),
          P('span', 'gb-key', { bg: 'keybindingLabel.background', fg: 'keybindingLabel.foreground', bd: 'keybindingLabel.border', bdB: 'keybindingLabel.bottomBorder' }, 'Ctrl'), '+',
          P('span', 'gb-key', { bg: 'keybindingLabel.background', fg: 'keybindingLabel.foreground', bd: 'keybindingLabel.border', bdB: 'keybindingLabel.bottomBorder' }, ','))),
    },

    {
      id: 'notifications',
      title: 'Notifications and banner',
      render: () => {
        const toast = (icon, iconKey, text) => P('div', 'gb-widget gb-toast', { bg: 'notifications.background', fg: 'notifications.foreground', bd: 'notificationToast.border', ...widgetShadow },
          D('gb-toast-msg', I(icon, { fg: iconKey }), ' ', text, P('span', null, { fg: 'notificationLink.foreground' }, 'Show log')),
          D('gb-toast-actions', button('Retry', primary), button('Dismiss', secondary)));
        return P('div', 'gb-surface', { bg: 'editor.background', fg: 'editor.foreground' },
          toast('error', 'notificationsErrorIcon.foreground', 'Build failed. '),
          toast('warning', 'notificationsWarningIcon.foreground', 'Two settings conflict. '),
          toast('info', 'notificationsInfoIcon.foreground', 'Update installed. '),
          D('gb-subhead', 'Notification center'),
          P('div', 'gb-widget gb-center', { bg: 'notifications.background', fg: 'notifications.foreground', bd: 'notificationCenter.border', ...widgetShadow },
            P('div', 'gb-center-head', { bg: 'notificationCenterHeader.background', fg: 'notificationCenterHeader.foreground' }, 'NOTIFICATIONS'),
            D('gb-toast-msg', I('info', { fg: 'notificationsInfoIcon.foreground' }), ' Update installed.'),
            P('div', 'gb-toast-msg', { bdT: 'notifications.border' }, I('warning', { fg: 'notificationsWarningIcon.foreground' }), ' Two settings conflict.')),
          D('gb-subhead', 'Banner'),
          P('div', 'gb-banner', { bg: 'banner.background', fg: 'banner.foreground' }, I('shield', { fg: 'banner.iconForeground' }), ' Restricted Mode is intended for safe code browsing.'));
      },
    },

    {
      id: 'panel',
      title: 'Panel',
      render: () => P('div', 'gb-panel', { bg: 'panel.background', fg: 'foreground', bdT: 'panel.border' },
        P('div', 'wb-panel-tabs', { bdB: 'panelTitle.border' },
          P('span', 'gb-ptab', { fg: 'panelTitle.activeForeground', bdB: 'panelTitle.activeBorder' }, 'Problems ',
            P('span', 'gb-badge', { bg: 'panelTitleBadge.background', fg: 'panelTitleBadge.foreground' }, '3')),
          P('span', 'gb-ptab', { fg: 'panelTitle.inactiveForeground' }, 'Output'),
          P('span', 'gb-ptab', { fg: 'panelTitle.inactiveForeground' }, 'Terminal'),
          S('wb-spacer'),
          P('div', 'gb-input gb-panel-filter', { ...inputSpec, bd: 'panelInput.border' }, P('span', null, { fg: 'input.placeholderForeground' }, 'Filter'))),
        P('div', 'gb-panel-section', { bg: 'panelSectionHeader.background', fg: 'panelSectionHeader.foreground', bdT: 'panelSectionHeader.border' }, I('chevron-down'), ' TEST RESULTS'),
        P('div', 'gb-panel-body', { bdT: 'panelSection.border' }, '15 tests passed'),
        P('div', 'gb-sticky', { bg: 'panelStickyScroll.background', bdB: 'panelStickyScroll.border', shadow: 'panelStickyScroll.shadow' },
          I('chevron-down'), ' src/shared.ts (sticky while scrolling)')),
    },

    {
      id: 'status',
      title: 'Status bar',
      wide: true,
      render: () => {
        const bar = (spec, ...items) => P('div', 'gb-statusbar', spec, ...items);
        const normal = { bg: 'statusBar.background', fg: 'statusBar.foreground', bdT: 'statusBar.border' };
        return labeled(
          ['normal', bar(normal,
            P('span', 'gb-sitem wb-remote', { bg: 'statusBarItem.remoteBackground', fg: 'statusBarItem.remoteForeground' }, I('remote'), ' WSL'),
            S('gb-sitem', I('git-branch'), ' main'), S('gb-sitem', I('sync')), S('wb-spacer'), S('gb-sitem', 'Ln 4, Col 12'), S('gb-sitem', 'UTF-8'))],
          ['item states: hover, pressed, focused, prominent', bar(normal,
            P('span', 'gb-sitem', { bg: 'statusBarItem.hoverBackground', fg: 'statusBarItem.hoverForeground' }, 'hover'),
            P('span', 'gb-sitem', { bg: 'statusBarItem.activeBackground' }, 'pressed'),
            P('span', 'gb-sitem', { ol: 'statusBarItem.focusBorder' }, 'focused'),
            P('span', 'gb-sitem', { bg: 'statusBarItem.prominentBackground', fg: 'statusBarItem.prominentForeground' }, 'prominent'),
            P('span', 'gb-sitem', { bg: 'statusBarItem.prominentHoverBackground', fg: 'statusBarItem.prominentHoverForeground' }, 'prominent hover'))],
          ['error and warning items', bar(normal,
            P('span', 'gb-sitem', { bg: 'statusBarItem.errorBackground', fg: 'statusBarItem.errorForeground' }, I('error'), ' Build failed'),
            P('span', 'gb-sitem', { bg: 'statusBarItem.warningBackground', fg: 'statusBarItem.warningForeground' }, I('warning'), ' Linting slow'),
            P('span', 'gb-sitem wb-remote', { bg: 'statusBarItem.offlineBackground', fg: 'statusBarItem.offlineForeground' }, I('debug-disconnect'), ' Offline'))],
          ['hovered: remote, offline, an item with two hovers', bar(normal,
            P('span', 'gb-sitem wb-remote', { bg: 'statusBarItem.remoteHoverBackground', fg: 'statusBarItem.remoteForeground' }, I('remote'), ' WSL'),
            P('span', 'gb-sitem', { bg: 'statusBarItem.offlineHoverBackground', fg: 'statusBarItem.offlineForeground' }, I('debug-disconnect'), ' Offline'),
            P('span', 'gb-sitem', { bg: 'statusBarItem.compactHoverBackground' }, I('bell'), ' 2'))],
          ['keyboard focus on the bar', bar({ ...normal, ol: 'statusBar.focusBorder' }, S('gb-sitem', I('git-branch'), ' main'), S('wb-spacer'), S('gb-sitem', 'UTF-8'))],
          ['window not focused', bar({ bg: 'statusBar.inactiveBackground', fg: 'statusBar.foreground', bdT: 'statusBar.border' }, S('gb-sitem', I('git-branch'), ' main'), S('wb-spacer'), S('gb-sitem', 'UTF-8'))],
          ['no folder open', bar({ bg: 'statusBar.noFolderBackground', fg: 'statusBar.noFolderForeground', bdT: 'statusBar.noFolderBorder' }, S('gb-sitem', I('bell')), S('wb-spacer'), S('gb-sitem', 'Plain Text'))],
          ['debugging', bar({ bg: 'statusBar.debuggingBackground', fg: 'statusBar.debuggingForeground', bdT: 'statusBar.debuggingBorder' }, S('gb-sitem', I('debug-alt'), ' Run Extension'), S('wb-spacer'), S('gb-sitem', 'Ln 4, Col 12'))]);
      },
    },

    {
      id: 'terminal',
      title: 'Terminal',
      wide: true,
      render: () => {
        const cell = (name) => P('span', 'gb-ansi', { fg: `terminal.ansi${name}` }, I('circle-large-filled'), ` ${name.replace('Bright', 'bright ').toLowerCase()}`);
        return P('div', 'gb-terminal', { bg: 'terminal.background', fg: 'terminal.foreground', bd: 'terminal.border' },
          D('gb-ansi-grid', ...ANSI.map(cell), ...ANSI.map(n => cell(`Bright${n}`))),
          D('gb-term-line', '$ npm test'),
          D('gb-term-line', P('span', 'gb-term-badge', { bg: 'terminal.ansiGreen', fg: 'terminal.ansiBlack' }, ' PASS '), ' test/shared.test.ts'),
          D('gb-term-line', P('span', 'gb-term-badge', { bg: 'terminal.ansiRed', fg: 'terminal.ansiBrightWhite' }, ' FAIL '), ' test/gallery.test.ts'),
          D('gb-term-line', 'selected: ', P('span', null, { bg: 'terminal.selectionBackground', fg: 'terminal.selectionForeground' }, 'npm run verify'),
            '   unfocused: ', P('span', null, { bg: 'terminal.inactiveSelectionBackground' }, 'npm run verify'),
            '   find: ', P('span', null, { bg: 'terminal.findMatchBackground', bd: 'terminal.findMatchBorder' }, 'verify')),
          D('gb-term-line', '$ ', P('span', 'gb-term-cursor', { bg: 'terminalCursor.foreground', fg: 'terminalCursor.background' }, 'n')),
          D('gb-term-line', 'other matches: ', P('span', null, { bg: 'terminal.findMatchHighlightBackground', bd: 'terminal.findMatchHighlightBorder' }, 'verify'),
            '   hover: ', P('span', null, { bg: 'terminal.hoverHighlightBackground' }, 'https://localhost:3000')),
          D('gb-term-line', P('span', null, { fg: 'terminal.initialHintForeground' }, 'Press Ctrl+I to ask for a command')),
          D('gb-term-tabs',
            P('div', 'gb-term-tab', { bdL2: 'terminal.tab.activeBorder' }, I('terminal'), ' pwsh'),
            D('gb-term-tab', I('terminal'), ' node'),
            P('div', 'gb-term-tab gb-term-drop', { bg: 'terminal.dropBackground' }, 'drop here to split')));
      },
    },

    {
      id: 'text',
      title: 'Text, links and code',
      render: () => P('div', 'gb-surface', { bg: 'editor.background', fg: 'foreground' },
        labeled(
          ['foreground', P('span', null, { fg: 'foreground' }, 'Default text in the workbench')],
          ['strong', P('span', null, { fg: 'strongForeground' }, 'Text and icons drawn for the most contrast')],
          ['description', P('span', null, { fg: 'descriptionForeground' }, 'Secondary text such as setting descriptions')],
          ['error', P('span', null, { fg: 'errorForeground' }, 'Something went wrong')],
          ['disabled', P('span', null, { fg: 'disabledForeground' }, 'Not available here')],
          ['icon', I('gear', { fg: 'icon.foreground' })],
          ['link, active link', D(null, P('span', null, { fg: 'textLink.foreground' }, 'Open settings'), '   ', P('span', null, { fg: 'textLink.activeForeground' }, 'Open settings'))],
          ['inline code', P('span', 'gb-preformat', { fg: 'textPreformat.foreground', bg: 'textPreformat.background' }, 'editor.fontSize')],
          ['code block', P('div', 'gb-codeblock', { bg: 'textCodeBlock.background' }, 'npm run verify')],
          ['block quote', P('div', 'gb-quote', { bg: 'textBlockQuote.background', bdL4: 'textBlockQuote.border' }, 'Quoted text in Markdown previews and release notes.')],
          ['separator', P('div', 'gb-separator', { bdT: 'textSeparator.foreground' })])),
    },

    {
      id: 'borders',
      title: 'Focus, borders, shadows and scrollbars',
      blurb: 'The contrast border keys are usually set only by high contrast themes.',
      render: () => P('div', 'gb-surface', { bg: 'editor.background', fg: 'foreground' },
        states(
          state('focus ring', P('div', 'gb-demo-box', { ol: 'focusBorder' }, 'focused')),
          state('contrast border', P('div', 'gb-demo-box', { bd: 'contrastBorder' }, 'element')),
          state('contrast active border', P('div', 'gb-demo-box', { olDash: 'contrastActiveBorder' }, 'active')),
          state('widget border', P('div', 'gb-demo-box', { bd: 'widget.border', bg: 'editorWidget.background' }, 'widget')),
          state('widget shadow', P('div', 'gb-demo-box', { shadow: 'widget.shadow', bg: 'editorWidget.background' }, 'widget'))),
        states(
          state('text selection', P('span', 'gb-demo-box', null, 'select ', P('span', null, { bg: 'selection.background' }, 'this text'))),
          state('sash hover', D('gb-sash-demo', P('span', 'gb-sash', { bg: 'sash.hoverBorder' }))),
          state('scrollbar: normal, hover, dragging', P('div', 'gb-scroll-demo', { shadow: 'scrollbar.shadow', bg: 'scrollbar.background' },
            P('span', 'gb-slider', { bg: 'scrollbarSlider.background' }),
            P('span', 'gb-slider', { bg: 'scrollbarSlider.hoverBackground' }),
            P('span', 'gb-slider', { bg: 'scrollbarSlider.activeBackground' }))))),
    },
  ];

  // ------------------------------------------------------------------ analysis

  /** Keys used by a preview, in order, and the contrast of every text color it draws. */
  function analyze(preview) {
    const byKey = ctx.model.byKey;
    const keys = [];
    const seen = new Set();
    for (const el of preview.querySelectorAll('[data-keys]')) {
      for (const k of el.getAttribute('data-keys').split(' ')) {
        if (!seen.has(k)) {
          seen.add(k);
          keys.push(k);
        }
      }
    }

    const editorBg = byKey.get('editor.background');
    const base = editorBg ? editorBg.rgba : { r: 30, g: 30, b: 30, a: 1 };
    const pairs = new Map();
    for (const el of preview.querySelectorAll('[data-fg]')) {
      if (el.closest('.gb-disabled')) continue;
      const fgKey = el.getAttribute('data-fg');
      const fg = byKey.get(fgKey);
      if (!fg) continue;
      const chain = [];
      for (let n = el; n && n !== preview.parentElement; n = n.parentElement) {
        const b = n.getAttribute('data-bg');
        if (b && byKey.has(b)) chain.push(b);
      }
      let bg = base;
      for (let i = chain.length - 1; i >= 0; i--) {
        const c = byKey.get(chain[i]).rgba;
        bg = c.a < 1 ? over(c, bg) : c;
      }
      const bgKey = chain[0] || 'editor.background';
      const ratio = contrastRatio(over(fg.rgba, bg), bg);
      const id = `${fgKey}|${bgKey}`;
      if (!pairs.has(id)) pairs.set(id, { fg: fgKey, bg: bgKey, ratio });
    }
    const list = [...pairs.values()];
    const worst = list.reduce((a, p) => (!a || p.ratio < a.ratio ? p : a), null);
    return { keys, pairs: list, worst };
  }

  // --------------------------------------------------------------- card chrome

  /** Swatch background: the color laid over editor.background, so translucency reads as a tint. */
  const swatchBg = prop => `linear-gradient(var(${prop}), var(${prop})), var(${varFor('editor.background')})`;

  function contributorOf(key) {
    const c = ctx.snapshot && ctx.snapshot.contributions ? ctx.snapshot.contributions[key] : undefined;
    return c ? { label: c.builtIn ? `${c.extensionName} (built in)` : c.extensionName, title: `${c.extensionId}${c.description ? `\n${c.description}` : ''}` } : { label: 'VS Code', title: 'Registered by VS Code itself' };
  }

  function chip(key) {
    const entry = ctx.model.byKey.get(key);
    const dot = h('span', { class: 'gb-dot' });
    if (entry) dot.style.background = swatchBg(entry.prop);
    const snippet = `"${key}": "${entry ? entry.hex : ''}"`;
    return h('button', {
      type: 'button',
      class: `gb-chip${entry ? ` src-${entry.source}` : ' unset'}`,
      'data-key': key,
      title: entry ? `${entry.hex}, ${entry.source === 'default' ? 'VS Code default' : entry.source === 'user' ? 'user override' : 'theme'}. Click to copy ${snippet}` : 'Unset: VS Code draws nothing for this key in the current theme. Click to copy the key.',
      onclick: () => ctx.copy(entry ? snippet : `"${key}": ""`),
    }, dot, key);
  }

  function definitions(def, info) {
    const worstFor = key => info.pairs.filter(p => p.fg === key).reduce((a, p) => (!a || p.ratio < a.ratio ? p : a), null);
    const rows = info.keys.map(key => {
      const e = ctx.model.byKey.get(key);
      const who = contributorOf(key);
      const pair = worstFor(key);
      const sw = h('span', { class: 'gb-dot gb-dot-lg' });
      if (e) sw.style.background = swatchBg(e.prop);
      return h('tr', { onclick: () => ctx.copy(`"${key}": "${e ? e.hex : ''}"`), title: 'Click to copy' },
        h('td', { class: 'mono' }, key),
        h('td', { class: 'mono' }, sw, ' ', e ? e.hex : h('span', { class: 'muted' }, 'unset')),
        h('td', null, e ? ctx.sourceBadge(e.source, e.origin) : ''),
        h('td', { title: who.title }, who.label),
        h('td', null, pair ? ctx.contrastBadge(pair.ratio, pair.bg) : ''));
    });
    const details = h('details', { class: 'gb-defs' },
      h('summary', null, `Definitions (${info.keys.length} keys)`),
      h('table', { class: 'rules' },
        h('thead', null, h('tr', null, h('th', null, 'Key'), h('th', null, 'Value'), h('th', null, 'Source'), h('th', null, 'Contributor'), h('th', null, 'Contrast'))),
        h('tbody', null, rows)));
    ctx.trackOpen(details, `defs:${def.id}`, false);
    return details;
  }

  /** Hovering a chip outlines the parts that use the key; hovering a part lights its chips. */
  function wireLinking(cardEl, preview) {
    const clear = () => cardEl.querySelectorAll('.gb-hl').forEach(el => el.classList.remove('gb-hl'));
    const showKey = key => {
      clear();
      cardEl.querySelectorAll(`.gb-chip[data-key="${CSS.escape(key)}"]`).forEach(el => el.classList.add('gb-hl'));
      preview.querySelectorAll('[data-keys]').forEach(el => {
        if (el.getAttribute('data-keys').split(' ').includes(key)) el.classList.add('gb-hl');
      });
    };
    const showPart = part => {
      clear();
      part.classList.add('gb-hl');
      for (const key of part.getAttribute('data-keys').split(' ')) {
        cardEl.querySelectorAll(`.gb-chip[data-key="${CSS.escape(key)}"]`).forEach(el => el.classList.add('gb-hl'));
      }
    };
    cardEl.addEventListener('mouseover', ev => {
      const t = /** @type {Element} */ (ev.target);
      const c = t.closest('.gb-chip');
      if (c) return showKey(c.getAttribute('data-key'));
      const part = t.closest('[data-keys]');
      if (part && preview.contains(part)) return showPart(part);
      clear();
    });
    cardEl.addEventListener('mouseleave', clear);
    cardEl.addEventListener('focusin', ev => {
      const c = /** @type {Element} */ (ev.target).closest('.gb-chip');
      if (c) showKey(c.getAttribute('data-key'));
    });
    cardEl.addEventListener('focusout', clear);
  }

  /** Cards whose drawing is shrunk to the card's width rather than scrolled sideways. */
  const FIT_TO_WIDTH = new Set(['workbench']);

  /**
   * Shrinks `preview` to fit `box`'s width, as the Theme Lab fits its Workbench drawing, so a
   * whole window shows at once. Never enlarges, and never below 45%.
   */
  function fitToWidth(box, preview) {
    if (typeof ResizeObserver === 'undefined') return;
    box.classList.add('gb-preview-fit');
    // Zooming changes the box's height, which notifies the observer again; only a change of
    // width refits, and the refit runs on the next frame, outside the observer's callback.
    let width = -1;
    let frame = 0;
    const fit = () => {
      frame = 0;
      preview.style.zoom = '';
      const have = box.clientWidth;
      const need = preview.scrollWidth;
      if (have > 0 && need > have) preview.style.zoom = String(Math.max(0.45, have / need));
    };
    new ResizeObserver(entries => {
      const w = Math.round(entries[entries.length - 1].contentRect.width);
      if (w === width) return;
      width = w;
      if (!frame) frame = requestAnimationFrame(fit);
    }).observe(box);
  }

  function card(def, preview, info) {
    const unset = info.keys.filter(k => !ctx.model.byKey.has(k)).length;
    const previewBox = h('div', { class: 'gb-preview', role: 'img', 'aria-label': `${def.title} preview. The definitions table lists the same keys.` }, preview);
    if (FIT_TO_WIDTH.has(def.id)) fitToWidth(previewBox, preview);
    const el = h('section', { class: `gb-card${def.wide ? ' wide' : ''}` },
      h('header', { class: 'gb-card-head' },
        h('h3', null, def.title),
        info.worst ? h('span', { class: 'gb-worst', title: `Lowest contrast: ${info.worst.fg} on ${info.worst.bg}` }, 'lowest ', ctx.contrastBadge(info.worst.ratio, info.worst.bg)) : null),
      def.blurb ? h('p', { class: 'muted gb-blurb' }, def.blurb) : null,
      previewBox,
      h('div', { class: 'gb-chips' }, info.keys.map(chip), unset ? h('span', { class: 'muted gb-unset-note' }, `${unset} unset`) : null),
      definitions(def, info));
    wireLinking(el, previewBox);
    return el;
  }

  function visible(def, info) {
    const ui = ctx.ui;
    const q = ui.filter.trim().toLowerCase();
    if (q && !def.title.toLowerCase().includes(q) && !info.keys.some(k => k.toLowerCase().includes(q))) return false;
    if (ui.source !== 'all' && !info.keys.some(k => { const e = ctx.model.byKey.get(k); return e && e.source === ui.source; })) return false;
    if (ui.lowContrast && !(info.worst && info.worst.ratio < 4.5)) return false;
    return true;
  }

  // ------------------------------------------------------------------- public

  /** The context's workbench settings, { modern, uppercase, tabStyle, activityBar }, or null when absent. */
  const modernOf = context => (context && context.modernUI && typeof context.modernUI === 'object' ? context.modernUI : null);

  /**
   * Headers and panel tabs are written in mixed case; VS Code draws them in capitals under the
   * classic UI (no settings, or modern off) and when the uppercase setting is on.
   */
  function markCasing(preview) {
    const m = modernOf(ctx);
    if (!m || !m.modern || m.uppercase) preview.classList.add('gb-upper');
    return preview;
  }

  /** Renders the gallery grid. Returns the node and how many cards passed the filters. */
  function render(context) {
    ctx = context;
    const cards = [];
    for (const def of CATALOG) {
      let preview;
      try {
        preview = def.render();
      } catch (err) {
        preview = h('p', { class: 'warn' }, `Could not draw ${def.title}: ${err && err.message}`);
      }
      markCasing(preview);
      const info = analyze(preview);
      if (visible(def, info)) cards.push(card(def, preview, info));
    }
    ctx = null;
    return { node: h('div', { class: 'gb-grid' }, cards), shown: cards.length, total: CATALOG.length };
  }

  /**
   * The previews alone, without the cards' chips and definitions, for the Theme Preview window.
   * context needs only { model: { byKey }, tokens }, plus modernUI ({ modern, uppercase,
   * tabStyle, activityBar }) to draw the modern workbench or move the activity bar; without it
   * the drawing is the classic one with the activity bar at the side. ids
   * picks cards in catalog order (all when omitted). Each result carries the card's id, title,
   * blurb and analyze() info.
   */
  function renderParts(context, ids) {
    ctx = context;
    const out = [];
    for (const def of CATALOG) {
      if (ids && !ids.includes(def.id)) continue;
      let preview;
      try {
        preview = def.render();
      } catch (err) {
        preview = h('p', { class: 'warn' }, `Could not draw ${def.title}: ${err && err.message}`);
      }
      markCasing(preview);
      out.push({ id: def.id, title: def.title, blurb: def.blurb || '', wide: Boolean(def.wide), preview, info: analyze(preview) });
    }
    ctx = null;
    return out;
  }

  /** Color keys registered by extensions, grouped by extension. */
  function renderContributions(context) {
    ctx = context;
    const ui = ctx.ui;
    const q = ui.filter.trim().toLowerCase();
    const byExt = new Map();
    for (const [key, c] of Object.entries((ctx.snapshot && ctx.snapshot.contributions) || {})) {
      const e = ctx.model.byKey.get(key);
      if (q && ![key, c.description, c.extensionName].some(f => f && f.toLowerCase().includes(q))) continue;
      if (ui.source !== 'all' && !(e && e.source === ui.source)) continue;
      if (!byExt.has(c.extensionId)) byExt.set(c.extensionId, { c, rows: [] });
      byExt.get(c.extensionId).rows.push([key, c, e]);
    }
    const groups = [...byExt.values()].sort((a, b) => Number(a.c.builtIn) - Number(b.c.builtIn) || a.c.extensionName.localeCompare(b.c.extensionName));
    let count = 0;
    const nodes = groups.map(({ c, rows }) => {
      count += rows.length;
      return h('div', { class: 'gb-contrib' },
        h('h4', null, c.extensionName, h('span', { class: 'muted' }, `  ${c.extensionId}${c.builtIn ? ', built in' : ''}`)),
        h('table', { class: 'rules' }, h('tbody', null, rows.map(([key, info, e]) => {
          const sw = h('span', { class: 'gb-dot gb-dot-lg' });
          if (e) sw.style.background = swatchBg(e.prop);
          return h('tr', { onclick: () => ctx.copy(`"${key}": "${e ? e.hex : ''}"`), title: 'Click to copy' },
            h('td', null, sw),
            h('td', { class: 'mono' }, key),
            h('td', { class: 'mono' }, e ? e.hex : h('span', { class: 'muted' }, 'unset')),
            h('td', null, e ? ctx.sourceBadge(e.source, e.origin) : ''),
            h('td', { class: 'muted' }, info.description || ''));
        }))));
    });
    ctx = null;
    return { nodes, count, extensions: groups.length };
  }

  // @ts-ignore attach for palette.js and the tests
  window.GBGallery = {
    render, renderContributions, renderParts,
    cards: CATALOG.map(def => ({ id: def.id, title: def.title })),
    catalogSize: CATALOG.length,
  };
})();
