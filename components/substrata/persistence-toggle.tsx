"use client";

import { useSyncExternalStore } from "react";
import { HardDrive } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import {
  getPersistenceEnabled,
  setPersistenceEnabled,
  subscribePersistence,
} from "@/lib/substrata/persistence-pref";
import { toast } from "@/lib/substrata/toast";

/**
 * Opt-in local-storage toggle (M1-9). Off by default; until the user turns it
 * on, Substrata writes nothing to the browser. Turning it off purges the local
 * copy. Provisional placement in the right dock; its real home is the top-bar
 * save-status / Scene menu (gated). All user-facing strings are ∑CG.
 */
export function PersistenceToggle() {
  const enabled = useSyncExternalStore(subscribePersistence, getPersistenceEnabled, () => false);

  return (
    <div className="flex h-9 items-center gap-2 px-2 text-xs">
      <HardDrive className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <span className="flex-1 truncate text-muted-foreground">
        {/* ∑CG: local-storage toggle label + state
            spec: ≤22 chars; names the opt-in "keep my work in this browser"
            setting and reads honestly (in THIS browser, not the cloud); reflect
            on/off if it fits; British spelling.
            sample (off): "Save in this browser"  ·  (on): "Saving in browser" */}
        ∑CG
      </span>
      <Switch
        checked={enabled}
        onCheckedChange={(v) => {
          setPersistenceEnabled(v);
          toast(v ? "saved" : "storage-off");
        }}
        // ∑CG: aria-label for the local-storage toggle
        //   spec: ≤32 chars, describes enabling local storage / autosave in this browser.
        //   sample: "Save my work in this browser"
        aria-label="∑CG"
      />
    </div>
  );
}
