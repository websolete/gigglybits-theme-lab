// Every color VS Code and its built-in extensions register (test/fixtures/vscode-colors.json,
// refreshed with `npm run colors:snapshot`) has exactly one decision: the theme sets it
// (KEY_GROUPS), draws it but leaves it unset on purpose (UNSET_KEYS), or leaves it to VS Code
// with a reason (LEFT_TO_VSCODE). After a VS Code update, this test names each new color.

/* eslint-disable @typescript-eslint/no-require-imports */
const TB = require('../scripts/theme-builder.js');
const snapshot: { vscodeVersion: string; ids: string[] } = require('./fixtures/vscode-colors.json');

/** Which of the three decisions hold the id. */
function decisionsFor(
  id: string,
  groups: Record<string, readonly string[]>,
  unset: Record<string, string>,
  left: readonly { keys: readonly string[]; prefixes: readonly string[]; except: readonly string[] }[],
): string[] {
  const out: string[] = [];
  if (Object.values(groups).some(keys => keys.includes(id))) {out.push('KEY_GROUPS');}
  if (id in unset) {out.push('UNSET_KEYS');}
  const inLeft = left.some(g => g.keys.includes(id) || (g.prefixes.some(p => id.startsWith(`${p}.`)) && !g.except.includes(id)));
  if (inLeft) {out.push('LEFT_TO_VSCODE');}
  return out;
}

describe('theme coverage of every VS Code color', () => {
  const check = (left = TB.LEFT_TO_VSCODE) => {
    const none: string[] = [];
    const many: string[] = [];
    for (const id of snapshot.ids) {
      const d = decisionsFor(id, TB.KEY_GROUPS, TB.UNSET_KEYS, left);
      if (d.length === 0) {none.push(id);}
      if (d.length > 1) {many.push(`${id} (${d.join(', ')})`);}
    }
    return { none, many };
  };

  it('{#coverage} gives every snapshot color exactly one decision', () => {
    expect(snapshot.ids.length).toBeGreaterThan(900);
    // An id listed under "none" needs a decision: set it in KEY_GROUPS and draw it in the
    // gallery, or add it to LEFT_TO_VSCODE with a reason.
    expect(check()).toEqual({ none: [], many: [] });
  });

  it('gives each left-to-VS-Code group an area and a reason, and lists only ids the theme sets in except', () => {
    const grouped = new Set(Object.values(TB.KEY_GROUPS as Record<string, string[]>).flat());
    for (const g of TB.LEFT_TO_VSCODE) {
      expect({ area: g.area, ok: Boolean(g.area && g.reason && (g.keys.length || g.prefixes.length)) }).toEqual({ area: g.area, ok: true });
      for (const id of g.except) {expect({ area: g.area, id, set: grouped.has(id) }).toEqual({ area: g.area, id, set: true });}
    }
  });

  it('names an id with its decision removed', () => {
    const id = 'debugIcon.breakpointForeground';
    expect(snapshot.ids).toContain(id);
    const without = TB.LEFT_TO_VSCODE.map((g: { prefixes: string[] }) => ({ ...g, prefixes: g.prefixes.filter((p: string) => p !== 'debugIcon') }));
    expect(check(without).none).toContain(id);
  });
});
