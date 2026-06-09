"use client"

import { useUrlFilters, useDebouncedSearchParam } from "@/lib/hooks"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { SlidersHorizontal } from "lucide-react"

const KIND_OPTIONS = [
  { value: "all", label: "All" },
  { value: "income", label: "Income" },
  { value: "expense", label: "Expense" },
  { value: "capital", label: "Capital" },
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

  const activeCount =
    (get("search") ? 1 : 0) +
    (from !== defaultFrom ? 1 : 0) +
    (to !== defaultTo ? 1 : 0) +
    (kind !== "all" ? 1 : 0) +
    (category !== "all" ? 1 : 0) +
    (voided !== "active" ? 1 : 0)

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <SlidersHorizontal />
          Filters
          {activeCount > 0 ? (
            <Badge
              variant="secondary"
              className="ml-0.5 h-4 min-w-4 rounded-full px-1 text-[0.65rem] tabular-nums"
            >
              {activeCount}
            </Badge>
          ) : null}
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full gap-0 sm:max-w-md">
        <SheetHeader className="border-b border-border">
          <SheetTitle>Filters</SheetTitle>
          <SheetDescription>Refine the ledger entries shown.</SheetDescription>
        </SheetHeader>
        <div className="flex flex-1 flex-col gap-5 overflow-y-auto py-5">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="search">Search</Label>
            <div className="relative flex">
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
          <div className="grid grid-cols-2 gap-3">
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
      </SheetContent>
    </Sheet>
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
    <div className="flex flex-col gap-1.5">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <div className="flex flex-wrap gap-1.5">
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
