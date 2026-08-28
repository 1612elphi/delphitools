import { module, test } from 'qunit';
import { sealSvgSeams } from 'delphitools-v2/components/tools/qr-genny';

const SVG =
	'<svg xmlns="http://www.w3.org/2000/svg">' +
	'<rect width="4" height="4" fill="#7c3aed"/>' +
	'<path d="M0 0h2v2z" fill="url(#g)"/>' +
	'<rect width="1" height="1" fill="none"/>' +
	'<circle r="1" fill="#000" stroke="#fff"/>' +
	'</svg>';

module('Unit | Tool | qr-genny', function () {
	test('filled shapes gain a same-colour outline', function (assert) {
		const out = sealSvgSeams(SVG);
		assert.true(
			out.includes(
				'<rect width="4" height="4" fill="#7c3aed" stroke="#7c3aed" stroke-width="0.5"/>',
			),
			out,
		);
	});

	test('gradient fills stroke with the same reference', function (assert) {
		assert.true(sealSvgSeams(SVG).includes('stroke="url(#g)"'));
	});

	test('fill=none and shapes with their own stroke stay untouched', function (assert) {
		const out = sealSvgSeams(SVG);
		assert.true(
			out.includes(
				'<rect width="1" height="1" fill="none"/>',
			),
		);
		assert.true(out.includes('stroke="#fff"'));
		assert.false(out.includes('fill="#000" stroke="#000"'));
	});

	test('the stroke width is adjustable', function (assert) {
		assert.true(sealSvgSeams(SVG, 1).includes('stroke-width="1"'));
	});

	test('unparseable input comes back unchanged', function (assert) {
		assert.strictEqual(sealSvgSeams('not svg'), 'not svg');
	});
});
