"use client"

import { useState, type ReactNode } from "react"
import { ChevronDown, ChevronUp } from "lucide-react"
import { Button } from "@/components/ui/button"

export function FinancialsSummary({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false)
  return (
    <div className="flex shrink-0 flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Summary
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() => setCollapsed((v) => !v)}
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Show summary" : "Hide summary"}
          title={collapsed ? "Show summary" : "Hide summary"}
        >
          {collapsed ? <ChevronDown /> : <ChevronUp />}
        </Button>
      </div>
      {!collapsed ? children : null}
    </div>
  )
}
