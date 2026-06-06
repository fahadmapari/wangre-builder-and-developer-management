"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useEffect, useRef, useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

const STATUS_OPTIONS = [
  { value: "all", label: "All" },
  { value: "planning", label: "Planning" },
  { value: "under_construction", label: "Under construction" },
  { value: "completed", label: "Completed" },
  { value: "on_hold", label: "On hold" },
] as const

export function ProjectFilters() {
  const router = useRouter()
  const sp = useSearchParams()
  const [, startTransition] = useTransition()

  const status = sp.get("status") ?? "all"
  const initialSearch = sp.get("search") ?? ""
  const [searchValue, setSearchValue] = useState(initialSearch)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  function applySearch(next: string) {
    const trimmed = next.trim()
    const params = new URLSearchParams(sp.toString())
    if (trimmed.length >= 2) params.set("search", trimmed)
    else params.delete("search")
    startTransition(() => {
      router.replace(`?${params.toString()}`, { scroll: false })
    })
  }

  function onSearchChange(next: string) {
    setSearchValue(next)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => applySearch(next), 350)
  }

  function flushSearch() {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    applySearch(searchValue)
  }

  function clearSearch() {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    setSearchValue("")
    applySearch("")
  }

  function setStatus(value: string) {
    const params = new URLSearchParams(sp.toString())
    if (value === "all") params.delete("status")
    else params.set("status", value)
    startTransition(() => {
      router.replace(`?${params.toString()}`, { scroll: false })
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="relative flex w-full sm:w-72">
        <Input
          type="search"
          placeholder="Search by name or location…"
          value={searchValue}
          maxLength={200}
          className="[&::-webkit-search-cancel-button]:hidden [&::-webkit-search-decoration]:hidden"
          onChange={(e) => onSearchChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              flushSearch()
            }
          }}
        />
        {searchValue.length > 0 ? (
          <button
            type="button"
            aria-label="Clear search"
            onClick={clearSearch}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            ✕
          </button>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">
          Status
        </span>
        <div className="flex flex-wrap gap-1">
          {STATUS_OPTIONS.map((o) => (
            <Button
              key={o.value}
              size="sm"
              variant={status === o.value ? "default" : "outline"}
              onClick={() => setStatus(o.value)}
              type="button"
            >
              {o.label}
            </Button>
          ))}
        </div>
      </div>
    </div>
  )
}
