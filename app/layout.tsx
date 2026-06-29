import type { Metadata } from "next";
import "./globals.css";

import { ColourNotationProvider } from "@/components/colour-notation-provider";

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

/**
 * Bare root layout: <html>/<body>, the no-flash theme bootstrap, and the
 * globally-shared colour-notation context. The site chrome (sidebar + header)
 * lives in app/(site)/layout.tsx so that sibling route trees — notably the
 * full-viewport Substrata editor at /editor — can opt out of it. Layouts nest
 * rather than replace, so anything chrome-specific must NOT live here.
 */
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
        <ColourNotationProvider>{children}</ColourNotationProvider>
      </body>
    </html>
  );
}
