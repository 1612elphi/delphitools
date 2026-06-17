const APP_STORE_URL = "https://apps.apple.com/us/app/delphitools/id6761313703"
const REPO_URL = "https://github.com/1612elphi/delphitools-cli"

// Real monospace, only for the literal shell command / flag — everything else
// is the UI font (iA Writer Quattro).
const mono = { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }

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

/**
 * "Elsewhere" — the iOS and CLI editions. Two full-width cards stacked in the
 * shared-hairline grid. Copy is constrained to the left (max-w-md); the mascot
 * is anchored bottom-right at a bounded height and hides on very narrow screens
 * (it's decorative), so the copy never gets squished or overlapped.
 */
export function DownloadCard() {
  return (
    <div className="grid border-l border-t border-border">
      {/* iOS */}
      <article className="group relative min-h-[240px] overflow-hidden border-r border-b border-border bg-gradient-to-br from-primary/[0.08] via-primary/[0.03] to-transparent p-6 sm:p-8">
        <div className="relative z-10 flex max-w-md flex-col items-start">
          <span className="text-[0.6rem] font-bold uppercase tracking-[0.2em] text-primary">iOS</span>
          <h3 className="mt-2 text-xl font-bold leading-snug text-foreground">
            The tools you love, now on iPhone and iPad.
          </h3>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            Built natively for iPhone and iPad. No accounts, no tracking, no compromises.
          </p>
          <a
            href={APP_STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-foreground px-4 py-2.5 text-xs font-semibold text-background transition-transform hover:scale-[1.03] active:scale-95"
          >
            <AppleLogo className="size-4" />
            Download on the App Store
            <span className="sr-only"> (opens in new tab)</span>
          </a>
        </div>
        <img
          src="/delphi-boxes.png"
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute bottom-6 right-6 hidden h-full max-h-[200px] w-auto select-none transition-transform duration-300 ease-out group-hover:scale-[1.04] xl:block"
        />
      </article>

      {/* CLI */}
      <article className="group relative min-h-[240px] overflow-hidden border-r border-b border-border bg-gradient-to-br from-emerald-600/[0.1] via-emerald-600/[0.03] to-transparent p-6 sm:p-8">
        <div className="relative z-10 flex max-w-md flex-col items-start">
          <span className="text-[0.6rem] font-bold uppercase tracking-[0.2em] text-emerald-700 dark:text-emerald-400">
            Terminal
          </span>
          <h3 className="mt-2 text-xl font-bold leading-snug text-foreground">
            Live in the terminal? Delphi&apos;s here too.
          </h3>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            The same tools, in your shell. Entirely offline. Everything pipes, everything takes{" "}
            <code
              style={mono}
              className="rounded bg-foreground/10 px-1 py-0.5 text-[0.7rem] text-foreground"
            >
              -j
            </code>{" "}
            for JSON.
          </p>
          <pre
            style={mono}
            className="mt-4 w-fit max-w-full overflow-x-auto rounded-md bg-zinc-900 px-3 py-2 text-[0.72rem] text-emerald-400 ring-1 ring-inset ring-white/10"
          >
            <code>$ cargo install delphitools-cli</code>
          </pre>
          <a
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <GithubLogo className="size-3.5" />
            view source
            <span className="sr-only"> (opens in new tab)</span>
          </a>
        </div>
        <img
          src="/delphi-cli.png"
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute bottom-6 right-6 hidden h-full max-h-[185px] w-auto select-none transition-transform duration-300 ease-out group-hover:scale-[1.04] xl:block"
        />
      </article>
    </div>
  )
}
