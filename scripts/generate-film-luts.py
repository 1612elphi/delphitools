"""Generate film LUTs via spectral_film_lut (MIT) → 33-cube packed strip PNGs.

Pipeline per look: camera negative (+ authentic print stock where applicable),
sRGB in -> Rec.709 gamut + sRGB gamma out (= our editor's working space).
Output format matches lib/substrata/lut-data.ts: 33 slices of 33x33 (blue picks
the slice) in one 1089x33 PNG.

Run (not part of the build; regenerates public/substrata/luts/ gen entries):
    python3 -m venv .venv && .venv/bin/pip install spectral_film_lut
    .venv/bin/python scripts/generate-film-luts.py
    cp gen-luts/*.png public/substrata/luts/
"""
import numpy as np
from PIL import Image
from spectral_film_lut.film_spectral import FilmSpectral
from spectral_film_lut.utils import create_lut
import spectral_film_lut as S

OUT = "gen-luts"
import os
os.makedirs(OUT, exist_ok=True)

# (output id, negative stock, print stock | None)
LOOKS = [
    ("lut-vision3-2383", S.KODAK_5207, S.KODAK_2383),          # cinema neg + THE print stock
    ("lut-eterna-500", S.FUJI_ETERNA_500, S.FUJI_3513),        # fuji cinema chain
    ("lut-gold-200", S.KODAK_GOLD_200, S.KODAK_SUPRA_ENDURA),  # consumer classic on paper
    ("lut-portra-endura", S.KODAK_PORTRA_400, S.KODAK_PORTRA_ENDURA),  # the real portra chain
    ("lut-ektachrome-100d", S.KODAK_EKTACHROME_100D, None),    # slide, direct
    ("lut-aerochrome", S.KODAK_AEROCHROME_III, None),         # infrared false-colour legend
    ("lut-instax", S.FUJI_INSTAX_COLOR, None),                 # instant
    ("lut-trix-polymax", S.KODAK_TRI_X_400, S.KODAK_POLYMAX_GRADE_2),  # bw neg on paper
]

for out_id, neg_cls, print_cls in LOOKS:
    neg = FilmSpectral(neg_cls)
    prn = FilmSpectral(print_cls) if print_cls is not None else None
    table = create_lut(
        neg, prn, lut_size=33, cube=False,
        input_colorspace="sRGB",
        output_gamut="Rec. 709",
        gamma_func="sRGB",
    )
    # colour.LUT3D table: [r_idx, g_idx, b_idx] -> rgb. Our strip: x = b*33 + r, y = g.
    S33 = 33
    strip = np.zeros((S33, S33 * S33, 3), dtype=np.uint8)
    t8 = np.clip(np.round(table * 255), 0, 255).astype(np.uint8)
    for b in range(S33):
        # slice b: strip[g, b*33 + r] = table[r, g, b]
        strip[:, b * S33:(b + 1) * S33] = t8[:, :, b].transpose(1, 0, 2)
    Image.fromarray(strip, "RGB").save(f"{OUT}/{out_id}.png", optimize=True)
    print(out_id, "ok")
