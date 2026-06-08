"use client"

import { useUrlFilters } from "@/lib/hooks"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function GlobalFilters({
  defaultFrom,
  defaultTo,
}: {
  defaultFrom: string
  defaultTo: string
}) {
  const { get, setParam } = useUrlFilters([
    "page",
    "moneyPage",
    "materialPage",
    "unitsPage",
  ])

  const from = get("from", defaultFrom)
  const to = get("to", defaultTo)

  return (
    <div className="flex flex-wrap items-end gap-3 pb-3">
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
  )
}
