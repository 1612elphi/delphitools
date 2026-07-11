"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const FAVOUR_LABEL = "DELPHI NEEDS A FAVOUR";

// Short version — scrolls in the ticker.
const FAVOUR_TICKER =
  "I'm looking for an old Humane Ai Pin device to hack, so if you have one, please get in touch, I'll buy it off of you. If you don't know what that is, cherish your ignorance.";

// Full version — shown in the modal.
const FAVOUR_INTRO =
  "I'm really sorry to bother you, but I'm running out of options. Promise that this little call to action won't stick around for long.";
// P1 wraps a link on the phrase "Humane Ai Pin".
const FAVOUR_P1A = "I'm looking for an old ";
const FAVOUR_P1B =
  " from back when they were produced, preferably with accessories such as extra battery boosters. I'm looking to hack that little laser projector that came with it for a little project I'm working on.";
const FAVOUR_P2 =
  "If you have one that you want to get rid of, get in touch with me. I'm interested in buying it off of you. I can take delivery in the continental US and in the EU.";
const FAVOUR_DISCLAIMER =
  "This is not an endorsement of the Ai Pin, It's entirely useless now that servers are shut down, and frankly it was a mindblowingly bad product in its prime. Do not mistake this for me being charitable to the product concept. It was stupid, and AI is not a good tool for the masses. It did, however, have a truly unique idea with that little laser projector that threw it's screen onto the palm of your hand.";

const FAVOUR_MAILTO = "mailto:tools@rmv.fyi?subject=Humane%20Ai%20Pin%20Inquiry";
const VERGE_REVIEW = "https://www.theverge.com/24126502/humane-ai-pin-review";

export function FavourBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setShow(true), 2000);
    return () => clearTimeout(t);
  }, []);

  if (!show) return null;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label={FAVOUR_LABEL}
          className="favour-banner flex w-full items-center gap-4 border-b border-border bg-background px-4 py-1.5 text-left text-xs transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="shrink-0 font-semibold tracking-wide text-foreground underline underline-offset-4">
            {FAVOUR_LABEL}
          </span>
          <div className="relative h-4 min-w-0 flex-1 overflow-hidden">
            <div className="favour-marquee absolute left-0 top-0 whitespace-nowrap leading-4 text-muted-foreground">
              {FAVOUR_TICKER}
            </div>
          </div>
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{FAVOUR_LABEL}</DialogTitle>
        </DialogHeader>
        <DialogDescription asChild>
          <div className="space-y-3 text-sm leading-relaxed">
            <p className="italic">{FAVOUR_INTRO}</p>
            <p>
              {FAVOUR_P1A}
              <a
                href={VERGE_REVIEW}
                target="_blank"
                rel="noreferrer"
                className="font-medium underline underline-offset-4 hover:text-primary"
              >
                Humane Ai Pin
              </a>
              {FAVOUR_P1B}
            </p>
            <p>{FAVOUR_P2}</p>
            <p>
              To reach me,{" "}
              <a
                href={FAVOUR_MAILTO}
                className="font-medium underline underline-offset-4 hover:text-primary"
              >
                send me an email
              </a>
              .
            </p>
            <p className="border-t border-border pt-3 text-xs italic text-muted-foreground">
              {FAVOUR_DISCLAIMER}
            </p>
          </div>
        </DialogDescription>
      </DialogContent>
    </Dialog>
  );
}
