// Not `.prettierrc.mjs`: the root .gitignore has `/.*.mjs` for session scratch
// rigs, which would untrack it.
export default {
	useTabs: true,
	tabWidth: 8,
	overrides: [
		{
			// YAML 1.2 §6.1 forbids tab characters in indentation.
			files: "*.{yml,yaml}",
			options: {
				useTabs: false,
				tabWidth: 2,
			},
		},
	],
};
