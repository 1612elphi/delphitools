"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Home, Info, Star } from "lucide-react";

import { toolCategories, featuredTools } from "@/lib/tools";
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
                  <Image src="/delphi-lowlod.png" width={64} height={64} alt="delphitools logo" className="rounded-lg border-2 border-green-800" />
                </div>
                <div className="flex flex-col gap-0.5 leading-none">
                  <span className="font-semibold">delphitools</span>
                  <span className="text-xs text-muted-foreground">
                    handmade tools
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
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

        <SidebarGroup>
          <SidebarGroupLabel className="flex items-center gap-1.5">
            <Star className="size-3 text-amber-500 fill-amber-500" />
            Greatest Hits
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {featuredTools.map((tool) => {
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
                      <Link href={tool.href}>
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

        {toolCategories.map((category) => (
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
                        <Link href={tool.href}>
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
                    delphi
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
                    1612elphi/delphitools
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
                    {lib.name}
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
                  many more open source libraries
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
