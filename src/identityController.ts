// The VS Code side of workspace identity: the first-open offer, the Set, Next and Clear
// commands, rewriting a hue identity when the theme or the chosen regions change, and, once
// at start-up, rewriting an identity whose overlay is missing a key or its "[GigglyBits*]"
// copy (overlayIncomplete). The color and settings math lives in src/identity.ts.
import * as vscode from 'vscode';
import { captureThemeSnapshot } from './themeSource';
import {
  DEFAULT_ACCENT, IDENTITY_REGIONS, harmonizedFill, identityOverlay, nextHue, overlayIncomplete, shouldOffer,
  suggestionHues, withIdentity, withoutIdentity, workspaceHue,
} from './identity';

const SECTION = 'gigglybits.identity';
const DECLINED_KEY = 'gigglybits.identity.declined';
const NO_FOLDER = 'Open a folder to set its color.';
const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

type Settings = Record<string, unknown>;
/** What onDidChange reports: an identity setting changed, or the active color theme did. */
type IdentityChange = 'identity' | 'theme';

/** '#abc' or 'abc' to '#aabbcc', or undefined when the text is not a hex color. */
function normalizeHex(text: string): string | undefined {
  const m = HEX.exec(text.trim());
  if (!m) { return undefined; }
  const hex = m[1].length === 3 ? m[1].split('').map(c => c + c).join('') : m[1];
  return '#' + hex.toLowerCase();
}

export class IdentityController {
  /** Set while this controller writes settings, so its own writes do not trigger a rewrite. */
  private writing = false;
  /**
   * onDidChange's listeners. A plain set rather than vscode.EventEmitter: scripts/smoke-bundle.js
   * activates the bundle against a stub vscode module that has no EventEmitter.
   */
  private readonly listeners = new Set<(kind: IdentityChange) => void>();

  constructor(private readonly context: vscode.ExtensionContext) {}

  /** Fires 'identity' on any gigglybits.identity setting change, our own writes included, and 'theme' on a theme change. */
  readonly onDidChange: vscode.Event<IdentityChange> = (listener, thisArgs?, disposables?) => {
    const bound = (kind: IdentityChange) => listener.call(thisArgs, kind);
    this.listeners.add(bound);
    const disposable = { dispose: () => { this.listeners.delete(bound); } };
    disposables?.push(disposable);
    return disposable;
  };

  private fire(kind: IdentityChange): void {
    for (const listener of [...this.listeners]) { listener(kind); }
  }

  register(): void {
    this.context.subscriptions.push(
      vscode.commands.registerCommand('gigglybits.identity.set', () => this.runSafely(() => this.set())),
      vscode.commands.registerCommand('gigglybits.identity.next', () => this.runSafely(() => this.next())),
      vscode.commands.registerCommand('gigglybits.identity.clear', () => this.runSafely(() => this.clear())),
      vscode.window.onDidChangeActiveColorTheme(() => {
        this.fire('theme');
        return this.runSafely(() => this.refresh(false));
      }),
      vscode.workspace.onDidChangeConfiguration(e => {
        if (!this.writing && e.affectsConfiguration(`${SECTION}.regions`)) { void this.runSafely(() => this.refresh(true)); }
      }),
      // No writing guard here: pin() writes through guarded(), and the Theme Lab must still hear it.
      vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration(SECTION)) { this.fire('identity'); }
      }),
    );
    void this.runSafely(() => this.repair());
    void this.runSafely(() => this.offer());
  }

  /**
   * Rewrites a set identity whose overlay is incomplete, such as one missing its "[GigglyBits*]"
   * copy, which refresh() never restores for a pinned color. A complete overlay is left alone.
   */
  private async repair(): Promise<void> {
    if (!this.hasFolder()) { return; }
    const pinned = this.pinnedColor();
    const hue = this.hue();
    if (!pinned && hue === undefined) { return; }
    if (!overlayIncomplete(this.colorCustomizations(), this.regions())) { return; }
    await this.guarded(async () => this.writeOverlay(pinned ?? await this.fillFor(hue as number)));
  }

  /** This workspace's identity fill and regions, or undefined with no folder or no identity. */
  async current(): Promise<{ fill: string; regions: string[] } | undefined> {
    if (!this.hasFolder()) { return undefined; }
    const pinned = this.pinnedColor();
    if (pinned) { return { fill: pinned, regions: this.regions() }; }
    const hue = this.hue();
    if (hue !== undefined) { return { fill: await this.fillFor(hue), regions: this.regions() }; }
    return undefined;
  }

  /** Pins a color chosen elsewhere, such as the Palette Lab's Use as this workspace's identity. */
  async pin(color: string): Promise<void> {
    const hex = normalizeHex(color);
    if (!hex) { throw new Error(`Not a hex color: ${color}`); }
    if (!this.hasFolder()) { vscode.window.showInformationMessage(NO_FOLDER); return; }
    await this.write({ pinnedColor: hex });
    vscode.window.showInformationMessage(`Workspace color set to ${hex}.`);
  }

  private async runSafely(action: () => Promise<void>): Promise<void> {
    try {
      await action();
    } catch (err) {
      vscode.window.showErrorMessage(`GigglyBits workspace color: ${(err as Error).message}`);
    }
  }

  private hasFolder(): boolean {
    return !!vscode.workspace.workspaceFolders?.length;
  }

  private folderHue(): number {
    return workspaceHue(vscode.workspace.name ?? '');
  }

  private config(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration(SECTION);
  }

  private hue(): number | undefined {
    const v = this.config().inspect<number>('hue')?.workspaceValue;
    return typeof v === 'number' ? v : undefined;
  }

  private pinnedColor(): string | undefined {
    const v = this.config().inspect<string>('pinnedColor')?.workspaceValue;
    return typeof v === 'string' ? normalizeHex(v) : undefined;
  }

  private regions(): string[] {
    const v = this.config().get<unknown>('regions');
    return Array.isArray(v) ? IDENTITY_REGIONS.filter(r => v.includes(r)) : [...IDENTITY_REGIONS];
  }

  private colorCustomizations(): unknown {
    return vscode.workspace.getConfiguration('workbench').inspect<Settings>('colorCustomizations')?.workspaceValue;
  }

  /** The active theme's focusBorder and editor background, user settings first. */
  private async themeColors(): Promise<{ accent: string; background?: string }> {
    const snap = await captureThemeSnapshot();
    const pick = (key: string) => snap.userColors[key]?.value ?? snap.themeColors[key]?.value;
    return { accent: pick('focusBorder') ?? DEFAULT_ACCENT, background: pick('editor.background') };
  }

  private async fillFor(hue: number): Promise<string> {
    return harmonizedFill(hue, (await this.themeColors()).accent);
  }

  private async offer(): Promise<void> {
    if (!this.hasFolder()) { return; }
    const offerOnOpen = this.config().get<boolean>('offerOnOpen') !== false;
    const declined = this.context.workspaceState.get<boolean>(DECLINED_KEY) === true;
    if (!shouldOffer({ colorCustomizations: this.colorCustomizations(), hue: this.hue(), pinnedColor: this.pinnedColor(), declined, offerOnOpen })) {
      return;
    }
    const hue = this.folderHue();
    const fill = await this.fillFor(hue);
    const choice = await vscode.window.showInformationMessage(
      `Give this workspace its own color, ${fill}? It colors the title bar, activity bar, status bar and tab borders.`,
      'Accept', 'Pick another', 'Not here',
    );
    if (choice === 'Accept') {
      await this.write({ hue });
    } else if (choice === 'Pick another') {
      await this.set();
    } else if (choice === 'Not here') {
      await this.context.workspaceState.update(DECLINED_KEY, true);
    }
  }

  private async set(): Promise<void> {
    if (!this.hasFolder()) { vscode.window.showInformationMessage(NO_FOLDER); return; }
    const { accent } = await this.themeColors();
    const current = this.hue();
    const custom = { label: '$(edit) Custom color...', description: 'Enter a hex color; it stays as entered across themes' };
    const items: (vscode.QuickPickItem & { hue?: number })[] = suggestionHues(current ?? this.folderHue()).map(hue => ({
      label: harmonizedFill(hue, accent),
      description: hue === current ? `hue ${hue}, current` : `hue ${hue}`,
      hue,
    }));
    const picked = await vscode.window.showQuickPick([...items, custom], {
      title: 'Set Workspace Color',
      placeHolder: 'Pick a color for this workspace. Suggestions follow the active theme.',
    });
    if (!picked) { return; }
    if (picked === custom) {
      const text = await vscode.window.showInputBox({
        title: 'Custom workspace color',
        prompt: 'A hex color such as #336699',
        value: this.pinnedColor() ?? '',
        validateInput: v => (normalizeHex(v) ? undefined : 'Enter a hex color: #rgb or #rrggbb.'),
      });
      const hex = text === undefined ? undefined : normalizeHex(text);
      if (hex) { await this.write({ pinnedColor: hex }); }
      return;
    }
    await this.write({ hue: (picked as { hue: number }).hue });
  }

  private async next(): Promise<void> {
    if (!this.hasFolder()) { vscode.window.showInformationMessage(NO_FOLDER); return; }
    await this.write({ hue: nextHue(this.hue() ?? this.folderHue()) });
  }

  private async clear(): Promise<void> {
    if (!this.hasFolder()) { vscode.window.showInformationMessage(NO_FOLDER); return; }
    await this.guarded(async () => {
      await this.config().update('hue', undefined, vscode.ConfigurationTarget.Workspace);
      await this.config().update('pinnedColor', undefined, vscode.ConfigurationTarget.Workspace);
      await this.writeColors(withoutIdentity(this.colorCustomizations()));
    });
    await this.context.workspaceState.update(DECLINED_KEY, true);
  }

  /** Rewrites the overlay for the active theme: a hue identity always, a pinned one only when regions changed. */
  private async refresh(regionsChanged: boolean): Promise<void> {
    if (!this.hasFolder()) { return; }
    const pinned = this.pinnedColor();
    const hue = this.hue();
    if (pinned && regionsChanged) {
      await this.guarded(() => this.writeOverlay(pinned));
    } else if (!pinned && hue !== undefined) {
      await this.guarded(async () => this.writeOverlay(await this.fillFor(hue)));
    }
  }

  /** Stores a hue identity (clearing any pin) or a pinned color, then writes its overlay. */
  private async write(identity: { hue: number } | { pinnedColor: string }): Promise<void> {
    await this.guarded(async () => {
      const cfg = this.config();
      if ('hue' in identity) {
        await cfg.update('hue', identity.hue, vscode.ConfigurationTarget.Workspace);
        await cfg.update('pinnedColor', undefined, vscode.ConfigurationTarget.Workspace);
        await this.writeOverlay(await this.fillFor(identity.hue));
      } else {
        await cfg.update('pinnedColor', identity.pinnedColor, vscode.ConfigurationTarget.Workspace);
        await this.writeOverlay(identity.pinnedColor);
      }
    });
  }

  private async writeOverlay(fill: string): Promise<void> {
    const { background } = await this.themeColors();
    await this.writeColors(withIdentity(this.colorCustomizations(), identityOverlay(fill, this.regions(), background)));
  }

  /** Writes the workspace colorCustomizations only when the value actually changes. */
  private async writeColors(next: Settings): Promise<void> {
    const current = this.colorCustomizations();
    if (JSON.stringify(current ?? {}) === JSON.stringify(next)) { return; }
    const value = Object.keys(next).length ? next : undefined;
    await vscode.workspace.getConfiguration('workbench').update('colorCustomizations', value, vscode.ConfigurationTarget.Workspace);
  }

  private async guarded(action: () => Promise<void>): Promise<void> {
    this.writing = true;
    try {
      await action();
    } finally {
      this.writing = false;
    }
  }
}
