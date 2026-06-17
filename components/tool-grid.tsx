"use client";

import Link from "next/link";
import { useEffect, useRef, type Ref } from "react";

import { toolCategories, featuredTools, type Tool } from "@/lib/tools";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  ANIMATED_ICONS,
  type AnimatedIcon,
  type AnimatedIconHandle,
} from "@/components/animated-icons";

/**
 * Renders a bespoke animated icon received as a prop. Kept at module scope so
 * the dynamic component looked up from ANIMATED_ICONS is never *created* inline
 * during ToolCell's render (which would trip react-hooks/static-components).
 */
function BespokeIcon({
  Icon,
  iconRef,
  className,
}: {
  Icon: AnimatedIcon;
  iconRef: Ref<AnimatedIconHandle>;
  className?: string;
}) {
  return <Icon ref={iconRef} size={20} aria-hidden className={className} />;
}

function ToolCell({ tool, featured = false }: { tool: Tool; featured?: boolean }) {
  const handleRef = useRef<AnimatedIconHandle>(null);
  const staticRef = useRef<HTMLSpanElement>(null);
  const Animated = ANIMATED_ICONS.get(tool.icon);
  const StaticIcon = tool.icon;

  // Normalise the static lucide paths so the CSS draw-in (stroke-dasharray:1)
  // wipes the full stroke. Bespoke (motion) icons animate themselves — skip them.
  useEffect(() => {
    if (Animated || !staticRef.current) return;
    staticRef.current
      .querySelectorAll<SVGGeometryElement>("svg > *")
      .forEach((el) => el.setAttribute("pathLength", "1"));
  }, [Animated]);

  const start = () => handleRef.current?.startAnimation();
  const stop = () => handleRef.current?.stopAnimation();

  const iconClass = cn(
    "tool-ic shrink-0 transition-transform group-hover:scale-110 group-focus-visible:scale-110",
    featured
      ? "text-amber-600 dark:text-amber-400"
      : "text-muted-foreground group-hover:text-primary group-focus-visible:text-primary"
  );

  return (
    <Link
      href={tool.href}
      onMouseEnter={Animated ? start : undefined}
      onMouseLeave={Animated ? stop : undefined}
      onFocus={Animated ? start : undefined}
      onBlur={Animated ? stop : undefined}
      className={cn(
        "tool-cell group flex min-h-[62px] items-center gap-3 border-b border-r px-3.5 py-3 transition-colors focus-visible:z-10 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
        featured
          ? "border-amber-500/30 bg-amber-500/[0.06] hover:bg-amber-500/[0.12]"
          : "border-border hover:bg-primary/[0.09]"
      )}
    >
      {Animated ? (
        <BespokeIcon Icon={Animated} iconRef={handleRef} className={iconClass} />
      ) : (
        <span
          ref={staticRef}
          aria-hidden
          className={cn(iconClass, "tool-ic-draw grid place-items-center")}
        >
          <StaticIcon className="size-5" />
        </span>
      )}
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="flex items-center gap-1.5 text-[0.78rem] font-medium leading-[1.25]">
          {tool.name}
          {tool.beta && (
            <Badge
              variant="outline"
              className="px-1.5 py-0 text-[10px] border-amber-500/50 text-amber-600 dark:text-amber-400"
            >
              Beta
            </Badge>
          )}
          {tool.new && (
            <Badge variant="outline" className="px-1.5 py-0 text-[10px] border-primary/50 text-primary">
              New
            </Badge>
          )}
        </span>
        <span className="line-clamp-2 text-[0.66rem] leading-[1.32] text-muted-foreground">
          {tool.description}
        </span>
      </span>
    </Link>
  );
}

/** A hairline grid of tool cells. `featured` switches to the amber accent. */
export function ToolCellGrid({ tools, featured = false }: { tools: Tool[]; featured?: boolean }) {
  return (
    <div
      className={cn(
        "grid grid-cols-[repeat(auto-fill,minmax(290px,1fr))] border-l border-t",
        featured ? "border-amber-500/30" : "border-border"
      )}
    >
      {tools.map((tool) => (
        <ToolCell key={tool.id} tool={tool} featured={featured} />
      ))}
    </div>
  );
}

/**
 * Greatest-hits row. Imports featuredTools itself (rather than receiving them
 * as props) so the icon *functions* never cross the server→client boundary.
 */
export function FeaturedGrid() {
  return <ToolCellGrid tools={featuredTools} featured />;
}

export function ToolGrid() {
  return (
    <div className="space-y-12">
      {toolCategories.map((category) => (
        <section key={category.id}>
          <div className="flex items-baseline gap-2.5 pb-2.5">
            <h3 className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-foreground">
              {category.name}
            </h3>
            <span className="text-[0.6rem] tabular-nums text-muted-foreground">
              {category.tools.length}
            </span>
            <span className="h-px flex-1 bg-border" />
          </div>
          <ToolCellGrid tools={category.tools} />
        </section>
      ))}
    </div>
  );
}
