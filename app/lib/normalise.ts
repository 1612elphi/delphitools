// Loudness normalisation for the Audio Normaliser: one integrated-LUFS
// measurement (BS.1770, lib/audio.ts) feeds a gain plan; the gain itself is
// applied by encodeWav's gain argument.

export interface NormalisePlan {
	/** the gain to apply, dB */
	gainDb: number;
	/** true when the ceiling held the gain below what the target asked for */
	limited: boolean;
	/** sample peak after the gain, dBFS */
	outPeakDb: number;
}

/**
 * The gain that brings a measured loudness to `targetLufs`, capped so the
 * sample peak stays at or under `ceilingDb`. Silence (non-finite inputs)
 * gets no gain.
 * ponytail: sample peak, not true peak; a 4x oversampled true-peak meter is
 * the upgrade if inter-sample overs matter.
 */
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
