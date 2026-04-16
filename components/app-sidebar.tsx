"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Info, Search, Star, X } from "lucide-react";

import { toolCategories, featuredTools } from "@/lib/tools";
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

export function AppSidebar() {
  const pathname = usePathname();
  const [search, setSearch] = useState("");
  const query = search.toLowerCase();

  const filteredFeatured = featuredTools.filter(
    (t) =>
      t.name.toLowerCase().includes(query) ||
      t.description.toLowerCase().includes(query)
  );

  const filteredCategories = toolCategories
    .map((cat) => ({
      ...cat,
      tools: cat.tools.filter(
        (t) =>
          t.name.toLowerCase().includes(query) ||
          t.description.toLowerCase().includes(query)
      ),
    }))
    .filter((cat) => cat.tools.length > 0);

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
              <Link href="/">
                <div className="flex aspect-square size-12 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <img src="/delphi-lowlod.png" width={64} height={64} alt="delphitools logo" className="rounded-lg border-2 border-green-800" />
                </div>
                <div className="flex flex-col gap-0.5 leading-none">
                  <span className="font-semibold">delphitools</span>
                  <span className="text-xs text-muted-foreground">
                    indie tools
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <div className="px-2 py-2 border-b border-sidebar-border group-data-[collapsible=icon]:hidden">
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
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      </div>

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
          </SidebarMenu>
        </SidebarGroup>
        )}

        {query && filteredFeatured.length === 0 && filteredCategories.length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground" role="status" aria-live="polite">
            No tools found
          </div>
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

      <SidebarFooter className="border-t border-sidebar-border">
        <Dialog>
          <DialogTrigger asChild>
            <button className="w-full p-2 text-xs text-muted-foreground text-left hover:bg-sidebar-accent rounded-md transition-colors group-data-[collapsible=icon]:hidden">
              <p>No logins. No tracking.</p>
              <p className="mt-1 opacity-70">Long live the handmade web.</p>
            </button>
          </DialogTrigger>
          <DialogTrigger asChild>
            <button className="hidden group-data-[collapsible=icon]:flex w-full p-2 items-center justify-center hover:bg-sidebar-accent rounded-md transition-colors">
              <Info className="size-4 text-muted-foreground" />
            </button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>About delphitools</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 text-sm text-muted-foreground">
              <p>
                delphitools is a collection of small, focused utilities that respect your privacy
                and work entirely in your browser. No data leaves your machine, no accounts required,
                no tracking. Just tools that do what they say.
              </p>
              <p>
                I love the web. The classic, real web full of weird things. And that web is out there. You just have to find it. And sometimes, you have to make it yourself.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 text-sm pt-4 border-t">
              <div className="space-y-1">
                <h3 className="font-medium text-foreground">Made by</h3>
                <p className="text-muted-foreground">
                  <a
                    href="https://rmv.fyi"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-primary transition-colors"
                  >
                    delphi<span className="sr-only"> (opens in new tab)</span>
                  </a>
                </p>
              </div>
              <div className="space-y-1">
                <h3 className="font-medium text-foreground">Source</h3>
                <p className="text-muted-foreground">
                  <a
                    href="https://github.com/1612elphi/delphitools"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-primary transition-colors"
                  >
                    1612elphi/delphitools<span className="sr-only"> (opens in new tab)</span>
                  </a>
                </p>
              </div>
            </div>
            <div className="pt-4 border-t space-y-2">
              <h3 className="font-medium text-foreground text-sm">Built with</h3>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { name: "Next.js", url: "https://nextjs.org" },
                  { name: "React", url: "https://react.dev" },
                  { name: "Tailwind CSS", url: "https://tailwindcss.com" },
                  { name: "shadcn/ui", url: "https://ui.shadcn.com" },
                  { name: "Radix UI", url: "https://radix-ui.com" },
                  { name: "Lucide", url: "https://lucide.dev" },
                ].map((lib) => (
                  <a
                    key={lib.name}
                    href={lib.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs px-2 py-1 rounded-md bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {lib.name}<span className="sr-only"> (opens in new tab)</span>
                  </a>
                ))}
              </div>
              <p className="text-xs text-muted-foreground/60 pt-2">
                Plus{" "}
                <a
                  href="https://github.com/1612elphi/delphitools/blob/main/ACKNOWLEDGEMENTS.md"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-muted-foreground transition-colors"
                >
                  many more open source libraries<span className="sr-only"> (opens in new tab)</span>
                </a>
                .
              </p>
            </div>
          </DialogContent>
        </Dialog>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
