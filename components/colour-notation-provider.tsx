"use client"

import { useMemo } from "react"
import { ColourNotationContext, useColourNotationState } from "@/hooks/use-colour-notation"

export function ColourNotationProvider({ children }: { children: React.ReactNode }) {
  const { notation, setNotation } = useColourNotationState()

  const value = useMemo(() => ({ notation, setNotation }), [notation, setNotation])

  return (
    <ColourNotationContext.Provider value={value}>
      {children}
    </ColourNotationContext.Provider>
  )
}
