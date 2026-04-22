import { useEffect, useRef } from "react"

export function useFilePaste(
  handler: (file: File) => void,
  accept?: string
) {
  const handlerRef = useRef(handler)
  handlerRef.current = handler

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = e.clipboardData?.files
      if (!files?.length) return

      const file = files[0]
      if (accept && !matchesAccept(file, accept)) return

      e.preventDefault()
      handlerRef.current(file)
    }
    document.addEventListener("paste", onPaste)
    return () => document.removeEventListener("paste", onPaste)
  }, [accept])
}

function matchesAccept(file: File, accept: string): boolean {
  return accept.split(",").some((pattern) => {
    const p = pattern.trim()
    if (p.endsWith("/*")) {
      return file.type.startsWith(p.slice(0, -1))
    }
    if (p.startsWith(".")) {
      return file.name.toLowerCase().endsWith(p.toLowerCase())
    }
    return file.type === p
  })
}
