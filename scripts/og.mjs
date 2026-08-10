// Renders the share cards to PNG at build time.
//
// Port of the Next app's lib/og-card.tsx. That file is satori-flavoured JSX
// compiled by Next; there is no JSX here, so the same element tree is written
// in satori's object form ({ type, props }) — which is what JSX compiled to
// anyway. Colours are hex because satori has no oklch parser, exactly as in the
// original.

import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const assets = join(root, 'assets/og');
const read = (f) => readFileSync(join(assets, f));
const dataUri = (f, type) =>
	`data:${type};base64,${read(f).toString('base64')}`;

export const OG_SIZE = { width: 1200, height: 630 };

const CREAM = '#faf5e6';
const BORDER = '#1b5e20';
const TITLE = '#14481a';
const SUB = '#1e6626';
const URL_SAGE = '#93a98d';

export const ogFonts = [
	{
		name: 'Quattro',
		data: read('quattro-italic-700.ttf'),
		weight: 700,
		style: 'normal',
	},
	{
		name: 'Quattro',
		data: read('quattro-italic-400.ttf'),
		weight: 400,
		style: 'normal',
	},
];

const MARK = dataUri('mark.jpg', 'image/jpeg');
const heroFile = read('hero.png');
const HERO = `data:image/png;base64,${heroFile.toString('base64')}`;
// IHDR width/height, so re-exporting the art at another size cannot stretch it.
const HERO_ASPECT = heroFile.readUInt32BE(16) / heroFile.readUInt32BE(20);

const h = (type, props = {}, children) => ({
	type,
	props: children === undefined ? props : { ...props, children },
});

/** Green border, cream field. Children stack from the bottom up. */
const Frame = (children) =>
	h(
		'div',
		{
			style: {
				display: 'flex',
				width: '100%',
				height: '100%',
				padding: 14,
				backgroundColor: BORDER,
				fontFamily: 'Quattro',
			},
		},
		h(
			'div',
			{
				style: {
					position: 'relative',
					display: 'flex',
					flexDirection: 'column',
					justifyContent: 'flex-end',
					flex: 1,
					overflow: 'hidden',
					backgroundColor: CREAM,
					paddingLeft: 56,
					paddingRight: 56,
					paddingBottom: 40,
				},
			},
			children,
		),
	);

/** Tiled wordmark band, each row offset so the seams do not line up. */
const TileBand = () =>
	h(
		'div',
		{
			style: {
				position: 'absolute',
				top: -30,
				left: 0,
				display: 'flex',
				flexDirection: 'column',
				color: SUB,
				opacity: 0.4,
				maskImage: 'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0) 100%)',
				fontSize: 46,
				fontWeight: 700,
				lineHeight: 1.3,
			},
		},
		[0, 1, 2, 3, 4].map((row) =>
			h(
				'div',
				{
					style: {
						marginLeft: -60 - row * 95,
						whiteSpace: 'nowrap',
					},
				},
				'delphitools '.repeat(9),
			),
		),
	);

const Mark = () =>
	h('img', {
		src: MARK,
		width: 168,
		height: 168,
		style: { position: 'absolute', right: 36, bottom: 30 },
	});

/** The hero art, centred in whatever room is left above the URL line. */
const Hero = () =>
	h(
		'div',
		{
			style: {
				display: 'flex',
				flex: 1,
				alignItems: 'center',
				justifyContent: 'center',
			},
		},
		h('img', {
			src: HERO,
			width: 1000,
			height: Math.round(1000 / HERO_ASPECT),
		}),
	);

const Title = (text) => {
	const size =
		text.length <= 14
			? 104
			: text.length <= 20
				? 88
				: text.length <= 26
					? 68
					: 56;
	return h(
		'div',
		{
			style: {
				display: 'flex',
				fontSize: size,
				fontWeight: 700,
				color: TITLE,
				lineHeight: 1.1,
			},
		},
		text,
	);
};

const Subtitle = (text) =>
	h(
		'div',
		{
			style: {
				display: 'flex',
				marginTop: 22,
				fontSize: text.length <= 30 ? 40 : 34,
				fontWeight: 700,
				color: SUB,
				lineHeight: 1.2,
			},
		},
		text,
	);

const SiteUrl = (gap = 96) =>
	h(
		'div',
		{
			style: {
				display: 'flex',
				marginTop: gap,
				fontSize: 34,
				color: URL_SAGE,
			},
		},
		'https://delphi.tools/',
	);

/** Share card for a tool page. Mirrors app/(site)/tools/[toolId]/og.png. */
export const toolCard = (name) =>
	Frame([
		TileBand(),
		Mark(),
		Title(name),
		Subtitle('a free tool on delphitools'),
		SiteUrl(),
	]);

/** Share card for the site root. The art carries the wordmark, so no title. */
export const siteCard = () => Frame([Hero(), SiteUrl(0)]);

export async function renderPng(element) {
	const svg = await satori(element, { ...OG_SIZE, fonts: ogFonts });
	return new Resvg(svg, {
		fitTo: { mode: 'width', value: OG_SIZE.width },
	})
		.render()
		.asPng();
}

// node scripts/og.mjs <outDir> — renders the two cards used for verification
if (import.meta.url === `file://${process.argv[1]}`) {
	const outDir = process.argv[2] ?? join(root, 'tmp/og');
	mkdirSync(outDir, { recursive: true });
	writeFileSync(
		join(outDir, 'px-to-rem.png'),
		await renderPng(toolCard('PX to REM')),
	);
	writeFileSync(join(outDir, 'site.png'), await renderPng(siteCard()));
	console.log('wrote', outDir);
}
