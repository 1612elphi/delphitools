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
		// One plain string per bullet, one bullet per line of the popup;
		// no markdown, no trailing period convention enforced. Sample
		// shape only (non-final wording, keep this block commented):
		//
		//   features: [
		//   	'Workflows: chain tools into a sequence and carry your file between steps.',
		//   	'Auto Subtitle: speech-to-text subtitles generated entirely in your browser.',
		//   ],
		//   fixes: [
		//   	'QR Generator: exported SVGs no longer show hairline seams between modules.',
		//   ],
		//   technical: [
		//   	'The stack moved from Next.js to Ember 7 with Crayon CSS, built by Vite.',
		//   ],
		features: [],
		fixes: [],
		technical: [],
	},
];
