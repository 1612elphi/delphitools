"use client";

import { useRef, useState } from "react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";

/**
 * Peelable stickers (the home-page wall + a one-off on the QR tool). Each is a
 * single transparent die-cut PNG rendered twice: the stuck "face" and a
 * vertically-mirrored "flap" whose grey underside is synthesised from the PNG's
 * own alpha (the #sticker-back SVG filter) — so it folds back on itself like a
 * real sticker, with no separate backing artwork. A GSAP timeline drives the
 * fold: click → peel up → download the high-res @2x PNG → re-stick (the board
 * stays full). Geometry adapted from React Bits "Sticker Peel" (drag-driven →
 * click-driven). Respects prefers-reduced-motion.
 */

type Sticker = {
  /** Base file name in /public/stickers (without extension). */
  file: string;
  /** Human label for the download filename + screen readers. */
  label: string;
  /** Resting tilt — also the axis the sticker peels along. */
  rot: number;
  /** Responsive display width — clamped per sticker to balance the wildly
   *  different aspect ratios. */
  width: string;
  /** Cross-axis placement, to scatter the stickers vertically on the wall. */
  align: "flex-start" | "center" | "flex-end";
};

const STICKERS: Sticker[] = [
  { file: "chant", label: "no login, no fee, these tools stay free", rot: 4, width: "clamp(180px, 42vw, 260px)", align: "center" },
  { file: "trans", label: "I had my files' gender transed at delphi.tools", rot: -7, width: "clamp(96px, 22vw, 132px)", align: "flex-start" },
  { file: "marker", label: "delphi, sketched", rot: 6, width: "clamp(120px, 30vw, 158px)", align: "flex-end" },
  { file: "policy", label: "privacy policy: no data collected", rot: -4, width: "clamp(170px, 40vw, 240px)", align: "flex-start" },
  { file: "saas-h8r", label: "certified SaaS h8r", rot: 5, width: "clamp(120px, 30vw, 158px)", align: "flex-end" },
];

type Phase = "stuck" | "peeling";

/** How far up the sticker lifts at the peak of the peel, as a % of its height.
 *  Higher = more dramatic curl (toward fully flipped); lower = a gentler lift. */
const PEEL_DEPTH = 78;

/**
 * Shared SVG filter that paints the flap as a flat grey sticker-back by flooding
 * the PNG's alpha shape. Rendered once per page that shows stickers.
 */
export function StickerFilters() {
  return (
    <svg width="0" height="0" aria-hidden="true" focusable="false" className="absolute">
      <defs>
        <filter id="sticker-back" x="-10%" y="-10%" width="120%" height="120%">
          <feFlood floodColor="rgb(208,204,196)" result="flood" />
          <feComposite operator="in" in="flood" in2="SourceAlpha" />
        </filter>
      </defs>
    </svg>
  );
}

function StickerButton({ sticker }: { sticker: Sticker }) {
  const [phase, setPhase] = useState<Phase>("stuck");
  const rootRef = useRef<HTMLButtonElement>(null);
  const tlRef = useRef<gsap.core.Timeline | null>(null);

  function download() {
    // Per-tool stickers live in a subdir (file = "lousy/<id>"); flatten the
    // slash so the saved file is e.g. delphitools-qr-genny-sticker.png.
    const base = sticker.file.split("/").pop() ?? sticker.file;
    const a = document.createElement("a");
    a.href = `/stickers/${sticker.file}@2x.png`;
    a.download = `delphitools-${base}-sticker.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  // Build the paused peel → download → restick timeline once.
  useGSAP(
    () => {
      const btn = rootRef.current;
      if (!btn) return;
      const lift = btn.querySelector<HTMLElement>(".peel-lift");
      const fold = { p: 0 }; // 0 → 1, mapped onto the 0 → PEEL_DEPTH% fold range
      const setFold = () => btn.style.setProperty("--peel", `${fold.p * PEEL_DEPTH}%`);

      const tl = gsap.timeline({
        paused: true,
        onComplete: () => {
          // back to a clean resting state so CSS hover + the next peel work
          gsap.set(lift, { clearProps: "transform,opacity" });
          setPhase("stuck");
        },
      });

      tl
        // 1 — grab: a quick spring-y lift toward the viewer.
        .to(lift, { scale: 1.06, yPercent: -3, duration: 0.16, ease: "back.out(2)" }, 0)
        // 2 — peel: the fold runs and accelerates as the adhesive lets go.
        .to(fold, { p: 1, duration: 0.5, ease: "power3.in", onUpdate: setFold }, 0.06)
        .to(lift, { yPercent: -14, rotate: -6, duration: 0.5, ease: "power2.out" }, 0.06)
        // download fires the moment it lets go
        .add(download, 0.5)
        // 3 — fall: the peeled sticker drops away under gravity and fades out.
        .to(lift, { yPercent: 150, rotate: -18, opacity: 0, duration: 0.5, ease: "power2.in" }, 0.56)
        // 4 — reappear: uncurl while hidden, then fade a fresh one back in.
        .add(() => {
          fold.p = 0;
          setFold();
        }, 1.12)
        .fromTo(
          lift,
          { opacity: 0, scale: 0.92, yPercent: 6, rotate: 0 },
          { opacity: 1, scale: 1, yPercent: 0, duration: 0.36, ease: "power2.out", immediateRender: false },
          1.18
        );

      tlRef.current = tl;
    },
    { scope: rootRef }
  );

  function handleClick() {
    if (phase !== "stuck") return;
    // Reduced motion: download now, skip the animation.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      download();
      return;
    }
    // Otherwise the timeline fires the download mid-peel (see `.add(download, 0.5)`).
    setPhase("peeling");
    tlRef.current?.invalidate().restart();
  }

  return (
    <button
      ref={rootRef}
      type="button"
      onClick={handleClick}
      className={"sticker-btn" + (phase !== "stuck" ? " is-peeling" : "")}
      style={
        {
          "--rot": `${sticker.rot}deg`,
          width: sticker.width,
          alignSelf: sticker.align,
        } as React.CSSProperties
      }
      aria-label={`Peel off and download the "${sticker.label}" sticker`}
      title="Peel me off!"
    >
      <span className="peel-lift">
        <span className="sticker-fold">
          {/* face — the part still stuck down */}
          <span className="sticker-face">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/stickers/${sticker.file}.png`}
              alt=""
              className="sticker-img"
              draggable={false}
              loading="lazy"
              decoding="async"
            />
          </span>
          {/* flap — the mirrored grey underside that curls back */}
          <span className="sticker-flap" aria-hidden="true">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/stickers/${sticker.file}.png`}
              alt=""
              className="sticker-img"
              draggable={false}
              loading="lazy"
              decoding="async"
            />
          </span>
        </span>
      </span>
    </button>
  );
}

/**
 * A single peelable sticker for dropping into a tool page. Two modes:
 *  - `file`: pick a named sticker from the wall (e.g. the flat "lousy").
 *  - `tool`: the per-tool "lousy" series in /public/stickers/lousy/<id>.png —
 *    one under every tool. They all share the wide "lousy" geometry; pass
 *    `label` for the screen-reader/download name (the tool's name is baked
 *    into the artwork itself).
 */
export function PeelSticker({ file, tool, label }: { file?: string; tool?: string; label?: string }) {
  const sticker: Sticker | undefined = tool
    ? {
        file: `lousy/${tool}`,
        label: label ?? "all I got was this lousy sticker",
        rot: -2.5,
        width: "clamp(220px, 60vw, 360px)",
        align: "center",
      }
    : STICKERS.find((s) => s.file === file);
  if (!sticker) return null;
  return (
    <>
      <StickerFilters />
      <StickerButton sticker={sticker} />
    </>
  );
}

export function StickerWall() {
  return (
    <section className="mt-16">
      <StickerFilters />
      <h2 className="text-lg font-semibold mb-1 text-foreground/80">Stickers</h2>
      <p className="text-sm text-muted-foreground mb-6 max-w-2xl">
        Free for the taking. Peel one off and it&apos;ll download a high-res PNG —
        print it, cut it out, slap it on your laptop.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-10 sm:gap-x-6 py-4">
        {STICKERS.map((sticker) => (
          <StickerButton key={sticker.file} sticker={sticker} />
        ))}
      </div>
    </section>
  );
}
