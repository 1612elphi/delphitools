"use client";

import { useState, useMemo } from "react";
import { Check, ChevronsUpDown, ScanSearch } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { paperSizeGroups, type PaperSize } from "@/lib/paper-sizes";

/** Flat array of every paper size from all groups (deduplicated by id, first occurrence wins). */
const ALL_SIZES: PaperSize[] = (() => {
  const seen = new Set<string>();
  const result: PaperSize[] = [];
  for (const group of paperSizeGroups) {
    for (const size of group.sizes) {
      if (!seen.has(size.id)) {
        seen.add(size.id);
        result.push(size);
      }
    }
  }
  return result;
})();

/** Look up a paper size by id across all groups. */
export function findPaperSize(id: string): PaperSize | undefined {
  return ALL_SIZES.find((s) => s.id === id);
}

interface PaperSizeComboboxProps {
  value: string;
  onValueChange: (id: string) => void;
  /** Show the "Infer from PDF" option */
  showInfer?: boolean;
  /** Show the "Custom…" option */
  showCustom?: boolean;
  /** Whether a PDF is loaded (affects infer label) */
  hasInferred?: boolean;
  /** The inferred size label to display when infer is active */
  inferredLabel?: string;
  className?: string;
  triggerClassName?: string;
}

export function PaperSizeCombobox({
  value,
  onValueChange,
  showInfer = false,
  showCustom = false,
  hasInferred = false,
  inferredLabel,
  className,
  triggerClassName,
}: PaperSizeComboboxProps) {
  const [open, setOpen] = useState(false);

  const selectedSize = useMemo(() => findPaperSize(value), [value]);
  const displayLabel =
    value === "infer"
      ? hasInferred && inferredLabel
        ? `Infer (${inferredLabel})`
        : "Infer from PDF"
      : value === "custom"
        ? "Custom…"
        : selectedSize?.label ?? value;

  const commonGroup = paperSizeGroups.find((g) => g.id === "common");
  const otherGroups = paperSizeGroups.filter((g) => g.id !== "common");

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("h-9 justify-between font-normal", triggerClassName)}
        >
          <span className="truncate">{displayLabel}</span>
          <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className={cn("p-0 w-[280px]", className)} align="start">
        <Command>
          <CommandInput placeholder="Search paper sizes…" />
          <CommandList>
            <CommandEmpty>No paper size found.</CommandEmpty>

            {showInfer && (
              <>
                <CommandGroup>
                  <CommandItem
                    value="infer"
                    onSelect={() => {
                      onValueChange("infer");
                      setOpen(false);
                    }}
                  >
                    <ScanSearch className={cn("mr-2 h-4 w-4", value === "infer" ? "opacity-100" : "opacity-40")} />
                    <span>Infer from PDF</span>
                    <Check className={cn("ml-auto h-4 w-4", value === "infer" ? "opacity-100" : "opacity-0")} />
                  </CommandItem>
                </CommandGroup>
                <CommandSeparator />
              </>
            )}

            {commonGroup && (
              <>
                <CommandGroup heading="Common">
                  {commonGroup.sizes.map((size) => (
                    <CommandItem
                      key={`common-${size.id}`}
                      value={`${size.label} common`}
                      onSelect={() => {
                        onValueChange(size.id);
                        setOpen(false);
                      }}
                    >
                      <Check className={cn("mr-2 h-4 w-4", value === size.id ? "opacity-100" : "opacity-0")} />
                      <span>{size.label}</span>
                      <span className="ml-auto text-xs text-muted-foreground">
                        {Math.round(size.widthMm)} × {Math.round(size.heightMm)}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
                <CommandSeparator />
              </>
            )}

            {otherGroups.map((group) => (
              <CommandGroup key={group.id} heading={group.label}>
                {group.sizes.map((size) => (
                  <CommandItem
                    key={size.id}
                    value={`${size.label} ${size.series}`}
                    onSelect={() => {
                      onValueChange(size.id);
                      setOpen(false);
                    }}
                  >
                    <Check className={cn("mr-2 h-4 w-4", value === size.id ? "opacity-100" : "opacity-0")} />
                    <span>{size.label}</span>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {Math.round(size.widthMm)} × {Math.round(size.heightMm)}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}

            {showCustom && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem
                    value="custom"
                    onSelect={() => {
                      onValueChange("custom");
                      setOpen(false);
                    }}
                  >
                    <Check className={cn("mr-2 h-4 w-4", value === "custom" ? "opacity-100" : "opacity-0")} />
                    Custom…
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
