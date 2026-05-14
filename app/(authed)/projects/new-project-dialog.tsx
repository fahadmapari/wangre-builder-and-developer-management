"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { createProject } from "./actions"

const STATUS_OPTIONS = [
  { value: "planning", label: "Planning" },
  { value: "under_construction", label: "Under construction" },
  { value: "completed", label: "Completed" },
  { value: "on_hold", label: "On hold" },
] as const

type FormState = {
  name: string
  location: string
  totalUnits: number
  totalParkings: number
  status: string
  notes: string
  startingUnitNumber: number
  unitsPerFloor: number
  parkingPrefix: string
}

const INITIAL: FormState = {
  name: "",
  location: "",
  totalUnits: 12,
  totalParkings: 4,
  status: "planning",
  notes: "",
  startingUnitNumber: 101,
  unitsPerFloor: 4,
  parkingPrefix: "P",
}

export function NewProjectButton({ variant }: { variant?: "cta" }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        size={variant === "cta" ? "default" : "sm"}
      >
        New project
      </Button>
      <NewProjectDialog key={open ? "open" : "closed"} open={open} onOpenChange={setOpen} />
    </>
  )
}

function NewProjectDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (next: boolean) => void
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [advanced, setAdvanced] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [errorField, setErrorField] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(INITIAL)

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function handleSubmit() {
    setErrorMsg(null)
    setErrorField(null)
    startTransition(async () => {
      const result = await createProject(form)
      if (!result.ok) {
        setErrorMsg(result.error)
        setErrorField(result.field ?? null)
        return
      }
      onOpenChange(false)
      router.push(`/projects/${result.data.projectId}`)
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
          <DialogDescription>
            Creates the project and auto-generates all apartments and parkings.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            handleSubmit()
          }}
          className="flex flex-col gap-4"
        >
          <Field
            label="Name"
            htmlFor="name"
            error={errorField === "name" ? errorMsg : null}
          >
            <Input
              id="name"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              disabled={isPending}
              autoFocus
            />
          </Field>
          <Field
            label="Location"
            htmlFor="location"
            error={errorField === "location" ? errorMsg : null}
          >
            <Input
              id="location"
              value={form.location}
              onChange={(e) => set("location", e.target.value)}
              disabled={isPending}
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field
              label="Total apartments"
              htmlFor="totalUnits"
              error={errorField === "totalUnits" ? errorMsg : null}
            >
              <Input
                id="totalUnits"
                type="number"
                min={1}
                value={form.totalUnits}
                onChange={(e) =>
                  set("totalUnits", Number(e.target.value))
                }
                disabled={isPending}
              />
            </Field>
            <Field
              label="Total parkings"
              htmlFor="totalParkings"
              error={errorField === "totalParkings" ? errorMsg : null}
            >
              <Input
                id="totalParkings"
                type="number"
                min={0}
                value={form.totalParkings}
                onChange={(e) =>
                  set("totalParkings", Number(e.target.value))
                }
                disabled={isPending}
              />
            </Field>
          </div>
          <Field label="Status" htmlFor="status">
            <Select
              value={form.status}
              onValueChange={(v) => set("status", v)}
              disabled={isPending}
            >
              <SelectTrigger id="status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Notes" htmlFor="notes">
            <Textarea
              id="notes"
              rows={3}
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              disabled={isPending}
            />
          </Field>

          <button
            type="button"
            onClick={() => setAdvanced((v) => !v)}
            className="self-start text-xs text-muted-foreground underline-offset-2 hover:underline"
          >
            {advanced ? "Hide" : "Show"} advanced options
          </button>
          {advanced ? (
            <div className="grid grid-cols-3 gap-4 rounded-md border border-border p-4">
              <Field
                label="Starting #"
                htmlFor="startingUnitNumber"
                error={
                  errorField === "startingUnitNumber" ? errorMsg : null
                }
              >
                <Input
                  id="startingUnitNumber"
                  type="number"
                  min={1}
                  value={form.startingUnitNumber}
                  onChange={(e) =>
                    set("startingUnitNumber", Number(e.target.value))
                  }
                  disabled={isPending}
                />
              </Field>
              <Field
                label="Units / floor"
                htmlFor="unitsPerFloor"
                error={errorField === "unitsPerFloor" ? errorMsg : null}
              >
                <Input
                  id="unitsPerFloor"
                  type="number"
                  min={1}
                  max={9}
                  value={form.unitsPerFloor}
                  onChange={(e) =>
                    set("unitsPerFloor", Number(e.target.value))
                  }
                  disabled={isPending}
                />
              </Field>
              <Field
                label="Parking prefix"
                htmlFor="parkingPrefix"
                error={errorField === "parkingPrefix" ? errorMsg : null}
              >
                <Input
                  id="parkingPrefix"
                  value={form.parkingPrefix}
                  onChange={(e) =>
                    set("parkingPrefix", e.target.value)
                  }
                  disabled={isPending}
                />
              </Field>
            </div>
          ) : null}

          {errorMsg && !errorField ? (
            <p className="text-sm text-destructive" role="alert">
              {errorMsg}
            </p>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Creating…" : "Create project"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function Field({
  label,
  htmlFor,
  error,
  children,
}: {
  label: string
  htmlFor: string
  error?: string | null
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  )
}
