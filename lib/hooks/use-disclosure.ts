"use client"

import { useCallback, useState } from "react"

/**
 * Open/close state for a dialog or sheet. `mounted` becomes true on first open
 * and stays true, so a lazily-imported body mounts only after the first open.
 * `contentKey` remounts the body on each open so internal form state resets.
 */
export function useDisclosure(initial = false) {
  const [open, setOpen] = useState(initial)
  const [mounted, setMounted] = useState(initial)
  const handleChange = useCallback((next: boolean) => {
    if (next) setMounted(true)
    setOpen(next)
  }, [])
  return {
    open,
    setOpen: handleChange,
    onOpenChange: handleChange,
    mounted,
    contentKey: open ? "open" : "closed",
  }
}
