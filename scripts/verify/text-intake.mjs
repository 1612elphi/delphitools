// usage: npm start, then node scripts/verify/text-intake.mjs

import { launch, visit, check, finish, sleep } from './harness.mjs';

const { browser, page } = await launch();
page.on('dialog', (dialog) => void dialog.accept());

const MD = '# Dropped heading\n\nA paragraph from the file.\n';

const dropText = (selector) =>
	page.evaluate(
		({ selector, text }) => {
			const transfer = new DataTransfer();
			transfer.items.add(new File([text], 'notes.md', { type: 'text/markdown' }));
			document
				.querySelector(selector)
				?.dispatchEvent(new DragEvent('drop', { dataTransfer: transfer, bubbles: true }));
		},
		{ selector, text: MD },
	);

await visit(page, '/tools/markdown-writer');
await page.evaluate(() => {
	const area = document.querySelector('.dt-md textarea');
	area.value = 'an old draft';
	area.dispatchEvent(new Event('input', { bubbles: true }));
});
await dropText('.dt-md');
await sleep(300);
check(
	'Markdown Writer replaces its draft with the dropped file',
	(await page.$eval('.dt-md textarea', (a) => a.value)) === MD,
);

await visit(page, '/tools/text-editor');
await page.waitForSelector('.dt-editor', { timeout: 15000 });
await dropText('.dt-te');
await sleep(500);
const heading = await page.$eval('.dt-editor h1', (h) => h.textContent?.trim()).catch(() => null);
check('Text Editor loads the dropped file as a document', heading === 'Dropped heading', heading ?? 'no h1');

await finish(browser);
