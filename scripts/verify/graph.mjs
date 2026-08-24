// needs npm start first

import { launch, visit, check, finish, sleep } from './harness.mjs';

const { browser, page } = await launch();

// typing appends; set+input replaces
async function setExpression(text) {
	await page.evaluate((value) => {
		const input = document.querySelector('.dt-graph-input');
		input.value = value;
		input.dispatchEvent(new Event('input', { bubbles: true }));
	}, text);
	await sleep(1200);
}

function readCurve() {
	return page.evaluate(() => {
		const path = document.querySelector('.dt-graph-curve');
		const error = document
			.querySelector('.dt-graph-error')
			?.textContent?.replace(/\s+/g, ' ')
			.trim();
		if (!path) return { drawn: false, error };
		const d = path.getAttribute('d') ?? '';
		const ys = d
			.replace(/^M/, '')
			.split(/[ML]/)
			.join(',')
			.split(',')
			.map(Number)
			.filter((_, i) => i % 2 === 1);
		return {
			drawn: true,
			expression: document.querySelector('.dt-graph-input')
				?.value,
			subpaths: (d.match(/M/g) ?? []).length,
			points: ys.length,
			span: Math.round(Math.max(...ys) - Math.min(...ys)),
			error,
		};
	});
}

await visit(page, '/tools/graph-calc');
await sleep(500);

// mathjs ~700kb, loads dynamic
const initial = await readCurve();
check(
	'the default entry plots once mathjs loads',
	initial.drawn && initial.points > 100,
	`${initial.expression}: ${initial.points} points`,
);

const surface = await page.evaluate(() => ({
	axes: document.querySelectorAll('.dt-graph-axes *').length,
	grid: document.querySelectorAll('.dt-graph-grid *').length,
	ticks: document.querySelectorAll('.dt-graph-ticks *').length,
}));
check(
	'the plane carries axes, grid and tick labels',
	surface.axes > 0 && surface.grid > 0 && surface.ticks > 0,
	`axes ${surface.axes}, grid ${surface.grid}, ticks ${surface.ticks}`,
);

await setExpression('sin(x)');
const sin = await readCurve();
check(
	'a new expression replaces the curve',
	sin.expression === 'sin(x)' && !sin.error && sin.points > 100,
	`${sin.points} points, ${sin.span} px tall ${sin.error ?? ''}`,
);

// 6 poles → 7 runs
await setExpression('tan(x)');
const tan = await readCurve();
check(
	'tan(x) breaks at every asymptote',
	tan.subpaths === 7,
	`${tan.subpaths} subpaths ${tan.error ?? ''}`,
);

await setExpression('1/x');
const inverse = await readCurve();
check(
	'and 1/x breaks at zero',
	inverse.subpaths === 2,
	`${inverse.subpaths} subpaths ${inverse.error ?? ''}`,
);

await setExpression('sqrt(');
const broken = await readCurve();
check(
	'an expression that does not compile says so',
	!!broken.error,
	broken.error ?? 'no error shown',
);

// pan/zoom shifts range bounds

await setExpression('sin(x)');
const ranges = () =>
	page.$$eval('.dt-graph-range input', (els) =>
		els.map((el) => el.value),
	);

const centre = await page.$eval('.dt-graph-plot', (svg) => {
	const box = svg.getBoundingClientRect();
	return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
});

const atRest = await ranges();
await page.mouse.move(centre.x, centre.y);
await page.mouse.down();
await page.mouse.move(centre.x - 90, centre.y - 50, { steps: 10 });
await page.mouse.up();
await sleep(300);
const panned = await ranges();
check(
	'dragging pans the plane',
	panned.join() !== atRest.join(),
	`${atRest.join(' ')} -> ${panned.join(' ')}`,
);

await page.mouse.move(centre.x, centre.y);
await page.mouse.wheel({ deltaY: -300 });
await sleep(400);
const zoomed = await ranges();
check(
	'and the wheel zooms it',
	zoomed.join() !== panned.join(),
	`${panned.join(' ')} -> ${zoomed.join(' ')}`,
);

await finish(browser);
