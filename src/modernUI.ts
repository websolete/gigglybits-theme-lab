import * as vscode from 'vscode';

/**
 * How VS Code draws the workbench under the settings the Workbench previews copy: floating
 * cards (modern), header and panel-tab casing (uppercase), the editor tab shape (tabStyle) and
 * where the activity bar sits (activityBar). The panels send this to their pages as
 * { type: 'modernUI', modernUI }.
 */
export interface ModernUISettings {
  modern: boolean;
  uppercase: boolean;
  tabStyle: 'connected' | 'pill';
  /** workbench.activityBar.location: 'default' is the side bar at the window's edge. */
  activityBar: 'default' | 'top' | 'bottom' | 'hidden';
}

/** The settings ModernUISettings reads; a change to any of them redraws the previews. */
export const MODERN_UI_SETTINGS = [
  'workbench.experimental.modernUI',
  'workbench.experimental.modernUIUppercaseViewHeaders',
  'workbench.experimental.modernUIEditorTabStyle',
  'workbench.activityBar.location',
] as const;

const ACTIVITY_BAR_PLACES = ['top', 'bottom', 'hidden'] as const;

/** The settings as VS Code applies them, with VS Code's defaults for any left unset. */
export function modernUISettings(): ModernUISettings {
  const config = vscode.workspace.getConfiguration('workbench');
  const modern = config.get<boolean>('experimental.modernUI');
  const uppercase = config.get<boolean>('experimental.modernUIUppercaseViewHeaders');
  const tabStyle = config.get<string>('experimental.modernUIEditorTabStyle');
  const location = config.get<string>('activityBar.location');
  return {
    modern: typeof modern === 'boolean' ? modern : true,
    uppercase: typeof uppercase === 'boolean' ? uppercase : false,
    tabStyle: tabStyle === 'pill' ? 'pill' : 'connected',
    activityBar: (ACTIVITY_BAR_PLACES as readonly string[]).includes(location as string)
      ? (location as ModernUISettings['activityBar'])
      : 'default',
  };
}

/** True when the change touches one of the settings ModernUISettings reads. */
export function affectsModernUI(event: vscode.ConfigurationChangeEvent): boolean {
  return MODERN_UI_SETTINGS.some(id => event.affectsConfiguration(id));
}
