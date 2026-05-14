# Phase 2 — Projects & Units Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** [`docs/superpowers/specs/2026-05-14-phase-2-projects-design.md`](../superpowers/specs/2026-05-14-phase-2-projects-design.md) (committed in `827ef0c`).

**Goal:** An admin can create a project with name, location, status, and apartment/parking counts; the system atomically generates the project + all units + all parkings in one Mongo transaction. Everyone can browse the project list and view a per-project detail shell with Inventory / Materials / Financials tabs (placeholders only — contents come in Phases 3–5).

**Architecture:** Server components for reads, a single server action (`createProject`) for the only mutation in this phase. Pure generation functions for unit numbering are split from the Mongo repository so the algorithm can be reasoned about and read in isolation. The transaction wraps all three writes (`projects.insertOne`, `units.insertMany` × 2). Role enforcement happens in the action (`requireAdmin`) and in conditional rendering of UI affordances — server enforcement is the source of truth, UI hiding is convenience.

**Tech Stack:** Next.js 16 (App Router, React 19), TypeScript, native `mongodb` driver, Zod, Tailwind v4 + shadcn/ui. No new runtime deps; six new shadcn primitives.

---

## File Structure

**Create:**
- `lib/projects/schemas.ts` — Zod schemas, inferred input types, domain types (`Project`, `Unit`), and `ActionResult<T>`.
- `lib/projects/generation.ts` — pure functions: `generateApartmentNumbers`, `generateParkingNumbers`, `floorFromApartmentNumber`.
- `lib/projects/repository.ts` — Mongo helpers: `listProjects`, `getProject`, `createProjectWithUnits` (the transactional one).
- `app/(authed)/projects/actions.ts` — server action `createProject` with `"use server"` directive.
- `app/(authed)/projects/page.tsx` — project list (server component).
- `app/(authed)/projects/new-project-dialog.tsx` — client component with the dialog and form.
- `app/(authed)/projects/[id]/page.tsx` — project detail shell (server component).
- `app/(authed)/projects/[id]/project-tabs.tsx` — client component for the radix Tabs scaffold with role-gated Financials.

**Modify:**
- `app/(authed)/page.tsx` — replace placeholder body with `redirect("/projects")`.
- `scripts/init-db.mjs` — add 5 new indexes (`projects.createdAt`, `projects.name`, `units.(projectId,type,status)`, `units.(projectId,type,number)` unique, `units.(status,soldAt)`).

**Add via `npx shadcn@latest add`:**
- `dialog`, `input`, `label`, `select`, `textarea`, `tabs` (six new primitives under `components/ui/`).

---

## Task 1 — Install shadcn primitives

**Files:**
- Create: `components/ui/dialog.tsx`, `components/ui/input.tsx`, `components/ui/label.tsx`, `components/ui/select.tsx`, `components/ui/textarea.tsx`, `components/ui/tabs.tsx`

- [ ] **Step 1: Run shadcn add for all six primitives**

```bash
npx shadcn@latest add dialog input label select textarea tabs
```

Expected: six new files appear under `components/ui/`. If shadcn prompts about overwrites, choose "skip" (we shouldn't have any of these yet — confirm with `ls components/ui` first if unsure).

- [ ] **Step 2: Verify nothing else changed**

```bash
git status
```

Expected: only `components/ui/{dialog,input,label,select,textarea,tabs}.tsx` are new (some shadcn versions also touch `package.json` / `package-lock.json` to add radix peer deps — that's fine).

- [ ] **Step 3: Commit**

```bash
git add components/ui/dialog.tsx components/ui/input.tsx components/ui/label.tsx components/ui/select.tsx components/ui/textarea.tsx components/ui/tabs.tsx package.json package-lock.json
git commit -m "chore: add shadcn dialog/input/label/select/textarea/tabs primitives"
```

If `package.json` and `package-lock.json` weren't touched, drop them from the `git add` line.

---

## Task 2 — Extend `db:init` script with Phase 2 indexes

**Files:**
- Modify: `scripts/init-db.mjs`

- [ ] **Step 1: Replace the script body**

Open `scripts/init-db.mjs` and replace its contents with:

```js
import { MongoClient } from "mongodb"

const uri = process.env.MONGODB_URI
const dbName = process.env.MONGODB_DB
if (!uri || !dbName) {
  console.error("Set MONGODB_URI and MONGODB_DB before running.")
  process.exit(1)
}

const client = new MongoClient(uri)
await client.connect()
const db = client.db(dbName)

// Phase 1
await db.collection("users").createIndex({ email: 1 }, { unique: true })

// Phase 2 — projects
await db.collection("projects").createIndex({ createdAt: -1 })
await db.collection("projects").createIndex({ name: 1 })

// Phase 2 — units (one collection, type discriminator)
await db.collection("units").createIndex({ projectId: 1, type: 1, status: 1 })
await db
  .collection("units")
  .createIndex({ projectId: 1, type: 1, number: 1 }, { unique: true })
await db.collection("units").createIndex({ status: 1, soldAt: -1 })

console.log(
  "Indexes ensured: users.email (unique); projects.createdAt, projects.name; " +
    "units.(projectId,type,status), units.(projectId,type,number) unique, units.(status,soldAt)"
)

await client.close()
```

- [ ] **Step 2: Run it**

```bash
npm run db:init
```

Expected output: a single line listing all indexes. The command must exit 0. Re-run a second time to confirm idempotency — same output, no error.

- [ ] **Step 3: Commit**

```bash
git add scripts/init-db.mjs
git commit -m "chore(db): add projects + units indexes to init script"
```

---

## Task 3 — Domain types and Zod schemas

**Files:**
- Create: `lib/projects/schemas.ts`

- [ ] **Step 1: Write `lib/projects/schemas.ts`**

```ts
import { z } from "zod"
import type { ObjectId } from "mongodb"

export const ProjectStatusSchema = z.enum([
  "planning",
  "under_construction",
  "completed",
  "on_hold",
])
export type ProjectStatus = z.infer<typeof ProjectStatusSchema>

export const CreateProjectInputSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Name is required")
      .max(120, "Name too long"),
    location: z
      .string()
      .trim()
      .min(1, "Location is required")
      .max(200, "Location too long"),
    totalUnits: z.coerce
      .number()
      .int("Must be a whole number")
      .min(1, "Must be at least 1")
      .max(2000, "Too large"),
    totalParkings: z.coerce
      .number()
      .int("Must be a whole number")
      .min(0, "Cannot be negative")
      .max(2000, "Too large"),
    status: ProjectStatusSchema.default("planning"),
    notes: z.string().max(2000).optional().default(""),
    startingUnitNumber: z.coerce
      .number()
      .int()
      .min(1)
      .max(99999)
      .default(101),
    unitsPerFloor: z.coerce
      .number()
      .int()
      .min(1, "At least 1")
      .max(9, "At most 9 (100s numbering convention)")
      .default(4),
    parkingPrefix: z
      .string()
      .trim()
      .min(1, "Required")
      .max(8, "Too long")
      .default("P"),
  })
  .refine(
    (data) => {
      const pos = data.startingUnitNumber % 100
      return pos >= 1 && pos + data.unitsPerFloor - 1 <= 99
    },
    {
      message:
        "Starting number's position on its floor + units per floor must fit within one floor (e.g. 101 + 4 → 101–104 ✓; 199 + 4 ✗).",
      path: ["startingUnitNumber"],
    }
  )

export type CreateProjectInput = z.infer<typeof CreateProjectInputSchema>

// NOTE: When/if a future phase adds an "add more units later" flow, it must
// update projects.totalUnits in the SAME transaction as the units insertMany.
export type Project = {
  _id: ObjectId
  name: string
  location: string
  status: ProjectStatus
  totalUnits: number
  totalParkings: number
  notes?: string
  createdBy: ObjectId
  createdAt: Date
  updatedAt: Date
}

export type UnitType = "apartment" | "parking"
export type UnitStatus = "available" | "sold"

export type Unit = {
  _id: ObjectId
  projectId: ObjectId
  type: UnitType
  number: string
  floor: number
  areaSqft: number
  salePrice: number
  status: UnitStatus
  soldAt?: Date
  soldPriceTotal?: number
  buyerName?: string
  notes?: string
  createdBy: ObjectId
  createdAt: Date
  updatedAt: Date
}

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; field?: string }
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add lib/projects/schemas.ts
git commit -m "feat(projects): add Zod schemas and domain types for projects/units"
```

---

## Task 4 — Pure generation functions

**Files:**
- Create: `lib/projects/generation.ts`

- [ ] **Step 1: Write `lib/projects/generation.ts`**

```ts
// Pure functions. No I/O, no Mongo. Re-usable and trivially inspectable.

export function floorFromApartmentNumber(number: string): number {
  return Math.floor(parseInt(number, 10) / 100)
}

export function generateApartmentNumbers(opts: {
  total: number
  startingUnitNumber: number
  unitsPerFloor: number
}): { number: string; floor: number }[] {
  const { total, startingUnitNumber, unitsPerFloor } = opts
  const startingFloor = Math.floor(startingUnitNumber / 100)
  const startingPosition = startingUnitNumber % 100
  const result: { number: string; floor: number }[] = []
  for (let i = 0; i < total; i++) {
    const floor = startingFloor + Math.floor(i / unitsPerFloor)
    const position = startingPosition + (i % unitsPerFloor)
    const number = String(floor * 100 + position)
    result.push({ number, floor })
  }
  return result
}

export function generateParkingNumbers(opts: {
  total: number
  prefix: string
}): { number: string; floor: number }[] {
  const { total, prefix } = opts
  const result: { number: string; floor: number }[] = []
  for (let i = 0; i < total; i++) {
    const number = `${prefix}${String(i + 1).padStart(3, "0")}`
    result.push({ number, floor: 0 })
  }
  return result
}
```

- [ ] **Step 2: Sanity-check the algorithm by reading the code**

The functions are exercised end-to-end via `mongosh` queries in Task 12. Before moving on, trace through these inputs mentally to make sure the implementation matches:

```
generateApartmentNumbers({ total: 12, startingUnitNumber: 101, unitsPerFloor: 4 })
// Expected:
//   i=0: floor=1, pos=1, number="101"
//   i=3: floor=1, pos=4, number="104"
//   i=4: floor=2, pos=1, number="201"
//   i=11: floor=3, pos=4, number="304"

generateParkingNumbers({ total: 4, prefix: "P" })
// Expected:
//   ["P001", "P002", "P003", "P004"] all with floor=0
```

If you'd rather run code, the fastest path is a temporary `console.log` inside Task 6's server action and a real submission in Task 12. No standalone script needed.

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add lib/projects/generation.ts
git commit -m "feat(projects): add pure unit-number generation helpers"
```

---

## Task 5 — Mongo repository (with atomic create)

**Files:**
- Create: `lib/projects/repository.ts`

- [ ] **Step 1: Write `lib/projects/repository.ts`**

```ts
import { ObjectId } from "mongodb"
import client, { getDb } from "@/lib/db/client"
import type {
  Project,
  Unit,
  UnitType,
  ProjectStatus,
} from "./schemas"
import {
  generateApartmentNumbers,
  generateParkingNumbers,
} from "./generation"

export async function listProjects(): Promise<Project[]> {
  const db = getDb()
  return db
    .collection<Project>("projects")
    .find({})
    .sort({ createdAt: -1 })
    .toArray()
}

export async function getProject(id: string): Promise<Project | null> {
  if (!ObjectId.isValid(id)) return null
  const db = getDb()
  return db
    .collection<Project>("projects")
    .findOne({ _id: new ObjectId(id) })
}

export async function createProjectWithUnits(
  input: {
    name: string
    location: string
    status: ProjectStatus
    totalUnits: number
    totalParkings: number
    notes?: string
    startingUnitNumber: number
    unitsPerFloor: number
    parkingPrefix: string
  },
  userId: string
): Promise<{ projectId: ObjectId }> {
  const createdBy = new ObjectId(userId)
  const session = client.startSession()
  try {
    let projectId!: ObjectId
    await session.withTransaction(async () => {
      const db = getDb()
      const projects = db.collection<Omit<Project, "_id">>("projects")
      const units = db.collection<Omit<Unit, "_id">>("units")
      const now = new Date()

      const projectDoc: Omit<Project, "_id"> = {
        name: input.name,
        location: input.location,
        status: input.status,
        totalUnits: input.totalUnits,
        totalParkings: input.totalParkings,
        notes: input.notes,
        createdBy,
        createdAt: now,
        updatedAt: now,
      }
      const projectResult = await projects.insertOne(projectDoc, { session })
      projectId = projectResult.insertedId

      const apartments: Omit<Unit, "_id">[] = generateApartmentNumbers({
        total: input.totalUnits,
        startingUnitNumber: input.startingUnitNumber,
        unitsPerFloor: input.unitsPerFloor,
      }).map((u) => ({
        projectId,
        type: "apartment" as UnitType,
        number: u.number,
        floor: u.floor,
        areaSqft: 0,
        salePrice: 0,
        status: "available",
        notes: "",
        createdBy,
        createdAt: now,
        updatedAt: now,
      }))

      const parkings: Omit<Unit, "_id">[] = generateParkingNumbers({
        total: input.totalParkings,
        prefix: input.parkingPrefix,
      }).map((p) => ({
        projectId,
        type: "parking" as UnitType,
        number: p.number,
        floor: p.floor,
        areaSqft: 0,
        salePrice: 0,
        status: "available",
        notes: "",
        createdBy,
        createdAt: now,
        updatedAt: now,
      }))

      if (apartments.length > 0)
        await units.insertMany(apartments, { session })
      if (parkings.length > 0) await units.insertMany(parkings, { session })
    })
    return { projectId }
  } finally {
    await session.endSession()
  }
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: 0 errors. If the `getDb` import errors, confirm `lib/db/client.ts` from Phase 1 exports `getDb` as a named export and `client` as default — both should already be in place from commit `97bfc60`.

- [ ] **Step 3: Commit**

```bash
git add lib/projects/repository.ts
git commit -m "feat(projects): add repository with atomic createProjectWithUnits"
```

---

## Task 6 — `createProject` server action

**Files:**
- Create: `app/(authed)/projects/actions.ts`

- [ ] **Step 1: Write the server action**

```ts
"use server"

import { revalidatePath } from "next/cache"
import { requireAdmin } from "@/lib/auth/session"
import {
  CreateProjectInputSchema,
  type ActionResult,
} from "@/lib/projects/schemas"
import { createProjectWithUnits } from "@/lib/projects/repository"

export async function createProject(
  raw: unknown
): Promise<ActionResult<{ projectId: string }>> {
  const user = await requireAdmin()
  const parsed = CreateProjectInputSchema.safeParse(raw)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return {
      ok: false,
      error: first?.message ?? "Invalid input",
      field: first?.path.join(".") || undefined,
    }
  }

  try {
    const { projectId } = await createProjectWithUnits(parsed.data, user.id)
    revalidatePath("/projects")
    return { ok: true, data: { projectId: projectId.toHexString() } }
  } catch (err) {
    console.error("createProject failed", err)
    return {
      ok: false,
      error: "Could not create project. Please try again.",
    }
  }
}
```

Notes for the executor:
- The action returns success-with-id rather than calling `redirect()` directly. The client component navigates on success — this keeps the action's `ActionResult` shape honest and avoids mixing Next.js's `redirect()` throw with our `try/catch`.
- `requireAdmin()` redirects floor managers before the action does any work. A floor manager who crafts a direct POST will hit the redirect and never reach the validation step.

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add "app/(authed)/projects/actions.ts"
git commit -m "feat(projects): add createProject server action (admin only)"
```

---

## Task 7 — Project list page

**Files:**
- Create: `app/(authed)/projects/page.tsx`

- [ ] **Step 1: Write the list page**

```tsx
import Link from "next/link"
import { requireAuth } from "@/lib/auth/session"
import { listProjects } from "@/lib/projects/repository"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { NewProjectButton } from "./new-project-dialog"

const STATUS_LABEL: Record<string, string> = {
  planning: "Planning",
  under_construction: "Under construction",
  completed: "Completed",
  on_hold: "On hold",
}

export default async function ProjectsPage() {
  const user = await requireAuth()
  const projects = await listProjects()

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-10">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Projects</h1>
          <p className="text-sm text-muted-foreground">
            {projects.length === 0
              ? "No projects yet."
              : `${projects.length} project${projects.length === 1 ? "" : "s"}`}
          </p>
        </div>
        {user.role === "admin" ? <NewProjectButton /> : null}
      </div>

      {projects.length === 0 ? (
        <Card className="grid place-items-center gap-3 p-12 text-center">
          <p className="text-sm text-muted-foreground">No projects yet.</p>
          {user.role === "admin" ? <NewProjectButton variant="cta" /> : null}
        </Card>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <li key={String(p._id)}>
              <Link
                href={`/projects/${String(p._id)}`}
                className="block"
              >
                <Card className="flex h-full flex-col gap-3 p-5 transition hover:border-foreground/30">
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="font-medium leading-tight">{p.name}</h2>
                    <Badge variant="secondary">
                      {STATUS_LABEL[p.status] ?? p.status}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{p.location}</p>
                  <div className="mt-auto flex items-baseline gap-4 text-xs text-muted-foreground">
                    <span>
                      <span className="font-mono text-foreground">
                        {p.totalUnits}
                      </span>{" "}
                      apartments
                    </span>
                    <span>
                      <span className="font-mono text-foreground">
                        {p.totalParkings}
                      </span>{" "}
                      parkings
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Created {p.createdAt.toLocaleDateString()}
                  </p>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
```

This file imports `NewProjectButton` from `./new-project-dialog`, which we'll create in Task 8. The file will not typecheck until Task 8 is done — that's OK; commit it anyway since it's already correct against the public API of the next task.

- [ ] **Step 2: Skip typecheck for now**

The import target doesn't exist yet. Confirm the file was written correctly with `git diff` and move on to Task 8.

- [ ] **Step 3: Commit**

```bash
git add "app/(authed)/projects/page.tsx"
git commit -m "feat(projects): add list page with cards and empty state"
```

---

## Task 8 — New project dialog (client)

**Files:**
- Create: `app/(authed)/projects/new-project-dialog.tsx`

- [ ] **Step 1: Write the dialog component**

```tsx
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
      {/* key={open ? ...} forces React to remount the dialog on each open/close
          cycle. Without this, useState(INITIAL) only runs once when the parent
          mounts, so reopening the dialog after a previous use shows stale form
          values and stale errors. */}
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
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: 0 errors. (Both Task 7 and Task 8 now compile.)

- [ ] **Step 3: Commit**

```bash
git add "app/(authed)/projects/new-project-dialog.tsx"
git commit -m "feat(projects): add new-project dialog with advanced options"
```

---

## Task 9 — Redirect `/` to `/projects`

**Files:**
- Modify: `app/(authed)/page.tsx`

- [ ] **Step 1: Replace `app/(authed)/page.tsx`**

Replace the entire file contents with:

```tsx
import { redirect } from "next/navigation"

export default function AuthedHome() {
  redirect("/projects")
}
```

The `(authed)` layout (commit `33ad3b5`) already calls `requireAuth()` so we don't repeat it here. The proxy ensures only authed users reach this route in the first place; the layout enforces it server-side.

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add "app/(authed)/page.tsx"
git commit -m "feat(home): redirect / to /projects"
```

---

## Task 10 — Project detail page

**Files:**
- Create: `app/(authed)/projects/[id]/page.tsx`

- [ ] **Step 1: Write the detail page**

```tsx
import { notFound } from "next/navigation"
import { requireAuth } from "@/lib/auth/session"
import { getProject } from "@/lib/projects/repository"
import { Badge } from "@/components/ui/badge"
import { ProjectTabs } from "./project-tabs"

const STATUS_LABEL: Record<string, string> = {
  planning: "Planning",
  under_construction: "Under construction",
  completed: "Completed",
  on_hold: "On hold",
}

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const user = await requireAuth()
  const { id } = await params
  const project = await getProject(id)
  if (!project) notFound()

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {project.name}
            </h1>
            <p className="text-sm text-muted-foreground">{project.location}</p>
          </div>
          <Badge variant="secondary">
            {STATUS_LABEL[project.status] ?? project.status}
          </Badge>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Tile
            label="Total apartments"
            value={String(project.totalUnits)}
          />
          <Tile
            label="Total parkings"
            value={String(project.totalParkings)}
          />
          <Tile
            label="Sold"
            value="—"
            muted
            hint="Available after first sale (Phase 3)"
          />
          <Tile
            label="Revenue"
            value="—"
            muted
            hint="Available after first sale (Phase 3)"
          />
          <Tile
            label="Created"
            value={project.createdAt.toLocaleDateString()}
          />
        </div>
      </header>
      <ProjectTabs role={user.role} />
    </div>
  )
}

function Tile({
  label,
  value,
  muted,
  hint,
}: {
  label: string
  value: string
  muted?: boolean
  hint?: string
}) {
  return (
    <div
      className={
        "flex flex-col gap-1 rounded-lg border border-border p-3 " +
        (muted ? "bg-muted/30 text-muted-foreground" : "bg-card")
      }
      title={hint}
    >
      <span className="text-xs uppercase tracking-wide">{label}</span>
      <span className="font-mono text-xl">{value}</span>
    </div>
  )
}
```

The file imports `ProjectTabs` from `./project-tabs` which we create in Task 11. Same situation as Tasks 7→8.

- [ ] **Step 2: Skip typecheck**

The import target doesn't exist yet. Move on to Task 11.

- [ ] **Step 3: Commit**

```bash
git add "app/(authed)/projects/[id]/page.tsx"
git commit -m "feat(projects): add detail shell with header and stat tiles"
```

---

## Task 11 — Project tabs scaffold (client)

**Files:**
- Create: `app/(authed)/projects/[id]/project-tabs.tsx`

- [ ] **Step 1: Write the tabs component**

```tsx
"use client"

import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import { Card } from "@/components/ui/card"
import type { Role } from "@/types"

export function ProjectTabs({ role }: { role: Role }) {
  return (
    <Tabs defaultValue="inventory">
      <TabsList>
        <TabsTrigger value="inventory">Inventory</TabsTrigger>
        <TabsTrigger value="materials">Materials</TabsTrigger>
        {role === "admin" ? (
          <TabsTrigger value="financials">Financials</TabsTrigger>
        ) : null}
      </TabsList>
      <TabsContent value="inventory">
        <Placeholder>Inventory listing coming in Phase 3.</Placeholder>
      </TabsContent>
      <TabsContent value="materials">
        <Placeholder>Materials tracking coming in Phase 4.</Placeholder>
      </TabsContent>
      {role === "admin" ? (
        <TabsContent value="financials">
          <Placeholder>Financial ledger coming in Phase 5.</Placeholder>
        </TabsContent>
      ) : null}
    </Tabs>
  )
}

function Placeholder({ children }: { children: React.ReactNode }) {
  return (
    <Card className="grid place-items-center p-12 text-sm text-muted-foreground">
      {children}
    </Card>
  )
}
```

- [ ] **Step 2: Typecheck + lint**

```bash
npm run typecheck
npm run lint
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add "app/(authed)/projects/[id]/project-tabs.tsx"
git commit -m "feat(projects): add tabs scaffold with role-gated financials"
```

---

## Task 12 — End-to-end verification

No code in this task. Run through the spec's verification list. Use the **superpowers:verification-before-completion** skill before reporting Phase 2 done.

**Before starting:** confirm a clean tree with `git status` and that you're on the correct branch (e.g., `feat/phase-2-projects` if you used a feature branch).

- [ ] **Typecheck and lint pass**

```bash
npm run typecheck
npm run lint
```

Both exit 0.

- [ ] **`db:init` is idempotent**

```bash
npm run db:init
npm run db:init
```

Both runs print the same one-line index summary and exit 0.

- [ ] **Floor manager: `/` redirects to `/projects`, empty state, no "New project" button**

Start the dev server (`npm run dev`). Sign in as a floor manager (anyone NOT in `ADMIN_EMAILS`). Hit `http://localhost:3000/`. Expected:
- Redirect to `/projects`.
- Page shows "No projects yet." (the page-header subtitle).
- The centered empty-state card says "No projects yet." with no CTA below it.
- No "New project" button in the top-right of the page.

- [ ] **Admin: creates a 12-unit + 4-parking project**

Sign out, sign in as the admin (in `ADMIN_EMAILS`). Hit `/projects`. Click "New project". In the dialog:
- name: `Skyline Heights`
- location: `Downtown`
- totalUnits: `12`
- totalParkings: `4`
- status: `Planning`
- notes: leave empty
- Leave advanced collapsed (defaults `101 / 4 / P`).

Click "Create project". Expected:
- Dialog closes.
- Browser navigates to `/projects/<new-id>`.
- Detail header shows "Skyline Heights", "Downtown", "Planning" badge.
- Five tiles: `Total apartments 12`, `Total parkings 4`, `Sold —` (muted), `Revenue —` (muted), `Created <today>`.
- Three tab triggers: Inventory (active), Materials, Financials.
- Inventory tab body says "Inventory listing coming in Phase 3."

- [ ] **`mongosh` data checks**

In a separate terminal, connect to the Atlas cluster:

```bash
mongosh "$MONGODB_URI"
use wangredev   // or whatever MONGODB_DB is set to
db.projects.find().sort({ createdAt: -1 }).limit(1).pretty()
db.units.countDocuments({ projectId: ObjectId("<paste new-id from URL>") })
db.units.find({ projectId: ObjectId("<id>"), type: "apartment" }, { number: 1, floor: 1, _id: 0 }).sort({ number: 1 }).toArray()
db.units.find({ projectId: ObjectId("<id>"), type: "parking" }, { number: 1, floor: 1, _id: 0 }).sort({ number: 1 }).toArray()
```

Expected:
- The project doc has `name`, `location`, `status`, `totalUnits=12`, `totalParkings=4`, `createdBy` (an ObjectId), `createdAt`, `updatedAt`.
- `countDocuments` returns `16`.
- Apartments list: `[{ number: "101", floor: 1 }, { number: "102", floor: 1 }, { number: "103", floor: 1 }, { number: "104", floor: 1 }, { number: "201", floor: 2 }, ... { number: "304", floor: 3 }]` — exactly 12 entries.
- Parkings list: `[{ number: "P001", floor: 0 }, { number: "P002", floor: 0 }, { number: "P003", floor: 0 }, { number: "P004", floor: 0 }]`.

- [ ] **Validation error path**

As admin, open "New project" again. Set `totalUnits=0`. Submit. Expected:
- Dialog stays open.
- Inline error below the "Total apartments" field: "Must be at least 1".
- No DB writes (verify with `db.projects.countDocuments()` before and after).

- [ ] **Refinement error path (numbering off the end of the floor)**

As admin, open "New project". Expand advanced. Set `startingUnitNumber=199`, leave `unitsPerFloor=4`. Submit. Expected:
- Inline error on Starting # field: "Starting number's position on its floor + units per floor must fit within one floor (e.g. 101 + 4 → 101–104 ✓; 199 + 4 ✗).".
- No DB writes.

- [ ] **Atomicity smoke test**

Open `lib/projects/repository.ts`. In `createProjectWithUnits`, immediately AFTER the parkings `insertMany` (or just before the closing `})` of `withTransaction`), add a synthetic failure:

```ts
throw new Error("synthetic test failure")
```

Save. As admin, attempt to create another project from the dialog. Expected:
- Dialog shows the generic error "Could not create project. Please try again."
- Dialog stays open.
- `mongosh`: `db.projects.countDocuments()` is **unchanged**. `db.units.countDocuments()` is **unchanged**. Confirms the transaction rolled back the project insert and the apartments insert.

**REMOVE the synthetic throw before committing.** Then verify a real create still works.

- [ ] **Floor manager: detail view, no Financials trigger**

Sign back in as a floor manager. Visit `/projects/<the-new-id>`. Expected:
- Header renders identically (same tiles, including `Sold —` and `Revenue —`).
- Tab triggers show only `Inventory` and `Materials`. No `Financials` trigger anywhere.

- [ ] **Direct action call as floor manager**

While signed in as a floor manager, open the browser devtools console on any authed page and run:

```js
fetch("/projects", {
  method: "POST",
  headers: {
    "content-type": "text/plain;charset=UTF-8",
    "next-action": /* see DevTools Network for the actual action id */ "",
  },
  body: JSON.stringify([{ name: "Hacked", location: "X", totalUnits: 1, totalParkings: 0, status: "planning", notes: "", startingUnitNumber: 101, unitsPerFloor: 4, parkingPrefix: "P" }]),
})
```

(Note: getting the exact `next-action` header for a Server Action requires reading it off a real request from DevTools' Network tab during a legitimate admin submission. The easier and equivalent check below is sufficient — skip this step if extracting the action ID is fiddly.)

**Easier check:** Confirm `requireAdmin()` is called as the FIRST line of the action body in `app/(authed)/projects/actions.ts` (verify by reading the file). Phase 1's `requireAdmin` redirects to `/`; a floor manager hitting the action gets the redirect before any DB code runs. This is the source of truth for the enforcement; the DevTools script is just a behavioral confirmation.

Expected (either via the script or by reading the action): non-admin requests never reach `createProjectWithUnits`.

- [ ] **Final clean state**

```bash
git status
git log --oneline -15
```

Working tree clean. Recent commit history shows the Phase 2 work in roughly the same shape as Phase 1's commit list (per-task commits).

- [ ] **Update meta-plan**

Open `C:\Users\simra\.claude\plans\make-multiple-small-plans-structured-dragon.md` and change the Phase 2 row in the phase map table:

```
| 2 | `docs/plans/phase-2-projects.md` | `projects` + `units` collections, project list & detail shell, "New project" (admin), auto-generate units & parkings inside one Mongo transaction. **(Detailed in repo; verified working.)** |
```

This mirrors what we did for Phase 1 in commit `c368d1f`.

---

## Notes for Phase 3 (next phase)

Phase 2 leaves all `units` documents in `status: "available"`. Phase 3 introduces:
- `transactions` collection (income/expense ledger).
- Inventory tab: replace the Phase 2 placeholder with a filterable table grouped by `type + status`.
- "Mark sold" flow on apartments and parkings: atomic update of the unit + insert of a linked income transaction. **First Mongo transaction touching two different collections in a mutation path other than create.**
- Header tiles `Sold` and `Revenue` start showing real numbers (drop the muted styling once they have data).

The `salePrice`, `soldAt`, `soldPriceTotal`, `buyerName` fields on `Unit` are already defined; Phase 3 just starts writing them. No schema migration needed.
