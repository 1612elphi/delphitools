/** A bitmap of any image the browser can show, svg included: createImageBitmap rejects svg blobs, a sized <img> does not. A longer side over maxSide scales down while decoding. */
export async function decodeImage(
	file: Blob,
	maxSide = Infinity,
): Promise<ImageBitmap> {
	const url = URL.createObjectURL(file);
	try {
		const img = new Image();
		img.src = url;
		await img.decode();
		const k = Math.min(
			1,
			maxSide / Math.max(img.naturalWidth, img.naturalHeight),
		);
		return await createImageBitmap(img, {
			imageOrientation: 'from-image',
			...(k < 1 && {
				resizeWidth: Math.max(
					1,
					Math.round(img.naturalWidth * k),
				),
				resizeHeight: Math.max(
					1,
					Math.round(img.naturalHeight * k),
				),
				resizeQuality: 'high',
			}),
		});
	} finally {
		URL.revokeObjectURL(url);
	}
}
