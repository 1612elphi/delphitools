import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Unified section header used across the home page — uppercase mono label, an
 * optional count, and a hairline rule that fills the row. Matches the tool
 * grid's category headers so every section reads as one system.
 */
export function SectionHeader({
  title,
  count,
  star = false,
  className,
}: {
  title: string;
  count?: number;
  star?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("mb-4 flex items-baseline gap-2.5", className)}>
      {star && (
        <Star
          className="size-3.5 shrink-0 self-center fill-amber-500 text-amber-500"
          aria-hidden="true"
        />
      )}
      <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-foreground">
        {title}
      </h2>
      {count != null && (
        <span className="text-[0.62rem] tabular-nums text-muted-foreground">{count}</span>
      )}
      <span className="h-px flex-1 bg-border" aria-hidden="true" />
    </div>
  );
}
