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
const LAST = 3;

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

  const slides: React.ReactNode[] = [
    <p key="1" className="leading-relaxed">
      Hi, this is Substrata, the delphitools image editor. We&rsquo;re still in beta — let me
      show you around.
    </p>,
    <p key="2" className="leading-relaxed">
      Everything is local, everything runs on your browser. This means that it might be slow on
      low-end machines.
    </p>,
    <div key="3" className="space-y-3">
      <p className="leading-relaxed">
        Because this is in your browser, it&rsquo;s entirely private by design. If you want to
        store your settings, files or preferences, you have to turn on local storage.
      </p>
      <StorageButton />
      <p className="leading-relaxed">
        Nothing of your data — no images, no clicks, no mouse movements, no analytics — will be
        sent back to the server. And I can prove this, since it&rsquo;s all{" "}
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
    </div>,
    <p key="4" className="leading-relaxed">
      Substrata is still an early access public beta. Please report bugs you find to me directly:{" "}
      <a href={BUG_MAILTO} className="underline underline-offset-2 hover:text-foreground">
        tools@rmv.fyi
      </a>
    </p>,
  ];

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
          {/* ∑CG: onboarding back button
              spec: one word, steps to the previous slide; disabled on slide 1; ≤ 8 chars
              sample: "Back"
          */}
          {"∑CG"}
        </Button>
        {slide < LAST ? (
          <Button
            type="button"
            onClick={() => setSlide((s) => Math.min(LAST, s + 1))}
            className="h-12 flex-[2] rounded-none text-sm font-semibold"
          >
            {/* ∑CG: onboarding next button
                spec: one word, advances to the next slide; ≤ 8 chars
                sample: "Next"
            */}
            {"∑CG"}
          </Button>
        ) : (
          <Button
            type="button"
            onClick={() => finishOnboarding()}
            className="h-12 flex-[2] rounded-none text-sm font-semibold"
          >
            {/* ∑CG: onboarding final button — closes the tour, opens the New-scene dialog
                spec: short send-off that ends the tour and starts working; ≤ 14 chars
                sample: "Let's go"
            */}
            {"∑CG"}
          </Button>
        )}
      </div>
    </DialogContent>
  );
}
