import { module, test } from 'qunit';
import { pastedHtml } from 'delphitools-v2/lib/pasted-html';

module('Unit | lib | pasted-html', function () {
	test('rich text keeps its structure and loses scripts and images', function (assert) {
		const out = pastedHtml(
			'<meta charset="utf-8"><!--StartFragment--><h1>Title</h1><p>Some <strong>bold</strong> text<img src="https://example.com/x.png"><script>alert(1)</script></p><!--EndFragment-->',
		);
		assert.strictEqual(
			out,
			'<h1>Title</h1><p>Some <strong>bold</strong> text</p>',
		);
	});

	test('a code editor copy is not rich text', function (assert) {
		assert.strictEqual(
			pastedHtml(
				'<meta charset="utf-8"><div style="color:#ccc"><div><span># Title</span></div><div><span>text</span></div></div>',
			),
			null,
		);
	});

	test('markup with no text is nothing', function (assert) {
		assert.strictEqual(
			pastedHtml('<p><img src="x.png"></p>'),
			null,
		);
	});
});
