// browser code, not node
/* eslint-disable n/no-unsupported-features/node-builtins */
// dev shim for http
crypto.randomUUID ??= () =>
	[...crypto.getRandomValues(new Uint8Array(16))]
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('')
		.replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5');

// ponytail: SHA-256 digest only, the one call errata and substrata make
crypto.subtle ??= (() => {
	const frac = (x) => ((x % 1) * 2 ** 32) >>> 0;
	const primes = [];
	for (let n = 2; primes.length < 64; n++)
		if (primes.every((p) => n % p)) primes.push(n);
	const K = primes.map((p) => frac(Math.cbrt(p)));
	const rotr = (x, n) => (x >>> n) | (x << (32 - n));
	const sha256 = (bytes) => {
		const h = primes.slice(0, 8).map((p) => frac(Math.sqrt(p)));
		const len = bytes.length;
		const padded = new Uint8Array((((len + 8) >> 6) + 1) << 6);
		padded.set(bytes);
		padded[len] = 0x80;
		const view = new DataView(padded.buffer);
		view.setUint32(padded.length - 8, Math.floor(len / 2 ** 29));
		view.setUint32(padded.length - 4, (len << 3) >>> 0);
		const w = new Uint32Array(64);
		for (let o = 0; o < padded.length; o += 64) {
			for (let i = 0; i < 16; i++)
				w[i] = view.getUint32(o + i * 4);
			for (let i = 16; i < 64; i++) {
				const a = w[i - 15];
				const b = w[i - 2];
				w[i] =
					w[i - 16] +
					(rotr(a, 7) ^ rotr(a, 18) ^ (a >>> 3)) +
					w[i - 7] +
					(rotr(b, 17) ^
						rotr(b, 19) ^
						(b >>> 10));
			}
			let [a, b, c, d, e, f, g, k] = h;
			for (let i = 0; i < 64; i++) {
				const t1 =
					k +
					(rotr(e, 6) ^
						rotr(e, 11) ^
						rotr(e, 25)) +
					((e & f) ^ (~e & g)) +
					K[i] +
					w[i];
				const t2 =
					(rotr(a, 2) ^
						rotr(a, 13) ^
						rotr(a, 22)) +
					((a & b) ^ (a & c) ^ (b & c));
				k = g;
				g = f;
				f = e;
				e = (d + t1) >>> 0;
				d = c;
				c = b;
				b = a;
				a = (t1 + t2) >>> 0;
			}
			[a, b, c, d, e, f, g, k].forEach((v, i) => {
				h[i] = (h[i] + v) >>> 0;
			});
		}
		const out = new DataView(new ArrayBuffer(32));
		h.forEach((v, i) => out.setUint32(i * 4, v));
		return out.buffer;
	};
	return {
		digest: async (_name, data) =>
			sha256(
				ArrayBuffer.isView(data)
					? new Uint8Array(
							data.buffer,
							data.byteOffset,
							data.byteLength,
						)
					: new Uint8Array(data),
			),
	};
})();
