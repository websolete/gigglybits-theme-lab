import * as vscode from 'vscode';

/**
 * How VS Code draws the workbench under its modern UI settings, which the Workbench previews
 * copy: floating cards (modern), header and panel-tab casing (uppercase), and the editor tab
 * shape (tabStyle). The panels send this to their pages as { type: 'modernUI', modernUI }.
 */
export interface ModernUISettings {
  modern: boolean;
  uppercase: boolean;
  tabStyle: 'connected' | 'pill';
}

/** The settings ModernUISettings reads; a change to any of them redraws the previews. */
export const MODERN_UI_SETTINGS = [
  'workbench.experimental.modernUI',
  'workbench.experimental.modernUIUppercaseViewHeaders',
  'workbench.experimental.modernUIEditorTabStyle',
] as const;

/** The three settings as VS Code applies them, with VS Code's defaults for any left unset. */
export function modernUISettings(): ModernUISettings {
  const config = vscode.workspace.getConfiguration('workbench');
  const modern = config.get<boolean>('experimental.modernUI');
  const uppercase = config.get<boolean>('experimental.modernUIUppercaseViewHeaders');
  const tabStyle = config.get<string>('experimental.modernUIEditorTabStyle');
  return {
    modern: typeof modern === 'boolean' ? modern : true,
    uppercase: typeof uppercase === 'boolean' ? uppercase : false,
    tabStyle: tabStyle === 'pill' ? 'pill' : 'connected',
  };
}

/** True when the change touches one of the modern UI settings. */
export function affectsModernUI(event: vscode.ConfigurationChangeEvent): boolean {
  return MODERN_UI_SETTINGS.some(id => event.affectsConfiguration(id));
}
