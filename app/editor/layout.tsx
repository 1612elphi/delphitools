import type { Metadata } from "next";

/**
 * Substrata editor root. Sits OUTSIDE the (site) route group, so it inherits
 * only the bare root layout (html/body/theme) — no sidebar, no per-tool max-w
 * chrome. Full-viewport, fixed shell (no page scroll); the canvas owns its own
 * panning/zoom (M1-4). This is a Server Component purely so it can export
 * metadata — all interactive surfaces are client components below it.
 *
 * NOTE (gated work, do NOT build unattended): the real window shell — top bar
 * (§7), Scene/Edit/Workspace/Help menus, omnibar + utility rail dock regions —
 * is M0-4/M0-5/M0-6 and needs Ruby's visual review. This layout only
 * establishes the full-viewport box they will live in.
 */
// share card rendered by ./og.png/route.tsx
const image = {
  url: "/editor/og.png",
  width: 1200,
  height: 630,
  // ∑CG: og:image:alt for the Substrata share card, announced by screen readers on social posts
  //   spec: one sentence describing the card, ≤ 120 chars, names Substrata
  //   sample: "A share card for Substrata, the delphitools image editor."
  alt: "∑CG",
};

export const metadata: Metadata = {
  // "Substrata" is Ruby's chosen product name (an identifier they set), not
  // authored copy. Any descriptive tagline appended here would be \u2211CG.
  title: "Substrata",
  openGraph: { type: "website", siteName: "delphitools", title: "Substrata", url: "/editor", images: [image] },
};

export default function EditorLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="fixed inset-0 flex h-[100dvh] w-screen flex-col overflow-hidden bg-background text-foreground">
      {children}
    </div>
  );
}
