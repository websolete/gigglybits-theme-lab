// @ts-check
// Turns one palette entry into a complete GigglyBits Dark color theme.
// Loads as window.GBBuilder in the Theme Lab webview (after shared.js) and as a CommonJS
// module in Node, where scripts/theme-builder.js re-exports it for the build script and the
// extension host. One builder means the Lab previews exactly what Try in VS Code applies.
//
// The theme owns the workbench colors the Palette Inspector's element gallery draws
// (and no others, so it never sets a key a third-party extension registers). Syntax is
// a baseline only: a few language-neutral root-scope rules and no semantic token rules,
// so coloring a specialized extension supplies is never fought by the theme.
//
// Every key starts in one swatch (a role, such as "accent" or "raised surface"). A style group
// can move a family's keys (tabs, lists and trees, buttons, editor text) to other Editor roles.
// The Lab's edits change a role, which moves every key in it and the roles made from it, or
// one key, and a key edit wins over a group.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    module.exports = factory(require('./shared.js'));
  } else {
    // @ts-ignore
    root.GBBuilder = factory(root.GB);
  }
})(typeof self !== 'undefined' ? self : this, function (GB) {
  const THEME_BACKGROUND = '#1e1e1e';
  const ROLE_NAMES = ['keyword', 'function', 'string', 'type', 'number'];
  const MIN_CONTRAST = 4.5;
  const MIN_DISTANCE = 0.05;
  const MAX_LIGHTNESS = 0.95;

  /** Language-neutral root scopes; every tokenColors selector is one of these. */
  const GENERIC_SCOPES = [
    'keyword', 'storage.type', 'storage.modifier',
    'entity.name.function', 'support.function',
    'string',
    'entity.name.type', 'entity.name.class', 'support.type', 'support.class',
    'constant.numeric', 'constant.language',
    'comment',
  ];

  /** Gallery keys the theme leaves unset on purpose, each with the reason. */
  const UNSET_KEYS = {
    contrastBorder: 'High-contrast border. Setting it in a dark theme draws an extra border around nearly every part of the workbench.',
    contrastActiveBorder: 'High-contrast border for the active element. Setting it draws an extra border around every focused or active part.',
    'editor.selectionForeground': 'Recolors selected text, replacing the syntax colors (including an extension\'s) while text is selected. VS Code leaves it unset outside high contrast.',
    'editor.findMatchForeground': 'Recolors the text of the current find match, replacing its syntax colors. VS Code leaves it unset.',
    'editor.findMatchHighlightForeground': 'Recolors the text of the other find matches, replacing their syntax colors. VS Code leaves it unset.',
    'terminal.selectionForeground': 'Recolors selected terminal text, replacing the colors the program printed. VS Code leaves it unset.',
  };

  /**
   * Colors VS Code registers that the theme leaves to VS Code's own defaults, by group, each with
   * the reason. The theme sets the main chrome and what you look at every day; these are the rest.
   * A group covers its keys and every id under its prefixes ('chat.' takes chat.x, not chatX),
   * except the ids the theme sets anyway. test/themeCoverage.test.ts checks that every color in
   * test/fixtures/vscode-colors.json is in exactly one of KEY_GROUPS, UNSET_KEYS and this list.
   */
  const notDaily = 'Not part of the main chrome or what you see every day, so VS Code\'s default stays.';
  const LEFT_TO_VSCODE = [
    {
      area: 'Debugging', reason: 'Seen only while debugging; VS Code\'s defaults read on any dark theme.',
      keys: ['editor.stackFrameHighlightBackground', 'editor.focusedStackFrameHighlightBackground', 'editor.inlineValuesForeground',
        'editor.inlineValuesBackground', 'commandCenter.debuggingBackground', 'debugConsoleInputIcon.foreground'],
      prefixes: ['debugIcon', 'debugToolBar', 'debugTokenExpression', 'debugView', 'debugConsole', 'debugExceptionWidget'], except: [],
    },
    { area: 'Testing', reason: 'Test Explorer states use VS Code\'s fixed status colors.', keys: [], prefixes: ['testing'], except: [] },
    {
      area: 'Notebooks', reason: 'Notebooks are not drawn in the preview.', keys: [],
      prefixes: ['notebook', 'interactive', 'notebookEditorOverviewRuler', 'notebookScrollbarSlider', 'notebookStatusErrorIcon', 'notebookStatusRunningIcon', 'notebookStatusSuccessIcon'],
      except: [],
    },
    { area: 'Onboarding', reason: 'Welcome and walkthrough pages.', keys: [], prefixes: ['welcomePage', 'walkThrough', 'walkthrough'], except: [] },
    {
      area: 'Extensions view', reason: 'The Extensions view keeps VS Code\'s look.', keys: [], prefixes: ['extensionButton', 'extensionIcon', 'extensionBadge'],
      except: ['extensionButton.background', 'extensionButton.foreground', 'extensionButton.hoverBackground'],
    },
    { area: 'Settings editor', reason: 'The Settings editor.', keys: [], prefixes: ['settings'], except: ['settings.headerForeground', 'settings.modifiedItemIndicator'] },
    { area: 'Keyboard Shortcuts and Profiles editors', reason: 'Editors opened rarely.', keys: ['profiles.sashBorder'], prefixes: ['keybindingTable'], except: [] },
    { area: 'Source control graph', reason: 'Graph lane colors are a fixed set.', keys: [], prefixes: ['scmGraph'], except: [] },
    {
      area: 'Agent sessions', reason: 'Agent session views and the agent sessions window change often between releases.',
      keys: ['editorOverviewRuler.agentFeedbackForeground'],
      prefixes: ['agentFeedbackEditorWidget', 'agentFeedbackInputWidget', 'agentSessionReadIndicator', 'agentSessionSelectedBadge',
        'agentSessionSelectedUnfocusedBadge', 'agents', 'agentsPanel', 'agentsWindowGraphic', 'activeSessionView', 'inactiveSessionView',
        'agentStatusIndicator', 'agentsBadge', 'agentsBottomPanel', 'agentsCard', 'agentsChatInput', 'agentsDetail', 'agentsGradient',
        'agentsNewSessionButton', 'agentsUnreadBadge', 'agentsUpdateButton', 'agentsVoice', 'agentsMobileDiff'],
      except: [],
    },
    { area: 'Charts', reason: 'Chart palettes are fixed hues.', keys: [], prefixes: ['charts', 'chart'], except: [] },
    { area: 'Profile badge', reason: 'The profile badge keeps VS Code\'s look.', keys: [], prefixes: ['profileBadge'], except: [] },
    {
      area: 'Review comments', reason: 'Review comments.',
      keys: ['editorGutter.commentGlyphForeground', 'editorGutter.commentRangeForeground', 'editorGutter.commentDraftGlyphForeground', 'editorGutter.commentUnresolvedGlyphForeground'],
      prefixes: ['commentsView', 'editorCommentsWidget'], except: [],
    },
    { area: 'Extension gutter decorations', reason: 'Gutter items extensions draw.', keys: ['editorGutter.itemBackground', 'editorGutter.itemGlyphForeground'], prefixes: [], except: [] },
    {
      area: 'Rarely seen surfaces', reason: 'Rarely seen; their defaults derive from colors the theme sets.',
      keys: ['browser.border', 'git.blame.editorDecorationForeground', 'ports.iconRunningProcessForeground', 'outputViewStickyScroll.background'],
      prefixes: ['mcpIcon', 'markdown', 'markdownAlert', 'textPreformat', 'outputView', 'searchEditor', 'multiDiffEditor'],
      except: ['textPreformat.background', 'textPreformat.foreground'],
    },
    { area: 'Celebrations', reason: 'Confetti colors are a fixed set.', keys: [], prefixes: ['confetti'], except: [] },
    { area: 'Input-method composition', reason: 'Seen only while composing text with an input method.', keys: ['editor.compositionBorder'], prefixes: [], except: [] },
    {
      area: 'Opacity values', reason: 'Defaults are black with an alpha (#000a, #000f), not colors a role could supply.',
      keys: ['editorUnnecessaryCode.opacity', 'minimap.foregroundOpacity'], prefixes: [], except: [],
    },
    {
      area: 'Modern UI', reason: 'Modern UI colors VS Code derives, modeled where the preview draws them (media/shared.js MODERN_UI_RULES).', keys: [],
      prefixes: ['surface', 'modernUI', 'modernPanel', 'modernTab', 'modernEditorTab', 'modernActivityBar', 'modernActivityBarItem', 'modernSash'], except: [],
    },
    {
      area: 'Optional editor guides', reason: 'Shown only when bracket pair guides or indent guide colorization are turned on.',
      keys: ['editorIndentGuide.background2', 'editorIndentGuide.background3', 'editorIndentGuide.background4', 'editorIndentGuide.background5',
        'editorIndentGuide.background6', 'editorIndentGuide.activeBackground2', 'editorIndentGuide.activeBackground3', 'editorIndentGuide.activeBackground4',
        'editorIndentGuide.activeBackground5', 'editorIndentGuide.activeBackground6'],
      prefixes: ['editorBracketPairGuide'], except: [],
    },
    {
      area: 'Older names', reason: 'Older names of colors the theme sets under their current names, or a color VS Code leaves unset so bracket colors show.',
      keys: ['editorIndentGuide.background', 'editorIndentGuide.activeBackground', 'quickInput.list.focusBackground', 'editorActiveLineNumber.foreground',
        'editorBracketMatch.foreground'],
      prefixes: [], except: [],
    },
    {
      area: 'Editor extras', reason: notDaily,
      keys: ['editor.placeholder.foreground', 'editor.wordHighlightTextBackground', 'editor.wordHighlightTextBorder',
        'editorBracketHighlight.foreground4', 'editorBracketHighlight.foreground5', 'editorBracketHighlight.foreground6',
        'editorInlayHint.parameterBackground', 'editorInlayHint.parameterForeground', 'editorInlayHint.typeBackground', 'editorInlayHint.typeForeground',
        'editorMultiCursor.primary.background', 'editorMultiCursor.primary.foreground', 'editorMultiCursor.secondary.background',
        'editorMultiCursor.secondary.foreground', 'editorStickyScroll.background', 'editorStickyScroll.shadow', 'editorStickyScrollGutter.background',
        'editorUnicodeHighlight.background', 'editorUnicodeHighlight.border', 'editorWordWrapIndicator.foreground', 'editorGutter.background',
        'editorGutter.foldingControlForeground', 'editorHoverWidget.highlightForeground', 'editorSuggestWidget.focusOutline',
        'editorActionList.background', 'editorActionList.focusBackground', 'editorActionList.focusForeground', 'editorActionList.foreground',
        'editorMarkerNavigation.background', 'editorPane.background', 'minimap.selectionHighlight', 'minimap.selectionOccurrenceHighlight',
        'minimapGutter.addedBackground', 'minimapGutter.deletedBackground', 'minimapGutter.modifiedBackground', 'diffEditor.move.border',
        'diffEditor.moveActive.border', 'diffEditorOverview.insertedForeground', 'diffEditorOverview.removedForeground',
        'peekViewEditorStickyScroll.background', 'peekViewEditorStickyScrollGutter.background'],
      prefixes: [], except: [],
    },
    {
      area: 'Workbench extras', reason: notDaily,
      keys: ['editorGroupHeader.connectedTabsBackground', 'editorGroupHeader.noTabsBackground', 'sideBySideEditor.horizontalBorder',
        'sideBySideEditor.verticalBorder', 'sideBar.dropBackground', 'panel.dropBorder', 'panelSection.dropBackground',
        'editorGroup.dropIntoPromptBackground', 'editorGroup.dropIntoPromptForeground', 'commandCenter.activeForeground',
        'commandCenter.inactiveBorder', 'commandCenter.inactiveForeground', 'statusBarItem.errorHoverBackground',
        'statusBarItem.errorHoverForeground', 'statusBarItem.warningHoverBackground', 'statusBarItem.warningHoverForeground',
        'statusBarItem.offlineHoverForeground', 'statusBarItem.remoteHoverForeground', 'checkbox.disabled.background',
        'checkbox.disabled.foreground', 'actionBar.toggledBackground', 'editor.border', 'tree.inactiveIndentGuidesStroke',
        'quickInputList.focusHighlightForeground'],
      prefixes: [], except: [],
    },
    {
      area: 'Inline chat and AI marks', reason: notDaily,
      keys: ['inlineChat.background', 'inlineChat.border', 'inlineChat.foreground', 'inlineChat.shadow', 'inlineChatDiff.inserted',
        'inlineChatDiff.removed', 'editorMinimap.inlineChatInserted', 'minimap.chatEditHighlight', 'editorLightBulbAi.foreground'],
      prefixes: [], except: [],
    },
    { area: 'Inline edits', reason: notDaily, keys: [], prefixes: ['inlineEdit'], except: [] },
    {
      area: 'Symbol icons', reason: `${notDaily} The few the theme sets are the outline and suggestion icons the preview draws.`, keys: [],
      prefixes: ['symbolIcon', 'terminalSymbolIcon'],
      except: ['symbolIcon.classForeground', 'symbolIcon.fieldForeground', 'symbolIcon.functionForeground', 'symbolIcon.methodForeground', 'symbolIcon.variableForeground'],
    },
    {
      area: 'Terminal extras', reason: notDaily, keys: [],
      prefixes: ['terminalStickyScroll', 'terminalStickyScrollHover', 'terminalCommandDecoration', 'terminalCommandGuide', 'terminalOverviewRuler'], except: [],
    },
    { area: 'Merge conflicts', reason: notDaily, keys: [], prefixes: ['merge', 'mergeEditor'], except: [] },
    {
      area: 'Chat extras', reason: 'Unused (VS Code\'s own description says so), VS Code\'s fixed brand colors, or the voice, dictation and MCP views.',
      keys: ['chat.inputWorkingBorderColor2', 'chat.inputWorkingBorderColor3', 'chat.voiceSpeakingGlow', 'chat.fusionBadgeGradientStart',
        'chat.fusionBadgeGradientEnd', 'chat.workingProgressStableIconForeground', 'chat.workingProgressInsidersIconForeground',
        'chat.voiceGlowBaseColor', 'chat.voiceListeningGlow', 'chat.dictationActiveMicGlow', 'chat.mcpCompatibilityWarningForeground'],
      prefixes: [], except: [],
    },
  ];

  /** True when LEFT_TO_VSCODE holds the id, by key or by prefix less except. */
  const leftToVSCode = id => LEFT_TO_VSCODE.some(g => g.keys.includes(id)
    || (g.prefixes.some(p => id.startsWith(`${p}.`)) && !g.except.includes(id)));

  const HEX = /^#[0-9a-f]{6}([0-9a-f]{2})?$/i;
  const bg = GB.parseColor(THEME_BACKGROUND);
  const contrastOnBg = hex => GB.contrastRatio(GB.parseColor(hex), bg);
  const round = x => Math.round(x * 1000) / 1000;

  /** Raises OKLCH lightness in 0.01 steps, keeping hue and requested chroma, until the color reads 4.5:1. */
  function liftToContrast(lch) {
    let l = lch.l;
    let hex = GB.oklchToHex({ l, c: lch.c, h: lch.h });
    while (contrastOnBg(hex) < MIN_CONTRAST && l < MAX_LIGHTNESS) {
      l = Math.min(MAX_LIGHTNESS, round(l + 0.01));
      hex = GB.oklchToHex({ l, c: lch.c, h: lch.h });
    }
    return { l, c: lch.c, h: lch.h, hex };
  }

  /** Euclidean distance in OKLab, from (L, C cos h, C sin h). */
  function oklabDistance(hexA, hexB) {
    const lab = hex => {
      const { l, c, h } = GB.hexToOklch(hex);
      const rad = (h * Math.PI) / 180;
      return [l, c * Math.cos(rad), c * Math.sin(rad)];
    };
    const a = lab(hexA);
    const b = lab(hexB);
    return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  }

  /**
   * The text levels the Roles step's Text contrast picks: lightness of bright, text, muted and
   * faint. Standard is the levels themes have always had; no level makes faint fainter.
   */
  const TEXT_LEVELS = {
    soft: [0.9, 0.81, 0.63, 0.5],
    standard: [0.95, 0.87, 0.68, 0.5],
    high: [0.98, 0.93, 0.76, 0.58],
  };

  /**
   * The Roles step's three settings in a chrome choice, cleaned: syntax, five palette indexes
   * for ROLE_NAMES (null for the default, colors 1 to 5 in order); depth, the multiplier on the
   * surface offsets, clamped to 0.5 to 2 and rounded to 0.1 (1 when not a finite number); text,
   * a TEXT_LEVELS id ('standard' otherwise). Every value missing or invalid builds as today.
   */
  function cleanChrome(chrome) {
    const c = chrome && typeof chrome === 'object' ? chrome : {};
    const syntax = Array.isArray(c.syntax) && c.syntax.length === ROLE_NAMES.length
      && c.syntax.every(i => Number.isInteger(i) && i >= 0) ? c.syntax.slice() : null;
    const depth = typeof c.depth === 'number' && Number.isFinite(c.depth)
      ? Math.round(Math.min(2, Math.max(0.5, c.depth)) * 10) / 10 : 1;
    const text = Object.prototype.hasOwnProperty.call(TEXT_LEVELS, c.text) ? c.text : 'standard';
    return { syntax, depth, text };
  }

  /**
   * Five '#rrggbb' colors for ROLE_NAMES: readable on the background and apart from each other.
   * `syntax` picks the palette color for each role (cleanChrome's syntax); every index wraps
   * around the palette, as the default colors 1 to 5 do on a shorter palette.
   */
  function roleColors(entry, syntax = null) {
    const sources = ROLE_NAMES.map((_, i) => entry.colors[(syntax ? syntax[i] : i) % entry.colors.length].toLowerCase());
    const roles = sources.map(src => {
      if (contrastOnBg(src) >= MIN_CONTRAST) {
        const lch = GB.hexToOklch(src);
        return { ...lch, hex: src };
      }
      return liftToContrast(GB.hexToOklch(src));
    });
    for (let i = 1; i < roles.length; i++) {
      const earlier = roles.slice(0, i).filter((_, j) => sources[j] !== sources[i]);
      const tooClose = () => earlier.some(r => oklabDistance(r.hex, roles[i].hex) < MIN_DISTANCE);
      while (tooClose() && roles[i].l < MAX_LIGHTNESS) {
        const l = Math.min(MAX_LIGHTNESS, round(roles[i].l + 0.02));
        roles[i] = { ...roles[i], l, hex: GB.oklchToHex({ l, c: roles[i].c, h: roles[i].h }) };
      }
    }
    return roles.map(r => r.hex);
  }

  const themeLabel = entry => 'GigglyBits Dark (' + entry.name + ')';
  const themeFileName = entry => 'gigglybits-dark-' + entry.id + '-color-theme.json';

  /** Black or white, whichever reads better on the color. */
  function textOn(hex) {
    const c = GB.parseColor(hex);
    return GB.contrastRatio(GB.parseColor('#000000'), c) >= GB.contrastRatio(GB.parseColor('#ffffff'), c) ? '#000000' : '#ffffff';
  }

  /**
   * A key edit with this value leaves the key to VS Code's own default. VS Code reads 'default'
   * in workbench.colorCustomizations the same way: it ignores the theme's value for the key.
   */
  const DEFAULT_COLOR = 'default';

  /**
   * The Lab's edits, cleaned: { swatches: { name: hex }, keys: { key: hex | 'default' } }.
   * Anything that is not a '#rrggbb' or '#rrggbbaa' string is dropped, except 'default' as a key
   * edit (DEFAULT_COLOR), so a bad value never reaches a theme.
   */
  function cleanEdits(edits) {
    const pick = (obj, allowDefault) => {
      const out = {};
      if (obj && typeof obj === 'object') {
        for (const [k, v] of Object.entries(obj)) {
          if (typeof v === 'string' && (HEX.test(v) || (allowDefault && v === DEFAULT_COLOR))) {out[k] = v.toLowerCase();}
        }
      }
      return out;
    };
    return { swatches: pick(edits && edits.swatches, false), keys: pick(edits && edits.keys, true) };
  }

  /**
   * The Frame settings, cleaned: { style: 'dark' | 'filled', color: '#rrggbb' }. chrome.frame is
   * { index?, color?, style? }; a '#rrggbb' color wins over index, index picks a palette color
   * (clamped), and with no usable color or index the frame follows chrome.index, the editor
   * accent. A style other than 'filled' is 'dark', so a bad or missing frame builds today's frame.
   */
  function frameOf(entry, chrome = {}) {
    const f = chrome && typeof chrome.frame === 'object' && chrome.frame !== null ? chrome.frame : {};
    const last = entry.colors.length - 1;
    const clamp = i => Math.min(Math.max(0, Math.round(Number(i)) || 0), last);
    const style = f.style === 'filled' ? 'filled' : 'dark';
    if (typeof f.color === 'string' && /^#[0-9a-f]{6}$/i.test(f.color)) return { style, color: f.color.toLowerCase() };
    const index = Number.isFinite(Number(f.index)) && f.index !== null && f.index !== undefined ? clamp(f.index) : clamp(chrome.index);
    return { style, color: entry.colors[index].toLowerCase() };
  }

  /** An edited value; a 6-digit edit of a translucent swatch keeps the swatch's alpha. */
  function editedValue(edit, computed) {
    return edit.length === 7 && computed.length === 9 ? edit + computed.slice(7) : edit;
  }

  /**
   * Named colors for one palette; KEY_GROUPS maps each gallery key to one of these.
   *
   * chrome picks the UI accent and surface tint, as in the Lab's Workbench preview: index is
   * the palette color the accent comes from (default color 1, the keyword color) and surfaces
   * is a GB.CHROME_SURFACES id (default neutral). The defaults reproduce the committed
   * variants exactly. edits.swatches replaces a swatch before the swatches made from it are
   * computed, so editing the accent also moves its hover, selection and badge-text colors.
   */
  function swatches(entry, chrome = {}, edits = undefined) {
    const se = cleanEdits(edits).swatches;
    const sw = {};
    const put = (name, value) => {
      sw[name] = se[name] ? editedValue(se[name], value) : value;
      return sw[name];
    };
    const opaque = hex => hex.slice(0, 7);

    const roles = cleanChrome(chrome);
    const [kw, fn, str, type, num] = roleColors(entry, roles.syntax);
    put('kw', kw); put('fn', fn); put('str', str); put('type', type); put('num', num);

    const index = Math.min(Math.max(0, Number(chrome.index) || 0), entry.colors.length - 1);
    // The palette's accent tints the surfaces and sets the status colors' lightness. An edited
    // accent replaces only the accent and the swatches made from it, so changing the button
    // color does not also re-tint the side bar or move the error red.
    const paletteAccent = GB.liftTo(entry.colors[index], THEME_BACKGROUND, MIN_CONTRAST);
    const accentLch = GB.hexToOklch(paletteAccent);
    const accent = opaque(put('accent', paletteAccent));
    const editedAccentLch = GB.hexToOklch(accent);
    const hue = accentLch.h;
    const bgL = GB.hexToOklch(opaque(put('bg', THEME_BACKGROUND))).l;
    const neutral = l => GB.oklchToHex({ l, c: 0.01, h: hue });
    const surfaceChroma = (GB.CHROME_SURFACES[chrome.surfaces] || GB.CHROME_SURFACES.neutral).chroma;
    const surface = l => GB.oklchToHex({ l, c: surfaceChroma, h: hue });

    // Surfaces, stepped from the editor background and tinted toward the accent's hue. The
    // Roles step's Depth multiplies each step (1 is the steps themes have always had).
    const step = offset => bgL + offset * roles.depth;
    put('deep', surface(step(-0.025)));
    put('line', surface(step(0.025)));
    put('raised', surface(step(0.045)));
    put('hover', surface(step(0.07)));
    put('select', GB.oklchToHex({ l: step(0.09), c: Math.max(0.04, surfaceChroma), h: hue }));
    put('divider', surface(step(0.04)));
    const border = opaque(put('border', surface(step(0.11))));
    // Input outlines: the border, lifted until it reads 3:1 on the editor and on the side bar.
    {
      const o = GB.hexToOklch(border);
      const backs = [sw.bg, sw.deep].map(hex => GB.parseColor(opaque(hex)));
      const reads = hex => backs.every(b => GB.contrastRatio(GB.parseColor(hex), b) >= 3);
      let l = o.l;
      let hex = border;
      while (!reads(hex) && l < MAX_LIGHTNESS) {
        l = Math.min(MAX_LIGHTNESS, round(l + 0.01));
        hex = GB.oklchToHex({ l, c: o.c, h: o.h });
      }
      put('inputBorder', hex);
    }
    put('none', '#00000000');
    put('shadow', '#0000005c');

    // Text, at the Roles step's Text contrast levels.
    const [brightL, textL, mutedL, faintL] = TEXT_LEVELS[roles.text];
    put('bright', neutral(brightL));
    const text = opaque(put('text', neutral(textL)));
    put('muted', neutral(mutedL));
    put('faint', neutral(faintL));
    put('textWash', text + '1a');
    put('textWash2', text + '2e');
    put('scroll', text + '26');
    put('scrollHover', text + '40');
    put('scrollActive', text + '59');

    // Accent: the chrome color (color 1 by default), after lifting.
    put('accentHover', GB.oklchToHex({ l: Math.min(MAX_LIGHTNESS, editedAccentLch.l + 0.05), c: editedAccentLch.c, h: editedAccentLch.h }));
    const accentText = opaque(put('accentText', textOn(accent)));
    put('accentTextFaint', accentText + '66');
    put('accentHalf', accent + '80');
    put('accentSoft', accent + '40');
    put('accentSel', accent + '4d');
    put('accentWash', accent + '26');
    put('accentFaint', accent + '1a');

    // Widgets that echo the syntax roles.
    put('findMatch', opaque(sw.fn) + '59');
    put('findHighlight', opaque(sw.fn) + '33');

    // Status colors keep fixed hues so they mean the same thing in every variant; they take
    // the accent's lightness and chroma (chroma at least 0.1 so a gray palette still yields
    // a red that reads as red), lifted to 4.5:1 like the syntax roles.
    const statusChroma = Math.max(0.1, accentLch.c);
    const status = h => liftToContrast({ l: accentLch.l, c: statusChroma, h }).hex;
    const statusDeep = h => GB.oklchToHex({ l: bgL + 0.08, c: 0.06, h });
    const error = opaque(put('error', status(25)));
    const warning = opaque(put('warning', status(85)));
    const success = opaque(put('success', status(145)));
    put('info', accent);
    put('conflict', status(330));
    put('errorText', textOn(error));
    put('warningText', textOn(warning));
    put('errorDeep', statusDeep(25));
    put('warningDeep', statusDeep(85));
    put('infoDeep', GB.oklchToHex({ l: bgL + 0.08, c: 0.06, h: hue }));
    put('successWash', success + '33');
    put('successFaint', success + '1a');
    put('errorWash', error + '33');
    put('errorFaint', error + '1a');

    // Terminal: fixed hues, so program output means what the program meant.
    const ansi = (h, l) => GB.oklchToHex({ l, c: 0.14, h });
    put('ansiBlack', neutral(0.3));
    put('ansiBrightBlack', neutral(0.55));
    put('ansiWhite', neutral(0.85));
    put('ansiBrightWhite', neutral(0.97));
    for (const [name, h] of [['Red', 25], ['Green', 145], ['Yellow', 95], ['Blue', 255], ['Magenta', 330], ['Cyan', 200]]) {
      put('ansi' + name, ansi(h, 0.68));
      put('ansiBright' + name, ansi(h, 0.78));
    }

    // Frame: the title bar, command center, activity bar, status bar and window border. Its
    // own color and style; it reads the editor's swatches but never writes them.
    const frame = frameOf(entry, chrome);
    if (frame.style === 'filled') {
      // Solid bars in the frame color, Peacock style, each text color picked for its own background.
      const fill = frame.color;
      const fillLch = GB.hexToOklch(fill);
      const shade = dl => GB.oklchToHex({ l: Math.min(0.95, Math.max(0.05, fillLch.l + dl)), c: fillLch.c, h: fillLch.h });
      const fg = textOn(fill);
      // Inactive icons: the text color, translucent, but never under 3:1 on the bar.
      const back = GB.parseColor(fill);
      const muted = ['99', 'b3', 'cc', 'e6', 'ff'].map(a => fg + a)
        .find(hex => GB.contrastRatio(GB.over(GB.parseColor(hex), back), back) >= 3);
      const hover = shade(fillLch.l > 0.6 ? -0.08 : 0.08);
      const remote = shade(fillLch.l > 0.6 ? -0.15 : 0.15);
      put('frameBg', fill);
      put('frameFg', fg);
      put('frameMuted', muted);
      put('frameBorder', fill);
      put('frameCcBg', fg + '1a');
      put('frameCcFg', fg);
      put('frameCcBorder', fg + '4d');
      put('frameActive', fg);
      put('frameBadge', fg);
      put('frameBadgeText', fill);
      put('frameHover', hover);
      put('frameHoverText', textOn(hover));
      put('frameRemote', remote);
      put('frameRemoteText', textOn(remote));
      put('frameWindow', fill);
      // The tab and split lines take the frame color, lifted to 3:1 on the editor.
      const line = GB.liftTo(fill, THEME_BACKGROUND, 3);
      put('frameLineAccent', line);
      put('frameLineBg', line);
      put('frameLineDivider', line);
    } else {
      // Dark bars, as the shipped themes have them, with accents from the frame color.
      const frameAccent = GB.liftTo(frame.color, THEME_BACKGROUND, MIN_CONTRAST);
      put('frameBg', sw.deep);
      put('frameFg', sw.text);
      put('frameMuted', sw.muted);
      put('frameBorder', sw.divider);
      put('frameCcBg', sw.raised);
      put('frameCcFg', sw.muted);
      put('frameCcBorder', sw.divider);
      put('frameActive', frameAccent);
      put('frameBadge', frameAccent);
      put('frameBadgeText', textOn(frameAccent));
      put('frameHover', sw.textWash2);
      put('frameHoverText', sw.text);
      put('frameRemote', frameAccent);
      put('frameRemoteText', textOn(frameAccent));
      put('frameWindow', '#00000000');
      // The tab and split lines keep the editor's accent, background and divider.
      put('frameLineAccent', sw.accent);
      put('frameLineBg', sw.bg);
      put('frameLineDivider', sw.divider);
    }
    return sw;
  }

  /** What each swatch is, for the Lab's edit panel. The order is the panel's order. */
  const SWATCHES = {
    accent: ['Accent', 'Buttons, badges, focus rings, the active tab line and links.'],
    accentHover: ['Accent, hovered', 'Buttons and links under the pointer.'],
    accentText: ['Text on the accent', 'Button and badge text.'],
    accentTextFaint: ['Faint text on the accent', 'The split button separator.'],
    accentHalf: ['Accent, half', 'Unsaved-tab lines, bracket match border and quote bars.'],
    accentSoft: ['Accent, soft', 'Active option toggles and the slash command chip in chat.'],
    accentSel: ['Selection', 'Selected text in editors and the terminal.'],
    accentWash: ['Accent wash', 'Selection in an unfocused editor, matching text and drop targets.'],
    accentFaint: ['Accent, faint', 'Folded regions.'],
    bg: ['Editor background', 'The editor, the active tab and the terminal. Moving it moves every surface.'],
    deep: ['Deep surface', 'Title bar, activity bar, side bar, panel and status bar.'],
    line: ['Current line', 'The cursor line and hovered tabs.'],
    raised: ['Raised surface', 'Widgets, menus, inputs, notifications and chat requests.'],
    hover: ['Hover surface', 'Hovered and focused list rows, secondary buttons.'],
    select: ['Selected row', 'The selected list row, menu item and suggestion.'],
    divider: ['Divider', 'Lines between the side bar, panel, tabs, status bar and split editors.'],
    border: ['Border', 'Borders of inputs, widgets, menus and the chat input.'],
    none: ['No color', 'Keys drawn as nothing on purpose.'],
    shadow: ['Shadow', 'Widget and scrollbar shadows.'],
    bright: ['Bright text', 'The active tab and selected rows.'],
    text: ['Text', 'Default text in the workbench and the editor.'],
    muted: ['Muted text', 'Descriptions, inactive tabs, placeholders and comments.'],
    faint: ['Faint text', 'Line numbers, ghost text and disabled text.'],
    textWash: ['Text wash', 'Keybinding labels and word highlights.'],
    textWash2: ['Text wash, stronger', 'Pressed status bar items and toolbar hovers.'],
    scroll: ['Scrollbar', 'The scrollbar thumb.'],
    scrollHover: ['Scrollbar, hovered', 'The scrollbar thumb under the pointer.'],
    scrollActive: ['Scrollbar, dragged', 'The scrollbar thumb while dragged.'],
    kw: ['Keywords', 'Syntax: keywords and storage types.'],
    fn: ['Functions', 'Syntax: functions; also find matches and method icons.'],
    str: ['Strings', 'Syntax: strings; also inline code.'],
    type: ['Types', 'Syntax: types and classes; also class icons.'],
    num: ['Numbers', 'Syntax: numbers and constants; also field icons.'],
    findMatch: ['Current find match', 'The find match the cursor is on.'],
    findHighlight: ['Other find matches', 'Every other find match.'],
    error: ['Error', 'Error text, squiggles and icons, deleted files and the auto-mode chat input border.'],
    errorText: ['Text on error', 'Error badge text.'],
    warning: ['Warning', 'Warnings, modified files and edited files in chat.'],
    warningText: ['Text on warning', 'Warning badge and debugging status bar text.'],
    success: ['Success', 'Added lines and files.'],
    info: ['Info', 'Info squiggles, icons and modified-line gutter marks.'],
    conflict: ['Conflict', 'Files with merge conflicts.'],
    errorDeep: ['Error background', 'Error messages under inputs and the error status bar item.'],
    warningDeep: ['Warning background', 'Warning messages under inputs.'],
    infoDeep: ['Info background', 'Info messages under inputs.'],
    successWash: ['Inserted text', 'Inserted text in diffs.'],
    successFaint: ['Inserted line', 'Inserted lines in diffs.'],
    errorWash: ['Removed text', 'Removed text in diffs.'],
    errorFaint: ['Removed line', 'Removed lines in diffs.'],
  };
  for (const name of ['Black', 'Red', 'Green', 'Yellow', 'Blue', 'Magenta', 'Cyan', 'White']) {
    SWATCHES['ansi' + name] = [`Terminal ${name.toLowerCase()}`, 'Program output in the terminal.'];
    SWATCHES['ansiBright' + name] = [`Terminal bright ${name.toLowerCase()}`, 'Program output in the terminal.'];
  }
  SWATCHES.inputBorder = ['Input outline', 'Borders of inputs, dropdowns, checkboxes and the chat input; at least 3:1.'];
  const FRAME_SWATCHES = {
    frameBg: ['Frame', 'Title bar, activity bar and status bar backgrounds.'],
    frameFg: ['Frame text', 'Title, active icons and status bar text.'],
    frameMuted: ['Frame text, dim', 'Inactive activity bar icons.'],
    frameBorder: ['Frame border', 'Lines along the title, activity and status bars.'],
    frameCcBg: ['Command center', 'The search box in the title bar.'],
    frameCcFg: ['Command center text', 'Text in the title bar search box.'],
    frameCcBorder: ['Command center border', 'The title bar search box outline.'],
    frameActive: ['Frame active line', 'The line beside the active activity bar icon.'],
    frameBadge: ['Frame badge', 'Activity bar count badges.'],
    frameBadgeText: ['Frame badge text', 'Numbers on activity bar badges.'],
    frameHover: ['Status item, hovered', 'A status bar item under the pointer.'],
    frameHoverText: ['Status item text, hovered', 'Text of a hovered status bar item.'],
    frameRemote: ['Remote item', 'The remote indicator at the left of the status bar.'],
    frameRemoteText: ['Remote item text', 'The remote indicator icon and text.'],
    frameWindow: ['Window border', 'The line around the whole window.'],
    frameLineAccent: ['Frame line, active', 'The active tab\'s top line and a hovered resize edge.'],
    frameLineBg: ['Frame line, under tab', 'The line under the active tab.'],
    frameLineDivider: ['Frame line, split', 'Lines between split editors and along the side bar and panel.'],
  };
  Object.assign(SWATCHES, FRAME_SWATCHES);
  // Each entry is [label, description, group]: 'frame' for the Frame swatches, 'editor' otherwise.
  for (const [name, def] of Object.entries(SWATCHES)) def[2] = name in FRAME_SWATCHES ? 'frame' : 'editor';

  const ANSI_NAMES = ['Black', 'Red', 'Green', 'Yellow', 'Blue', 'Magenta', 'Cyan', 'White'];
  /**
   * The Roles step's families, in order: each swatch belongs to exactly one, and `how` says in
   * one sentence how swatches() makes the family from the palette.
   */
  const ROLE_FAMILIES = [
    {
      id: 'syntax', name: 'Syntax', roles: ['kw', 'fn', 'str', 'type', 'num', 'findMatch', 'findHighlight'],
      how: 'Palette colors in the order Colors sets, each lifted to 4.5:1 on the editor background and kept apart from the others. Find matches are see-through Functions.',
    },
    {
      id: 'accent', name: 'Accent', roles: ['accent', 'accentHover', 'accentText', 'accentTextFaint', 'accentHalf', 'accentSoft', 'accentSel', 'accentWash', 'accentFaint'],
      how: 'The Editor accent from step 3, lifted to 4.5:1. The rest are its hover, the text drawn on it and see-through steps of it.',
    },
    {
      id: 'surfaces', name: 'Surfaces', roles: ['bg', 'deep', 'line', 'raised', 'hover', 'select', 'divider', 'border', 'inputBorder', 'shadow', 'none'],
      how: 'Steps lighter and darker than the editor background, as far apart as Depth sets, tinted toward the accent\'s hue at step 3\'s surface strength. Input outlines are lifted to 3:1.',
    },
    {
      id: 'text', name: 'Text', roles: ['bright', 'text', 'muted', 'faint', 'textWash', 'textWash2', 'scroll', 'scrollHover', 'scrollActive'],
      how: 'Grays at four lightness levels that Contrast sets, barely tinted toward the accent; the washes and scrollbars are see-through Text.',
    },
    {
      id: 'status', name: 'Status', roles: ['error', 'warning', 'success', 'info', 'conflict', 'errorText', 'warningText', 'errorDeep', 'warningDeep', 'infoDeep', 'successWash', 'successFaint', 'errorWash', 'errorFaint'],
      how: 'Fixed hues, so red means error in every theme, at the accent\'s lightness and lifted to 4.5:1. Info is the accent.',
    },
    {
      id: 'terminal', name: 'Terminal', roles: ANSI_NAMES.flatMap(n => ['ansi' + n, 'ansiBright' + n]),
      how: 'Fixed hues at fixed lightness, so program output means what the program meant.',
    },
    {
      id: 'frame', name: 'Frame', roles: Object.keys(FRAME_SWATCHES),
      how: 'From the Frame color and style in step 3.',
    },
  ];

  /**
   * Every gallery key, grouped by the swatch it takes. A key the gallery starts drawing
   * fails the coverage test in test/themeBuilder.test.ts until it is placed here or in UNSET_KEYS.
   */
  const KEY_GROUPS = {
    bg: [
      'editor.background', 'breadcrumb.background', 'tab.activeBackground',
      'tab.unfocusedActiveBackground', 'tab.unfocusedActiveBorder', 'terminal.background', 'terminalCursor.background',
    ],
    deep: [
      'sideBar.background', 'sideBarSectionHeader.background', 'panel.background', 'activityBarTop.background',
      'editorGroupHeader.tabsBackground', 'tab.inactiveBackground', 'tab.unfocusedInactiveBackground',
      'diffEditor.unchangedRegionBackground', 'peekViewEditor.background', 'peekViewEditorGutter.background',
      'peekViewResult.background',
    ],
    line: [
      'editor.lineHighlightBackground', 'tab.hoverBackground', 'tab.unfocusedHoverBackground', 'tab.selectedBackground',
    ],
    raised: [
      'editorWidget.background', 'editorHoverWidget.background', 'editorSuggestWidget.background', 'editorInlayHint.background',
      'menu.background', 'input.background', 'dropdown.background', 'dropdown.listBackground', 'checkbox.background',
      'checkbox.selectBackground', 'breadcrumbPicker.background', 'notifications.background',
      'notificationCenterHeader.background', 'panelSectionHeader.background', 'peekViewTitle.background', 'quickInput.background',
      'radio.inactiveBackground', 'textBlockQuote.background', 'textCodeBlock.background', 'textPreformat.background',
      'chat.requestBackground', 'chat.avatarBackground', 'inlineChatInput.background',
    ],
    hover: [
      'list.hoverBackground', 'list.focusBackground', 'list.inactiveSelectionBackground', 'button.secondaryBackground',
      'inputOption.hoverBackground', 'radio.inactiveHoverBackground', 'menubar.selectionBackground',
      'editorHoverWidget.statusBarBackground', 'quickInputTitle.background', 'statusBarItem.prominentBackground',
    ],
    select: [
      'list.activeSelectionBackground', 'menu.selectionBackground', 'editorSuggestWidget.selectedBackground',
      'quickInputList.focusBackground', 'peekViewResult.selectionBackground', 'banner.background',
    ],
    divider: [
      'sideBarSectionHeader.border', 'panelSection.border',
      'panelSectionHeader.border', 'statusBar.debuggingBorder',
      'tab.border', 'editorGroupHeader.tabsBorder', 'diffEditor.border', 'notifications.border',
      'editorRuler.foreground', 'terminal.border', 'sideBarActivityBarTop.border',
    ],
    border: [
      'widget.border', 'editorWidget.border', 'editorHoverWidget.border', 'editorSuggestWidget.border', 'menu.border',
      'menu.separatorBackground', 'checkbox.selectBorder',
      'notificationCenter.border', 'notificationToast.border', 'keybindingLabel.border', 'keybindingLabel.bottomBorder',
      'pickerGroup.border', 'radio.inactiveBorder', 'list.inactiveFocusOutline', 'editorIndentGuide.background1',
      'editorWhitespace.foreground', 'tree.indentGuidesStroke', 'textSeparator.foreground', 'button.secondaryHoverBackground',
      'statusBarItem.prominentHoverBackground', 'chat.requestBorder',
    ],
    inputBorder: ['input.border', 'dropdown.border', 'checkbox.border', 'panelInput.border', 'inlineChatInput.border'],
    none: [
      'button.border', 'menu.selectionBorder', 'menubar.selectionBorder', 'toolbar.hoverOutline', 'tab.hoverBorder',
      'tab.unfocusedHoverBorder', 'editor.lineHighlightBorder', 'editor.findMatchHighlightBorder', 'editor.findRangeHighlightBorder',
      'editor.rangeHighlightBorder', 'editor.selectionHighlightBorder', 'editor.wordHighlightBorder',
      'editor.wordHighlightStrongBorder', 'editorError.background', 'editorError.border', 'editorWarning.background',
      'editorWarning.border', 'editorInfo.background', 'editorInfo.border', 'editorHint.border', 'editorGhostText.background',
      'editorGhostText.border', 'diffEditor.insertedTextBorder', 'diffEditor.removedTextBorder',
      'peekViewEditor.matchHighlightBorder', 'terminal.findMatchBorder', 'activityBarTop.activeBackground',
    ],
    shadow: ['widget.shadow', 'scrollbar.shadow'],
    bright: [
      'tab.activeForeground', 'breadcrumb.activeSelectionForeground', 'breadcrumb.focusForeground',
      'list.activeSelectionForeground', 'list.activeSelectionIconForeground', 'menu.selectionForeground',
      'quickInputList.focusForeground', 'quickInputList.focusIconForeground', 'peekViewResult.selectionForeground',
      'chat.slashCommandForeground',
    ],
    text: [
      'foreground', 'editor.foreground', 'icon.foreground', 'activityBar.dropBorder',
      'sideBar.foreground', 'sideBarSectionHeader.foreground', 'sideBarTitle.foreground',
      'editorWidget.foreground', 'editorHoverWidget.foreground',
      'editorSuggestWidget.foreground', 'editorSuggestWidget.selectedForeground', 'editorSuggestWidget.selectedIconForeground',
      'menu.foreground', 'menubar.selectionForeground', 'input.foreground', 'dropdown.foreground', 'checkbox.foreground',
      'button.secondaryForeground', 'inputOption.activeForeground', 'inputValidation.errorForeground',
      'inputValidation.warningForeground', 'inputValidation.infoForeground', 'keybindingLabel.foreground', 'list.focusForeground',
      'list.hoverForeground', 'list.inactiveSelectionForeground', 'list.inactiveSelectionIconForeground', 'banner.foreground',
      'notifications.foreground', 'notificationCenterHeader.foreground', 'panelSectionHeader.foreground',
      'panelTitle.activeForeground', 'peekViewResult.fileForeground', 'peekViewTitleLabel.foreground', 'quickInput.foreground',
      'radio.activeForeground', 'settings.headerForeground', 'statusBarItem.errorForeground',
      'statusBarItem.warningForeground', 'statusBarItem.offlineForeground', 'statusBarItem.prominentForeground',
      'statusBarItem.prominentHoverForeground', 'tab.hoverForeground', 'tab.selectedForeground', 'tab.unfocusedActiveForeground',
      'terminal.foreground', 'editorLineNumber.activeForeground', 'chat.avatarForeground', 'activityBarTop.foreground',
    ],
    muted: [
      'descriptionForeground', 'breadcrumb.foreground',
      'tab.inactiveForeground', 'tab.unfocusedHoverForeground', 'panelTitle.inactiveForeground', 'peekViewResult.lineForeground',
      'peekViewTitleDescription.foreground', 'editorCodeLens.foreground', 'editorHint.foreground', 'editorInlayHint.foreground',
      'editorSuggestWidgetStatus.foreground', 'input.placeholderForeground', 'radio.inactiveForeground',
      'diffEditor.unchangedRegionForeground', 'inlineChatInput.placeholderForeground', 'activityBarTop.inactiveForeground',
    ],
    faint: [
      'disabledForeground', 'list.deemphasizedForeground', 'editorLineNumber.foreground', 'editorGhostText.foreground',
      'editor.foldPlaceholderForeground', 'editorIndentGuide.activeBackground1', 'gitDecoration.ignoredResourceForeground',
      'tab.unfocusedInactiveForeground',
    ],
    textWash: ['keybindingLabel.background', 'editor.findRangeHighlightBackground', 'editor.wordHighlightBackground', 'toolbar.activeBackground'],
    textWash2: ['statusBarItem.activeBackground', 'toolbar.hoverBackground', 'editor.rangeHighlightBackground'],
    scroll: ['scrollbarSlider.background'],
    scrollHover: ['scrollbarSlider.hoverBackground'],
    scrollActive: ['scrollbarSlider.activeBackground'],
    accent: [
      'focusBorder', 'button.background', 'extensionButton.background', 'badge.background',
      'panelTitleBadge.background', 'progressBar.background', 'activityBar.activeFocusBorder',
      'panelTitle.activeBorder', 'tab.selectedBorderTop', 'tab.activeModifiedBorder', 'textLink.foreground',
      'notificationLink.foreground', 'list.highlightForeground', 'list.focusHighlightForeground', 'list.focusOutline',
      'list.focusAndSelectionOutline', 'editorSuggestWidget.highlightForeground', 'editorSuggestWidget.focusHighlightForeground',
      'pickerGroup.foreground', 'inputOption.activeBorder', 'radio.activeBorder', 'peekView.border',
      'settings.modifiedItemIndicator', 'statusBarItem.focusBorder', 'editorCursor.foreground',
      'terminalCursor.foreground', 'banner.iconForeground', 'editorLightBulbAutoFix.foreground', 'editorBracketHighlight.foreground1',
      'inlineChatInput.focusBorder', 'activityBarTop.activeBorder',
    ],
    accentHover: ['button.hoverBackground', 'extensionButton.hoverBackground', 'textLink.activeForeground'],
    accentText: [
      'button.foreground', 'extensionButton.foreground', 'badge.foreground', 'panelTitleBadge.foreground',
    ],
    accentTextFaint: ['button.separator'],
    accentHalf: [
      'tab.inactiveModifiedBorder', 'tab.unfocusedActiveBorderTop', 'tab.unfocusedActiveModifiedBorder',
      'editorBracketMatch.border', 'textBlockQuote.border',
    ],
    accentSoft: [
      'inputOption.activeBackground', 'radio.activeBackground', 'tab.unfocusedInactiveModifiedBorder', 'editor.wordHighlightStrongBackground',
      'chat.slashCommandBackground',
    ],
    accentSel: ['editor.selectionBackground', 'selection.background', 'terminal.selectionBackground'],
    accentWash: [
      'editor.inactiveSelectionBackground', 'editor.selectionHighlightBackground', 'editorBracketMatch.background',
      'list.dropBackground', 'terminal.inactiveSelectionBackground',
    ],
    accentFaint: ['editor.foldBackground'],
    fn: [
      'editor.findMatchBorder', 'symbolIcon.functionForeground', 'symbolIcon.methodForeground', 'editorBracketHighlight.foreground2',
    ],
    str: ['textPreformat.foreground', 'editorBracketHighlight.foreground3'],
    type: ['symbolIcon.classForeground'],
    num: ['symbolIcon.fieldForeground', 'symbolIcon.variableForeground'],
    findMatch: ['editor.findMatchBackground', 'terminal.findMatchBackground', 'peekViewEditor.matchHighlightBackground', 'peekViewResult.matchHighlightBackground'],
    findHighlight: ['editor.findMatchHighlightBackground'],
    error: [
      'errorForeground', 'editorError.foreground', 'list.errorForeground', 'list.invalidItemForeground', 'inputValidation.errorBorder',
      'notificationsErrorIcon.foreground', 'problemsErrorIcon.foreground', 'activityErrorBadge.background',
      'editorGutter.deletedBackground', 'gitDecoration.deletedResourceForeground', 'gitDecoration.stageDeletedResourceForeground',
      'chat.linesRemovedForeground',
    ],
    errorText: ['activityErrorBadge.foreground'],
    warning: [
      'editorWarning.foreground', 'list.warningForeground', 'inputValidation.warningBorder', 'notificationsWarningIcon.foreground',
      'problemsWarningIcon.foreground', 'activityWarningBadge.background', 'editorLightBulb.foreground',
      'gitDecoration.modifiedResourceForeground', 'gitDecoration.stageModifiedResourceForeground', 'statusBar.debuggingBackground',
      'chat.editedFileForeground',
    ],
    warningText: ['activityWarningBadge.foreground', 'statusBar.debuggingForeground'],
    success: [
      'editorGutter.addedBackground', 'gitDecoration.addedResourceForeground', 'gitDecoration.untrackedResourceForeground',
      'gitDecoration.renamedResourceForeground', 'chat.linesAddedForeground',
    ],
    info: [
      'editorInfo.foreground', 'inputValidation.infoBorder', 'notificationsInfoIcon.foreground', 'problemsInfoIcon.foreground',
      'editorGutter.modifiedBackground', 'gitDecoration.submoduleResourceForeground',
    ],
    conflict: ['gitDecoration.conflictingResourceForeground'],
    errorDeep: ['inputValidation.errorBackground', 'statusBarItem.errorBackground', 'statusBarItem.offlineBackground'],
    warningDeep: ['inputValidation.warningBackground', 'statusBarItem.warningBackground'],
    infoDeep: ['inputValidation.infoBackground'],
    successWash: ['diffEditor.insertedTextBackground', 'diffEditorGutter.insertedLineBackground'],
    successFaint: ['diffEditor.insertedLineBackground'],
    errorWash: ['diffEditor.removedTextBackground', 'diffEditorGutter.removedLineBackground'],
    errorFaint: ['diffEditor.removedLineBackground'],
    ansiBlack: ['terminal.ansiBlack'], ansiBrightBlack: ['terminal.ansiBrightBlack'],
    ansiWhite: ['terminal.ansiWhite'], ansiBrightWhite: ['terminal.ansiBrightWhite'],
    ansiRed: ['terminal.ansiRed'], ansiBrightRed: ['terminal.ansiBrightRed'],
    ansiGreen: ['terminal.ansiGreen'], ansiBrightGreen: ['terminal.ansiBrightGreen'],
    ansiYellow: ['terminal.ansiYellow'], ansiBrightYellow: ['terminal.ansiBrightYellow'],
    ansiBlue: ['terminal.ansiBlue'], ansiBrightBlue: ['terminal.ansiBrightBlue'],
    ansiMagenta: ['terminal.ansiMagenta'], ansiBrightMagenta: ['terminal.ansiBrightMagenta'],
    ansiCyan: ['terminal.ansiCyan'], ansiBrightCyan: ['terminal.ansiBrightCyan'],
    // Frame: decided by the frame settings, never by the editor's.
    frameBg: ['titleBar.activeBackground', 'activityBar.background', 'activityBar.activeBackground', 'statusBar.background', 'statusBar.noFolderBackground'],
    frameFg: ['titleBar.activeForeground', 'activityBar.foreground', 'statusBar.foreground', 'statusBar.noFolderForeground'],
    frameMuted: ['activityBar.inactiveForeground'],
    frameBorder: ['titleBar.border', 'activityBar.border', 'statusBar.border', 'statusBar.noFolderBorder'],
    frameCcBg: ['commandCenter.background'],
    frameCcFg: ['commandCenter.foreground'],
    frameCcBorder: ['commandCenter.border'],
    frameActive: ['activityBar.activeBorder'],
    frameBadge: ['activityBarBadge.background'],
    frameBadgeText: ['activityBarBadge.foreground'],
    frameHover: ['statusBarItem.hoverBackground'],
    frameHoverText: ['statusBarItem.hoverForeground'],
    frameRemote: ['statusBarItem.remoteBackground'],
    frameRemoteText: ['statusBarItem.remoteForeground'],
    frameWindow: ['window.activeBorder'],
    frameLineAccent: ['tab.activeBorderTop', 'sash.hoverBorder'],
    frameLineBg: ['tab.activeBorder'],
    frameLineDivider: ['editorGroup.border', 'sideBar.border', 'panel.border'],
  };

  /**
   * The everyday colors the theme sets beyond the original gallery (scrollbar and minimap marks,
   * filter highlights, the unfocused window, sticky scroll and the like), each under a swatch
   * that already exists. They join KEY_GROUPS below, so each swatch keeps one key list.
   */
  const EVERYDAY_KEY_GROUPS = {
    bg: ['editorCursor.background', 'editorGroup.emptyBackground', 'minimap.background', 'editorOverviewRuler.background'],
    deep: ['sideBarTitle.background', 'sideBarStickyScroll.background', 'panelStickyScroll.background'],
    line: ['editor.inactiveLineHighlightBackground'],
    raised: ['listFilterWidget.background'],
    hover: ['editorStickyScrollHover.background'],
    divider: ['tab.divider', 'diffEditor.diagonalFill', 'editorOverviewRuler.border'],
    border: [
      'editor.snippetFinalTabstopHighlightBorder', 'editorWidget.resizeBorder', 'simpleFindWidget.sashBorder',
      'tab.lastPinnedBorder', 'tree.tableColumnsBorder',
    ],
    none: [
      'button.secondaryBorder', 'editor.snippetFinalTabstopHighlightBackground', 'editor.snippetTabstopHighlightBorder',
      'editor.symbolHighlightBorder', 'editorGroup.dropIntoPromptBorder', 'editorGroup.focusedEmptyBorder',
      'editorGroupHeader.border', 'editorStickyScroll.border', 'editorUnnecessaryCode.border', 'list.filterMatchBorder',
      'list.inactiveFocusBackground', 'listFilterWidget.outline', 'panelTitle.border', 'sideBarTitle.border',
      'scrollbar.background', 'sideBarStickyScroll.border', 'panelStickyScroll.border',
    ],
    shadow: ['diffEditor.unchangedRegionShadow', 'listFilterWidget.shadow', 'sideBarStickyScroll.shadow', 'panelStickyScroll.shadow'],
    bright: ['strongForeground'],
    text: ['activityBarTop.dropBorder'],
    muted: [
      'search.resultsInfoForeground', 'editorOverviewRuler.bracketMatchForeground', 'editorOverviewRuler.commonContentForeground',
      'editorOverviewRuler.commentUnresolvedForeground',
    ],
    faint: ['editorLineNumber.dimmedForeground', 'editorOverviewRuler.commentForeground', 'editorOverviewRuler.commentDraftForeground'],
    textWash: ['diffEditor.unchangedCodeBackground', 'editor.snippetTabstopHighlightBackground', 'tree.tableOddRowsBackground'],
    textWash2: ['editorOverviewRuler.rangeHighlightForeground'],
    scroll: ['minimapSlider.background', 'editorOverviewRuler.wordHighlightTextForeground'],
    scrollHover: ['minimapSlider.hoverBackground', 'editorOverviewRuler.wordHighlightForeground'],
    scrollActive: ['minimapSlider.activeBackground'],
    accent: ['statusBar.focusBorder', 'tab.dragAndDropBorder'],
    accentHover: ['editorLink.activeForeground'],
    accentHalf: ['list.dropBetweenBackground', 'editorOverviewRuler.selectionHighlightForeground', 'editorGutter.modifiedSecondaryBackground'],
    accentSoft: ['editorOverviewRuler.wordHighlightStrongForeground'],
    accentWash: ['editor.hoverHighlightBackground', 'editorGroup.dropBackground'],
    findMatch: ['minimap.findMatchHighlight', 'editorOverviewRuler.findMatchForeground'],
    findHighlight: ['editor.symbolHighlightBackground', 'list.filterMatchBackground'],
    error: [
      'editorBracketHighlight.unexpectedBracket.foreground', 'editorMarkerNavigationError.background', 'listFilterWidget.noMatchesOutline',
      'minimap.errorHighlight', 'editorOverviewRuler.errorForeground', 'editorOverviewRuler.deletedForeground',
    ],
    warning: ['editorMarkerNavigationWarning.background', 'minimap.warningHighlight', 'editorOverviewRuler.warningForeground'],
    success: ['editorOverviewRuler.addedForeground', 'editorOverviewRuler.currentContentForeground'],
    info: [
      'editorMarkerNavigationInfo.background', 'minimap.infoHighlight', 'editorOverviewRuler.infoForeground',
      'editorOverviewRuler.modifiedForeground', 'editorOverviewRuler.incomingContentForeground',
    ],
    errorDeep: ['statusBarItem.offlineHoverBackground'],
    warningDeep: ['editorMarkerNavigationWarning.headerBackground'],
    infoDeep: ['editorMarkerNavigationInfo.headerBackground'],
    errorFaint: ['editorMarkerNavigationError.headerBackground'],
    successWash: ['editorGutter.addedSecondaryBackground', 'editorOverviewRuler.inlineChatInserted'],
    errorWash: ['editor.linkedEditingBackground', 'editorGutter.deletedSecondaryBackground', 'editorOverviewRuler.inlineChatRemoved'],
    // Frame: the unfocused window's bars and the pressed command center follow the frame settings.
    frameBg: ['titleBar.inactiveBackground', 'statusBar.inactiveBackground'],
    frameMuted: ['titleBar.inactiveForeground'],
    frameCcBorder: ['commandCenter.activeBorder'],
    frameHover: ['commandCenter.activeBackground', 'statusBarItem.compactHoverBackground', 'statusBarItem.remoteHoverBackground'],
    frameWindow: ['window.inactiveBorder'],
  };
  /** The chat and terminal colors beyond the original gallery, the same way. */
  const AREA_KEY_GROUPS = {
    divider: ['chat.checkpointSeparator'],
    border: ['chat.requestCodeBorder'],
    none: ['terminal.findMatchHighlightBorder'],
    bright: ['chat.thinkingShimmer'],
    faint: ['terminal.initialHintForeground'],
    textWash: ['chat.statusBackground'],
    accent: ['chat.inputWorkingBorderColor1', 'chat.sessionStateIndicator.inProgressBorder', 'terminal.tab.activeBorder'],
    accentSoft: ['chat.requestBubbleHoverBackground'],
    accentWash: ['chat.requestBubbleBackground', 'terminal.dropBackground', 'terminal.hoverHighlightBackground'],
    findMatch: ['chat.findMatchBackground'],
    findHighlight: ['chat.findMatchHighlightBackground', 'terminal.findMatchHighlightBackground'],
    warning: ['chat.sessionStateIndicator.needsInputBorder'],
    success: ['chat.sessionStateIndicator.unvisitedBorder'],
  };
  for (const [name, groups] of Object.entries({ EVERYDAY_KEY_GROUPS, AREA_KEY_GROUPS })) {
    for (const [swatch, keys] of Object.entries(groups)) {
      if (!KEY_GROUPS[swatch]) {throw new Error(`theme-builder: ${name} names a swatch with no keys '${swatch}'`);}
      KEY_GROUPS[swatch].push(...keys);
    }
  }

  /** The keys the frame settings decide: every key a Frame swatch takes. */
  const FRAME_KEYS = Object.keys(FRAME_SWATCHES).flatMap(name => KEY_GROUPS[name]);

  /** key -> the swatch it takes, from KEY_GROUPS. */
  const SWATCH_OF = {};
  for (const [swatch, keys] of Object.entries(KEY_GROUPS)) {
    for (const key of keys) {SWATCH_OF[key] = swatch;}
  }

  /** The token rule names tokenColors gives its rules, which an Editor text group can map. */
  const TOKEN_RULES = ['Keyword', 'Function', 'String', 'Type', 'Number', 'Comment'];

  /**
   * The widget families a style group can restyle: label, the color keys in it, and the token
   * rules in it. Every FRAME_KEYS key is left out, so a group never reaches the frame.
   */
  const GROUP_FAMILIES = (() => {
    const frame = new Set(FRAME_KEYS);
    const keysFrom = (...prefixes) => Object.keys(SWATCH_OF).filter(k => !frame.has(k) && prefixes.some(p => k.startsWith(p))).sort();
    return {
      tabs: { label: 'Tabs', keys: keysFrom('tab.'), tokens: [] },
      lists: { label: 'Lists and trees', keys: keysFrom('list.', 'tree.'), tokens: [] },
      buttons: { label: 'Buttons', keys: keysFrom('button.'), tokens: [] },
      editorText: { label: 'Editor text', keys: ['editor.foreground'], tokens: TOKEN_RULES.slice() },
    };
  })();

  const isEditorRole = name => typeof name === 'string' && Object.prototype.hasOwnProperty.call(SWATCHES, name) && SWATCHES[name][2] === 'editor';

  /**
   * What the groups set, as { keys: { key: value }, tokens: { rule name: value } } from the
   * swatches sw. An entry counts only when it names a key or token rule of its group's family
   * and an Editor swatch; every other entry, and anything that is not a group, is ignored.
   */
  function groupValues(sw, groups) {
    const keys = {};
    const tokens = {};
    for (const g of Array.isArray(groups) ? groups : []) {
      if (!g || typeof g !== 'object' || !Object.prototype.hasOwnProperty.call(GROUP_FAMILIES, g.family)) {continue;}
      if (!g.roles || typeof g.roles !== 'object') {continue;}
      const family = GROUP_FAMILIES[g.family];
      for (const [name, swatch] of Object.entries(g.roles)) {
        if (!isEditorRole(swatch) || FRAME_KEYS.includes(name)) {continue;}
        if (family.keys.includes(name)) {keys[name] = sw[swatch];}
        else if (family.tokens.includes(name)) {tokens[name] = sw[swatch];}
      }
    }
    return { keys, tokens };
  }

  /**
   * Workbench colors, sorted by key. groups ({ family, roles } each) move their family's keys
   * to other Editor swatches after the roles are applied; edits.keys replaces single keys last.
   * A key edited to 'default' (DEFAULT_COLOR) keeps that value: the settings VS Code reads honor
   * it, and the Lab's preview leaves the key out (media/palette.js themeOf).
   */
  function buildColors(entry, chrome = {}, edits = undefined, groups = []) {
    const sw = swatches(entry, chrome, edits);
    const colors = {};
    for (const [swatch, keys] of Object.entries(KEY_GROUPS)) {
      if (!(swatch in sw)) {throw new Error(`theme-builder: KEY_GROUPS names an unknown swatch '${swatch}'`);}
      for (const key of keys) {
        if (key in colors || key in UNSET_KEYS) {throw new Error(`theme-builder: ${key} is placed twice`);}
        colors[key] = sw[swatch];
      }
    }
    Object.assign(colors, groupValues(sw, groups).keys);
    Object.assign(colors, cleanEdits(edits).keys);
    return Object.fromEntries(Object.keys(colors).sort().map(k => [k, colors[k]]));
  }

  /** The baseline token rules; an Editor text group sets a rule's foreground. */
  function tokenColors(entry, chrome = {}, edits = undefined, groups = []) {
    const sw = swatches(entry, chrome, edits);
    const grouped = groupValues(sw, groups).tokens;
    const rules = [
      { name: 'Keyword', scope: ['keyword', 'storage.type', 'storage.modifier'], settings: { foreground: sw.kw } },
      { name: 'Function', scope: ['entity.name.function', 'support.function'], settings: { foreground: sw.fn } },
      { name: 'String', scope: ['string'], settings: { foreground: sw.str } },
      { name: 'Type', scope: ['entity.name.type', 'entity.name.class', 'support.type', 'support.class'], settings: { foreground: sw.type } },
      { name: 'Number', scope: ['constant.numeric', 'constant.language'], settings: { foreground: sw.num } },
      { name: 'Comment', scope: ['comment'], settings: { foreground: sw.muted, fontStyle: 'italic' } },
    ];
    for (const rule of rules) {
      if (rule.name in grouped) {rule.settings.foreground = grouped[rule.name];}
    }
    return rules;
  }

  function buildTheme(entry, chrome = {}, edits = undefined, groups = []) {
    return {
      $schema: 'vscode://schemas/color-theme',
      name: themeLabel(entry),
      type: 'dark',
      semanticHighlighting: true,
      colors: buildColors(entry, chrome, edits, groups),
      tokenColors: tokenColors(entry, chrome, edits, groups),
    };
  }

  /** The fixed theme the Lab applies candidates to through scoped settings. */
  const LAB_THEME_LABEL = 'GigglyBits Dark (Lab)';
  const LAB_THEME_FILE = 'gigglybits-lab-color-theme.json';

  /**
   * The theme slots a saved library theme binds to. VS Code lists only themes an extension
   * ships as files, so the build ships SLOT_COUNT placeholder themes and a saved theme's
   * colors go into user settings scoped to its slot's label.
   */
  const SLOT_COUNT = 12;
  const slotLabel = n => `GigglyBits Theme ${n}`;
  const slotFile = n => `gigglybits-theme-${n}-color-theme.json`;

  /**
   * Everything the Lab writes to try a candidate live: the theme colors and token rules,
   * scoped to the Lab theme in user settings, with the style groups given. Workspace
   * identity is not part of it.
   */
  function labSettings(entry, chrome = {}, edits = undefined, groups = []) {
    const theme = buildTheme(entry, chrome, edits, groups);
    return { colors: theme.colors, tokenColors: theme.tokenColors };
  }

  return {
    THEME_BACKGROUND, UNSET_KEYS, LEFT_TO_VSCODE, leftToVSCode, GENERIC_SCOPES, ROLE_NAMES, LAB_THEME_LABEL, LAB_THEME_FILE,
    SLOT_COUNT, slotLabel, slotFile,
    KEY_GROUPS, SWATCHES, SWATCH_OF, FRAME_KEYS, GROUP_FAMILIES, ROLE_FAMILIES, TEXT_LEVELS, cleanChrome,
    DEFAULT_COLOR, roleColors, themeLabel, themeFileName, swatches, cleanEdits, buildColors, tokenColors, buildTheme, labSettings,
  };
});
