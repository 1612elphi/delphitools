import type { Dictionary } from './transliterate';

const FULL_DICTIONARY_URL = '/data/shavian-dictionary-full.json';

export function parseDictJson(json: Record<string, string[]>): Dictionary {
	return new Map(Object.entries(json));
}

// one request per tier for page lifetime
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
			// fetch resolves on 404, check ok before json
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
			// cached rejection blocks later retries
			fullDictPromise = null;
			throw error;
		});
	return fullDictPromise;
}
