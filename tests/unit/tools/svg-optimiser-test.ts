import { module, test } from 'qunit';
import { stripRootDimensions } from 'delphitools-v2/components/tools/svg-optimiser';

const NESTED =
	'<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100">' +
	'<svg x="10" y="10" width="50" height="50" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>' +
	'</svg>';

module('Unit | Tool | svg-optimiser', function () {
	test('the root loses width and height when it has a viewBox', function (assert) {
		const out = stripRootDimensions(NESTED);
		assert.false(/^<svg[^>]*\swidth=/.test(out), 'root width gone');
		assert.false(
			/^<svg[^>]*\sheight=/.test(out),
			'root height gone',
		);
		assert.true(
			out.includes('viewBox="0 0 200 100"'),
			'root viewBox kept',
		);
	});

	test('a nested svg keeps its width and height (#46)', function (assert) {
		const out = stripRootDimensions(NESTED);
		assert.true(
			out.includes(
				'<svg x="10" y="10" width="50" height="50"',
			),
			out,
		);
	});

	test('a root without a viewBox keeps its dimensions', function (assert) {
		const svg =
			'<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"/>';
		assert.strictEqual(stripRootDimensions(svg), svg);
	});

	test('unparseable input comes back unchanged', function (assert) {
		assert.strictEqual(stripRootDimensions('nope'), 'nope');
	});
});
