import { launch, visit, check, finish, sleep } from './harness.mjs';

const { browser, page } = await launch();
await visit(page, '/tools/cron-builder');

const settle = () => sleep(200);

const setBox = (value) =>
	page.$eval('.dt-cb-expr', (el, v) => {
		el.value = v;
		el.dispatchEvent(new Event('input', { bubbles: true }));
	}, value);

const boxValue = () => page.$eval('.dt-cb-expr', (el) => el.value);
const canon = () => page.$eval('.dt-cb-canon', (el) => el.textContent.trim());
const desc = () => page.$eval('.dt-cb-desc', (el) => el.textContent.trim());

const runs = () =>
	page.$$eval('.dt-cb-run', (els) =>
		els.map((el) => {
			const t = el.textContent.trim();
			const day = /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun),/.exec(t)?.[1] ?? null;
			const tm = /(\d{1,2}):(\d{2})\s*(AM|PM)?/i.exec(t);
			if (!tm) return { day, hour: -1, minute: -1 };
			let hour = parseInt(tm[1], 10);
			const minute = parseInt(tm[2], 10);
			if (/pm/i.test(tm[3] ?? '') && hour !== 12) hour += 12;
			if (/am/i.test(tm[3] ?? '') && hour === 12) hour = 0;
			return { day, hour, minute };
		}),
	);
check(
	'the box starts at the default expression',
	(await boxValue()) === '30 9 * * MON-FRI',
);
check(
	'the canonical line normalises the day names',
	(await canon()) === '30 9 * * 1-5',
);
check(
	'the description reads the default in plain language',
	(await desc()) === 'At 09:30 on weekdays',
);
const labelText = await page.$eval('.dt-cb-runs-label', (el) =>
	el.textContent.replace(/\s+/g, ' ').trim(),
);
check(
	'five next runs are listed, timezone named',
	(await page.$$eval('.dt-cb-run', (els) => els.length)) === 5 &&
		/\(.+\)/.test(labelText),
	labelText,
);
await page.click('[aria-label="Step (Minute)"]');
await settle();
check(
	'picking the Step preset rewrites the expression',
	(await canon()) === '*/5 9 * * 1-5',
);
check(
	'the description follows the builder',
	(await desc()) === 'Every 5 minutes during hour 9 on weekdays',
);
check(
	'the active minute mode is Step',
	await page.$eval(
		'.dt-cb-cell[data-field="minute"] [aria-label="Step (Minute)"]',
		(el) => el.getAttribute('aria-pressed'),
	).then((v) => v === 'true'),
);
await setBox('*/15 9-17 * * 1-5');
await settle();
check(
	'a pasted five-field expression lands in the cells',
	(await page.$eval(
		'.dt-cb-cell[data-field="minute"] .dt-cb-free',
		(el) => el.value,
	)) === '*/15' &&
		(await page.$eval(
			'.dt-cb-cell[data-field="dow"] .dt-cb-free',
			(el) => el.value,
		)) === '1-5',
);
check(
	'the reading mentions weekdays',
	(await desc()).includes('weekdays'),
	await desc(),
);
const nextFive = await runs();
check(
	'next runs stay Mon–Fri at :00/:15/:30/:45 within 9–17',
	nextFive.length === 5 &&
		nextFive.every(
			(r) =>
				['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].includes(r.day) &&
				r.hour >= 9 &&
				r.hour <= 17 &&
				[0, 15, 30, 45].includes(r.minute),
		),
	JSON.stringify(nextFive),
);
await setBox('0 9 * MON 1');
await settle();
check(
	'a name in the wrong field is named with its reason',
	await page.$$eval('.dt-cb-error-row', (rows) =>
		rows.some(
			(row) =>
				row
					.querySelector('.dt-cb-error-field')
					?.textContent.trim() === 'Month' &&
				row
					.querySelector('.dt-cb-error-text')
					?.textContent.includes('Wrong field'),
		),
	),
);
check(
	'the failing cell carries the error state too',
	await page.$eval('.dt-cb-cell[data-field="month"]', (el) =>
		el.classList.contains('is-error'),
	),
);
check(
	'no canonical line while the expression is broken',
	(await page.$('.dt-cb-canon')) === null,
);
check(
	'copy refuses an invalid expression',
	await page.$eval('.dt-cb-btn', (el) => el.disabled),
);
await setBox('*/15 9-17 * * 1-5');
await settle();
await page.click('.dt-cb-btn');
check(
	'copy arms: the button shows the copied state',
	await page
		.waitForFunction(
			() =>
				document
					.querySelector('.dt-cb-btn')
					?.textContent.includes('Copied'),
			{ timeout: 2000 },
		)
		.then(() => true)
		.catch(() => false),
);

await finish(browser);
