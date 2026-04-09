"use client"

import { ColourNotationContext, useColourNotationState } from "@/hooks/use-colour-notation"

export function ColourNotationProvider({ children }: { children: React.ReactNode }) {
  const { notation, setNotation } = useColourNotationState()

  return (
    <ColourNotationContext.Provider value={{ notation, setNotation }}>
      {children}
    </ColourNotationContext.Provider>
  )
}
