/**
 * The front-page hero images. The page picks one at random per load; the
 * shuffle button appears once there are two. Add a file under public/heroes
 * and an entry here; `artist` + `url` render the credit line under the
 * omnibox, and an entry without them shows no credit.
 */
export interface HeroArt {
	/** path under /public */
	src: string;
	artist?: string;
	/** the artist's profile, linked from the credit line */
	url?: string;
}

export const HERO_ART: HeroArt[] = [
	{
		src: '/heroes/delphi.png',
		artist: 'delphi',
		url: 'https://rmv.fyi/',
	},
	{
		src: '/heroes/Valkyrie.png',
		artist: 'Valkyrie',
		url: 'https://theslightlychippedmoon.com/',
	},
];
