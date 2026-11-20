// usage: --index skips fetch
import {
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { photoWords } from '../app/lib/substrata/photo-words.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(root, 'node_modules/.cache/photo-index');
const OUT = join(root, 'public/substrata/photos');
const TOKEN = process.env.OPENVERSE_TOKEN;
// openverse anonymous/keyed limits
const PAGE_SIZE = TOKEN ? 50 : 20;
const MAX_RESULTS = 240;
const SPACING_MS = TOKEN ? 700 : 3200;
const BUDGET = Number(process.env.BUDGET ?? (TOKEN ? 9000 : 190));
const SHARD = 1000;
const INFLIGHT = TOKEN ? 8 : 4;

const SUBJECTS = `
mountain lake forest river ocean beach coast island desert canyon waterfall
glacier snow winter autumn spring summer meadow field farm garden flower
rose tulip sunflower tree leaf moss fern cactus palm sky cloud sunset sunrise
night stars moon storm rain fog rainbow city street skyline bridge building
architecture house cabin church castle ruins tower lighthouse harbour boat ship
train railway car bicycle road path tunnel market cafe kitchen food bread
fruit vegetable coffee tea cake breakfast dinner wine people portrait child
family hands crowd dancer musician worker dog cat horse cow sheep bird
owl eagle duck butterfly bee insect fish whale deer fox bear rabbit squirrel
lion elephant zoo texture wood stone rock sand water ice fire paper fabric
wall door window stairs light shadow abstract pattern colour pink blue green
red yellow orange purple black white grey vintage map book library school
office desk computer phone camera music guitar piano art painting sculpture
museum festival sport football running swimming yoga travel camping tent
hiking park playground fountain statue sign neon industrial factory space
planet science microscope plant seed mushroom rocks shells coral reef
`
	.split(/\s+/)
	.filter(Boolean);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// page size changes pages
const cachePath = (q, page) => join(CACHE, `${q}-${PAGE_SIZE}-${page}.json`);

async function fetchPage(q, page) {
	const params = new URLSearchParams({
		q,
		license: 'cc0,pdm',
		page: String(page),
		page_size: String(PAGE_SIZE),
		mature: 'false',
	});
	// node 18 has fetch
	// eslint-disable-next-line n/no-unsupported-features/node-builtins
	const res = await fetch(
		`https://api.openverse.org/v1/images/?${params}`,
		{
			headers: {
				'User-Agent':
					'delphitools photo index (https://delphi.tools)',
				...(TOKEN
					? { Authorization: `Bearer ${TOKEN}` }
					: {}),
			},
			signal: AbortSignal.timeout(90_000),
		},
	);
	if (res.status === 429) return 'limited';
	if (!res.ok) return `http ${res.status}`;
	const body = await res.json();
	writeFileSync(cachePath(q, page), JSON.stringify(body));
	return body;
}

function pageCount(q) {
	const first = cachePath(q, 1);
	if (!existsSync(first)) return 1;
	const { result_count } = JSON.parse(readFileSync(first, 'utf8'));
	return Math.ceil(Math.min(result_count, MAX_RESULTS) / PAGE_SIZE);
}

// breadth first across subjects
async function fetchAll() {
	mkdirSync(CACHE, { recursive: true });
	const todo = [];
	const pages = Math.ceil(MAX_RESULTS / PAGE_SIZE);
	for (let page = 1; page <= pages; page++)
		for (const q of SUBJECTS)
			if (!existsSync(cachePath(q, page)))
				todo.push([q, page]);
	let spent = 0;
	let stop = false;
	const inflight = new Set();
	for (const [q, page] of todo) {
		if (stop || spent >= BUDGET) break;
		if (page > pageCount(q)) continue;
		spent++;
		const job = fetchPage(q, page)
			.then((r) => {
				if (r === 'limited') stop = true;
				const note =
					typeof r === 'string'
						? r
						: `${r.results.length}`;
				console.log(`${q} p${page}: ${note}`);
			})
			.catch((e) =>
				console.log(`${q} p${page}: ${e.message}`),
			)
			.finally(() => inflight.delete(job));
		inflight.add(job);
		while (inflight.size >= INFLIGHT) await Promise.race(inflight);
		await sleep(SPACING_MS);
	}
	await Promise.all(inflight);
	console.log(
		`spent ${spent} requests${stop ? ', stopped by the rate limit' : ''}`,
	);
}

function buildIndex() {
	const seen = new Set();
	const rows = [];
	const postings = new Map();
	const files = existsSync(CACHE) ? readdirSync(CACHE).sort() : [];
	for (const file of files) {
		const { results = [] } = JSON.parse(
			readFileSync(join(CACHE, file), 'utf8'),
		);
		for (const r of results) {
			if (
				seen.has(r.url) ||
				!['cc0', 'pdm'].includes(r.license)
			)
				continue;
			seen.add(r.url);
			const id = rows.length;
			rows.push([
				r.url,
				r.title?.trim() || '',
				r.creator?.trim() || '',
				r.foreign_landing_url ?? '',
				r.license,
			]);
			const terms = new Set(
				photoWords(
					[
						r.title ?? '',
						...(r.tags ?? []).map(
							(t) => t.name,
						),
					].join(' '),
				),
			);
			for (const t of terms) {
				const list = postings.get(t) ?? [];
				list.push(id);
				postings.set(t, list);
			}
		}
	}
	rmSync(OUT, { recursive: true, force: true });
	mkdirSync(OUT, { recursive: true });
	// drop one-off words
	const index = {};
	for (const [w, list] of [...postings].sort())
		if (list.length > 1) index[w] = list;
	writeFileSync(
		join(OUT, 'index.json'),
		JSON.stringify({
			shard: SHARD,
			count: rows.length,
			words: index,
		}),
	);
	for (let s = 0; s * SHARD < rows.length; s++)
		writeFileSync(
			join(OUT, `rows-${s}.json`),
			JSON.stringify(rows.slice(s * SHARD, (s + 1) * SHARD)),
		);
	console.log(
		`${rows.length} photos, ${Object.keys(index).length} words, ${Math.ceil(rows.length / SHARD)} shards`,
	);
}

if (!process.argv.includes('--index')) await fetchAll();
buildIndex();
