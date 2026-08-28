
import { launch, visit, check, sleep, finish } from './harness.mjs';

const TOGGLE = ".dt-icon-btn[aria-label='Toggle sidebar']";
const MOBILE = { width: 500, height: 900 };
const DESKTOP = { width: 1200, height: 900 };

const { browser, page } = await launch({ viewport: MOBILE });
await visit(page, '/');

const drawer = () =>
	page.evaluate(() => {
		const sidebar = document.querySelector('.dt-sidebar');
		const scrim = document.querySelector('.dt-sidebar-scrim');
		return {
			mobile: sidebar.dataset.mobile,
			open: sidebar.dataset.openMobile,
			scrim: !!scrim,
			scrimWidth: scrim
				? Math.round(
						scrim.getBoundingClientRect()
							.width,
					)
				: 0,
			offCanvas: Math.round(
				sidebar.getBoundingClientRect().left,
			),
		};
	});

const closed = await drawer();
check('narrow viewport switches to the drawer', closed.mobile === 'true');
check('which starts closed', closed.open !== 'true');
check('with no scrim', !closed.scrim);
check(
	'and the panel off-canvas',
	closed.offCanvas < 0,
	`left=${closed.offCanvas}`,
);

await page.click(TOGGLE);
await sleep(500);
const open = await drawer();
check('the toggle opens the drawer', open.open === 'true');
check('over a scrim', open.scrim);
check(
	'that covers the viewport',
	open.scrimWidth >= MOBILE.width,
	`${open.scrimWidth}px`,
);
check('and the panel slides in', open.offCanvas >= 0, `left=${open.offCanvas}`);

// scrim midpoint sits behind the open drawer
await page.mouse.click(MOBILE.width - 20, MOBILE.height / 2);
await sleep(500);
check('tapping the scrim closes it', (await drawer()).open !== 'true');

await page.click(TOGGLE);
await sleep(400);
await page.setViewport(DESKTOP);
await sleep(700);
const resized = await drawer();
check('crossing to desktop leaves mobile mode', resized.mobile !== 'true');
check(
	'and clears the scrim',
	!resized.scrim,
	'a surviving scrim swallows every click on the page',
);

await page.click('.dt-nav-link');
await sleep(600);
check(
	'so the sidebar is usable again',
	page.url().endsWith('/'),
	page.url().replace('http://localhost:3000', '') || '/',
);

await finish(browser);
