"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useTransition } from "react"
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
  const router = useRouter()
  const sp = useSearchParams()
  const [, startTransition] = useTransition()

  const from = sp.get("from") ?? defaultFrom
  const to = sp.get("to") ?? defaultTo
  const kind = sp.get("kind") ?? "all"
  const category = sp.get("category") ?? "all"
  const voided = sp.get("voided") ?? "active"

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(sp.toString())
    next.set(key, value)
    startTransition(() => {
      router.replace(`?${next.toString()}`, { scroll: false })
    })
  }

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
