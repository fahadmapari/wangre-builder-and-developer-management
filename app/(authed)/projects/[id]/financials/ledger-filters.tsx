"use client"

import { useUrlFilters, useDebouncedSearchParam } from "@/lib/hooks"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

const KIND_OPTIONS = [
  { value: "all", label: "All" },
  { value: "income", label: "Income" },
  { value: "expense", label: "Expense" },
] as const

const CATEGORY_OPTIONS = [
  { value: "all", label: "All" },
  { value: "sale", label: "Sale" },
  { value: "purchase", label: "Purchase" },
  { value: "adhoc", label: "Ad-hoc" },
  { value: "transfer_in", label: "Transfer in" },
  { value: "transfer_out", label: "Transfer out" },
] as const

const VOIDED_OPTIONS = [
  { value: "active", label: "Active only" },
  { value: "all", label: "Include voided" },
] as const

export function LedgerFilters({
  defaultFrom,
  defaultTo,
}: {
  defaultFrom: string
  defaultTo: string
}) {
  const { get, setParam, setParams } = useUrlFilters(["page"])

  const from = get("from", defaultFrom)
  const to = get("to", defaultTo)
  const kind = get("kind", "all")
  const category = get("category", "all")
  const voided = get("voided", "active")

  const search = useDebouncedSearchParam({
    initial: get("search"),
    apply: (v) => setParams({ search: v || null }),
    delay: 350,
    minLength: 2,
  })

  return (
    <div className="flex flex-col gap-3 pb-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="from">From</Label>
          <Input
            id="from"
            type="date"
            value={from}
            onChange={(e) => setParam("from", e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="to">To</Label>
          <Input
            id="to"
            type="date"
            value={to}
            onChange={(e) => setParam("to", e.target.value)}
          />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="search">Search</Label>
        <div className="relative flex w-full sm:w-72">
          <Input
            id="search"
            type="search"
            placeholder="description, buyer, notes..."
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
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <ChipGroup
          label="Kind"
          options={KIND_OPTIONS}
          active={kind}
          onSelect={(v) => setParam("kind", v)}
        />
        <ChipGroup
          label="Category"
          options={CATEGORY_OPTIONS}
          active={category}
          onSelect={(v) => setParam("category", v)}
        />
        <ChipGroup
          label="Voided"
          options={VOIDED_OPTIONS}
          active={voided}
          onSelect={(v) => setParam("voided", v)}
        />
      </div>
    </div>
  )
}

function ChipGroup({
  label,
  options,
  active,
  onSelect,
}: {
  label: string
  options: readonly { value: string; label: string }[]
  active: string
  onSelect: (v: string) => void
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <div className="flex flex-wrap gap-1">
        {options.map((o) => (
          <Button
            key={o.value}
            size="sm"
            variant={active === o.value ? "default" : "outline"}
            onClick={() => onSelect(o.value)}
            type="button"
          >
            {o.label}
          </Button>
        ))}
      </div>
    </div>
  )
}
