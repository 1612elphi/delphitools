export interface HeroArt {
	src: string;
	artist?: string;
	url?: string;
}

export const HERO_ART: HeroArt[] = [
	{
		src: '/heroes/delphi.webp',
		artist: 'delphi',
		url: 'https://rmv.fyi/',
	},
	{
		src: '/heroes/Valkyrie.webp',
		artist: 'Valkyrie',
		url: 'https://theslightlychippedmoon.com/',
	},
	{
		src: '/heroes/rowan-oats-1.webp',
		artist: 'Rowan Oats',
		url: 'https://rowanoats.com/',
	},
	{
		src: '/heroes/rowan-oats-2.webp',
		artist: 'Rowan Oats',
		url: 'https://rowanoats.com/',
	},
	{
		src: '/heroes/olive.webp',
		artist: 'olive',
		url: 'https://wikipedia.org/wiki/Olive',
	},
];
