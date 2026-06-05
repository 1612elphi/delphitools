"use client"

import { Pipette } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { useColourNotation } from "@/hooks/use-colour-notation"
import { COLOUR_NOTATIONS } from "@/lib/colour-notation"

export function ColourNotationSelector() {
  const { notation, setNotation } = useColourNotation()

  const current = COLOUR_NOTATIONS.find(n => n.id === notation)

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 px-2 text-xs font-mono"
          title="Colour notation preference"
        >
          <Pipette className="size-3.5" />
          <span className="hidden sm:inline">{current?.label}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2" align="end">
        <div className="px-1 pb-2 text-xs font-medium text-muted-foreground">
          Colour Notation
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {COLOUR_NOTATIONS.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => setNotation(n.id)}
              title={n.example}
              className={`flex min-h-[3.25rem] items-center justify-center rounded-md border px-2 py-2 text-center text-xs font-medium leading-tight transition-colors ${
                notation === n.id
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border hover:border-primary/40 hover:bg-muted"
              }`}
            >
              {n.label}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
