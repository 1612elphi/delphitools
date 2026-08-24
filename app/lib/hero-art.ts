export interface HeroArt {
	src: string;
	artist?: string;
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
	{
		src: '/heroes/rowan-oats-1.png',
		artist: 'Rowan Oats',
		url: 'https://rowanoats.com/',
	},
	{
		src: '/heroes/rowan-oats-2.png',
		artist: 'Rowan Oats',
		url: 'https://rowanoats.com/',
	},
];
