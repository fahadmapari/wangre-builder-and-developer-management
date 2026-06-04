"use client"

import { useState } from "react"
import { ChevronDown, ChevronRight } from "lucide-react"

interface CollapsibleSectionProps {
  title: string
  actions?: React.ReactNode
  children: React.ReactNode
}

export function CollapsibleSection({
  title,
  actions,
  children,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(false)

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1.5 text-sm font-semibold tracking-tight hover:text-foreground/80"
        >
          {open ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
          {title}
        </button>
        {actions && open && <div>{actions}</div>}
      </div>
      {open && children}
    </section>
  )
}
