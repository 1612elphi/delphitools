// Every ported tool route renders its own tool.
//
// The gap this closes: a tool whose module fails to export a default component
// is not an error anywhere. loadToolComponent returns undefined, the route
// renders the Coming Soon placeholder, and the build, the lint gates and the
// prerender pass are all still green — prerender only reads the page header,
// which comes from lib/tools.ts rather than from the component. The same is
// true of a tool that throws while rendering: the placeholder is what a visitor
// sees either way.
//
// So: visit every route that has a component file, and assert the placeholder
// is absent and something rendered under it. harness.mjs already counts console
// errors and uncaught exceptions as failures, which is the other half.
//
// Usage: npm start, then node scripts/verify/tools.mjs

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
	// A tool that mounts a canvas, a worker or an editor can take a frame
	// longer than the route transition.
	await sleep(150);

	const seen = await page.evaluate(() => {
		const body = document.querySelector('.dt-tool-body');
		return {
			placeholder: !!document.querySelector('.dt-tool-soon'),
			// The header block is always there; anything after it is the tool.
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
