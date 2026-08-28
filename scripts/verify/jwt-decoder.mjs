// proves wiring; suite covers math
// usage: npm start, then node scripts/verify/jwt-decoder.mjs

import { launch, visit, check, finish, sleep } from './harness.mjs';

const b64u = (s) => Buffer.from(s, 'utf8').toString('base64url');
const SEG = {
	alg: `${b64u('{"alg":"HS256","typ":"JWT"}')}`,
	payload: `${b64u(
		JSON.stringify({
			sub: '1234567890',
			name: 'John Doe',
			iat: 1771135200, // 2026-02-15
			nbf: 1771135000,
			exp: 2999999000, // 2064 — far future
		}),
	)}`,
	sig: 'SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c', // 32 bytes
};

const { browser, page } = await launch();

const setToken = async (value) => {
	await page.evaluate((v) => {
		const el = document.querySelector('.dt-jwt-area');
		const setter = Object.getOwnPropertyDescriptor(
			HTMLTextAreaElement.prototype,
			'value',
		).set;
		setter.call(el, v);
		el.dispatchEvent(new Event('input', { bubbles: true }));
	}, value);
	await sleep(350);
};

// one serialisable read
const snapshot = () =>
	page.evaluate(() => ({
		settings: [...document.querySelectorAll('.dt-jwt-cell')].map(
			(cell) => cell.textContent.replace(/\s+/g, ' ').trim(),
		),
		claims: [...document.querySelectorAll('.dt-jwt-claim')].map((row) =>
			row.textContent.replace(/\s+/g, ' ').trim(),
		),
		expiredBadge: !!document.querySelector('.dt-jwt-badge'),
		banner: document
			.querySelector('.dt-jwt-banner')
			?.textContent.replace(/\s+/g, ' ')
			.trim(),
		paneLabels: [...document.querySelectorAll('.dt-jwt-pane-label')].map(
			(el) => el.textContent.trim(),
		),
		paneMetas: [...document.querySelectorAll('.dt-jwt-pane-meta')].map(
			(el) => el.textContent.trim(),
		),
		headerJson:
			document
				.querySelectorAll('.dt-jwt-pane')[0]
				?.querySelector('.dt-jwt-json')?.textContent ?? null,
		payloadJson:
			document
				.querySelectorAll('.dt-jwt-pane')[1]
				?.querySelector('.dt-jwt-json')?.textContent ?? null,
		paneErrs: [...document.querySelectorAll('.dt-jwt-pane')].map(
			(pane) =>
				pane.querySelector('.dt-jwt-err')?.textContent.trim() ?? null,
		),
		signatureText:
			document.querySelector('.dt-jwt-sig')?.textContent.trim() ?? null,
		meta: document
			.querySelector('.dt-jwt-meta')
			?.textContent.replace(/\s+/g, ' ')
			.trim(),
	}));

// unregistered id → placeholder
await visit(page, '/');
const cell = await page.evaluate(() => !!document.querySelector('a[href="/tools/jwt-decoder"]'));
check('the catalogue links the tool', cell);

await visit(page, '/tools/jwt-decoder');
const shell = await page.evaluate(() => ({
	root: !!document.querySelector('.dt-jwt'),
	area: !!document.querySelector('.dt-jwt-area'),
	panes: document.querySelectorAll('.dt-jwt-pane').length,
	banner: !!document.querySelector('.dt-jwt-banner'),
	settings: document.querySelectorAll('.dt-jwt-cell').length,
}));
check('the tool page renders', shell.root && shell.area);
check(
	'empty input decodes nothing',
	shell.panes === 0 && !shell.banner && shell.settings === 0,
);

await setToken([SEG.alg, SEG.payload, SEG.sig].join('.'));
let s = await snapshot();
check('header and payload decode as pretty JSON',
	s.headerJson?.includes('"alg": "HS256"') &&
	s.payloadJson?.includes('"sub": "1234567890"'),
	s.paneLabels.join(' · '));
check('algorithm and type land in the summary cells',
	s.settings[0]?.endsWith('HS256') && s.settings[1]?.endsWith('JWT'),
	s.settings.slice(0, 2).join(' · '));
check('the signature stays opaque with its byte count',
	s.signatureText === SEG.sig && s.paneMetas[2]?.startsWith('32 bytes'),
	`${s.paneMetas[2]}`);
check('the bar reports the segment count once decoding',
	s.meta === '3 segments',
	s.meta);
check('header and payload byte counts are shown',
	s.paneMetas[0]?.endsWith(' bytes') && s.paneMetas[1]?.endsWith(' bytes'),
	s.paneMetas.join(' · '));
check('all three registered claims humanise to absolute dates',
	s.claims.length === 3 &&
	s.claims.every((row) => /\d{4}, \d{2}:\d{2}:\d{2}/.test(row)) &&
	s.claims[0].startsWith('Issued') &&
	s.claims[1].startsWith('Not before') &&
	s.claims[2].startsWith('Expires'),
	s.claims.join(' · '));
check('a future exp reports Valid and no badge',
	!s.expiredBadge && s.settings[3]?.endsWith('Valid'),
	s.settings[3]);

const expiredToken = [
	SEG.alg,
	b64u(JSON.stringify({ sub: '1234567890', exp: 1516239023 })), // 2018
	SEG.sig,
].join('.');
await setToken(expiredToken);
s = await snapshot();
check('a past exp gets the Expired badge',
	s.expiredBadge &&
	s.settings[3]?.endsWith('Expired') &&
	s.claims.some((row) => row.startsWith('Expires') && row.includes('Expired')),
	s.claims.join(' · '));

await setToken('abc');
s = await snapshot();
check('a single-segment input reports 1 / 3 and no panes',
	s.banner === 'Segments 1 / 3' && s.paneLabels.length === 0,
	s.banner);
await setToken('a.b');
s = await snapshot();
check('two segments report 2 / 3', s.banner === 'Segments 2 / 3', s.banner);

await setToken(`%%.${SEG.payload}.${SEG.sig}`);
s = await snapshot();
check('a bad-base64url header fails per-segment',
	s.paneErrs[0] === 'not base64url' &&
	s.payloadJson?.includes('"sub"') &&
	s.signatureText === SEG.sig,
	`header: ${s.paneErrs[0]}; payload decoded: ${!!s.payloadJson}`);

await setToken(`${b64u('hello')}.${SEG.payload}.${SEG.sig}`);
s = await snapshot();
check('a non-JSON header says so',
	s.paneErrs[0] === 'not JSON' && !!s.payloadJson,
	s.paneErrs[0]);

await setToken(`${SEG.alg}.${b64u('[1,2]')}.${SEG.sig}`);
s = await snapshot();
check('a non-object payload says so',
	s.paneErrs[1] === 'not an object' &&
	s.paneLabels.length === 3 && s.claims.length === 0 &&
	s.settings[0]?.endsWith('HS256'),
	`errors: ${s.paneErrs.join(' · ')}`);

await setToken('lorem ipsum dolor sit amet');
s = await snapshot();
check('free text cannot crash the tool',
	s.banner === 'Segments 1 / 3' || s.paneLabels.length === 3 || s.settings.length > 0,
	s.banner ?? `panes: ${s.paneLabels.length}`);

await page.click('.dt-jwt-btn');
await sleep(250);
const cleared = await page.evaluate(() => ({
	value: document.querySelector('.dt-jwt-area').value,
	panes: document.querySelectorAll('.dt-jwt-pane').length,
}));
check('Clear resets the tool', cleared.value === '' && cleared.panes === 0);

await finish(browser);
