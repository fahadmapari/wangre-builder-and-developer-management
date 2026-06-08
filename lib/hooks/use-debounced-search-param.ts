"use client"

import { useEffect, useRef, useState } from "react"

export type UseDebouncedSearchParamOptions = {
  /** Initial input value (typically the current search param). */
  initial: string
  /** Push the (already-thresholded) value to the URL. Empty string clears. */
  apply: (value: string) => void
  /** Debounce delay in ms. Default 350. */
  delay?: number
  /** Minimum trimmed length before a value is applied; shorter clears. Default 2. */
  minLength?: number
}

/**
 * Debounced controlled search box bound to a URL param. Mirrors the ref-timer
 * pattern in ledger-filters: setState happens only in event handlers; the
 * effect does cleanup only (satisfies react-hooks/set-state-in-effect).
 */
export function useDebouncedSearchParam(opts: UseDebouncedSearchParamOptions) {
  const { initial, apply, delay = 350, minLength = 2 } = opts
  const [value, setValue] = useState(initial)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [])

  function applyThresholded(next: string) {
    const trimmed = next.trim()
    apply(trimmed.length >= minLength ? trimmed : "")
  }

  function onChange(next: string) {
    setValue(next)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => applyThresholded(next), delay)
  }

  function flush() {
    if (timer.current) clearTimeout(timer.current)
    applyThresholded(value)
  }

  function clear() {
    if (timer.current) clearTimeout(timer.current)
    setValue("")
    apply("")
  }

  return { value, onChange, flush, clear }
}
