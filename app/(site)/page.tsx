import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { featuredTools, allTools } from "@/lib/tools";
import { ToolGrid, FeaturedGrid } from "@/components/tool-grid";
import { DownloadCard } from "@/components/download-card";
import { StickerWall } from "@/components/sticker-wall";
import { SectionHeader } from "@/components/section-header";

export const metadata: Metadata = {
  title: "delphitools — privacy-first browser tools",
  description:
    "A collection of small, low stakes and low effort tools. No logins, no registration, no data collection. Everything runs locally in your browser.",
};

/** Letters of the TAXIWAY wordmark, pre-keyed so duplicate letters keep stable identities. */
const TAXIWAY_TILES = "TAXIWAY".split("").map((ch, i) => ({ ch, id: `tile-${i}` }));

export default function Home() {
  return (
    <div className="p-6 md:p-8 lg:p-10">
      {/* Hero */}
      <header className="mb-12">
        <img
          src="/delphi-friday.png"
          alt=""
          width={4871}
          height={1714}
          className="h-auto w-full max-w-2xl"
        />
        <h1 className="sr-only">delphitools</h1>
        <div className="mt-6 max-w-2xl space-y-3 text-sm leading-relaxed text-muted-foreground">
          <p className="text-base leading-snug text-foreground">
            A collection of small, low stakes and low effort tools.
          </p>
          <p>
            No logins, no registration, no data collection. I can&apos;t believe I have to say
            that. Long live the handmade web.
          </p>
          <p>
            If you find these tools useful, I&apos;m glad. You don&apos;t owe me anything. But if
            you&apos;re an artist, feel free to{" "}
            <Link className="underline" href="mailto:tools@rmv.fyi">
              email me your work
            </Link>
            . I&apos;d love to see it.
          </p>
          <p>
            If you would like to donate to delphitools, I ask that you don&apos;t. Make a donation
            to{" "}
            <a
              className="underline"
              href="https://donate.wikimedia.org"
              target="_blank"
              rel="noopener noreferrer"
            >
              Wikipedia<span className="sr-only"> (opens in new tab)</span>
            </a>{" "}
            or the{" "}
            <a
              className="underline"
              href="https://www.eff.org/donate"
              target="_blank"
              rel="noopener noreferrer"
            >
              EFF<span className="sr-only"> (opens in new tab)</span>
            </a>{" "}
            instead. Email me your proof of donation and I&apos;ll put you in the credits.
          </p>
        </div>
      </header>

      {/* Greatest Hits */}
      <section className="mb-12">
        <SectionHeader title="Greatest Hits" count={featuredTools.length} star />
        <FeaturedGrid />
      </section>

      {/* Elsewhere */}
      <section className="mb-12">
        <SectionHeader title="Elsewhere" count={2} />
        <DownloadCard />
      </section>

      {/* All Tools */}
      <section>
        <SectionHeader title="All Tools" count={allTools.length} />
        <ToolGrid />
      </section>

      {/* Friends of Delphi */}
      <section className="mt-16">
        <SectionHeader title="Friends of Delphi" count={3} />
        <div className="grid border-l border-t border-border sm:grid-cols-2 lg:grid-cols-3">
          <a
            href="https://rmv.fyi/projects/taxiway"
            target="_blank"
            rel="noopener noreferrer"
            className="group block"
          >
            <div
              className="relative h-full overflow-hidden border-r border-b border-border transition-all"
              style={{
                background: 'linear-gradient(145deg, #0d0c0a 0%, #14130f 100%)',              }}
            >
              <div
                className="absolute inset-0 opacity-[0.06]"
                style={{
                  backgroundImage: 'repeating-linear-gradient(90deg, #5b8fa8 0px, #5b8fa8 1px, transparent 1px, transparent 80px), repeating-linear-gradient(0deg, #5b8fa8 0px, #5b8fa8 1px, transparent 1px, transparent 80px)',
                }}
              />
              <div className="relative p-6 flex flex-col gap-4">
                <div className="flex items-start justify-between">
                  <div
                    className="text-[10px] tracking-[0.3em] uppercase"
                    style={{ color: '#9e7322', fontFamily: "var(--font-mono)" }}
                  >
                    PDF Preflight
                  </div>
                  <ExternalLink
                    className="size-3.5 opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ color: '#d4952a' }}
                  />
                </div>
                <div
                  className="inline-flex gap-[5px] p-[8px_10px] rounded-lg"
                  style={{ background: '#161513' }}
                >
                  {TAXIWAY_TILES.map((tile) => (
                    <div
                      key={tile.id}
                      className="relative flex flex-col gap-[1px] overflow-hidden"
                      style={{ width: 34, height: 46 }}
                    >
                      <div
                        className="relative flex-1 flex items-end justify-center overflow-hidden"
                        style={{
                          borderRadius: '4px 4px 1px 1px',
                          background: 'linear-gradient(180deg, #2a2825 0%, #252420 100%)',
                          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)',
                        }}
                      >
                        <span className="taxiway-glyph" style={{ top: '100%' }}>
                          {tile.ch}
                        </span>
                      </div>
                      <div
                        className="relative flex-1 flex items-start justify-center overflow-hidden"
                        style={{
                          borderRadius: '1px 1px 4px 4px',
                          background: 'linear-gradient(180deg, #222120 0%, #1f1e1b 100%)',
                          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.02)',
                        }}
                      >
                        <span className="taxiway-glyph" style={{ top: '0%' }}>
                          {tile.ch}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
                <p
                  className="text-sm leading-relaxed"
                  style={{
                    color: '#e8dcc8',
                    opacity: 0.4,
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  Your PDFs, cleared for takeoff.
                </p>
              </div>
            </div>
          </a>

          <a
            href="https://rmv.fyi/projects/cassini"
            target="_blank"
            rel="noopener noreferrer"
            className="group block"
          >
            <div
              className="relative h-full overflow-hidden border-r border-b border-border transition-all"
              style={{
                background: 'linear-gradient(145deg, #2d2d33 0%, #272730 100%)',              }}
            >
              <div
                className="absolute inset-0 opacity-[0.04]"
                style={{
                  backgroundImage: 'repeating-linear-gradient(90deg, #e8e4dc 0px, #e8e4dc 1px, transparent 1px, transparent 60px)',
                }}
              />
              <div className="relative p-6 flex flex-col gap-4">
                <div className="flex items-start justify-between">
                  <div
                    className="text-[10px] tracking-[0.3em] uppercase"
                    style={{ color: '#8a9a68', fontFamily: "var(--font-mono)" }}
                  >
                    Drawing App
                  </div>
                  <ExternalLink
                    className="size-3.5 opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ color: '#e8e4dc' }}
                  />
                </div>
                <div>
                  <h3
                    className="text-3xl leading-none"
                    style={{
                      fontFamily: "var(--font-mono)",
                      color: '#e8e4dc',
                    }}
                  >
                    Cassini
                  </h3>
                  <span
                    className="text-[10px] tracking-[0.2em] uppercase mt-1 inline-block"
                    style={{
                      color: '#c4523a',
                      fontFamily: "var(--font-mono)",
                    }}
                  >
                    ECS-1
                  </span>
                </div>
                <p
                  className="text-sm leading-relaxed"
                  style={{
                    color: '#e8e4dc',
                    opacity: 0.5,
                    fontFamily: "var(--font-mono)",
                    fontStyle: 'italic',
                  }}
                >
                  Create with limits.
                </p>
              </div>
            </div>
          </a>

          <a
            href="https://1337suite.is-hella.tech"
            target="_blank"
            rel="noopener noreferrer"
            className="group block"
          >
            <div
              className="relative h-full overflow-hidden border-r border-b border-border transition-all"
              style={{
                background: 'linear-gradient(145deg, #0d0d0d 0%, #1a1a2e 100%)',              }}
            >
              <div
                className="absolute inset-0 opacity-[0.03]"
                style={{
                  backgroundImage: 'repeating-linear-gradient(0deg, #00ff41 0px, #00ff41 1px, transparent 1px, transparent 40px)',
                }}
              />
              <div className="relative p-6 flex flex-col gap-4">
                <div className="flex items-start justify-between">
                  <div
                    className="text-[10px] tracking-[0.3em] uppercase"
                    style={{ color: '#7b68ee', fontFamily: "var(--font-mono)" }}
                  >
                    Unicode &amp; Text Tools
                  </div>
                  <ExternalLink
                    className="size-3.5 opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ color: '#00ff41' }}
                  />
                </div>
                <div>
                  <h3
                    className="text-sm leading-none"
                    style={{
                      fontFamily: "var(--font-mono)",
                      color: '#e0e0e0',
                      opacity: 0.7,
                      letterSpacing: '0.05em',
                    }}
                  >
                    Eleonor Rose&apos;s
                  </h3>
                  <span
                    className="text-2xl font-bold mt-1 inline-block"
                    style={{
                      color: '#00ff41',
                      fontFamily: "var(--font-mono)",
                      letterSpacing: '0.05em',
                      textShadow: '0 0 7px #00ff41, 0 0 20px rgba(0, 255, 65, 0.4)',
                    }}
                  >
                    [1337 SUITE]
                  </span>
                </div>
                <p
                  className="text-sm leading-relaxed"
                  style={{
                    color: '#00ff41',
                    opacity: 0.4,
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  7ext, transf0rmed.
                </p>
              </div>
            </div>
          </a>
        </div>
      </section>

      {/* Stickers */}
      <StickerWall />

      {/* About */}
      <section className="mt-16">
        <SectionHeader title="About" />
        <div className="max-w-2xl space-y-5 text-sm leading-relaxed text-muted-foreground">
          <p>
            delphitools is a collection of small, focused utilities that respect your privacy and
            work entirely in your browser. No data leaves your machine, no accounts required, no
            tracking. Just tools that do what they say.
          </p>
          <p>
            I love the web. The classic, real web full of weird things. And that web is out there.
            You just have to find it. And sometimes, you have to make it yourself.
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <h3 className="text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-foreground">
                Made by
              </h3>
              <p>
                <a
                  href="https://rmv.fyi"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  delphi<span className="sr-only"> (opens in new tab)</span>
                </a>
              </p>
            </div>
            <div className="space-y-1.5">
              <h3 className="text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-foreground">
                Source
              </h3>
              <p>
                <a
                  href="https://github.com/1612elphi/delphitools"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  1612elphi/delphitools<span className="sr-only"> (opens in new tab)</span>
                </a>
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-foreground">
              Contributors
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {[
                { name: "Himanshu Balani", url: "https://github.com/himanshubalani" },
                { name: "Mahmoud Ashraf", url: "https://github.com/SNO7E-G" },
                { name: "Moamal Alaa", url: "https://github.com/Moamal-2000" },
                { name: "Mouaz Aldakkak", url: "https://github.com/movoid12" },
                { name: "Pranav K", url: "https://github.com/Pranavk-official" },
                { name: "Claude", url: "https://rmv.fyi/notes/i-hope-you-don-t-use-generative-ai" },
              ].map((person) => (
                <a
                  key={person.name}
                  href={person.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground"
                >
                  {person.name}<span className="sr-only"> (opens in new tab)</span>
                </a>
              ))}
            </div>
            <p className="pt-1 text-xs text-muted-foreground/60">
              <a
                href="https://rmv.fyi/notes/i-hope-you-don-t-use-generative-ai"
                target="_blank"
                rel="noopener noreferrer"
                className="underline transition-colors hover:text-muted-foreground"
              >
                Behind the scenes of delphitools<span className="sr-only"> (opens in new tab)</span>
              </a>
            </p>
          </div>

          <p className="border-t border-border pt-4 text-xs text-muted-foreground/60">
            Built with Next.js, Tailwind CSS, and shadcn/ui. All processing happens locally in your
            browser.
          </p>
        </div>
      </section>
    </div>
  );
}
