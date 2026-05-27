"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useTransition } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function GlobalFilters({
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

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(sp.toString())
    next.delete("page")
    next.delete("moneyPage")
    next.delete("materialPage")
    next.delete("unitsPage")
    next.set(key, value)
    startTransition(() => {
      router.replace(`?${next.toString()}`, { scroll: false })
    })
  }

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
