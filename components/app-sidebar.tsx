"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Brush, Home, Info, Search, Star, X } from "lucide-react";

import { toolCategories, featuredTools } from "@/lib/tools";
import { AboutDelphitoolsBody } from "@/components/about-delphitools";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  SidebarRail,
} from "@/components/ui/sidebar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

// Inlined at build time from next.config.ts (git HEAD, env override, or "dev").
const COMMIT_SHA = process.env.NEXT_PUBLIC_COMMIT_SHA ?? "dev";

// Pride Month styling, baked in at build time (auto-on in June). See next.config.ts.
const PRIDE = process.env.NEXT_PUBLIC_PRIDE === "1";

export function AppSidebar() {
  const pathname = usePathname();
  const [search, setSearch] = useState("");
  const query = search.toLowerCase();

  const filteredFeatured = featuredTools.filter(
    (t) =>
      t.name.toLowerCase().includes(query) ||
      t.description.toLowerCase().includes(query)
  );

  const filteredCategories = toolCategories.flatMap((cat) => {
    const tools = cat.tools.filter(
      (t) =>
        t.name.toLowerCase().includes(query) ||
        t.description.toLowerCase().includes(query)
    );
    return tools.length > 0 ? [{ ...cat, tools }] : [];
  });

  return (
    <Sidebar variant="sidebar" collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <Link href="/" className="group/brand">
                <div className="flex aspect-square size-12 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <img
                    src="/delphi-lowlod.png"
                    width={64}
                    height={64}
                    alt="delphitools logo"
                    className={cn(
                      "rounded-lg border-2",
                      PRIDE ? "pride-ring" : "border-green-800"
                    )}
                  />
                </div>
                <div className="flex flex-col gap-0.5 leading-none">
                  <span className={cn("font-semibold", PRIDE && "pride-wordmark")}>
                    delphitools
                  </span>
                  <span className="text-xs text-muted-foreground">
                    <span
                      className={cn(
                        "group-hover/brand:hidden",
                        PRIDE && "pride-tagline"
                      )}
                    >
                      {PRIDE ? "trans rights" : "indie tools"}
                    </span>
                    <span
                      className="hidden font-mono group-hover/brand:inline"
                      title="Build commit"
                    >
                      version: {COMMIT_SHA}
                    </span>
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <div className="p-2 border-b border-sidebar-border group-data-[collapsible=icon]:hidden">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <Input
            placeholder="Search tools..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 pl-8 pr-8 text-sm"
            aria-label="Search tools"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      <nav aria-label="Main" className="flex min-h-0 flex-1 flex-col">
        <SidebarContent>
          {!query && (
            <SidebarGroup>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname === "/"}
                    tooltip="Home"
                  >
                    <Link href="/">
                      <Home className="size-4" />
                      <span>Home</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                {/* the editor — more than a tool, so it sits with Home rather
                    than inside a category */}
                <SidebarMenuItem>
                  <SidebarMenuButton asChild tooltip="Substrata">
                    <Link href="/editor" prefetch={false}>
                      <Brush className="size-4" />
                      <span>Substrata</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroup>
          )}

        {query && filteredFeatured.length === 0 && filteredCategories.length === 0 && (
          <output className="block px-4 py-8 text-center text-sm text-muted-foreground" aria-live="polite">
            No tools found
          </output>
        )}

        {filteredFeatured.length > 0 && (
        <SidebarGroup>
          <SidebarGroupLabel className="flex items-center gap-1.5">
            <Star className="size-3 text-amber-500 fill-amber-500" aria-hidden="true" />
            Greatest Hits
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {filteredFeatured.map((tool) => {
                const Icon = tool.icon;
                const isActive = pathname === tool.href;
                return (
                  <SidebarMenuItem key={tool.id}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      tooltip={tool.name}
                      className="text-amber-700 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-300"
                    >
                      <Link href={tool.href} prefetch={false}>
                        <Icon className="size-4" />
                        <span>{tool.name}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        )}

          {filteredCategories.map((category) => (
            <SidebarGroup key={category.id}>
              <SidebarGroupLabel>{category.name}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {category.tools.map((tool) => {
                    const Icon = tool.icon;
                    const isActive = pathname === tool.href;
                    return (
                      <SidebarMenuItem key={tool.id}>
                        <SidebarMenuButton
                          asChild
                          isActive={isActive}
                          tooltip={tool.name}
                        >
                          <Link href={tool.href} prefetch={false}>
                            <Icon className="size-4" />
                            <span>{tool.name}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
        </SidebarContent>
      </nav>

      <SidebarFooter className="border-t border-sidebar-border">
        <Dialog>
          <DialogTrigger asChild>
            <button type="button" className="w-full p-2 hover:bg-sidebar-accent rounded-md transition-colors">
              <div className="text-xs text-muted-foreground text-left group-data-[collapsible=icon]:hidden">
                <p>No logins. No tracking.</p>
                <p className="mt-1 opacity-70">Long live the handmade web.</p>
              </div>
              <div className="hidden group-data-[collapsible=icon]:flex items-center justify-center">
                <Info className="size-4 text-muted-foreground" aria-hidden="true" />
                <span className="sr-only">About delphitools</span>
              </div>
            </button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>About delphitools</DialogTitle>
            </DialogHeader>
            <AboutDelphitoolsBody />
          </DialogContent>
        </Dialog>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
