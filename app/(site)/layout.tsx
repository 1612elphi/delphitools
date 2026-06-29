import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { AppHeader } from "@/components/app-header";
import SkipLink from "@/components/ui/skip-link";

/**
 * Site chrome: the sidebar + header shell shared by the home page and every
 * tool route. Split out of the root layout (see app/layout.tsx) so the
 * Substrata editor route can render full-viewport without it. Route groups are
 * URL-transparent, so "/" and "/tools/*" are unchanged.
 */
export default function SiteLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <SidebarProvider>
      <SkipLink />
      <AppSidebar />
      <SidebarInset>
        <AppHeader />
        <main className="flex-1 overflow-auto" id="main-content" tabIndex={-1}>
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
