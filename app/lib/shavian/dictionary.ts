import type { Dictionary } from './transliterate';

const FULL_DICTIONARY_URL = '/data/shavian-dictionary-full.json';

export function parseDictJson(json: Record<string, string[]>): Dictionary {
	return new Map(Object.entries(json));
}

// One request per tier for the lifetime of the page, whatever remounts.
let coreDictPromise: Promise<Dictionary> | null = null;
let fullDictPromise: Promise<Dictionary> | null = null;

export function loadCoreDictionary(): Promise<Dictionary> {
	coreDictPromise ??=
		import('delphitools-v2/lib/shavian/dictionary-core.json?raw').then(
			(core) =>
				parseDictJson(
					JSON.parse(core.default) as Record<
						string,
						string[]
					>,
				),
		);
	return coreDictPromise;
}

export function loadFullDictionary(): Promise<Dictionary> {
	fullDictPromise ??= fetch(FULL_DICTIONARY_URL)
		.then((response) => {
			// fetch resolves on 404. Without this the miss reaches json(),
			// which throws a parse error the caller reads as a bad payload,
			// and the tool glosses every word past the 7,500-entry core with
			// the heuristic while reporting itself ready.
			if (!response.ok) {
				throw new Error(
					`${FULL_DICTIONARY_URL} returned HTTP ${response.status}`,
				);
			}
			return response.json() as Promise<
				Record<string, string[]>
			>;
		})
		.then(parseDictJson)
		.catch((error: unknown) => {
			// A cached rejection would deny every later mount a retry.
			fullDictPromise = null;
			throw error;
		});
	return fullDictPromise;
}
