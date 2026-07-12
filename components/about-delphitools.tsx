/**
 * The About-delphitools dialog body, extracted verbatim from app-sidebar's
 * footer dialog so the Substrata editor's Help ▸ About delphitools pane can
 * render the same content (single source of truth for the copy, contributor
 * and thanks lists). Both hosts wrap it in their own DialogContent/Header.
 */
export function AboutDelphitoolsBody() {
  return (
    <>
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
      <div className="grid gap-4 sm:grid-cols-2 text-sm pt-4 border-t">
        <div className="space-y-1">
          <h3 className="font-medium text-foreground">Made by</h3>
          <p className="text-muted-foreground">
            <a
              href="https://rmv.fyi"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-primary transition-colors"
            >
              delphi<span className="sr-only"> (opens in new tab)</span>
            </a>
          </p>
        </div>
        <div className="space-y-1">
          <h3 className="font-medium text-foreground">Source</h3>
          <p className="text-muted-foreground">
            <a
              href="https://github.com/1612elphi/delphitools"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-primary transition-colors"
            >
              1612elphi/delphitools<span className="sr-only"> (opens in new tab)</span>
            </a>
          </p>
        </div>
      </div>
      <div className="pt-4 border-t space-y-2">
        <h3 className="font-medium text-foreground text-sm">Contributors</h3>
        <div className="flex flex-wrap gap-1.5">
          {[
            { name: "Himanshu Balani", url: "https://github.com/himanshubalani" },
            { name: "Mahmoud Ashraf", url: "https://github.com/SNO7E-G" },
            { name: "Moamal Alaa", url: "https://github.com/Moamal-2000" },
            { name: "Muhammad Fikri", url: "https://github.com/MuhammadFikriiii" },
            { name: "Claude", url: "https://rmv.fyi/notes/i-hope-you-don-t-use-generative-ai" },
          ].map((person) => (
            <a
              key={person.name}
              href={person.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs px-2 py-1 rounded-md bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors"
            >
              {person.name}<span className="sr-only"> (opens in new tab)</span>
            </a>
          ))}
        </div>
        <p className="text-xs text-muted-foreground/60 pt-1">
          <a
            href="https://rmv.fyi/notes/i-hope-you-don-t-use-generative-ai"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-muted-foreground transition-colors"
          >
            Behind the scenes of delphitools<span className="sr-only"> (opens in new tab)</span>
          </a>
        </p>
      </div>
      <div className="pt-4 border-t space-y-2">
        <h3 className="font-medium text-foreground text-sm">With thanks to</h3>
        <p className="text-xs text-muted-foreground">
          Folks who, instead of donating to delphitools, gave to Wikipedia or the EFF
          on its behalf.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {[
            { name: "Joe Herby", org: "EFF", orgUrl: "https://www.eff.org" },
            { name: "Val C", org: "EFF", orgUrl: "https://www.eff.org" },
            { name: "Kacper Węgrowski", org: "Wikipedia", orgUrl: "https://donate.wikimedia.org" },
            { name: "Carlos Araújo", org: "Wikipedia", orgUrl: "https://donate.wikimedia.org" },
          ].map((donor) => (
            <a
              key={donor.name}
              href={donor.orgUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs px-2 py-1 rounded-md bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors"
            >
              {donor.name} · {donor.org}<span className="sr-only"> (opens in new tab)</span>
            </a>
          ))}
        </div>
      </div>
      <div className="pt-4 border-t space-y-2">
        <h3 className="font-medium text-foreground text-sm">Built with</h3>
        <div className="flex flex-wrap gap-1.5">
          {[
            { name: "Next.js", url: "https://nextjs.org" },
            { name: "React", url: "https://react.dev" },
            { name: "Tailwind CSS", url: "https://tailwindcss.com" },
            { name: "shadcn/ui", url: "https://ui.shadcn.com" },
            { name: "Radix UI", url: "https://radix-ui.com" },
            { name: "Lucide", url: "https://lucide.dev" },
          ].map((lib) => (
            <a
              key={lib.name}
              href={lib.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs px-2 py-1 rounded-md bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors"
            >
              {lib.name}<span className="sr-only"> (opens in new tab)</span>
            </a>
          ))}
        </div>
        <p className="text-xs text-muted-foreground/60 pt-2">
          Plus{" "}
          <a
            href="https://github.com/1612elphi/delphitools/blob/main/ACKNOWLEDGEMENTS.md"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-muted-foreground transition-colors"
          >
            many more open source libraries<span className="sr-only"> (opens in new tab)</span>
          </a>
          .
        </p>
      </div>
    </>
  );
}
