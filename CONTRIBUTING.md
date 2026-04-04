# Contributing to delphitools

Thanks for your interest in contributing! delphitools welcomes code contributions from anyone, provided they align with the project's philosophy and the guidelines below.

## What we accept

- **Bug fixes** that resolve an open issue
- **New tools** that solve a real problem the contributor has personally encountered -- not hypothetical "might be useful" additions
- **Improvements** to existing tools that make them more useful or reliable

Every contribution should reference an issue. If one doesn't exist yet, open one first and describe the problem you're solving.

## The delphitools maxim

delphitools is **local, private, and static by design**. Every contribution must uphold these principles:

1. **No outside calls.** Tools must never phone home, fetch from external APIs, or transmit user data anywhere. All processing happens in the browser, on the user's device.
2. **No server components.** The entire web application compiles to static HTML. Server Actions, API routes, server-side data fetching, and any runtime server dependency are not permitted. The only server involvement is at build time (`next build`).
3. **All local, all private.** No analytics, no tracking, no cookies, no logins, no telemetry. If a tool needs data, the user provides it and it never leaves their machine.

If your contribution can't work within these constraints, it doesn't belong in delphitools.

## UNIX philosophy

Each tool should do one thing well. Resist the urge to build a Swiss army knife -- a focused tool that solves a specific problem cleanly is better than a sprawling tool that does everything poorly. Compose small, sharp utilities rather than monolithic features.

## AI-assisted contributions

AI-generated or AI-assisted code is welcome, but **every contribution must be human-reviewed before submission**. You are responsible for understanding what your code does, why it works, and what it doesn't handle. "My AI wrote it" is not an acceptable response to review feedback.

## How to contribute

1. **Open or find an issue** describing the problem or tool you want to work on
2. **Fork the repo** and create a branch from `main`
3. **Follow existing conventions** -- read `CLAUDE.md` for project structure, naming, and style guidance
4. **Verify your changes**:
   - `npm run build` must succeed (static export, no server dependencies)
   - `npm run lint` must pass
   - Test your changes manually in the browser
5. **Open a pull request** referencing the issue it addresses

## Adding a new tool

1. Create your tool component in `components/tools/` with `"use client"`
2. Register it in `components/tools/index.tsx` using a dynamic import
3. Add metadata to `lib/tools.ts` (id, name, description, category)
4. Confirm `npm run build` still produces a fully static export

See `CLAUDE.md` for the full tool component structure and naming conventions.

## Code style

- **British spelling** in user-facing text: "colour", "optimiser", "favourite"
- **kebab-case** for tool IDs and file names
- **PascalCase** for component names
- Use existing `components/ui/` primitives (shadcn/ui) rather than rolling your own
- Tailwind CSS for styling -- no custom CSS files
- Keep dependencies minimal. If you can do it without a library, do it without a library.

## What we won't accept

- Features that require a running server or external service
- Tools that send data off-device for any reason
- Contributions without an associated issue
- Code the contributor can't explain or defend in review
- Scope creep disguised as improvements

## Questions?

Open an issue. Keep it simple.
