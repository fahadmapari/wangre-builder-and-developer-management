"use client"

import { useUrlFilters, useDebouncedSearchParam } from "@/lib/hooks"
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
  const { get, setParams } = useUrlFilters([])

  const status = get("status", "all")

  const search = useDebouncedSearchParam({
    initial: get("search"),
    apply: (v) => setParams({ search: v || null }),
    delay: 350,
    minLength: 2,
  })

  function setStatus(value: string) {
    setParams({ status: value === "all" ? null : value })
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="relative flex w-full sm:w-72">
        <Input
          type="search"
          placeholder="Search by name or location…"
          value={search.value}
          maxLength={200}
          className="[&::-webkit-search-cancel-button]:hidden [&::-webkit-search-decoration]:hidden"
          onChange={(e) => search.onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              search.flush()
            }
          }}
        />
        {search.value.length > 0 ? (
          <button
            type="button"
            aria-label="Clear search"
            onClick={search.clear}
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
