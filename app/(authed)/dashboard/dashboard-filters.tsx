"use client"

import { useUrlFilters } from "@/lib/hooks"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { isoDate, last12MonthsStart } from "@/lib/dashboard/dates"

export function DashboardFilters({
  projects,
  defaultFrom,
  defaultTo,
  allTimeFrom,
}: {
  projects: { id: string; name: string }[]
  defaultFrom: string
  defaultTo: string
  allTimeFrom: string
}) {
  // Dashboard has no pagination params to reset.
  const { get, setParam, setParams } = useUrlFilters([])
  const project = get("project", "all")
  const from = get("from", defaultFrom)
  const to = get("to", defaultTo)
  const today = isoDate(new Date())

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1.5">
        <Label>Scope</Label>
        <Select value={project} onValueChange={(v) => setParam("project", v)}>
          <SelectTrigger className="w-[240px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All projects (combined)</SelectItem>
            {projects.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
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
      <div className="flex items-center gap-1.5 pb-0.5">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setParams({ from: defaultFrom, to: defaultTo })}
        >
          This year
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            setParams({ from: isoDate(last12MonthsStart()), to: today })
          }
        >
          Last 12 months
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setParams({ from: allTimeFrom, to: today })}
        >
          All time
        </Button>
      </div>
    </div>
  )
}
