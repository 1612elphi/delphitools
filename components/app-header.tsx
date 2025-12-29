"use client";

import { usePathname } from "next/navigation";
import { Home, Sparkles } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { getToolById, getCategoryByToolId } from "@/lib/tools";
import { Badge } from "@/components/ui/badge";
import Image from "next/image";

export function AppHeader() {
  const pathname = usePathname();

  // Extract tool ID from pathname
  const toolId = pathname.startsWith("/tools/")
    ? pathname.replace("/tools/", "")
    : null;

  const tool = toolId ? getToolById(toolId) : null;
  const category = toolId ? getCategoryByToolId(toolId) : null;

  return (
    <header className="sticky top-0 z-50 flex h-14 shrink-0 items-center gap-2 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-2 h-4" />

      {tool ? (
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <tool.icon className="size-5 text-muted-foreground" />
            <h1 className="text-lg font-semibold">{tool.name}</h1>
          </div>
          {category && (
            <Badge variant="secondary" className="hidden sm:inline-flex">
              {category.name}
            </Badge>
          )}
        </div>
      ) : pathname === "/" ? (
        <div className="flex items-center gap-2">
          <Home className="size-5 text-muted-foreground" />
          <h1 className="text-lg font-semibold">Home</h1>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <Image src="/delphi.png" alt="delphitools logo" className="size-5 text-muted-foreground" />
          <h1 className="text-lg font-semibold">delphitools</h1>
        </div>
      )}
    </header>
  );
}
