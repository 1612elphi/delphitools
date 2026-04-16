import type { Metadata } from "next";
import "./globals.css";

import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { AppHeader } from "@/components/app-header";
import { ColourNotationProvider } from "@/components/colour-notation-provider";
import SkipLink from "@/components/ui/skip-link";

export const metadata: Metadata = {
  title: "delphitools",
  description:
    "A collection of small, low stakes and low effort tools. No logins, no registration, no data collection.",
  icons: {
    icon: "/delphi-lowlod.png",
    shortcut: "/delphi-lowlod.png",
    apple: "/delphi-lowlod.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("theme");if(t==="dark"||(t!=="light"&&matchMedia("(prefers-color-scheme:dark)").matches))document.documentElement.classList.add("dark")}catch(e){}})()`,
          }}
        />
      </head>
      <body className="font-mono antialiased">
        <ColourNotationProvider>
          <SidebarProvider>
            <SkipLink />
            <AppSidebar />
            <SidebarInset>
              <AppHeader />
              <main
                className="flex-1 overflow-auto"
                id="main-content"
                tabIndex={-1}
              >
                {children}
              </main>
            </SidebarInset>
          </SidebarProvider>
        </ColourNotationProvider>
      </body>
    </html>
  );
}
