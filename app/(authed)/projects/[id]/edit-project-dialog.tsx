"use client"

import { useState, useTransition } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
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
import { updateProject } from "../../projects/actions"
import type { ProjectStatus } from "@/lib/projects/schemas"

type Props = {
  projectId: string
  current: {
    name: string
    location: string
    status: ProjectStatus
    notes?: string
  }
}

const STATUS_OPTIONS: { value: ProjectStatus; label: string }[] = [
  { value: "planning", label: "Planning" },
  { value: "under_construction", label: "Under construction" },
  { value: "completed", label: "Completed" },
  { value: "on_hold", label: "On hold" },
]

export function EditProjectDialog({ projectId, current }: Props) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [errorField, setErrorField] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Edit project
        </Button>
      </DialogTrigger>
      <DialogContent
        key={open ? `open-${projectId}` : "closed"}
        className="sm:max-w-md"
      >
        <DialogHeader>
          <DialogTitle>Edit project</DialogTitle>
          <DialogDescription>
            Update descriptive fields. Capacity changes are separate.
          </DialogDescription>
        </DialogHeader>
        <form
          action={(formData) => {
            setError(null)
            setErrorField(null)
            startTransition(async () => {
              const raw = {
                projectId,
                name: String(formData.get("name") ?? ""),
                location: String(formData.get("location") ?? ""),
                status: String(formData.get("status") ?? "") as ProjectStatus,
                notes: String(formData.get("notes") ?? ""),
              }
              const res = await updateProject(raw)
              if (res.ok) {
                setOpen(false)
              } else {
                setError(res.error)
                setErrorField(res.field ?? null)
              }
            })
          }}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              name="name"
              defaultValue={current.name}
              maxLength={120}
              required
            />
            {errorField === "name" && (
              <p className="text-sm text-red-600">{error}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="location">Location</Label>
            <Input
              id="location"
              name="location"
              defaultValue={current.location}
              maxLength={200}
              required
            />
            {errorField === "location" && (
              <p className="text-sm text-red-600">{error}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="status">Status</Label>
            <Select name="status" defaultValue={current.status}>
              <SelectTrigger id="status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              name="notes"
              defaultValue={current.notes ?? ""}
              maxLength={2000}
              rows={3}
            />
            {errorField === "notes" && (
              <p className="text-sm text-red-600">{error}</p>
            )}
          </div>
          {error && !errorField && (
            <p className="text-sm text-red-600">{error}</p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
