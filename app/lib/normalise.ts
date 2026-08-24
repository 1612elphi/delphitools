// bs.1770 loudness input

export interface NormalisePlan {
	gainDb: number;
	limited: boolean;
	outPeakDb: number;
}

// sample peaks exclude inter-samples
export function planGain(
	lufs: number,
	peakDb: number,
	targetLufs: number,
	ceilingDb = -1,
): NormalisePlan {
	if (!Number.isFinite(lufs) || !Number.isFinite(peakDb))
		return { gainDb: 0, limited: false, outPeakDb: peakDb };
	const wanted = targetLufs - lufs;
	const headroom = ceilingDb - peakDb;
	const limited = wanted > headroom;
	const gainDb = limited ? headroom : wanted;
	return { gainDb, limited, outPeakDb: peakDb + gainDb };
}

export function dbToGain(db: number): number {
	return 10 ** (db / 20);
}
