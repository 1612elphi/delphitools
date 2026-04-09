"use client"

import { createContext, useContext, useState, useCallback } from "react"
import type { ColourNotation } from "@/lib/colour-notation"

interface ColourNotationContextValue {
  notation: ColourNotation
  setNotation: (n: ColourNotation) => void
}

export const ColourNotationContext = createContext<ColourNotationContextValue>({
  notation: "hex",
  setNotation: () => {},
})

export function useColourNotation() {
  return useContext(ColourNotationContext)
}

export function useColourNotationState() {
  const [notation, setNotationState] = useState<ColourNotation>("hex")

  const setNotation = useCallback((n: ColourNotation) => {
    setNotationState(n)
  }, [])

  return { notation, setNotation }
}
