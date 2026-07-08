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
 * save-status / Scene menu (gated). All user-facing strings are \u2211CG.
 */
export function PersistenceToggle() {
  const enabled = useSyncExternalStore(subscribePersistence, getPersistenceEnabled, () => false);

  return (
    <div className="flex h-9 items-center gap-2 px-2 text-xs">
      <HardDrive className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <span className="flex-1 truncate text-muted-foreground">
        Save in this browser
      </span>
      <Switch
        checked={enabled}
        onCheckedChange={(v) => {
          setPersistenceEnabled(v);
          toast(v ? "saved" : "storage-off");
        }}
        aria-label="Save my work in this browser"
      />
    </div>
  );
}
