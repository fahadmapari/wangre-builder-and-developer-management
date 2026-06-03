# Settings Page & Role-Based Access Control Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an admin-only `/settings` page where admins can manage an email allowlist (who can sign in and with what role) and change roles of existing users, with immediate session revocation on removal.

**Architecture:** A new `allowedEmails` MongoDB collection gates sign-in via a NextAuth `signIn` callback — only listed emails are admitted. The `createUser` event seeds the role from that collection instead of the `ADMIN_EMAILS` env var (which becomes a one-time bootstrap). Removing an email deletes the user's sessions immediately. The settings page has two tabs: Access List (pre-configured allowlist) and Users (existing signed-in users).

**Tech Stack:** Next.js 16 App Router, NextAuth v5 with MongoDB adapter, MongoDB v6, shadcn/ui (Radix UI + Tailwind), Zod v4, TypeScript, server actions with `revalidatePath`.

---

## File Map

| File | Status | Responsibility |
|------|--------|---------------|
| `lib/settings/schemas.ts` | Create | `AllowedEmail` type, `UserRow` type, Zod input validators |
| `lib/settings/repository.ts` | Create | All DB ops: allowedEmails CRUD, users list/update/delete, session deletion, bootstrap/migration |
| `auth.ts` | Modify | Add `signIn` callback (allowlist gate + bootstrap), update `createUser` to read role from allowedEmails |
| `app/login/page.tsx` | Modify | Read `searchParams.error` and pass to `SignInCard` |
| `app/login/sign-in-card.tsx` | Modify | Accept `serverError` prop and display it |
| `app/(authed)/settings/actions.ts` | Create | Server actions: addAllowedEmail, removeAllowedEmail, updateUserRole, removeUser |
| `app/(authed)/settings/components.tsx` | Create | Client components: AccessListTab, UsersTab, AddEmailDialog, remove confirm buttons, role selects |
| `app/(authed)/settings/page.tsx` | Create | Server component: requireAdmin, fetch data, render tabs |
| `app/(authed)/layout.tsx` | Modify | Add "Settings" nav link (admin-only) |

---

## Task 1: Types & Schemas

**Files:**
- Create: `lib/settings/schemas.ts`

- [ ] **Step 1: Create the file**

```ts
import { z } from "zod"
import type { ObjectId } from "mongodb"
import type { Role } from "@/types"

export type AllowedEmail = {
  _id: ObjectId
  email: string
  role: Role
  addedAt: Date
  addedByEmail: string
}

export type UserRow = {
  _id: ObjectId
  email: string
  name: string | null
  image: string | null
  role: Role
}

export const AddAllowedEmailSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, "Email is required")
    .email("Must be a valid email address"),
  role: z.enum(["admin", "floor_manager"]),
})
export type AddAllowedEmailInput = z.infer<typeof AddAllowedEmailSchema>

export const UpdateUserRoleSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(["admin", "floor_manager"]),
})
export type UpdateUserRoleInput = z.infer<typeof UpdateUserRoleSchema>
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: No errors related to the new file.

- [ ] **Step 3: Commit**

```bash
git add lib/settings/schemas.ts
git commit -m "feat(settings): add settings schemas and types"
```

---

## Task 2: Repository

**Files:**
- Create: `lib/settings/repository.ts`

- [ ] **Step 1: Create the file**

```ts
import { ObjectId } from "mongodb"
import { getDb } from "@/lib/db/client"
import type { Role } from "@/types"
import type { AllowedEmail, UserRow } from "./schemas"

// ── AllowedEmails ────────────────────────────────────────────────────────────

export async function listAllowedEmails(): Promise<AllowedEmail[]> {
  return getDb()
    .collection<AllowedEmail>("allowedEmails")
    .find({})
    .sort({ addedAt: -1 })
    .toArray()
}

export async function getAllowedEmailByEmail(
  email: string
): Promise<AllowedEmail | null> {
  return getDb()
    .collection<AllowedEmail>("allowedEmails")
    .findOne({ email: email.toLowerCase().trim() })
}

export async function upsertAllowedEmail(
  email: string,
  role: Role,
  addedByEmail: string
): Promise<void> {
  const normalised = email.toLowerCase().trim()
  await getDb()
    .collection<AllowedEmail>("allowedEmails")
    .updateOne(
      { email: normalised },
      {
        $set: { role, addedByEmail },
        $setOnInsert: { email: normalised, addedAt: new Date() },
      },
      { upsert: true }
    )
}

export async function deleteAllowedEmailByEmail(email: string): Promise<void> {
  await getDb()
    .collection("allowedEmails")
    .deleteOne({ email: email.toLowerCase().trim() })
}

export async function isAllowedEmailsEmpty(): Promise<boolean> {
  const count = await getDb().collection("allowedEmails").countDocuments()
  return count === 0
}

// Seeds from ADMIN_EMAILS (bootstrap) + all existing users (migration).
// Uses upsert so it is idempotent and safe under concurrent calls.
export async function seedAllowedEmails(adminEmails: string[]): Promise<void> {
  const db = getDb()
  const existingUsers = await db
    .collection<{ email: string; role?: Role }>("users")
    .find({}, { projection: { email: 1, role: 1 } })
    .toArray()

  const seen = new Set<string>()
  const entries: Array<{ email: string; role: Role }> = []

  for (const u of existingUsers) {
    const email = (u.email ?? "").toLowerCase().trim()
    if (!email) continue
    seen.add(email)
    entries.push({ email, role: u.role ?? "floor_manager" })
  }

  for (const email of adminEmails) {
    if (!seen.has(email)) {
      seen.add(email)
      entries.push({ email, role: "admin" })
    }
  }

  for (const entry of entries) {
    await db.collection("allowedEmails").updateOne(
      { email: entry.email },
      {
        $setOnInsert: {
          email: entry.email,
          role: entry.role,
          addedAt: new Date(),
          addedByEmail: "system",
        },
      },
      { upsert: true }
    )
  }
}

// ── Users ────────────────────────────────────────────────────────────────────

export async function listUsers(): Promise<UserRow[]> {
  const docs = await getDb()
    .collection<{
      _id: ObjectId
      email: string
      name?: string | null
      image?: string | null
      role?: Role
    }>("users")
    .find({}, { projection: { email: 1, name: 1, image: 1, role: 1 } })
    .sort({ email: 1 })
    .toArray()

  return docs.map((d) => ({
    _id: d._id,
    email: d.email ?? "",
    name: d.name ?? null,
    image: d.image ?? null,
    role: d.role ?? "floor_manager",
  }))
}

export async function getUserById(userId: string): Promise<UserRow | null> {
  if (!ObjectId.isValid(userId)) return null
  const doc = await getDb()
    .collection<{
      _id: ObjectId
      email: string
      name?: string | null
      image?: string | null
      role?: Role
    }>("users")
    .findOne(
      { _id: new ObjectId(userId) },
      { projection: { email: 1, name: 1, image: 1, role: 1 } }
    )
  if (!doc) return null
  return {
    _id: doc._id,
    email: doc.email ?? "",
    name: doc.name ?? null,
    image: doc.image ?? null,
    role: doc.role ?? "floor_manager",
  }
}

export async function updateUserRoleInDb(
  userId: string,
  role: Role
): Promise<void> {
  if (!ObjectId.isValid(userId)) return
  await getDb()
    .collection("users")
    .updateOne({ _id: new ObjectId(userId) }, { $set: { role } })
}

export async function deleteUserById(userId: string): Promise<void> {
  if (!ObjectId.isValid(userId)) return
  const db = getDb()
  const oid = new ObjectId(userId)
  await db.collection("users").deleteOne({ _id: oid })
  await db.collection("accounts").deleteMany({ userId: oid })
}

// ── Sessions ─────────────────────────────────────────────────────────────────

export async function deleteSessionsByUserId(userId: string): Promise<void> {
  if (!ObjectId.isValid(userId)) return
  await getDb()
    .collection("sessions")
    .deleteMany({ userId: new ObjectId(userId) })
}

export async function getUserIdByEmail(
  email: string
): Promise<string | null> {
  const doc = await getDb()
    .collection<{ _id: ObjectId }>("users")
    .findOne(
      { email: email.toLowerCase().trim() },
      { projection: { _id: 1 } }
    )
  return doc ? doc._id.toString() : null
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add lib/settings/repository.ts
git commit -m "feat(settings): add settings repository"
```

---

## Task 3: Update auth.ts

**Files:**
- Modify: `auth.ts`

- [ ] **Step 1: Replace auth.ts**

```ts
import NextAuth from "next-auth"
import Google from "next-auth/providers/google"
import { MongoDBAdapter } from "@auth/mongodb-adapter"
import { ObjectId } from "mongodb"
import client, { getDb } from "@/lib/db/client"
import type { Role } from "@/types"
import {
  getAllowedEmailByEmail,
  isAllowedEmailsEmpty,
  seedAllowedEmails,
} from "@/lib/settings/repository"

const adminEmails = (process.env.ADMIN_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean)

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: MongoDBAdapter(client, {
    databaseName: process.env.MONGODB_DB,
  }),
  session: { strategy: "database" },
  providers: [Google],
  pages: { signIn: "/login" },
  callbacks: {
    async session({ session, user }) {
      session.user.id = user.id
      session.user.role = user.role ?? "floor_manager"
      return session
    },
    async signIn({ user }) {
      const email = (user.email ?? "").toLowerCase().trim()
      if (!email) return false

      // Bootstrap/migration: seed allowedEmails on first run
      if (await isAllowedEmailsEmpty()) {
        await seedAllowedEmails(adminEmails)
      }

      const entry = await getAllowedEmailByEmail(email)
      return entry !== null
    },
  },
  events: {
    async createUser({ user }) {
      if (!user.id) return
      const email = (user.email ?? "").toLowerCase()
      // Role comes from allowedEmails (set by signIn callback before this fires)
      const entry = await getAllowedEmailByEmail(email)
      const role: Role = entry?.role ?? "floor_manager"
      await getDb()
        .collection("users")
        .updateOne(
          { _id: new ObjectId(user.id) },
          { $set: { role, createdAt: new Date() } }
        )
    },
  },
})
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add auth.ts
git commit -m "feat(settings): add sign-in allowlist gate and bootstrap migration"
```

---

## Task 4: Login page error display

**Files:**
- Modify: `app/login/page.tsx`
- Modify: `app/login/sign-in-card.tsx`

- [ ] **Step 1: Update sign-in-card.tsx to accept a serverError prop**

Replace the `SignInCard` function signature and add the server error display. The complete updated file:

```tsx
"use client"

import { useState, useTransition } from "react"
import { signIn } from "next-auth/react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

interface SignInCardProps {
  serverError?: string | null
}

export function SignInCard({ serverError }: SignInCardProps) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleGoogle() {
    setError(null)
    startTransition(async () => {
      try {
        await signIn("google", { callbackUrl: "/" })
      } catch {
        setError("Sign-in failed. Try again.")
      }
    })
  }

  const displayError = serverError ?? error

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-base font-medium">Sign in</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Button
          type="button"
          variant="outline"
          className="h-10 w-full justify-center gap-2"
          disabled={isPending}
          onClick={handleGoogle}
        >
          <GoogleMark />
          {isPending ? "Redirecting…" : "Continue with Google"}
        </Button>
        {displayError && (
          <p className="text-xs text-destructive" role="alert">
            {displayError}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M12 10.2v3.84h5.45c-.23 1.25-.93 2.31-1.98 3.02v2.5h3.2c1.87-1.72 2.95-4.26 2.95-7.27 0-.7-.06-1.37-.18-2.02H12z"
      />
      <path
        fill="#34A853"
        d="M12 22c2.7 0 4.97-.9 6.62-2.44l-3.2-2.5c-.9.6-2.05.97-3.42.97-2.63 0-4.86-1.78-5.66-4.18H3.04v2.6A9.99 9.99 0 0 0 12 22z"
      />
      <path
        fill="#FBBC05"
        d="M6.34 13.85a6 6 0 0 1 0-3.7V7.55H3.04a10 10 0 0 0 0 8.9l3.3-2.6z"
      />
      <path
        fill="#4285F4"
        d="M12 5.92c1.47 0 2.78.5 3.82 1.5l2.85-2.85C16.96 2.99 14.7 2 12 2A9.99 9.99 0 0 0 3.04 7.55l3.3 2.6C7.14 7.7 9.37 5.92 12 5.92z"
      />
    </svg>
  )
}
```

- [ ] **Step 2: Update login page.tsx to pass the error**

```tsx
import { redirect } from "next/navigation"
import { auth } from "@/auth"
import { SignInCard } from "./sign-in-card"

const ERROR_MESSAGES: Record<string, string> = {
  AccessDenied:
    "Your account is not on the access list. Contact an administrator.",
  OAuthAccountNotLinked:
    "This email is linked to a different sign-in method.",
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const session = await auth()
  if (session?.user) redirect("/")

  const { error } = await searchParams
  const serverError = error ? (ERROR_MESSAGES[error] ?? "Sign-in failed. Try again.") : null

  return (
    <main className="grid min-h-svh place-items-center bg-background px-6 py-12">
      <div className="flex w-full max-w-md flex-col items-center gap-10">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex size-12 items-center justify-center rounded-xl border border-border bg-card font-mono text-lg font-semibold">
            W
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Wangre</h1>
          <p className="max-w-xs text-sm text-muted-foreground">
            Internal operations console for projects, inventory, and ledger.
          </p>
        </div>
        <SignInCard serverError={serverError} />
        <p className="text-xs text-muted-foreground">
          Access is limited to authorized staff. Contact an administrator if you
          need an invitation.
        </p>
      </div>
    </main>
  )
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add app/login/page.tsx app/login/sign-in-card.tsx
git commit -m "feat(settings): show access-denied error on login page"
```

---

## Task 5: Server Actions

**Files:**
- Create: `app/(authed)/settings/actions.ts`

- [ ] **Step 1: Create the file**

```ts
"use server"

import { revalidatePath } from "next/cache"
import { requireAdmin } from "@/lib/auth/session"
import { AddAllowedEmailSchema, UpdateUserRoleSchema } from "@/lib/settings/schemas"
import type { ActionResult } from "@/lib/projects/schemas"
import {
  upsertAllowedEmail,
  deleteAllowedEmailByEmail,
  updateUserRoleInDb,
  deleteUserById,
  deleteSessionsByUserId,
  getUserIdByEmail,
  getUserById,
  getAllowedEmailByEmail,
} from "@/lib/settings/repository"

export async function addAllowedEmail(
  raw: unknown
): Promise<ActionResult<void>> {
  const currentUser = await requireAdmin()

  const parsed = AddAllowedEmailSchema.safeParse(raw)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return {
      ok: false,
      error: first?.message ?? "Invalid input",
      field: first?.path.join(".") || undefined,
    }
  }

  await upsertAllowedEmail(
    parsed.data.email,
    parsed.data.role,
    currentUser.email ?? ""
  )
  revalidatePath("/settings")
  return { ok: true, data: undefined }
}

export async function removeAllowedEmail(
  email: string
): Promise<ActionResult<void>> {
  const currentUser = await requireAdmin()

  if (currentUser.email?.toLowerCase() === email.toLowerCase()) {
    return { ok: false, error: "You cannot remove yourself from the access list." }
  }

  const userId = await getUserIdByEmail(email)
  if (userId) {
    await deleteSessionsByUserId(userId)
  }
  await deleteAllowedEmailByEmail(email)
  revalidatePath("/settings")
  return { ok: true, data: undefined }
}

export async function updateUserRole(
  raw: unknown
): Promise<ActionResult<void>> {
  await requireAdmin()

  const parsed = UpdateUserRoleSchema.safeParse(raw)
  if (!parsed.success) {
    return { ok: false, error: "Invalid input" }
  }

  const { userId, role } = parsed.data
  await updateUserRoleInDb(userId, role)

  // Keep allowedEmails in sync
  const user = await getUserById(userId)
  if (user?.email) {
    const entry = await getAllowedEmailByEmail(user.email)
    if (entry) {
      await upsertAllowedEmail(user.email, role, "system")
    }
  }

  revalidatePath("/settings")
  return { ok: true, data: undefined }
}

export async function removeUser(userId: string): Promise<ActionResult<void>> {
  const currentUser = await requireAdmin()

  const target = await getUserById(userId)
  if (!target) return { ok: false, error: "User not found." }

  if (currentUser.id === userId) {
    return { ok: false, error: "You cannot remove your own account." }
  }

  await deleteSessionsByUserId(userId)
  await deleteUserById(userId)
  if (target.email) {
    await deleteAllowedEmailByEmail(target.email)
  }
  revalidatePath("/settings")
  return { ok: true, data: undefined }
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add "app/(authed)/settings/actions.ts"
git commit -m "feat(settings): add settings server actions"
```

---

## Task 6: Client Components

**Files:**
- Create: `app/(authed)/settings/components.tsx`

- [ ] **Step 1: Create the file**

```tsx
"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import type { AllowedEmail, UserRow } from "@/lib/settings/schemas"
import type { Role } from "@/types"
import {
  addAllowedEmail,
  removeAllowedEmail,
  updateUserRole,
  removeUser,
} from "./actions"

// ── SettingsTabs ─────────────────────────────────────────────────────────────

interface SettingsTabsProps {
  allowedEmails: AllowedEmail[]
  users: UserRow[]
  currentUserId: string
}

export function SettingsTabs({
  allowedEmails,
  users,
  currentUserId,
}: SettingsTabsProps) {
  return (
    <Tabs defaultValue="access-list">
      <TabsList>
        <TabsTrigger value="access-list">Access List</TabsTrigger>
        <TabsTrigger value="users">Users</TabsTrigger>
      </TabsList>
      <TabsContent value="access-list" className="mt-6">
        <AccessListTab allowedEmails={allowedEmails} currentUserId={currentUserId} />
      </TabsContent>
      <TabsContent value="users" className="mt-6">
        <UsersTab users={users} currentUserId={currentUserId} />
      </TabsContent>
    </Tabs>
  )
}

// ── AccessListTab ─────────────────────────────────────────────────────────────

function AccessListTab({
  allowedEmails,
  currentUserId: _currentUserId,
}: {
  allowedEmails: AllowedEmail[]
  currentUserId: string
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Only emails on this list can sign in.
        </p>
        <Button size="sm" onClick={() => setOpen(true)}>
          Add Email
        </Button>
      </div>
      <AddEmailDialog open={open} onClose={() => setOpen(false)} />
      <div className="rounded-md border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                Email
              </th>
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                Role
              </th>
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                Added By
              </th>
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                Added At
              </th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {allowedEmails.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-6 text-center text-muted-foreground"
                >
                  No emails on the access list.
                </td>
              </tr>
            )}
            {allowedEmails.map((entry) => (
              <tr key={entry.email} className="border-b border-border last:border-0">
                <td className="px-4 py-2.5 font-mono text-xs">{entry.email}</td>
                <td className="px-4 py-2.5 capitalize">
                  {entry.role === "admin" ? "Admin" : "Floor Manager"}
                </td>
                <td className="px-4 py-2.5 text-muted-foreground">
                  {entry.addedByEmail}
                </td>
                <td className="px-4 py-2.5 text-muted-foreground">
                  {new Date(entry.addedAt).toLocaleDateString()}
                </td>
                <td className="px-4 py-2.5 text-right">
                  <RemoveEmailButton email={entry.email} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── AddEmailDialog ────────────────────────────────────────────────────────────

function AddEmailDialog({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [email, setEmail] = useState("")
  const [role, setRole] = useState<Role>("floor_manager")
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const result = await addAllowedEmail({ email, role })
      if (!result.ok) {
        setError(result.error)
        return
      }
      setEmail("")
      setRole("floor_manager")
      onClose()
      router.refresh()
    })
  }

  function handleClose() {
    setEmail("")
    setRole("floor_manager")
    setError(null)
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Add Email to Access List</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email address</Label>
            <Input
              id="email"
              type="email"
              placeholder="user@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={isPending}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="role">Role</Label>
            <Select
              value={role}
              onValueChange={(v) => setRole(v as Role)}
              disabled={isPending}
            >
              <SelectTrigger id="role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="floor_manager">Floor Manager</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {error && (
            <p className="text-xs text-destructive" role="alert">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Adding…" : "Add"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ── RemoveEmailButton ─────────────────────────────────────────────────────────

function RemoveEmailButton({ email }: { email: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function handleConfirm() {
    startTransition(async () => {
      await removeAllowedEmail(email)
      router.refresh()
    })
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
          Remove
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove {email}?</AlertDialogTitle>
          <AlertDialogDescription>
            This will immediately sign out the user and block future sign-ins.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isPending ? "Removing…" : "Remove"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

// ── UsersTab ──────────────────────────────────────────────────────────────────

function UsersTab({
  users,
  currentUserId,
}: {
  users: UserRow[]
  currentUserId: string
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Users who have signed in. Role changes take effect immediately.
      </p>
      <div className="rounded-md border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                Name
              </th>
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                Email
              </th>
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                Role
              </th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {users.length === 0 && (
              <tr>
                <td
                  colSpan={4}
                  className="px-4 py-6 text-center text-muted-foreground"
                >
                  No users yet.
                </td>
              </tr>
            )}
            {users.map((user) => (
              <tr
                key={user._id.toString()}
                className="border-b border-border last:border-0"
              >
                <td className="px-4 py-2.5">
                  {user.name ?? <span className="text-muted-foreground">—</span>}
                </td>
                <td className="px-4 py-2.5 font-mono text-xs">{user.email}</td>
                <td className="px-4 py-2.5">
                  <UserRoleSelect
                    userId={user._id.toString()}
                    currentRole={user.role}
                    disabled={user._id.toString() === currentUserId}
                  />
                </td>
                <td className="px-4 py-2.5 text-right">
                  {user._id.toString() !== currentUserId && (
                    <RemoveUserButton
                      userId={user._id.toString()}
                      email={user.email}
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── UserRoleSelect ────────────────────────────────────────────────────────────

function UserRoleSelect({
  userId,
  currentRole,
  disabled,
}: {
  userId: string
  currentRole: Role
  disabled: boolean
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function handleChange(role: string) {
    startTransition(async () => {
      await updateUserRole({ userId, role })
      router.refresh()
    })
  }

  return (
    <Select
      value={currentRole}
      onValueChange={handleChange}
      disabled={disabled || isPending}
    >
      <SelectTrigger className="h-7 w-36 text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="floor_manager">Floor Manager</SelectItem>
        <SelectItem value="admin">Admin</SelectItem>
      </SelectContent>
    </Select>
  )
}

// ── RemoveUserButton ──────────────────────────────────────────────────────────

function RemoveUserButton({
  userId,
  email,
}: {
  userId: string
  email: string
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function handleConfirm() {
    startTransition(async () => {
      await removeUser(userId)
      router.refresh()
    })
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
          Remove
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove {email}?</AlertDialogTitle>
          <AlertDialogDescription>
            This will immediately sign out the user, delete their account, and
            remove them from the access list.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isPending ? "Removing…" : "Remove"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add "app/(authed)/settings/components.tsx"
git commit -m "feat(settings): add settings client components"
```

---

## Task 7: Settings Page Server Component

**Files:**
- Create: `app/(authed)/settings/page.tsx`

- [ ] **Step 1: Create the file**

```tsx
import { requireAdmin } from "@/lib/auth/session"
import { listAllowedEmails, listUsers } from "@/lib/settings/repository"
import { SettingsTabs } from "./components"

export default async function SettingsPage() {
  const currentUser = await requireAdmin()

  const [allowedEmails, users] = await Promise.all([
    listAllowedEmails(),
    listUsers(),
  ])

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage access control and user roles.
        </p>
      </div>
      <SettingsTabs
        allowedEmails={JSON.parse(JSON.stringify(allowedEmails))}
        users={JSON.parse(JSON.stringify(users))}
        currentUserId={currentUser.id}
      />
    </div>
  )
}
```

> **Note on `JSON.parse(JSON.stringify(...))`:** MongoDB documents contain `ObjectId` and `Date` instances which are not serialisable across the server→client boundary. This round-trip converts them to strings/ISO strings so React can pass them as props. The `AllowedEmail` and `UserRow` types in components will treat `_id` as `unknown` after serialisation — that is fine since we only call `.toString()` on it client-side. If TypeScript complains, cast with `as AllowedEmail[]` after the parse.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`

If you see a serialisation error about `ObjectId` not assignable to the client prop type, update the `SettingsTabsProps` in `components.tsx` to use serialised versions:

In `app/(authed)/settings/components.tsx`, change the import types at the top:

```tsx
// Replace the AllowedEmail and UserRow imports with serialised versions:
type SerialisedAllowedEmail = Omit<AllowedEmail, "_id" | "addedAt"> & {
  _id: string
  addedAt: string
}
type SerialisedUserRow = Omit<UserRow, "_id"> & { _id: string }
```

Then update `SettingsTabsProps` to use `SerialisedAllowedEmail[]` and `SerialisedUserRow[]`, and update all usages in the file accordingly (the only `_id` usage is `.toString()` — change those to just use the `_id` string directly).

- [ ] **Step 3: Commit**

```bash
git add "app/(authed)/settings/page.tsx"
git commit -m "feat(settings): add settings page server component"
```

---

## Task 8: Navigation Link

**Files:**
- Modify: `app/(authed)/layout.tsx`

- [ ] **Step 1: Add Settings link to admin nav block**

In `app/(authed)/layout.tsx`, find the admin-only links block (currently ends with the Audit link) and add Settings after it:

```tsx
{isAdmin ? (
  <>
    <Link
      href="/catalog"
      className="text-sm text-muted-foreground hover:text-foreground"
    >
      Catalog
    </Link>
    <Link
      href="/financials"
      className="text-sm text-muted-foreground hover:text-foreground"
    >
      Financials
    </Link>
    <Link
      href="/transfers"
      className="text-sm text-muted-foreground hover:text-foreground"
    >
      Transfers
    </Link>
    <Link
      href="/audit"
      className="text-sm text-muted-foreground hover:text-foreground"
    >
      Audit
    </Link>
    <Link
      href="/settings"
      className="text-sm text-muted-foreground hover:text-foreground"
    >
      Settings
    </Link>
  </>
) : null}
```

- [ ] **Step 2: Typecheck and build**

Run: `npm run typecheck`
Expected: No errors.

Run: `npm run build`
Expected: Build succeeds with no type or compilation errors.

- [ ] **Step 3: Commit**

```bash
git add "app/(authed)/layout.tsx"
git commit -m "feat(settings): add Settings nav link for admins"
```

---

## Manual Verification Checklist

After all tasks are complete, start the dev server (`npm run dev`) and verify:

- [ ] Sign in with an email that is NOT in `allowedEmails` → redirected to `/login?error=AccessDenied` with "Your account is not on the access list" message
- [ ] Sign in with an email that IS in `allowedEmails` → succeeds, role matches the allowlist entry
- [ ] Admin can visit `/settings` → sees Access List and Users tabs
- [ ] Floor manager visiting `/settings` → redirected to `/`
- [ ] Add a new email via the Access List tab → row appears, typecheck passes
- [ ] Remove an email from the Access List → user is signed out on next request
- [ ] Change a user's role in the Users tab → role badge updates in their session
- [ ] Remove a user from Users tab → they are signed out and cannot re-sign-in
- [ ] Trying to remove yourself in either tab → error message shown, no action taken
- [ ] Fresh install with `ADMIN_EMAILS` set and empty DB → first sign-in seeds the allowlist, admin can sign in
