// placeholder passes build, lint, prerender unseen

import { readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, visit, check, finish, sleep } from './harness.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

const toolIds = readdirSync(join(root, 'app/components/tools'))
	.filter((name) => name.endsWith('.gts'))
	.map((name) => name.slice(0, -'.gts'.length))
	.sort();

const { browser, page } = await launch();

check(
	'there are tools to check',
	toolIds.length > 0,
	`${toolIds.length} found`,
);

for (const id of toolIds) {
	await visit(page, `/tools/${id}`);
	// canvas/worker tools render a frame later
	await sleep(150);

	const seen = await page.evaluate(() => {
		const body = document.querySelector('.dt-tool-body');
		return {
			placeholder: !!document.querySelector('.dt-tool-soon'),
			rendered: (body?.children.length ?? 0) > 1,
			markup: (body?.lastElementChild?.className ?? '').slice(
				0,
				40,
			),
		};
	});

	check(
		`${id} renders its tool, not the placeholder`,
		!seen.placeholder && seen.rendered,
		seen.placeholder ? 'Coming Soon' : seen.markup,
	);
}

await finish(browser);
