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
      <PopoverContent className="w-72 p-2 max-h-[70vh] overflow-y-auto" align="end">
        <div className="text-xs font-medium text-muted-foreground px-2 py-1.5">
          Colour Notation
        </div>
        {COLOUR_NOTATIONS.map((n) => (
          <button
            key={n.id}
            onClick={() => setNotation(n.id)}
            className={`w-full flex flex-col items-start px-2 py-1.5 rounded-md text-left transition-colors ${
              notation === n.id
                ? "bg-primary/10 text-primary"
                : "hover:bg-muted"
            }`}
          >
            <span className="text-sm font-medium">{n.label}</span>
            <span className="text-xs font-mono text-muted-foreground">{n.example}</span>
          </button>
        ))}
      </PopoverContent>
    </Popover>
  )
}
