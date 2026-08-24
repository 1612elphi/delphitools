import { launch, visit, check, sleep, finish } from './harness.mjs';

const TOGGLE = ".dt-icon-btn[aria-label='Toggle sidebar']";

const { browser, page } = await launch({
	viewport: { width: 1400, height: 1000 },
});
await visit(page, '/');

const shell = await page.evaluate(() => ({
	sidebar: !!document.querySelector('.dt-sidebar'),
	header: !!document.querySelector('.dt-header'),
	navLinks: document.querySelectorAll('.dt-nav-link').length,
	groups: document.querySelectorAll('.dt-nav-group').length,
	title: document
		.querySelector('.dt-header-title h1')
		?.textContent.trim(),
	theme: !!document.querySelector(
		".dt-icon-btn[aria-label='Toggle theme']",
	),
}));
check('sidebar and header render', shell.sidebar && shell.header);
check('every tool has a nav link', shell.navLinks >= 55, `${shell.navLinks}`);
check('links are grouped by category', shell.groups >= 5, `${shell.groups}`);
check('the home route names itself', shell.title === 'Home', shell.title);
check('the theme toggle is present', shell.theme);

await page.type('.dt-search-input', 'palette');
await sleep(400);
const filtered = await page.evaluate(() => ({
	links: [...document.querySelectorAll('.dt-nav-label')].map((el) =>
		el.textContent.trim(),
	),
	groups: [...document.querySelectorAll('.dt-nav-group-label')].map(
		(el) => el.textContent.trim(),
	),
}));
check(
	'search narrows the list',
	filtered.links.length > 0 && filtered.links.length < shell.navLinks,
	`${filtered.links.length} of ${shell.navLinks}`,
);
check(
	'and every survivor matches',
	filtered.links.every((label) => /palette/i.test(label)),
	filtered.links.join(', '),
);
check(
	'empty groups are dropped',
	filtered.groups.length < shell.groups,
	filtered.groups.join(', '),
);

await page.click('.dt-search-clear');
await sleep(300);
check(
	'clearing restores the full list',
	(await page.$$eval('.dt-nav-link', (els) => els.length)) ===
		shell.navLinks,
);

const rail = () =>
	page.evaluate(() => {
		const el = document.querySelector('.dt-sidebar');
		return {
			state: el.dataset.state,
			width: Math.round(el.getBoundingClientRect().width),
			labels: getComputedStyle(
				document.querySelector('.dt-nav-label'),
			).display,
		};
	});

const expanded = await rail();
check('starts expanded', expanded.state === 'expanded', expanded.state);

await page.click(TOGGLE);
await sleep(500);
const collapsed = await rail();
check('the toggle collapses it', collapsed.state === 'collapsed');
check(
	'to an icon rail',
	collapsed.width < expanded.width / 2,
	`${expanded.width} -> ${collapsed.width}`,
);
check('with the labels hidden', collapsed.labels === 'none');

check(
	'and the rail persists to a cookie',
	await page.evaluate(() => /sidebar_state=false/.test(document.cookie)),
	await page.evaluate(() => document.cookie),
);

await page.click(TOGGLE);
await sleep(400);
check('and expands again', (await rail()).state === 'expanded');

await visit(page, '/tools/px-to-rem');
const tool = await page.evaluate(() => ({
	title: document
		.querySelector('.dt-header-title h1')
		?.textContent.trim(),
	badge: document.querySelector('.dt-badge')?.textContent.trim(),
	active: document
		.querySelector('.dt-nav-link.active .dt-nav-label')
		?.textContent.trim(),
	headers: document.querySelectorAll('.dt-header').length,
}));
check('a tool route names the tool', tool.title === 'PX to REM', tool.title);
check('and shows its category', tool.badge === 'Typography & Text', tool.badge);
check(
	'and marks the nav link active',
	tool.active === 'PX to REM',
	tool.active,
);
check('exactly one header', tool.headers === 1, `${tool.headers}`);

await page.goto('http://localhost:3000/nope', { waitUntil: 'networkidle2' });
await sleep(600);
check(
	'an unknown route renders the 404',
	await page.$('.dt-404'),
	await page.$eval('.dt-404 h1', (el) => el.textContent.trim()),
);

await visit(page, '/tools/px-to-rem');

// lucide-static bakes 24px attrs
const icons = await page.$$eval(
	'.dt-nav-link .dt-icon svg, .dt-header-icon svg',
	(els) =>
		els
			.slice(0, 6)
			.map((el) =>
				Math.round(el.getBoundingClientRect().width),
			),
);
check(
	'icons size to their wrapper, not to the SVG attribute',
	icons.length > 0 && icons.every((w) => w !== 24),
	icons.join(' '),
);

check(
	'body text uses the self-hosted face',
	await page.evaluate(() =>
		getComputedStyle(document.body).fontFamily.includes(
			'iA Writer',
		),
	),
	await page.evaluate(
		() => getComputedStyle(document.body).fontFamily.split(',')[0],
	),
);

// crayon.sr-only uses deprecated clip
const srOnly = await page.evaluate(() => {
	const el = document.querySelector('.dt-sr-only');
	if (!el) return null;
	const r = el.getBoundingClientRect();
	return {
		w: Math.round(r.width),
		h: Math.round(r.height),
		clip: getComputedStyle(el).clipPath,
	};
});
check(
	'screen-reader-only text is clipped, not merely small',
	srOnly && srOnly.w <= 1 && srOnly.h <= 1 && srOnly.clip !== 'none',
	JSON.stringify(srOnly),
);

await page.setViewport({ width: 500, height: 900 });
await sleep(400);
check(
	'the header badge drops out on a narrow viewport',
	(await page.$eval(
		'.dt-header-title .dt-badge',
		(el) => getComputedStyle(el).display,
	)) === 'none',
);

await finish(browser);
