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
export const metadata: Metadata = {
  // "Substrata" is Ruby's chosen product name (an identifier she set), not
  // authored copy. Any descriptive tagline appended here would be ∑CG.
  title: "Substrata",
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
