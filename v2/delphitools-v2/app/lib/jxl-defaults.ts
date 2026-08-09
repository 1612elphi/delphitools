/** Canonical libjxl encoder settings (the @jsquash/jxl option shape), shared
 *  by the image-converter tool and the Substrata export worker so the two
 *  never drift. `quality` / `lossless` are per-call; spread these first. */
export const JXL_ENCODE_DEFAULTS = {
	effort: 7,
	progressive: false,
	epf: -1,
	lossyPalette: false,
	decodingSpeedTier: 0,
	photonNoiseIso: 0,
	lossyModular: false,
} as const;
