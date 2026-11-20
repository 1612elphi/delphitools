import { BASE, launch, visit, check, finish, sleep } from './harness.mjs';

const { browser, page } = await launch();
await page
	.browserContext()
	.overridePermissions(BASE, [
		'clipboard-read',
		'clipboard-write',
		'clipboard-sanitized-write',
	]);

const field = '.alg-field';
const state = () =>
	page.evaluate(() => ({
		field: document
			.querySelector('.alg-field svg[role="img"]')
			?.getAttribute('aria-label'),
		panel: !!document.querySelector('dialog.canon-math-input[open]'),
		heading: document
			.querySelector('.canon-split-main .canon-heading')
			?.textContent.trim(),
		lines: [
			...document.querySelectorAll('.canon-split-main .canon-value-line'),
		].map((l) => l.textContent.replace(/\s+/g, ' ').trim()),
		status: document
			.querySelector('.canon-split-sidebar .canon-status')
			?.textContent.trim(),
		picture: document
			.querySelector('.alg-picture-svg')
			?.getAttribute('aria-label'),
		glyphs: document.querySelectorAll('.alg-picture-svg g > *').length,
	}));
const clickText = (scope, text) =>
	page.evaluate(
		(scope, text) =>
			[...document.querySelectorAll(`${scope} button`)]
				.find((b) => b.textContent.trim() === text)
				.click(),
		scope,
		text,
	);
// ArrowRight exits power/fraction
const retype = async (...parts) => {
	await page.evaluate(() => document.activeElement?.blur());
	await page.focus(field);
	for (const [index, part] of parts.entries()) {
		if (index) await page.keyboard.press('ArrowRight');
		await page.keyboard.type(part);
	}
	await sleep(50);
	await page.keyboard.press('Enter');
	await sleep(400);
};

await visit(page, '/tools/algebra-calc');
await sleep(500);
check(
	'the split fills the sheet',
	await page.evaluate(
		() =>
			document.querySelector('.dt-canon-tool').getBoundingClientRect()
				.height ===
			document.querySelector('.algebra-calc').getBoundingClientRect()
				.height,
	),
);
const layout = await page.evaluate(() => {
	const input = document.querySelector('.alg-field');
	const first = document.querySelector('.canon-split-sidebar .canon-rows > *');
	return {
		first: first === input,
		size: input.querySelector('svg').getBoundingClientRect().height,
		height: input.getBoundingClientRect().height,
	};
});
check('the expression field opens the settings pane', layout.first);
check('large, at primary height', layout.size >= 24 && layout.height >= 68, `${layout.size}px ${layout.height}px`);
const panes = await page.evaluate(() =>
	['sidebar', 'main'].map((p) =>
		Math.round(document.querySelector(`.algebra-calc .canon-split-${p}`).getBoundingClientRect().width),
	),
);
check('the panes split 50/50', Math.abs(panes[0] - panes[1]) <= 2, panes.join(' '));
let s = await state();
check('empty: the placeholder example shows faint in the picture', s.glyphs > 0 && s.picture.includes('(x+1)^2 - x^2'), s.picture);

await page.focus(field);
await page.keyboard.type('(x+1)^2');
await sleep(300);
s = await state();
check('typing on the field opens the keypad panel', s.panel);
await page.keyboard.press('ArrowRight');
await page.keyboard.type('-x^2');
await sleep(50);
s = await state();
check('simplify answers as you type', s.lines[0]?.includes('2 * x + 1') || s.lines[0]?.includes('2x + 1') || s.lines[0]?.includes('2 x + 1'), s.lines.join(' | '));
check('the result heading names the operation', s.heading === 'Simplified', s.heading);

await page.keyboard.press('Enter');
await sleep(400);
s = await state();
check('Enter closes the panel', !s.panel);
check(
	'and focus returns to the field',
	await page.evaluate(() => document.activeElement?.classList.contains('alg-field')),
);
await page.keyboard.type('7');
await sleep(300);
s = await state();
check('a character typed on the field replaces the expression', s.panel && s.field === '7', s.field);
await page.keyboard.press('Escape');
await sleep(400);
await page.click(field);
await sleep(400);
s = await state();
check('a click opens the panel on the expression', s.panel && s.field === '7', s.field);
await page.keyboard.press('Escape');
await sleep(400);

await clickText('.algebra-calc [aria-label="Operation"]', 'Solve');
await retype('x^2', '-4=0');
s = await state();
check('solve lists each root', s.lines.length === 2 && s.lines[0].includes('2') && s.lines[1].includes('-2'), s.lines.join(' | '));
check('the picture sets the working', s.picture.replaceAll(' ', '').startsWith('x^2-4=0'), s.picture);
check(
	'the variable row shows for solve',
	await page.evaluate(() =>
		[...document.querySelectorAll('.algebra-calc .canon-row-title')].some(
			(t) => t.textContent.trim() === 'Variable',
		),
	),
);
await clickText('.algebra-calc .canon-split-main', 'Copy');
await sleep(300);
let copied = await page.evaluate(() => navigator.clipboard.readText());
check('Copy copies every solution', copied === 'x = 2, x = -2', copied);

await clickText('.algebra-calc [aria-label="Operation"]', 'd/dx');
await retype('x^3');
s = await state();
check('d/dx differentiates', s.lines[0]?.includes('3 * x ^ 2'), s.lines.join());
await clickText('.algebra-calc .canon-split-main', 'Use as input');
check('the result morphs into the input', await page.evaluate(() => document.getAnimations().length > 0));
await sleep(50);
s = await state();
check('Use as input puts the result in the field', s.field === '3 * x ^ 2' && s.lines[0]?.includes('6 * x'), `${s.field} ${s.lines}`);

await clickText('.algebra-calc [aria-label="Operation"]', 'Factor');
await retype('x^3', '-1');
s = await state();
check('factor factors, as iOS does', s.lines[0]?.replaceAll(' ', '').includes('(-1+x)*(1+x+x^2)') && !s.status, `${s.lines} ${s.status}`);

await clickText('.algebra-calc [aria-label="Operation"]', '∫');
await retype('x^2');
s = await state();
check('∫ integrates with a constant', s.lines[0]?.replaceAll(' ', '').includes('(1/3)*x^3+C') && !s.status, `${s.lines} ${s.status}`);

await clickText('.algebra-calc [aria-label="Operation"]', 'Expand');
await page.evaluate(() =>
	document.querySelector('.alg-example[aria-label="(a+b)*(a-b)"]').click(),
);
await sleep(50);
s = await state();
check('an example loads and answers', s.field === '(a+b)*(a-b)' && s.lines[0]?.includes('a ^ 2'), `${s.field} ${s.lines}`);
check(
	'and is marked current',
	await page.$eval('.alg-example[aria-label="(a+b)*(a-b)"]', (b) => b.getAttribute('aria-current') === 'true'),
);

await page.evaluate(() => document.querySelector('.algebra-calc .canon-grid .canon-math-key, .algebra-calc .canon-grid button').click());
await sleep(600);
check('a key opens the keypad sheet', !!(await page.$('dialog[open]')));
await page.keyboard.press('Escape');
await sleep(600);
check('Escape closes it', !(await page.$('dialog[open]')));

await visit(page, '/tools/algebra-calc?algExpr=2*x%2B3%3D7&algOp=solve&algVar=x');
await sleep(500);
s = await state();
check('launch flags', s.field === '2*x+3=7' && s.lines[0]?.includes('2'), `${s.field} ${s.lines}`);

await page.setViewport({ width: 390, height: 844 });
await visit(page, '/tools/algebra-calc');
check(
	'no horizontal scroll on a phone',
	await page.evaluate(
		() =>
			document.documentElement.scrollWidth <=
			document.documentElement.clientWidth,
	),
);

await finish(browser);
