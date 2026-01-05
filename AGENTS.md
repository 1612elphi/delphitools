# DelphiTools - AGENTS.md

This file contains instructions for agentic coding assistants working in this repository.

## Build & Development Commands

```bash
npm run dev      # Start development server (localhost:3000)
npm run build    # Build for production
npm start        # Start production server
npm run lint     # Run ESLint
```

**Note:** No test framework is currently configured. Add tests if implementing new functionality that warrants testing.

## Project Stack

- **Framework:** Next.js 16 (App Router)
- **Language:** TypeScript (strict mode enabled)
- **Styling:** Tailwind CSS v4
- **Components:** shadcn/ui (new-york style) + Radix UI primitives
- **Icons:** lucide-react

## Code Style Guidelines

### Imports

- Use ES6 imports with `@/*` alias for absolute paths:
  ```tsx
  import { Button } from "@/components/ui/button";
  import { cn } from "@/lib/utils";
  ```
- Group external library imports first, then internal imports
- Destructure icon imports: `import { Copy, Check } from "lucide-react";`

### File Structure

- `app/` - Next.js App Router pages and layouts
- `components/tools/` - Tool implementations (e.g., `palette-genny.tsx`)
- `components/ui/` - Base UI components from shadcn/ui
- `lib/` - Utility functions, shared logic
- `hooks/` - Custom React hooks

### Component Conventions

- **Client components:** Add `"use client";` at the very top
- **Naming:** PascalCase for components and types, camelCase for functions and variables
- **Exports:** Named exports for components: `export function MyTool() { ... }`
- **Props:** Explicit TypeScript types, use `Readonly<>` wrapper for complex props

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function MyTool() {
  const [value, setValue] = useState("");

  return <div>...</div>;
}
```

### Styling

- Use `cn()` utility from `@/lib/utils` to merge Tailwind classes:
  ```tsx
  import { cn } from "@/lib/utils";
  className={cn("base-class", isActive && "active-class")}
  ```
- Follow Tailwind v4 conventions
- Use semantic utility classes (e.g., `text-sm`, `font-bold`, `p-4`)
- Prefix responsive variants: `md:`, `lg:`

### TypeScript

- Explicit types for interfaces and type definitions
- Use `type` for unions/primitives, `interface` for objects with shape
- Use `null` for missing/failed operations (no explicit error boundaries)
- Type imports: `import type { Metadata } from "next";`

```tsx
interface PaletteColour {
  id: string;
  hex: string;
  locked: boolean;
}

type PaletteStrategy = "analogous" | "complementary" | "triadic";
```

### React Hooks

- Use `useCallback` for event handlers passed to children
- Use `useRef` for DOM refs and non-reactive values
- Use `useEffect` for side effects (always return cleanup function for event listeners)

```tsx
const handleClick = useCallback(() => {
  setCount(prev => prev + 1);
}, []);
```

### Constants

- Use UPPER_SNAKE_CASE for constants:
  ```tsx
  const MIN_COLOURS = 2;
  const MAX_COLOURS = 11;
  const MOBILE_BREAKPOINT = 640;
  ```

### Utility Functions

- Place shared logic in `lib/` directory
- Pure functions preferred
- Use JSDoc-style comments for sections:
  ```tsx
  // ============================================================================
  // SECTION NAME
  // ============================================================================
  ```

### Tool Implementation Pattern

Tools typically follow this structure:
1. `"use client"` directive
2. Imports (React hooks, icons, UI components, utilities)
3. Helper functions (local utility functions)
4. Type definitions
5. Constants
6. Main component with state and callbacks
7. JSX return with UI

See `components/tools/palette-genny.tsx:859` as a reference.

### Error Handling

- Return `null` for failed operations (e.g., invalid color parsing)
- Use optional chaining `?.` and nullish coalescing `??` where appropriate
- Minimal try/catch - prefer validation checks

### Comments

- **NO** regular comments in code (unless explicitly requested)
- Section headers use the comment block style shown above
- JSDoc for exported functions is optional but helpful

### ESLint

- Run `npm run lint` before committing
- Linting config: `eslint.config.mjs` - extends Next.js core-web-vitals and TypeScript rules
- No additional custom rules

## Adding New Tools

1. Create component in `components/tools/[tool-id].tsx`
2. Add tool entry to `lib/tools.ts` in the appropriate category
3. Create page at `app/tools/[tool-id]/page.tsx`:
   ```tsx
   import { ToolIdTool } from "@/components/tools/tool-id";
   import type { Metadata } from "next";

   export const metadata: Metadata = {
     title: "Tool Name - delphitools",
     description: "Tool description",
   };

   export default function Page() {
     return <ToolIdTool />;
   }
   ```
4. Use existing tools as templates for patterns and styling

## Testing

No tests currently exist. If adding tests, choose an appropriate framework and add test scripts to `package.json`.
