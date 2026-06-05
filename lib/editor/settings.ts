// Editor settings — session-only; never persisted to the device.
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

// Clean up any settings a previous build persisted (we store nothing now).
export function clearStoredSettings(): void {
  try {
    localStorage.removeItem("delphitools-editor-settings");
  } catch {
    /* ignore */
  }
}
