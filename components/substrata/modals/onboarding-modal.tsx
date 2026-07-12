"use client";

import { useState, useSyncExternalStore } from "react";
import { Check, HardDrive } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DialogContent, DialogTitle } from "@/components/ui/dialog";
import { finishOnboarding } from "@/lib/substrata/onboarding-pref";
import {
  getPersistenceEnabled,
  setPersistenceEnabled,
  subscribePersistence,
} from "@/lib/substrata/persistence-pref";
import { toast } from "@/lib/substrata/toast";

/**
 * First-visit onboarding (Ruby 2026-07-12) — four slides, wording dictated by
 * Ruby verbatim (capitalisation/punctuation normalised only; edit the JSX
 * below to rephrase). Slide 3 carries the storage opt-in as a big friendly
 * button reusing the toggle's shipped label. Closing by ANY means (Done, Esc,
 * overlay) marks the flow seen and hands over to the New-scene dialog when
 * the session is still on an empty scene.
 */

const BUG_MAILTO = "mailto:tools@rmv.fyi?subject=substrata%20bug%20report";
const REPO_URL = "https://github.com/1612elphi/delphitools";

function StorageButton() {
  const enabled = useSyncExternalStore(subscribePersistence, getPersistenceEnabled, () => false);
  return (
    <Button
      type="button"
      disabled={enabled}
      onClick={() => {
        setPersistenceEnabled(true);
        toast("saved");
      }}
      className="h-12 w-full rounded-none text-sm font-semibold"
    >
      {enabled ? <Check className="size-4" aria-hidden /> : <HardDrive className="size-4" aria-hidden />}
      {/* the persistence toggle's shipped label, reused */}
      Save in this browser
    </Button>
  );
}

export function OnboardingModal() {
  const [slide, setSlide] = useState(0);
  // every close path (the final button here; Esc/overlay in ModalHost)
  // routes through finishOnboarding — see onboarding-pref

  // Slide copy: Ruby's dictated lines form the skeleton; the additions
  // (capability line, model footnote, save-to-file reassurance, feedback
  // pointer, touch slide, sign-off) are Claude-authored per Ruby's
  // 2026-07-12 grant — she may rewrite any of it. Illustrations drop inline
  // as <img src="/substrata/onboarding/…"> wherever they fit.
  const slides: React.ReactNode[] = [
    <div key="hello" className="space-y-3">
      {/* eslint-disable-next-line @next/next/no-img-element -- static export, unoptimized anyway */}
      <img
        src="/substrata/onboarding/workshop.png"
        alt=""
        width={999}
        height={1000}
        className="mx-auto -mt-1 h-auto max-h-100 w-auto"
      />
      <p className="leading-relaxed">
        Hi, this is Substrata, the delphitools image editor. It does effects, layers, filters, film sims, cropping, text and more.
      </p>
      <p className="leading-relaxed">It's still in early access, so calibrate your excitement.</p>
    </div>,
    <div key="local" className="space-y-3">
      {/* eslint-disable-next-line @next/next/no-img-element -- static export, unoptimized anyway */}
      <img
        src="/substrata/onboarding/local.png"
        alt=""
        width={1000}
        height={731}
        className="mx-auto -mt-1 h-auto max-h-100 w-auto"
      />
      <p className="leading-relaxed">
        Everything is local, everything runs on your browser. This means that it might be slow
        on low-end machines.
      </p>
    </div>,
    <div key="private" className="space-y-3">
      {/* eslint-disable-next-line @next/next/no-img-element -- static export, unoptimized anyway */}
      <img
        src="/substrata/onboarding/private.png"
        alt=""
        width={1000}
        height={622}
        className="mx-auto -mt-1 h-auto max-h-100 w-auto"
      />
      <p className="leading-relaxed">
        Because this is in your browser, it&rsquo;s entirely private by design. Nothing of your
        data — no images, no clicks, no mouse movements, no analytics — will be sent back to the
        server. And I can prove this, since it&rsquo;s all{" "}
        <a
          href={REPO_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2 hover:text-foreground"
        >
          open source
        </a>
        .
      </p>
      <p className="leading-relaxed text-muted-foreground/80">
        One footnote: a few heavyweight tools download their machinery on first use — the
        background remover fetches its model, for instance. That&rsquo;s a download, not an
        upload. Nothing of yours goes anywhere.
      </p>
    </div>,
    <div key="storage" className="space-y-3">
      <p className="leading-relaxed">
        If you want to store your settings, files or preferences, you have to turn on local
        storage.
      </p>
      {/* eslint-disable-next-line @next/next/no-img-element -- static export, unoptimized anyway */}
      <img
        src="/substrata/onboarding/still-private.png"
        alt=""
        width={800}
        height={561}
        className="mx-auto h-auto max-h-36 w-auto"
      />
      <StorageButton />
      <p className="leading-relaxed">
        Substrata will still work if you leave this off, and won&rsquo;t save any cookies or
        local data, but you won&rsquo;t be able to autosave or remember tool preferences.
      </p>
    </div>,
    // touch devices only: the two-finger navigation nobody would discover unprompted
    ...(typeof navigator !== "undefined" && navigator.maxTouchPoints > 1
      ? [
          <p key="touch" className="leading-relaxed">
            Since you&rsquo;re on touch: two fingers pan and zoom the canvas, one finger — or
            your pencil — drives the tool. Pinch away.
          </p>,
        ]
      : []),
    <div key="beta" className="space-y-3">
      <p className="leading-relaxed">
        Substrata is still an early access public beta. Please report bugs you find to me
        directly:{" "}
        <a href={BUG_MAILTO} className="underline underline-offset-2 hover:text-foreground">
          tools@rmv.fyi
        </a>{" "}
        — or hit the Feedback button up in the top bar, it does the same thing.
      </p>
      <p className="leading-relaxed">Thanks for being here this early. Love, delphi</p>
    </div>,
  ];
  const LAST = slides.length - 1;

  return (
    <DialogContent
      showCloseButton={false}
      className="max-w-md gap-0 border-2 border-border p-0"
      aria-describedby={undefined}
    >
      {/* no visible chrome (Ruby 2026-07-12): one box, content + nav only —
          the slides are free-flow JSX so illustrations can sit inline with
          the text (drop <img src="/substrata/onboarding/…"> anywhere) */}
      <DialogTitle className="sr-only">Substrata</DialogTitle>

      <div className="min-h-[188px] px-5 py-5 text-sm text-muted-foreground">{slides[slide]}</div>

      <div className="flex items-center justify-center gap-1.5 pb-3" aria-hidden>
        {slides.map((_, i) => (
          <span
            key={i}
            className={cn("size-1.5 rounded-full", i === slide ? "bg-primary" : "bg-border")}
          />
        ))}
      </div>

      <div className="flex flex-row gap-0 border-t-2 border-border">
        <Button
          type="button"
          variant="ghost"
          disabled={slide === 0}
          onClick={() => setSlide((s) => Math.max(0, s - 1))}
          className="h-12 flex-1 rounded-none border-r border-border text-sm"
        >
          Back
        </Button>
        {slide < LAST ? (
          <Button
            type="button"
            onClick={() => setSlide((s) => Math.min(LAST, s + 1))}
            className="h-12 flex-[2] rounded-none text-sm font-semibold"
          >
            Next
          </Button>
        ) : (
          <Button
            type="button"
            onClick={() => finishOnboarding()}
            className="h-12 flex-[2] rounded-none text-sm font-semibold"
          >
            let&rsquo;s go
          </Button>
        )}
      </div>
    </DialogContent>
  );
}
