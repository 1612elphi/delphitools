/**
 * Per-letter chart data for the NATO Phonetic tool: the ICS maritime signal
 * flag as inline SVG and the flag-semaphore arm positions. Flag geometry
 * follows the blazons in Wikipedia, "International maritime signal flags"
 * (e.g. M "azure, a saltire argent"); semaphore angles are the standard
 * chart as the receiver sees it, in 45° steps clockwise from straight down.
 */

const COLOURS = {
	r: '#cc2b37',
	b: '#1f3a93',
	y: '#f5c928',
	k: '#151515',
	w: '#ffffff',
};

type Fill = keyof typeof COLOURS;

const W = 120;
const H = 90;

const rect = (x: number, y: number, w: number, h: number, f: Fill): string =>
	`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${COLOURS[f]}"/>`;

const poly = (f: Fill, ...points: number[]): string =>
	`<polygon points="${points.join(' ')}" fill="${COLOURS[f]}"/>`;

const stroke = (
	f: Fill,
	width: number,
	x1: number,
	y1: number,
	x2: number,
	y2: number,
): string =>
	`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${COLOURS[f]}" stroke-width="${width}"/>`;

/** An upright cross (R, X) or a saltire (M, V) through the whole flag. */
const cross = (f: Fill, width: number): string =>
	stroke(f, width, W / 2, 0, W / 2, H) +
	stroke(f, width, 0, H / 2, W, H / 2);
const saltire = (f: Fill, width: number): string =>
	stroke(f, width, 0, 0, W, H) + stroke(f, width, W, 0, 0, H);

const SWALLOWTAIL = `M0 0H${W}L${W - 25} ${H / 2}L${W} ${H}H0Z`;
const RECTANGLE = `M0 0H${W}V${H}H0Z`;

function checker(cols: number, rows: number, a: Fill, b: Fill): string {
	const cw = W / cols;
	const ch = H / rows;
	let out = '';
	for (let r = 0; r < rows; r++)
		for (let c = 0; c < cols; c++)
			out += rect(
				c * cw,
				r * ch,
				cw,
				ch,
				(r + c) % 2 ? b : a,
			);
	return out;
}

/** Bendy sinister of ten (Y): stripes rotated to the fly-up diagonal, clipped. */
function bendySinister(a: Fill, b: Fill): string {
	const angle = (-Math.atan2(H, W) * 180) / Math.PI;
	let stripes = '';
	for (let i = -2; i < 12; i++)
		stripes += rect(-40, i * 15, 200, 15, i % 2 ? b : a);
	return (
		`<clipPath id="dt-flag-y"><rect width="${W}" height="${H}"/></clipPath>` +
		`<g clip-path="url(#dt-flag-y)"><g transform="rotate(${angle.toFixed(2)} ${W / 2} ${H / 2})">${stripes}</g></g>`
	);
}

interface Flag {
	shapes: string;
	outline: string;
}

function flag(shapes: string, outline = RECTANGLE): Flag {
	return { shapes, outline };
}

const FLAGS: Record<string, Flag> = {
	// Alfa: swallowtailed, per pale argent and azure
	A: flag(
		rect(0, 0, W / 2, H, 'w') +
			poly(
				'b',
				W / 2,
				0,
				W,
				0,
				W - 25,
				H / 2,
				W,
				H,
				W / 2,
				H,
			),
		SWALLOWTAIL,
	),
	// Bravo: swallowtailed, gules
	B: flag(poly('r', 0, 0, W, 0, W - 25, H / 2, W, H, 0, H), SWALLOWTAIL),
	// Charlie: azure, a fess gules fimbriated argent
	C: flag(
		rect(0, 0, W, H, 'b') +
			rect(0, H * 0.2, W, H * 0.6, 'w') +
			rect(0, H * 0.4, W, H * 0.2, 'r'),
	),
	// Delta: or, a Spanish fess azure
	D: flag(rect(0, 0, W, H, 'y') + rect(0, H / 4, W, H / 2, 'b')),
	// Echo: per fess azure and gules
	E: flag(rect(0, 0, W, H / 2, 'b') + rect(0, H / 2, W, H / 2, 'r')),
	// Foxtrot: argent, a lozenge throughout gules
	F: flag(
		rect(0, 0, W, H, 'w') +
			poly('r', W / 2, 0, W, H / 2, W / 2, H, 0, H / 2),
	),
	// Golf: paly of six or and azure
	G: flag(
		[0, 1, 2, 3, 4, 5]
			.map((i) =>
				rect(
					(i * W) / 6,
					0,
					W / 6,
					H,
					i % 2 ? 'b' : 'y',
				),
			)
			.join(''),
	),
	// Hotel: per pale argent and gules
	H: flag(rect(0, 0, W / 2, H, 'w') + rect(W / 2, 0, W / 2, H, 'r')),
	// India: or, a pellet
	I: flag(
		rect(0, 0, W, H, 'y') +
			`<circle cx="${W / 2}" cy="${H / 2}" r="21" fill="${COLOURS.k}"/>`,
	),
	// Juliett: azure, a fess argent
	J: flag(
		rect(0, 0, W, H / 3, 'b') +
			rect(0, H / 3, W, H / 3, 'w') +
			rect(0, (2 * H) / 3, W, H / 3, 'b'),
	),
	// Kilo: per pale or and azure
	K: flag(rect(0, 0, W / 2, H, 'y') + rect(W / 2, 0, W / 2, H, 'b')),
	// Lima: quarterly or and sable
	L: flag(checker(2, 2, 'y', 'k')),
	// Mike: azure, a saltire argent
	M: flag(rect(0, 0, W, H, 'b') + saltire('w', 18)),
	// November: chequy of sixteen azure and argent
	N: flag(checker(4, 4, 'b', 'w')),
	// Oscar: per bend gules and or
	O: flag(poly('y', 0, 0, W, H, 0, H) + poly('r', 0, 0, W, 0, W, H)),
	// Papa: azure, an inescutcheon argent
	P: flag(rect(0, 0, W, H, 'b') + rect(W / 4, H / 4, W / 2, H / 2, 'w')),
	// Quebec: or
	Q: flag(rect(0, 0, W, H, 'y')),
	// Romeo: gules, a cross or
	R: flag(rect(0, 0, W, H, 'r') + cross('y', 18)),
	// Sierra: argent, an inescutcheon azure
	S: flag(rect(0, 0, W, H, 'w') + rect(W / 4, H / 4, W / 2, H / 2, 'b')),
	// Tango: tierced in pale gules, argent and azure
	T: flag(
		rect(0, 0, W / 3, H, 'r') +
			rect(W / 3, 0, W / 3, H, 'w') +
			rect((2 * W) / 3, 0, W / 3, H, 'b'),
	),
	// Uniform: quarterly gules and argent
	U: flag(checker(2, 2, 'r', 'w')),
	// Victor: argent, a saltire gules
	V: flag(rect(0, 0, W, H, 'w') + saltire('r', 18)),
	// Whiskey: azure, an inescutcheon gules fimbriated argent
	W: flag(
		rect(0, 0, W, H, 'b') +
			rect(W / 6, H / 6, (2 * W) / 3, (2 * H) / 3, 'w') +
			rect(W / 3, H / 3, W / 3, H / 3, 'r'),
	),
	// Xray: argent, a cross azure
	X: flag(rect(0, 0, W, H, 'w') + cross('b', 18)),
	// Yankee: bendy sinister of ten or and gules
	Y: flag(bendySinister('y', 'r')),
	// Zulu: per saltire or, sable, gules and azure
	Z: flag(
		poly('y', 0, 0, W, 0, W / 2, H / 2) +
			poly('k', 0, 0, W / 2, H / 2, 0, H) +
			poly('r', W, 0, W, H, W / 2, H / 2) +
			poly('b', 0, H, W / 2, H / 2, W, H),
	),
};

/** The whole flag as an inline SVG string, hairlined by its own outline. */
export function flagSvg(letter: string): string {
	const spec = FLAGS[letter.toUpperCase()];
	if (!spec) return '';
	return (
		`<svg class="dt-nato-flag" viewBox="0 0 ${W} ${H}" aria-hidden="true">` +
		spec.shapes +
		`<path d="${spec.outline}" fill="none" stroke="var(--border)" stroke-width="2"/>` +
		`</svg>`
	);
}

/**
 * Both arm directions per letter, degrees clockwise from straight down as
 * the receiver sees them. A–G raise one arm through the seven positions;
 * the rest pair two positions (J and V swap places in the pairing so that
 * H–Z stay alphabetical on the chart).
 */
export const SEMAPHORE: Record<string, [number, number]> = {
	A: [45, 0],
	B: [90, 0],
	C: [135, 0],
	D: [180, 0],
	E: [0, 225],
	F: [0, 270],
	G: [0, 315],
	H: [45, 90],
	I: [45, 135],
	J: [180, 270],
	K: [45, 180],
	L: [45, 225],
	M: [45, 270],
	N: [45, 315],
	O: [90, 135],
	P: [90, 180],
	Q: [90, 225],
	R: [90, 270],
	S: [90, 315],
	T: [135, 180],
	U: [135, 225],
	V: [180, 315],
	W: [225, 270],
	X: [225, 315],
	Y: [135, 270],
	Z: [270, 315],
};

/** The semaphore signal as a circle with two arms, like the wall charts. */
export function semaphoreSvg(letter: string): string {
	const angles = SEMAPHORE[letter.toUpperCase()];
	if (!angles) return '';
	const arm = (deg: number) => {
		const rad = (deg * Math.PI) / 180;
		const x = (24 - Math.sin(rad) * 20).toFixed(1);
		const y = (24 + Math.cos(rad) * 20).toFixed(1);
		return `<line x1="24" y1="24" x2="${x}" y2="${y}"/>`;
	};
	return (
		`<svg class="dt-nato-sem" viewBox="0 0 48 48" aria-hidden="true">` +
		`<circle cx="24" cy="24" r="21"/>` +
		arm(angles[0]) +
		arm(angles[1]) +
		`</svg>`
	);
}
