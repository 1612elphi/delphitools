/**
 * Social-media aspect-ratio presets, carried over from the Next app's
 * `lib/social-presets.ts` unchanged. It lives outside the tool because
 * Substrata's batch social-size export reuses the same table.
 *
 * `width`/`height` are aspect-ratio components, not pixel dimensions.
 */

export interface SocialRatio {
	name: string;
	label: string;
	width: number;
	height: number;
}

export interface SocialPlatform {
	name: string;
	ratios: SocialRatio[];
}

export const SOCIAL_PLATFORMS: SocialPlatform[] = [
	{
		name: 'Instagram',
		ratios: [
			{ name: 'Square', label: '1:1', width: 1, height: 1 },
			{ name: 'Portrait', label: '4:5', width: 4, height: 5 },
			{
				name: 'Landscape',
				label: '1.91:1',
				width: 1.91,
				height: 1,
			},
			{ name: 'Reels', label: '9:16', width: 9, height: 16 },
		],
	},
	{
		name: 'Bluesky',
		ratios: [
			{ name: 'Square', label: '1:1', width: 1, height: 1 },
			{
				name: 'Landscape',
				label: '16:9',
				width: 16,
				height: 9,
			},
			{ name: 'Portrait', label: '3:4', width: 3, height: 4 },
			{ name: 'Wide', label: '2:1', width: 2, height: 1 },
		],
	},
	{
		name: 'Threads',
		ratios: [
			{ name: 'Square', label: '1:1', width: 1, height: 1 },
			{ name: 'Portrait', label: '4:5', width: 4, height: 5 },
			{
				name: 'Landscape',
				label: '1.91:1',
				width: 1.91,
				height: 1,
			},
			{
				name: 'Stories',
				label: '9:16',
				width: 9,
				height: 16,
			},
		],
	},
];
