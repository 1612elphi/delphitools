// Editor settings — persisted separately from the document.
export interface EditorSettings {
  highlightSentence: boolean;
  highlightParagraph: boolean;
  typewriter: boolean;
  dimInactive: boolean;
  showGutter: boolean;
  showMarginLine: boolean;
  codeMode: boolean;
  /** which GutterField ids are shown (modular) */
  enabledFields: string[];
}

export const DEFAULT_SETTINGS: EditorSettings = {
  highlightSentence: false,
  highlightParagraph: false,
  typewriter: false,
  dimInactive: false,
  showGutter: true,
  showMarginLine: true,
  codeMode: false,
  enabledFields: ["words"],
};

const KEY = "delphitools-editor-settings";

export function loadSettings(): EditorSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<EditorSettings>) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: EditorSettings): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* ignore quota / privacy-mode errors */
  }
}
