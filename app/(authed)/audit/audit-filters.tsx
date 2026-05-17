"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { AuditFilters } from "@/lib/audit/schemas"

type Option = { id: string; label: string }

export function AuditFiltersForm({
  currentFilters,
  users,
  projects,
}: {
  currentFilters: AuditFilters
  users: Option[]
  projects: Option[]
}) {
  const router = useRouter()
  const sp = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const [from, setFrom] = useState<string>(toIsoDate(currentFilters.from))
  const [to, setTo] = useState<string>(toIsoDate(currentFilters.to))
  const [actor, setActor] = useState<string>(
    currentFilters.actorId?.toHexString() ?? "all"
  )
  const [action, setAction] = useState<string>(currentFilters.action ?? "all")
  const [entityType, setEntityType] = useState<string>(
    currentFilters.entityType ?? "all"
  )
  const [project, setProject] = useState<string>(
    currentFilters.projectId?.toHexString() ?? "all"
  )

  function apply() {
    const params = new URLSearchParams(sp.toString())
    setParam(params, "from", from)
    setParam(params, "to", to)
    setParam(params, "actor", actor === "all" ? "" : actor)
    setParam(params, "action", action === "all" ? "" : action)
    setParam(params, "entityType", entityType === "all" ? "" : entityType)
    setParam(params, "project", project === "all" ? "" : project)
    params.delete("page") // reset to page 1 on filter change
    startTransition(() => {
      router.push(`?${params.toString()}`)
    })
  }

  function reset() {
    setFrom("")
    setTo("")
    setActor("all")
    setAction("all")
    setEntityType("all")
    setProject("all")
    startTransition(() => {
      router.push(`?`)
    })
  }

  return (
    <form
      className="grid grid-cols-1 gap-3 rounded border border-border bg-card p-4 md:grid-cols-3 lg:grid-cols-6"
      onSubmit={(e) => {
        e.preventDefault()
        apply()
      }}
    >
      <Field label="From">
        <Input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          disabled={isPending}
        />
      </Field>
      <Field label="To">
        <Input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          disabled={isPending}
        />
      </Field>
      <Field label="Actor">
        <Select value={actor} onValueChange={setActor} disabled={isPending}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All users</SelectItem>
            {users.map((u) => (
              <SelectItem key={u.id} value={u.id}>
                {u.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Action">
        <Select value={action} onValueChange={setAction} disabled={isPending}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All actions</SelectItem>
            <SelectItem value="created">Created</SelectItem>
            <SelectItem value="voided">Voided</SelectItem>
            <SelectItem value="reversed">Reversed</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Field label="Entity">
        <Select
          value={entityType}
          onValueChange={setEntityType}
          disabled={isPending}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All entities</SelectItem>
            <SelectItem value="transaction">Transaction</SelectItem>
            <SelectItem value="movement">Movement</SelectItem>
            <SelectItem value="project">Project</SelectItem>
            <SelectItem value="unit">Unit</SelectItem>
            <SelectItem value="material">Material</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Field label="Project">
        <Select value={project} onValueChange={setProject} disabled={isPending}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All projects</SelectItem>
            {projects.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <div className="flex items-end gap-2 md:col-span-3 lg:col-span-6">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Applying…" : "Apply filters"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={reset}
          disabled={isPending}
        >
          Reset
        </Button>
      </div>
    </form>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  )
}

function setParam(params: URLSearchParams, key: string, value: string) {
  if (value) params.set(key, value)
  else params.delete(key)
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}
