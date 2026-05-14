# Phase 2 — Projects & Units (design)

**Date:** 2026-05-14
**Status:** Approved (brainstorm). Implementation plan pending.
**Depends on:** Phase 1 (auth, Mongo client, server-side guards) — already merged to master.

## Goal

Admins can create a project (with name, location, status, unit and parking counts, and a numbering convention) and the system atomically generates the project document plus all units and parkings in one Mongo transaction. Both roles can browse the project list and open a project detail page that scaffolds three tabs (Inventory, Materials, Financials) as placeholders for Phases 3–5.

## Non-goals (explicitly deferred)

- Editing a project (name, location, status, counts) — manual via Mongo Atlas in v1, like role changes from Phase 1.
- Deleting a project.
- Adding or removing units after creation.
- Per-unit editing (Phase 3 inventory tab will handle this).
- Tab contents — Phase 2 renders placeholders only.
- Search, filter, sort on the project list (Phase 7 polish).

## Data model

### `projects` collection

```ts
type Project = {
  _id: ObjectId
  name: string
  location: string                              // free-text, single line
  status: "planning" | "under_construction" | "completed" | "on_hold"
  totalUnits: number                            // fixed at creation
  totalParkings: number                         // fixed at creation
  notes?: string                                // optional, multi-line
  createdBy: ObjectId                           // ref users
  createdAt: Date
  updatedAt: Date
}
```

Indexes:
- `{ createdAt: -1 }` — list ordering.
- `{ name: 1 }` — future search (Phase 7).

### `units` collection (one collection, discriminator)

```ts
type Unit = {
  _id: ObjectId
  projectId: ObjectId
  type: "apartment" | "parking"
  number: string                                // "101", "P001"
  floor: number                                 // apartments: Math.floor(parseInt(number)/100); parkings: 0
  areaSqft: number                              // 0 at creation; editable in Phase 3
  salePrice: number                             // 0 at creation; set at sale time
  status: "available" | "sold"
  soldAt?: Date                                 // Phase 3
  soldPriceTotal?: number                       // Phase 3 — actual sale price; may differ from listed
  buyerName?: string                            // Phase 3
  notes?: string
  createdBy: ObjectId
  createdAt: Date
  updatedAt: Date
}
```

Indexes:
- `{ projectId: 1, type: 1, status: 1 }` — Phase 3 inventory tab queries.
- `{ projectId: 1, type: 1, number: 1 }` unique — prevents duplicate numbers within a project+type.
- `{ status: 1, soldAt: -1 }` — Phase 5 ledger drilldowns.

Phase 3+ fields (`salePrice`, `soldAt`, `soldPriceTotal`, `buyerName`) are defined now to avoid a later migration. They're optional / zero-valued at creation.

### Numbering convention

Apartments use 100s-based numbering. With `startingUnitNumber=101` and `unitsPerFloor=4`, the generator produces:
- Floor 1: `101, 102, 103, 104`
- Floor 2: `201, 202, 203, 204`
- … and so on.

Formula for the i-th apartment (0-indexed):
- `floor = startingFloor + Math.floor(i / unitsPerFloor)`
- `positionOnFloor = startingPosition + (i % unitsPerFloor)`
- `number = String(floor * 100 + positionOnFloor)`

Where `startingFloor = Math.floor(startingUnitNumber / 100)` and `startingPosition = startingUnitNumber % 100`.

Constraint: works for any `unitsPerFloor ≤ 9` within the 100s convention. If a future project needs ≥10 units per floor, the generator will require switching to 1000s convention — out of scope for Phase 2.

Parkings: `${parkingPrefix}${(i+1).toString().padStart(3, "0")}` → `P001, P002, …`. Floor defaults to 0; user can edit individual parkings later (negative values for basement) once per-unit editing exists.

## Pages & routes

| Route | Component | Access |
|---|---|---|
| `/` | Server-side `redirect("/projects")` | All authed |
| `/projects` | Project list (grid of cards) + "New project" button (admin only) | All authed |
| `/projects/[id]` | Detail shell: header + tabs scaffold | All authed (Financials tab hidden for floor_manager) |

The `(authed)` layout from Phase 1 wraps all of these unchanged.

### `/projects` — list

- Server component reads with `getDb().collection("projects").find().sort({ createdAt: -1 }).toArray()`.
- Each card shows: name, location, status badge, totalUnits / totalParkings, created date.
- Empty state: centered card "No projects yet." Admin sees a "Create your first project" CTA.
- "New project" button in the page header, visible only to admin (UI hidden + server-enforced in the action).

### `/projects/[id]` — detail shell

- Server component reads the project; if not found → Next.js `notFound()`.
- Header:
  - Project name (h1)
  - Location subtitle
  - Status badge
  - Stat tile row: **Total apartments** (n), **Total parkings** (n), **Sold** (—), **Revenue** (—), **Created** (date). The "—" tiles are visibly muted to signal Phase 3+ content; copy in tooltip explains "Available after first sale (Phase 3)".
- Tabs (radix Tabs primitive):
  - **Inventory** (default) — placeholder card "Inventory listing coming in Phase 3."
  - **Materials** — placeholder card "Materials tracking coming in Phase 4."
  - **Financials** — admin-only tab trigger. Placeholder card "Financial ledger coming in Phase 5."
- Financials tab trigger is conditionally rendered: `{user.role === "admin" && <TabsTrigger value="financials">…}`. (Server-side enforcement for the tab's data will be added in Phase 5 when the data exists.)

## Create-project flow

1. Admin clicks "New project" on `/projects` → modal dialog opens.
2. **Top-tier fields:** `name`, `location`, `totalUnits`, `totalParkings`, `status` (default `planning`), `notes`.
3. **Advanced (collapsed by default):** `startingUnitNumber` (default `101`), `unitsPerFloor` (default `4`), `parkingPrefix` (default `P`).
4. Submit → server action `createProject(input)`:
   - `await requireAdmin()` (redirects floor_managers away — they cannot reach this code path via UI, but the guard is the enforcement).
   - Validate input with Zod (positive integers for counts, sane string lengths, status in enum, `unitsPerFloor` in `[1, 9]`).
   - `client.startSession()` and `session.withTransaction(async () => { … })`:
     - Insert one `projects` document.
     - Generate `totalUnits` apartment docs (numbering per the formula above).
     - Generate `totalParkings` parking docs (numbering with prefix + zero-padded sequence).
     - `insertMany(apartments, { session })` and `insertMany(parkings, { session })`, both with `createdBy` set to the admin's user id.
   - `revalidatePath("/projects")` and `redirect(`/projects/${insertedProject._id.toHexString()}`)` on success.
5. On validation or transaction failure: server action returns `{ ok: false, error, field? }`; the dialog surfaces the message and stays open. See "Error handling" below.

## Components & files

### Create

- `app/(authed)/projects/page.tsx` — list page (server component).
- `app/(authed)/projects/new-project-dialog.tsx` — client form, advanced section, calls action.
- `app/(authed)/projects/actions.ts` — `createProject` server action.
- `app/(authed)/projects/[id]/page.tsx` — detail shell (server component).
- `app/(authed)/projects/[id]/project-tabs.tsx` — client tabs (radix) with role-gated Financials trigger.
- `lib/projects/schemas.ts` — Zod schemas for `createProjectInput` + inferred types.
- `lib/projects/repository.ts` — typed Mongo helpers: `listProjects`, `getProject(id)`, `createProjectWithUnits(input, userId)`.
- `lib/projects/generation.ts` — pure functions: `generateApartmentNumbers`, `generateParkingNumbers`, `floorFromApartmentNumber`. Pure so they're trivial to unit-test in Phase 7.

### Modify

- `app/(authed)/page.tsx` — replace placeholder body with `redirect("/projects")`.
- `scripts/init-db.mjs` — add `projects` indexes and `units` indexes (idempotent `createIndex` calls).

### Add via `npx shadcn@latest add`

- `dialog`, `input`, `label`, `select`, `textarea`, `tabs`.

## Role enforcement

| Action | Admin | Floor manager |
|---|---|---|
| View `/projects` | ✓ | ✓ |
| See "New project" button | ✓ | hidden |
| Submit `createProject` action | ✓ (`requireAdmin`) | rejected by server guard |
| View `/projects/[id]` | ✓ | ✓ |
| See Financials tab trigger | ✓ | hidden |
| See Inventory / Materials tabs | ✓ | ✓ |

**Server-side enforcement is the source of truth.** UI hiding is convenience only; every server action and protected route starts with `requireAuth()` or `requireRole(...)` — per the Phase 1 locked-in convention.

## Error handling pattern

Server actions return a discriminated result for user-fixable errors:

```ts
type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; field?: string }
```

- Zod failures map to `{ ok: false, error: <first issue's message>, field: <path> }`.
- Transaction failures map to `{ ok: false, error: "Could not create project. Please try again." }`. Detailed errors are logged server-side (not returned).
- Auth and role failures redirect (Next.js `redirect()`), they never return — they happen before any user input is processed.

The client dialog reads `result.field` and highlights the offending input. The dialog stays open on failure.

## Verification (manual, like Phase 1)

- `npm run db:init` succeeds and prints index counts for `projects` and `units` (idempotent on re-run).
- **Floor manager flow:** `/` redirects to `/projects`; empty state visible; no "New project" button.
- **Admin flow:** clicks "New project"; submits with `name=Skyline Heights, location=Downtown, totalUnits=12, totalParkings=4, status=planning`; lands on `/projects/<new-id>` with the header populated and three tabs visible.
- `mongosh` checks:
  - `db.projects.find().sort({ createdAt: -1 }).limit(1)` shows the new doc.
  - `db.units.countDocuments({ projectId: <new-id> })` returns `16`.
  - `db.units.find({ projectId: <new-id>, type: "apartment" }).sort({ number: 1 }).toArray()` shows numbers `101–104, 201–204, 301–304`.
  - `db.units.find({ projectId: <new-id>, type: "parking" }).sort({ number: 1 }).toArray()` shows `P001, P002, P003, P004`.
- **Validation error:** admin submits dialog with `totalUnits=0` → inline error on the field, dialog stays open, no DB writes.
- **Transaction atomicity smoke test:** intentionally inject a failure mid-transaction (e.g., temporarily throw between the two `insertMany` calls) and confirm the project document is also rolled back — no orphan `projects` doc remains. Remove the injection before committing.
- **Floor manager visiting detail page:** `/projects/<id>` renders; Financials tab trigger is absent.
- **Direct POST to the server action as a floor manager** (curl or DevTools "fetch" with the action's signature) → redirected away (not 200).

## Open risks / things to watch

1. **Mongo Atlas transaction warm-up.** First transaction after a long-idle period can take ~200ms while the driver opens a session. Not a correctness issue — surface if it appears in dev.
2. **Unique index on `(projectId, type, number)`.** The generator produces unique numbers by construction, so this index will never fire on a normal create. It's there as a guard against future code paths (Phase 7 manual add).
3. **`unitsPerFloor` upper bound of 9.** Documented in the dialog's Advanced section as a hint. Picking 10+ silently breaks the 100s convention; Zod rejects values outside `[1, 9]`.
4. **Counts vs reality drift.** `projects.totalUnits` is the count snapshot at creation. If Phase 3+ ever adds an "add more units" flow, we must also update `totalUnits` in the same transaction. Phase 2 leaves a comment in the schema file as a reminder.

## What Phase 2 leaves for Phase 3

- `units` documents exist, fields like `salePrice` and `status` are queryable but never mutated by Phase 2 UI.
- The Inventory tab placeholder is replaced with the filterable inventory table.
- "Mark sold" flow adds the first mutation that touches `units` + inserts a linked `transactions` record (Phase 3 introduces the `transactions` collection).
