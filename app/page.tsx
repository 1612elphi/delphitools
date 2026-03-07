import Link from "next/link";
import { ArrowRight, Star, ExternalLink } from "lucide-react";
import { toolCategories, featuredTools } from "@/lib/tools";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function Home() {
  return (
    <div className="p-6 md:p-8 lg:p-10">
      {/* Hero Section */}
      <div className="mb-12">
        <div className="flex items-center gap-3 mb-4">
          <img
            src="/delphi-friday.png"
            alt="Tools logo"
            width={1000}
            height={48}
          />
        </div>
        <div className="mt-6 max-w-2xl space-y-3 text-muted-foreground">
          <p className="text-lg">
            A collection of small, low stakes and low effort tools.
          </p>
          <p>
            No logins, no registration, no data collection. I can&apos;t believe
            I have to say that. Long live the handmade web.
          </p>
          <p>
            If you find these tools useful, I'm glad. You don't owe me anything. But if you're an artist, feel free to <Link className="underline" href="mailto:tools@rmv.fyi">email me your work</Link>. I'd love to see it.
          </p>
        </div>
      </div>

      {/* Greatest Hits */}
      <section className="mb-12">
        <div className="flex items-center gap-2 mb-4">
          <Star className="size-5 text-amber-500 fill-amber-500" />
          <h2 className="text-lg font-semibold text-foreground/80">
            Greatest Hits
          </h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {featuredTools.map((tool) => {
            const Icon = tool.icon;
            return (
              <Link key={tool.id} href={tool.href}>
                <Card className="group h-full transition-all border-amber-500/20 bg-amber-500/5 hover:border-amber-500/40 hover:bg-amber-500/10 hover:shadow-md">
                  <CardHeader className="pb-4">
                    <div className="flex items-start justify-between">
                      <div className="flex size-10 items-center justify-center rounded-lg bg-amber-500/10 group-hover:bg-amber-500/20 transition-colors">
                        <Icon className="size-5 text-amber-600 dark:text-amber-400" />
                      </div>
                      <ArrowRight className="size-4 text-amber-500/50 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                    <CardTitle className="text-base mt-3 flex items-center gap-2">
                      {tool.name}
                      {tool.beta && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-500/50 text-amber-600 dark:text-amber-400">Beta</Badge>
                      )}
                      {tool.new && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-primary/50 text-primary">New</Badge>
                      )}
                    </CardTitle>
                    <CardDescription className="text-sm">
                      {tool.description}
                    </CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Friends of Tools */}
      <section className="mb-12">
        <h2 className="text-lg font-semibold mb-4 text-foreground/80">
          Friends of Tools
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <a
            href="https://rmv.fyi/projects/taxiway"
            target="_blank"
            rel="noopener noreferrer"
            className="group block"
          >
            <div
              className="relative h-full overflow-hidden rounded-xl border transition-all hover:shadow-lg hover:scale-[1.01]"
              style={{
                background: 'linear-gradient(145deg, #0d0c0a 0%, #14130f 100%)',
                borderColor: '#2a2520',
              }}
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
                    style={{ color: '#9e7322', fontFamily: "'Geist Mono', monospace" }}
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
                  {'TAXIWAY'.split('').map((ch, i) => (
                    <div
                      key={i}
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
                        <span
                          style={{
                            fontFamily: "'Geist Mono', monospace",
                            fontWeight: 700,
                            fontSize: 22,
                            color: '#d4952a',
                            textShadow: '0 0 10px rgba(212, 149, 42, 0.15)',
                            lineHeight: 1,
                            position: 'absolute',
                            top: '100%',
                            left: '50%',
                            transform: 'translate(-50%, -50%)',
                          }}
                        >
                          {ch}
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
                        <span
                          style={{
                            fontFamily: "'Geist Mono', monospace",
                            fontWeight: 700,
                            fontSize: 22,
                            color: '#d4952a',
                            textShadow: '0 0 10px rgba(212, 149, 42, 0.15)',
                            lineHeight: 1,
                            position: 'absolute',
                            top: '0%',
                            left: '50%',
                            transform: 'translate(-50%, -50%)',
                          }}
                        >
                          {ch}
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
                    fontFamily: "'Geist Mono', monospace",
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
              className="relative h-full overflow-hidden rounded-xl border transition-all hover:shadow-lg hover:scale-[1.01]"
              style={{
                background: 'linear-gradient(145deg, #2d2d33 0%, #272730 100%)',
                borderColor: '#42424c',
              }}
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
                    style={{ color: '#8a9a68', fontFamily: "'Geist Mono', monospace" }}
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
                      fontFamily: "'Instrument Serif', Georgia, serif",
                      color: '#e8e4dc',
                    }}
                  >
                    Cassini
                  </h3>
                  <span
                    className="text-[10px] tracking-[0.2em] uppercase mt-1 inline-block"
                    style={{
                      color: '#c4523a',
                      fontFamily: "'Geist Mono', monospace",
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
                    fontFamily: "'Instrument Serif', Georgia, serif",
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
              className="relative h-full overflow-hidden rounded-xl border transition-all hover:shadow-lg hover:scale-[1.01]"
              style={{
                background: 'linear-gradient(145deg, #0d0d0d 0%, #1a1a2e 100%)',
                borderColor: '#2a2a3e',
              }}
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
                    style={{ color: '#7b68ee', fontFamily: "'Geist Mono', monospace" }}
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
                      fontFamily: "'Geist Mono', monospace",
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
                      fontFamily: "'Geist Mono', monospace",
                      letterSpacing: '0.1em',
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
                    fontFamily: "'Geist Mono', monospace",
                  }}
                >
                  7ext, transf0rmed.
                </p>
              </div>
            </div>
          </a>
        </div>
      </section>

      {/* Tool Categories */}
      <div className="space-y-10">
        {toolCategories.map((category) => (
          <section key={category.id}>
            <h2 className="text-lg font-semibold mb-4 text-foreground/80">
              {category.name}
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {category.tools.map((tool) => {
                const Icon = tool.icon;
                return (
                  <Link key={tool.id} href={tool.href}>
                    <Card className="group h-full transition-all hover:border-foreground/20 hover:shadow-md">
                      <CardHeader className="pb-4">
                        <div className="flex items-start justify-between">
                          <div className="flex size-10 items-center justify-center rounded-lg bg-muted group-hover:bg-primary/10 transition-colors">
                            <Icon className="size-5 text-muted-foreground group-hover:text-primary transition-colors" />
                          </div>
                          <ArrowRight className="size-4 text-muted-foreground/50 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                        <CardTitle className="text-base mt-3 flex items-center gap-2">
                          {tool.name}
                          {tool.beta && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-500/50 text-amber-600 dark:text-amber-400">Beta</Badge>
                          )}
                          {tool.new && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-primary/50 text-primary">New</Badge>
                          )}
                        </CardTitle>
                        <CardDescription className="text-sm">
                          {tool.description}
                        </CardDescription>
                      </CardHeader>
                    </Card>
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      {/* About Section */}
      <div className="mt-16 pt-8 border-t">
        <div className="max-w-2xl space-y-6">
          <h2 className="text-lg font-semibold text-foreground/80">About</h2>

          <div className="space-y-4 text-sm text-muted-foreground">
            <p>
              Tools is a collection of small, focused utilities that respect your privacy
              and work entirely in your browser. No data leaves your machine, no accounts required,
              no tracking. Just tools that do what they say.
            </p>
            <p>
              I love the web. The classic, real web full of weird things. And that web is out there. You just have to find it. And sometimes, you have to make it yourself.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 text-sm">
            <div className="space-y-2">
              <h3 className="font-medium text-foreground/80">Made by</h3>
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
            <div className="space-y-2">
              <h3 className="font-medium text-foreground/80">Live Site</h3>
              <p className="text-muted-foreground">
                <a
                  href="https://tools.brodyberson.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-primary transition-colors"
                >
                  tools.brodyberson.com
                </a>
              </p>
            </div>
          </div>

          <div className="pt-4 border-t border-border/50">
            <p className="text-xs text-muted-foreground/60">
              Built with Next.js, Tailwind CSS, and shadcn/ui. All processing happens locally in your browser.
            </p>
            <p className="text-xs text-muted-foreground/60 mt-2">
              Forked from{" "}
              <a
                href="https://github.com/1612elphi/delphitools"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-muted-foreground transition-colors"
              >
                delphitools
              </a>
              .
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
