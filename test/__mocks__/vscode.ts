// The slice of the vscode API that src/themeSource.ts reads, driven by `mockState`.
// jest.config.js maps the `vscode` import to this file.

export enum ColorThemeKind {
  Light = 1,
  Dark = 2,
  HighContrast = 3,
  HighContrastLight = 4,
}

export interface MockExtension {
  id: string;
  extensionPath: string;
  packageJSON: unknown;
}

export const mockState = {
  kind: ColorThemeKind.Dark as ColorThemeKind,
  extensions: [] as MockExtension[],
  /** "section.key" -> value at the user (global) level. */
  userSettings: {} as Record<string, unknown>,
  /** "section.key" -> value at the workspace level. */
  workspaceSettings: {} as Record<string, unknown>,
};

export function resetMockState(): void {
  mockState.kind = ColorThemeKind.Dark;
  mockState.extensions = [];
  mockState.userSettings = {};
  mockState.workspaceSettings = {};
}

export const window = {
  get activeColorTheme() {
    return { kind: mockState.kind };
  },
};

export const extensions = {
  get all() {
    return mockState.extensions;
  },
};

export const workspace = {
  getConfiguration(section: string) {
    const id = (key: string) => `${section}.${key}`;
    return {
      get<T>(key: string): T | undefined {
        const k = id(key);
        return (k in mockState.workspaceSettings ? mockState.workspaceSettings[k] : mockState.userSettings[k]) as T | undefined;
      },
      inspect<T>(key: string) {
        const k = id(key);
        return {
          key: k,
          globalValue: mockState.userSettings[k] as T | undefined,
          workspaceValue: mockState.workspaceSettings[k] as T | undefined,
        };
      },
    };
  },
};
