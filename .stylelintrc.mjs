// The app's stylesheets are Sass (Crayon), so the default CSS parser chokes on
// `//` comments and `@use`. postcss-scss handles both.
export default {
	extends: ['stylelint-config-standard'],
	customSyntax: 'postcss-scss',
	// Concept mocks, kept byte-frozen as design reference.
	ignoreFiles: ['docs/**'],
	rules: {
		// Crayon's API is kebab-case functions in a namespace (crayon.font-size);
		// the standard config's CSS-function allowlist does not know about them.
		'function-no-unknown': null,
		// `@use`, `@forward`, `@include`, `@extend`, `@mixin`
		'at-rule-no-unknown': null,
		// ProseMirror owns `.ProseMirror`, `.ProseMirror-selectednode` and
		// `.selectedCell`, and renders a custom `<footnote>` element. We style
		// them; we do not get to rename them.
		'selector-class-pattern': null,
		'selector-type-no-unknown': null,
		// The sticker-wall and .dt-editor rules layer deliberately, and the Pride
		// keyframes are one line per stop on purpose.
		'no-descending-specificity': null,
		'declaration-block-single-line-max-declarations': null,
		// The :root/.dark token block is carried over byte-for-byte from the Next
		// app's globals.css and stays the reference for the whole migration.
		// `oklch(97% .02 90deg)` is spec-equivalent to `oklch(0.97 0.02 90)`, but
		// rewriting it would make every future diff against the parent repo noisy.
		'lightness-notation': null,
		'hue-degree-notation': null,
		// `-webkit-background-clip: text` is deliberate. Autofix once rewrote it to
		// the unprefixed property, which both dropped older WebKit and produced an
		// identical duplicate — the exact failure the @supports guard exists to
		// avoid. The `.pride-*` rules are the only prefixed properties here.
		'property-no-vendor-prefix': null,
		// .dt-editor's "typography refinements" section layers on the base rules
		// on purpose; same for the sticker-wall states.
		'no-duplicate-selectors': null,
		// `html.dark &` inside the dark mixin has its scoping root at the call site.
		'nesting-selector-no-missing-scoping-root': null,
	},
};
