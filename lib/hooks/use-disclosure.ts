"use client"

import { useState } from "react"

/**
 * Open/close state for a dialog or sheet. `contentKey` remounts the body on
 * each open so internal form state resets — matches the existing
 * `key={open ? "open" : "closed"}` idiom. Works for both controlled dialogs
 * and DialogTrigger-based ones (spread the key onto whichever owns it).
 */
export function useDisclosure(initial = false) {
  const [open, setOpen] = useState(initial)
  return {
    open,
    setOpen,
    onOpenChange: setOpen,
    contentKey: open ? "open" : "closed",
  }
}
