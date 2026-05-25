"use client"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

const APP_STORE_URL = "https://apps.apple.com/us/app/delphitools/id6761313703"
const REPO_URL = "https://github.com/1612elphi/delphitools-cli"

const AppleLogo = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
  </svg>
)

const GithubLogo = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56 0-.27-.01-1.16-.02-2.1-3.2.7-3.87-1.36-3.87-1.36-.52-1.33-1.28-1.69-1.28-1.69-1.05-.72.08-.71.08-.71 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11.06 11.06 0 0 1 5.79 0c2.21-1.49 3.18-1.18 3.18-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.42-2.69 5.39-5.25 5.68.41.36.78 1.06.78 2.13 0 1.54-.01 2.78-.01 3.16 0 .31.21.68.8.56C20.21 21.38 23.5 17.08 23.5 12 23.5 5.65 18.35.5 12 .5Z" />
  </svg>
)

function AppStoreButton() {
  return (
    <a
      href={APP_STORE_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 rounded-lg bg-foreground px-5 py-2.5 transition-opacity hover:opacity-90"
    >
      <AppleLogo className="size-4 text-background" />
      <span className="text-sm font-medium text-background">Download on the App Store</span>
    </a>
  )
}

function CliActions() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <pre className="overflow-x-auto rounded-lg bg-zinc-900 px-4 py-3 font-mono text-xs text-[#00aa00]">
        <code>$ cargo install delphitools-cli</code>
      </pre>
      <a
        href={REPO_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <GithubLogo className="size-3.5" />
        <span>view github</span>
      </a>
    </div>
  )
}

function DesktopIosCard() {
  return (
    <section className="mb-6 hidden sm:block sm:pt-20">
      <div className="relative">
        <div className="rounded-2xl border border-primary/20 bg-primary/5 transition-all hover:border-primary/30 hover:shadow-lg">
          <div className="relative p-10 pr-48 md:pr-56 lg:pr-64">
            <div className="space-y-4 max-w-lg">
              <h3 className="text-3xl font-semibold leading-tight text-foreground">
                The tools you love, now on iPhone and iPad.
              </h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                The same privacy-first tools you rely on, built natively for iOS. No accounts, no tracking, no compromises.
              </p>
              <div className="pt-2 flex flex-wrap gap-3">
                <AppStoreButton />
              </div>
            </div>
          </div>
        </div>
        <img
          src="/delphi-boxes.png"
          alt="delphi carrying a stack of tool boxes"
          className="absolute right-6 bottom-4 h-[calc(100%+5rem)] w-auto pointer-events-none"
        />
      </div>
    </section>
  )
}

function DesktopCliCard() {
  return (
    <section className="mb-12 hidden sm:block">
      <div className="relative">
        <div className="rounded-2xl border border-emerald-600/20 bg-emerald-600/5 transition-all hover:border-emerald-600/30 hover:shadow-lg">
          <div className="relative p-10 pr-60 md:pr-64 lg:pr-72">
            <div className="space-y-4 max-w-lg">
              <h3 className="text-3xl font-semibold leading-tight text-foreground">
                Live in the terminal? Delphi&apos;s here too.
              </h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                The same privacy-first tools, in your shell. Entirely offline. Everything pipes. Everything takes <code className="font-mono text-xs">-j</code> for JSON.
              </p>
              <CliActions />
            </div>
          </div>
        </div>
        <img
          src="/delphi-cli.png"
          alt="delphi trapped in a terminal box"
          className="absolute right-6 top-6 h-[calc(100%-2.75rem)] w-auto pointer-events-none"
        />
      </div>
    </section>
  )
}

function MobileTabsCard() {
  return (
    <section className="mb-12 sm:hidden">
      <Tabs defaultValue="ios">
        <div className="rounded-2xl border border-primary/20 bg-primary/5">
          <div className="flex flex-col gap-3 px-6 pt-6">
            <h3 className="text-xl font-semibold leading-tight text-foreground">
              Get delphitools for…
            </h3>
            <TabsList>
              <TabsTrigger value="ios">iOS</TabsTrigger>
              <TabsTrigger value="cli">CLI</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="ios" className="mt-0">
            <div className="flex flex-col gap-4 p-6 pt-4">
              <div className="flex justify-center pt-2">
                <img
                  src="/delphi-boxes.png"
                  alt="delphi carrying a stack of tool boxes"
                  className="h-40 w-auto"
                />
              </div>
              <p className="text-sm leading-relaxed text-muted-foreground">
                The same privacy-first tools you rely on, built natively for iOS.
              </p>
              <div className="flex flex-wrap gap-3">
                <AppStoreButton />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="cli" className="mt-0">
            <div className="flex flex-col gap-4 p-6 pt-4">
              <div className="flex justify-center pt-2">
                <img
                  src="/delphi-cli.png"
                  alt="delphi trapped in a terminal box"
                  className="h-40 w-auto"
                />
              </div>
              <p className="text-sm leading-relaxed text-muted-foreground">
                The same privacy-first tools, in your shell. Entirely offline. Everything pipes.
              </p>
              <CliActions />
            </div>
          </TabsContent>
        </div>
      </Tabs>
    </section>
  )
}

export function DownloadCard() {
  return (
    <>
      <DesktopIosCard />
      <DesktopCliCard />
      <MobileTabsCard />
    </>
  )
}
