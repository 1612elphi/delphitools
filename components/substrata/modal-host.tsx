"use client";

import { useSyncExternalStore } from "react";
import { Dialog } from "@/components/ui/dialog";
import { closeModal, getOpenModal, subscribeModal } from "@/lib/substrata/modal";
import { ensureScene } from "@/lib/substrata/file-ops";
import { finishOnboarding } from "@/lib/substrata/onboarding-pref";
import { ExportModal } from "@/components/substrata/modals/export-modal";
import { CanvasSizeModal } from "@/components/substrata/modals/canvas-size-modal";
import { ShortcutsModal } from "@/components/substrata/modals/shortcuts-modal";
import { OnboardingModal } from "@/components/substrata/modals/onboarding-modal";
import { AboutSubstrataModal, AboutDelphitoolsModal } from "@/components/substrata/modals/about-modals";

/**
 * Host for the editor's blocking modals (Export · Canvas size · New scene ·
 * the Help panes). Reads the modal store and mounts the active dialog; Radix
 * `<Dialog>` supplies the overlay, focus trap, and Esc-to-close. Each modal
 * body renders its own `<DialogContent>` (header/title · fields · actions),
 * so it owns its width and layout.
 */
export function ModalHost() {
  const open = useSyncExternalStore(subscribeModal, getOpenModal, () => null);

  return (
    <Dialog
      open={open !== null}
      onOpenChange={(next) => {
        if (next) return;
        // Esc/overlay-close of the onboarding still counts as "seen" and
        // hands over to the New-scene dialog — same path as its final button
        if (open === "onboarding") {
          finishOnboarding();
          return;
        }
        closeModal();
        // fresh boots are doc-less until the New-scene dialog lands one —
        // Esc/overlay-dismiss falls back to a default blank scene
        if (open === "new-scene") ensureScene();
      }}
    >
      {open === "export" && <ExportModal />}
      {open === "canvas-size" && <CanvasSizeModal />}
      {open === "new-scene" && <CanvasSizeModal mode="new" />}
      {open === "onboarding" && <OnboardingModal />}
      {open === "shortcuts" && <ShortcutsModal />}
      {open === "about-substrata" && <AboutSubstrataModal />}
      {open === "about-delphitools" && <AboutDelphitoolsModal />}
    </Dialog>
  );
}
