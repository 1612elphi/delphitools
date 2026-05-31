"use client"

import { useSyncExternalStore } from "react"
import { Moon, Sun } from "lucide-react"
import { Button } from "@/components/ui/button"

/** Subscribe to changes of the `dark` class on <html>, so the toggle stays in sync. */
function subscribeToTheme(callback: () => void) {
  const observer = new MutationObserver(callback)
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  })
  return () => observer.disconnect()
}

const isDarkSnapshot = () => document.documentElement.classList.contains("dark")
const serverFalse = () => false
const serverTrue = () => true
const noopSubscribe = () => () => {}

export function ThemeToggle() {
  // useSyncExternalStore reads the live theme without setting state in an effect,
  // and uses the server snapshot during hydration to avoid a mismatch.
  const dark = useSyncExternalStore(subscribeToTheme, isDarkSnapshot, serverFalse)
  const mounted = useSyncExternalStore(noopSubscribe, serverTrue, serverFalse)

  function toggle() {
    const next = !dark
    document.documentElement.classList.toggle("dark", next)
    localStorage.setItem("theme", next ? "dark" : "light")
  }

  if (!mounted) return <Button variant="ghost" size="icon" className="size-8" disabled><Sun className="size-4" /></Button>

  return (
    <Button variant="ghost" size="icon" className="size-8" onClick={toggle}>
      {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
      <span className="sr-only">Toggle theme</span>
    </Button>
  )
}
