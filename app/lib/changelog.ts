/**
 * The changelog the "what's new?" popup renders. One entry per release,
 * newest first; the "changes since" dropdown lists the `since` baselines.
 * Every string in here is user-facing copy: Ruby writes all of it (see
 * changelog-2.0.txt for the 2.0 material). An empty array renders an
 * empty tab.
 */

export interface Release {
	/** the version the entry describes */
	version: string;
	/** the baseline the changes are counted from ("changes since ...") */
	since: string;
	features: string[];
	fixes: string[];
	technical: string[];
}

export const RELEASES: Release[] = [
	{
		version: '2.0.0',
		since: '1.0',
		features: [],
		fixes: [],
		technical: [],
	},
];
