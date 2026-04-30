const APP_STORE_URL = "https://apps.apple.com/us/app/delphitools/id6761313703"

const AppleLogo = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
  </svg>
)

export function IosAppCard() {
  return (
    <section className="mb-12 sm:pt-20">
      <div className="relative">
        <div className="rounded-2xl border border-primary/20 bg-primary/5 transition-all hover:border-primary/30 hover:shadow-lg">
          {/* Mobile layout */}
          <div className="flex flex-col gap-4 p-8 sm:hidden">
            <img
              src="/dt-icon.jpg"
              alt="delphitools app icon"
              className="size-16 rounded-xl shadow-sm"
            />
            <div className="space-y-2">
              <h3 className="text-xl font-semibold leading-tight text-foreground">
                The tools you love, now on iPhone and iPad.
              </h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                The same privacy-first tools you rely on, built natively for iOS.
              </p>
            </div>
            <div className="mt-1 flex flex-wrap gap-3">
              <a
                href={APP_STORE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg bg-foreground px-5 py-2.5 transition-opacity hover:opacity-90"
              >
                <AppleLogo className="size-4 text-background" />
                <span className="text-sm font-medium text-background">Download on the App Store</span>
              </a>
            </div>
          </div>
          {/* Desktop layout */}
          <div className="relative hidden sm:block p-10 pr-48 md:pr-56 lg:pr-64">
            <div className="space-y-4 max-w-lg">
              <h3 className="text-3xl font-semibold leading-tight text-foreground">
                The tools you love, now on iPhone and iPad.
              </h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                The same privacy-first tools you rely on, built natively for iOS. No accounts, no tracking, no compromises.
              </p>
              <div className="pt-2 flex flex-wrap gap-3">
                <a
                  href={APP_STORE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-lg bg-foreground px-5 py-2.5 transition-opacity hover:opacity-90"
                >
                  <AppleLogo className="size-4 text-background" />
                  <span className="text-sm font-medium text-background">Download on the App Store</span>
                </a>
              </div>
            </div>
          </div>
        </div>
        {/* Desktop: overlapping etching */}
        <img
          src="/delphi-boxes.png"
          alt="delphi carrying a stack of tool boxes"
          className="hidden sm:block absolute right-6 -bottom-16 h-[calc(100%+8rem)] w-auto pointer-events-none"
        />
      </div>
    </section>
  )
}
