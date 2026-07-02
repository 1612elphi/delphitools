"use client";

import { useSyncExternalStore } from "react";
import { Dialog } from "@/components/ui/dialog";
import { closeModal, getOpenModal, subscribeModal } from "@/lib/substrata/modal";
import { ExportModal } from "@/components/substrata/modals/export-modal";
import { CanvasSizeModal } from "@/components/substrata/modals/canvas-size-modal";

/**
 * Host for the editor's blocking modals (Export · Canvas size). Reads the modal
 * store and mounts the active dialog; Radix `<Dialog>` supplies the overlay,
 * focus trap, and Esc-to-close. Each modal body renders its own `<DialogContent>`
 * (header/title · fields · actions), so it owns its width and layout.
 */
export function ModalHost() {
  const open = useSyncExternalStore(subscribeModal, getOpenModal, () => null);

  return (
    <Dialog
      open={open !== null}
      onOpenChange={(next) => {
        if (!next) closeModal();
      }}
    >
      {open === "export" && <ExportModal />}
      {open === "canvas-size" && <CanvasSizeModal />}
    </Dialog>
  );
}
