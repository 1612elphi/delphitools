// The header's colour-notation selector, and the service behind it.
//
// The point of the service is that the preference is site-wide: a value copied
// out of one Colour tool has to match the next one, and survive a reload.

import { launch, visit, check, sleep, finish } from './harness.mjs';

const { browser, page } = await launch();

const trigger = '.dt-notation-trigger';
const swatchValue = () =>
	page.$eval('.dt-swatch-value', (el) => el.textContent.trim());

await visit(page, '/tools/palette-genny');
check('a Colour tool shows the selector', await page.$(trigger));
check(
	'and it opens on HEX',
	(await page.$eval(trigger, (el) => el.textContent.trim())) === 'HEX',
);
check('swatches read as hex', /^#[\da-f]{6}$/i.test(await swatchValue()));

await page.click(trigger);
await sleep(250);
const options = await page.$$eval('.dt-notation-option', (els) =>
	els.map((el) => el.textContent.trim()),
);
check('nine notations offered', options.length === 9, options.join(' '));
check(
	'the current one is pressed',
	(
		await page.$$eval('.dt-notation-option', (els) =>
			els
				.filter(
					(el) =>
						el.getAttribute(
							'aria-pressed',
						) === 'true',
				)
				.map((el) => el.textContent.trim()),
		)
	).join() === 'HEX',
);

await page.evaluate(() => {
	[...document.querySelectorAll('.dt-notation-option')]
		.find((el) => el.textContent.trim() === 'OKLCH')
		.click();
});
await sleep(300);
check('choosing closes the popover', !(await page.$('.dt-notation-popover')));
check(
	'the trigger shows the new notation',
	(await page.$eval(trigger, (el) => el.textContent.trim())) === 'OKLCH',
);
check(
	'the tool reformats its swatches',
	/^oklch\(/.test(await swatchValue()),
	await swatchValue(),
);

// Same service, second tool.
await page.evaluate(() => {
	document.querySelector(
		'.dt-nav-link[href="/tools/colour-converter"]',
	)?.click();
});
await sleep(600);
check(
	'colour-converter hides the selector',
	!(await page.$(trigger)),
	'its own format picker sets the notation for what it shows',
);

await page.evaluate(() => {
	document.querySelector(
		'.dt-nav-link[href="/tools/favicon-genny"]',
	)?.click();
});
await sleep(600);
check(
	'a non-Colour tool hides it too',
	!(await page.$(trigger)),
	'favicon-genny is Images & Assets',
);

// Below sm the label drops and the pipette carries the control on its own. The
// rule has to be scoped to the label, because Icon renders a <span> too and a
// bare `span` selector leaves a clickable box with nothing drawn in it.
await visit(page, '/tools/palette-genny');
for (const [width, label] of [
	[420, 'none'],
	[900, 'block'],
]) {
	await page.setViewport({ width, height: 800 });
	await sleep(350);
	const parts = await page.evaluate(() => {
		const button = document.querySelector('.dt-notation-trigger');
		const icon = button.querySelector('.dt-icon');
		return {
			icon: Math.round(icon.getBoundingClientRect().width),
			trigger: Math.round(
				button.getBoundingClientRect().width,
			),
			label: getComputedStyle(
				button.querySelector('.dt-notation-current'),
			).display,
		};
	});
	check(
		`at ${width}px the pipette is drawn`,
		parts.icon > 0 && parts.trigger > parts.icon,
		`icon ${parts.icon}px in a ${parts.trigger}px control`,
	);
	check(
		`at ${width}px the label is ${label}`,
		parts.label === label,
		parts.label,
	);
}
await page.setViewport({ width: 1400, height: 1000 });

// The Next version held this in memory and lost it on reload.
await visit(page, '/tools/palette-genny');
check(
	'the choice survives a reload',
	(await page.$eval(trigger, (el) => el.textContent.trim())) === 'OKLCH',
);
check('and the swatches still reformat', /^oklch\(/.test(await swatchValue()));

await finish(browser);
