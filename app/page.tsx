import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Star } from "lucide-react";
import { toolCategories, featuredTools } from "@/lib/tools";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default function Home() {
  return (
    <div className="p-6 md:p-8 lg:p-10">
      {/* Hero Section */}
      <div className="mb-12">
        <div className="flex items-center gap-3 mb-4">
          <Image
            src="/delphi-friday.png"
            alt="delphitools logo"
            width={1000}
            height={48}
            className=""
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
            Delphi&apos;s Greatest Hits
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
                    <CardTitle className="text-base mt-3">
                      {tool.name}
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
                        <CardTitle className="text-base mt-3">
                          {tool.name}
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
              delphitools is a collection of small, focused utilities that respect your privacy
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
              <h3 className="font-medium text-foreground/80">Source</h3>
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

          <div className="pt-4 border-t border-border/50">
            <p className="text-xs text-muted-foreground/60">
              Built with Next.js, Tailwind CSS, and shadcn/ui. All processing happens locally in your browser.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
