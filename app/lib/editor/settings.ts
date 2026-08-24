// session settings only
export interface EditorSettings {
	highlightSentence: boolean;
	highlightParagraph: boolean;
	typewriter: boolean;
	dimInactive: boolean;
	showGutter: boolean;
	showMarginLine: boolean;
	codeMode: boolean;
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
	enabledFields: ['words'],
};

// remove legacy storage
export function clearStoredSettings(): void {
	try {
		localStorage.removeItem('delphitools-editor-settings');
	} catch {}
}
