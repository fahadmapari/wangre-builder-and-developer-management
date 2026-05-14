"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useTransition } from "react"
import { Button } from "@/components/ui/button"

const TYPE_OPTIONS = [
  { value: "apartment", label: "Apartments" },
  { value: "parking", label: "Parkings" },
  { value: "all", label: "All" },
] as const

const STATUS_OPTIONS = [
  { value: "available", label: "Available" },
  { value: "sold", label: "Sold" },
  { value: "all", label: "All" },
] as const

export function InventoryFilters() {
  const router = useRouter()
  const sp = useSearchParams()
  const [, startTransition] = useTransition()

  const type = sp.get("type") ?? "apartment"
  const status = sp.get("status") ?? "available"

  function setParam(key: "type" | "status", value: string) {
    const next = new URLSearchParams(sp.toString())
    next.set(key, value)
    startTransition(() => {
      router.replace(`?${next.toString()}`, { scroll: false })
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-4 pb-3">
      <ChipGroup
        label="Type"
        options={TYPE_OPTIONS}
        active={type}
        onSelect={(v) => setParam("type", v)}
      />
      <ChipGroup
        label="Status"
        options={STATUS_OPTIONS}
        active={status}
        onSelect={(v) => setParam("status", v)}
      />
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
      <div className="flex gap-1">
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
