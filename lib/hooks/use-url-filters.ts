"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useTransition } from "react"

/**
 * Read/write URL search params for filter bars. `setParam`/`setParams` delete
 * the configured pagination keys (so changing a filter resets to page 1) and
 * navigate via router.replace with scroll:false inside a transition — the exact
 * behavior every *-filters.tsx currently hand-rolls.
 *
 * @param resetKeys pagination keys to clear on any change. Pass the SAME set the
 *   file currently deletes (e.g. ["page"] for ledger, ["page","moneyPage",
 *   "materialPage","unitsPage"] for the global financials bar).
 */
export function useUrlFilters(resetKeys: string[] = ["page"]) {
  const router = useRouter()
  const sp = useSearchParams()
  const [isPending, startTransition] = useTransition()

  function get(key: string, fallback = ""): string {
    return sp.get(key) ?? fallback
  }

  function commit(next: URLSearchParams) {
    for (const k of resetKeys) next.delete(k)
    startTransition(() => {
      router.replace(`?${next.toString()}`, { scroll: false })
    })
  }

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(sp.toString())
    next.set(key, value)
    commit(next)
  }

  /** Set multiple params; a null/"" value deletes the key. */
  function setParams(entries: Record<string, string | null>) {
    const next = new URLSearchParams(sp.toString())
    for (const [k, v] of Object.entries(entries)) {
      if (v === null || v === "") next.delete(k)
      else next.set(k, v)
    }
    commit(next)
  }

  return { sp, get, setParam, setParams, isPending }
}
