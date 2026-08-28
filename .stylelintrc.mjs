// scss needs postcss-scss
export default {
	extends: ['stylelint-config-standard'],
	customSyntax: 'postcss-scss',
	ignoreFiles: ['docs/**'],
	rules: {
		// crayon functions use namespaces
		'function-no-unknown': null,
		'at-rule-no-unknown': null,
		// prosemirror owns these selectors
		'selector-class-pattern': null,
		'selector-type-no-unknown': null,
		// intentional selector layering
		'no-descending-specificity': null,
		'declaration-block-single-line-max-declarations': null,
		// preserve next css parity
		'lightness-notation': null,
		'hue-degree-notation': null,
		// old webkit needs prefix
		'property-no-vendor-prefix': null,
		// intentional selector layering
		'no-duplicate-selectors': null,
		// mixins scope at call sites
		'nesting-selector-no-missing-scoping-root': null,
	},
};
