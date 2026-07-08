"use client";

import { useEffect, useRef } from "react";
import { hsvToRgb } from "@/lib/substrata/colour-hsv";
import { setHsv, type ColourSnapshot } from "@/lib/substrata/colour-store";
import { Knob, clamp01 } from "@/components/substrata/modules/colour-picker-kit";

/**
 * Colour mode 2 — HSV TRIANGLE. A masked conic hue ring (drag to set hsv.h from
 * the angle) with an inscribed SV triangle that rotates with the hue; dragging
 * inside the triangle sets saturation + value via barycentric coordinates.
 * Ported from sketches/pickers.html §"2 · HSV TRIANGLE" (.wheelpad/.wheelwrap/
 * .wheel/.tri/.ringkn).
 *
 * Geometry is authored here (angle ↔ hue, barycentric ↔ s/v, closest-point
 * clamping); colour maths comes from colour-hsv. The triangle fill is drawn per
 * pixel to a canvas so every (s,v) reads true; interaction runs off the same
 * corner geometry, so the knob always sits under the colour it names. Pointer
 * handling is custom (angle + barycentric) with pointer capture; refs are read
 * only inside handlers / effects, never during render. The only copy is the
 * control's aria-label.
 */

// Geometry, as fractions of the square wheelwrap (centre = 0.5, 0.5). The ring
// mask is transparent to 56% and opaque past 58% of the box's farthest-corner
// radius (≈0.707 of the width), so its inner edge sits near 0.40 of the width.
const RING_OUTER = 0.5; // outer radius (the circle edge)
const RING_KNOB_R = 0.45; // ring-knob radius (mid-band)
const TRI_R = 0.33; // SV-triangle circumradius (fits inside the ring hole)

// Canvas backing = display px × SS; drawn larger then down-scaled for smoother
// triangle edges without per-pixel feathering.
const WHEEL_PX = 168;
const SS = 2;

const DEG = 180 / Math.PI;
const norm360 = (a: number): number => ((a % 360) + 360) % 360;

interface Pt {
  x: number;
  y: number;
}

/** Conic angle (from north, clockwise) → matches `conic-gradient(from 90deg…)`. */
const hueToConic = (h: number): number => norm360(450 - h);

/** Normalised point about the centre → hue (0–360), inverse of hueToConic. */
function pointToHue(nx: number, ny: number): number {
  const conic = Math.atan2(nx - 0.5, -(ny - 0.5)) * DEG;
  return norm360(450 - conic);
}

/** The three SV-triangle corners for a hue, in normalised coords. The pure-hue
 *  corner points toward that hue on the ring; white/black trail at ±120°. */
function triCorners(hue: number): { hueC: Pt; white: Pt; black: Pt } {
  const conic = hueToConic(hue);
  const at = (offset: number): Pt => {
    const t = (conic + offset) / DEG;
    return { x: 0.5 + TRI_R * Math.sin(t), y: 0.5 - TRI_R * Math.cos(t) };
  };
  return { hueC: at(0), white: at(120), black: at(240) };
}

/** Barycentric weights of p w.r.t. triangle (a, b, c). Order matches corners. */
function bary(p: Pt, a: Pt, b: Pt, c: Pt): [number, number, number] {
  const v0x = b.x - a.x;
  const v0y = b.y - a.y;
  const v1x = c.x - a.x;
  const v1y = c.y - a.y;
  const v2x = p.x - a.x;
  const v2y = p.y - a.y;
  const d00 = v0x * v0x + v0y * v0y;
  const d01 = v0x * v1x + v0y * v1y;
  const d11 = v1x * v1x + v1y * v1y;
  const d20 = v2x * v0x + v2y * v0y;
  const d21 = v2x * v1x + v2y * v1y;
  const inv = 1 / (d00 * d11 - d01 * d01 || 1);
  const wb = (d11 * d20 - d01 * d21) * inv;
  const wc = (d00 * d21 - d01 * d20) * inv;
  return [1 - wb - wc, wb, wc];
}

function closestOnSeg(p: Pt, a: Pt, b: Pt): Pt {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const t = clamp01(((p.x - a.x) * abx + (p.y - a.y) * aby) / (abx * abx + aby * aby || 1));
  return { x: a.x + abx * t, y: a.y + aby * t };
}

/** Nearest point on/in the triangle (p itself if already inside). */
function clampToTri(p: Pt, a: Pt, b: Pt, c: Pt): Pt {
  const [wa, wb, wc] = bary(p, a, b, c);
  if (wa >= 0 && wb >= 0 && wc >= 0) return p;
  const cands = [closestOnSeg(p, a, b), closestOnSeg(p, b, c), closestOnSeg(p, c, a)];
  let best = cands[0];
  let bd = Infinity;
  for (const q of cands) {
    const d = (q.x - p.x) ** 2 + (q.y - p.y) ** 2;
    if (d < bd) {
      bd = d;
      best = q;
    }
  }
  return best;
}

/** Normalised point → (s, v) via the SV triangle for the given hue. */
function pointToSV(p: Pt, hue: number): { s: number; v: number } {
  const { hueC, white, black } = triCorners(hue);
  const q = clampToTri(p, hueC, white, black);
  let [wa, wb] = bary(q, hueC, white, black);
  wa = Math.max(0, wa);
  wb = Math.max(0, wb);
  const v = clamp01(wa + wb); // 1 − blackWeight
  const s = v > 1e-4 ? clamp01(wa / v) : 0;
  return { s, v };
}

export function TriangleMode({ colour }: { colour: ColourSnapshot }) {
  const { hsv } = colour;
  const hue = hsv.h;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drag = useRef<"ring" | "tri" | null>(null);

  // Repaint the triangle fill whenever the hue changes (s/v drags don't alter it).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = WHEEL_PX * SS;
    canvas.width = W;
    canvas.height = W;

    const { hueC, white, black } = triCorners(hue);
    const ax = hueC.x * W;
    const ay = hueC.y * W;
    const v0x = white.x * W - ax;
    const v0y = white.y * W - ay;
    const v1x = black.x * W - ax;
    const v1y = black.y * W - ay;
    const d00 = v0x * v0x + v0y * v0y;
    const d01 = v0x * v1x + v0y * v1y;
    const d11 = v1x * v1x + v1y * v1y;
    const inv = 1 / (d00 * d11 - d01 * d01 || 1);

    const { r: hr, g: hg, b: hb } = hsvToRgb({ h: hue, s: 1, v: 1 });

    const img = ctx.createImageData(W, W);
    const data = img.data;
    for (let py = 0; py < W; py++) {
      for (let px = 0; px < W; px++) {
        const v2x = px + 0.5 - ax;
        const v2y = py + 0.5 - ay;
        const d20 = v2x * v0x + v2y * v0y;
        const d21 = v2x * v1x + v2y * v1y;
        const wb = (d11 * d20 - d01 * d21) * inv; // white weight
        const wc = (d00 * d21 - d01 * d20) * inv; // black weight
        const wa = 1 - wb - wc; // pure-hue weight
        if (wa < 0 || wb < 0 || wc < 0) continue; // outside → left transparent
        // colour = wa·hue + wb·white + wc·black (black contributes nothing)
        const i = (py * W + px) * 4;
        data[i] = Math.round(wa * hr + wb * 255);
        data[i + 1] = Math.round(wa * hg + wb * 255);
        data[i + 2] = Math.round(wa * hb + wb * 255);
        data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }, [hue]);

  // Read the live colour off the closure (handlers are rebuilt each render).
  const write = (nx: number, ny: number) => {
    if (drag.current === "ring") {
      setHsv({ h: pointToHue(nx, ny) });
    } else if (drag.current === "tri") {
      const { s, v } = pointToSV({ x: nx, y: ny }, hue);
      if (v <= 1e-4) setHsv({ v: 0 });
      else setHsv({ s, v });
    }
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const nx = (e.clientX - r.left) / r.width;
    const ny = (e.clientY - r.top) / r.height;
    const { hueC, white, black } = triCorners(hue);
    const [wa, wb, wc] = bary({ x: nx, y: ny }, hueC, white, black);
    if (wa >= 0 && wb >= 0 && wc >= 0) drag.current = "tri";
    else if (Math.hypot(nx - 0.5, ny - 0.5) <= RING_OUTER) drag.current = "ring";
    else return;
    e.currentTarget.setPointerCapture(e.pointerId);
    write(nx, ny);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const r = e.currentTarget.getBoundingClientRect();
    write((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    drag.current = null;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  };

  // Knob placements (pure functions of the current colour — no ref reads).
  const conic = hueToConic(hue) / DEG;
  const ringKx = 0.5 + RING_KNOB_R * Math.sin(conic);
  const ringKy = 0.5 - RING_KNOB_R * Math.cos(conic);

  const { hueC, white, black } = triCorners(hue);
  const wa = hsv.s * hsv.v; // pure-hue weight
  const wb = hsv.v * (1 - hsv.s); // white weight
  const wc = 1 - hsv.v; // black weight
  const triKx = wa * hueC.x + wb * white.x + wc * black.x;
  const triKy = wa * hueC.y + wb * white.y + wc * black.y;

  return (
    <div className="flex h-full items-center justify-center border-b border-border p-2">
      <div
        className="relative size-[156px] touch-none"
        role="group"
        aria-label="HSV triangle"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {/* hue ring — conic gradient masked to a donut */}
        <div
          className="pointer-events-none absolute inset-0 rounded-full"
          style={{
            background: "conic-gradient(from 90deg,#f00,#f0f,#00f,#0ff,#0f0,#ff0,#f00)",
            WebkitMask: "radial-gradient(circle, transparent 56%, #000 58%)",
            mask: "radial-gradient(circle, transparent 56%, #000 58%)",
          }}
          aria-hidden
        />
        {/* SV triangle fill (rotates with the hue). size-full pins the CSS box to
            the 168px wrap; the buffer is 2× for crisp edges. A bare <canvas> is a
            replaced element, so inset-0 alone would leave it at its buffer size. */}
        <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 size-full" aria-hidden />
        <Knob x={ringKx} y={ringKy} />
        <Knob x={triKx} y={triKy} />
      </div>
    </div>
  );
}
