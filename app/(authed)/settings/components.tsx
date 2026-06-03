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

// Serialised versions received from server component via JSON
type SerialisedAllowedEmail = Omit<AllowedEmail, "_id" | "addedAt"> & { _id: string; addedAt: string }
type SerialisedUserRow = Omit<UserRow, "_id"> & { _id: string }

// ── SettingsTabs ─────────────────────────────────────────────────────────────

interface SettingsTabsProps {
  allowedEmails: SerialisedAllowedEmail[]
  users: SerialisedUserRow[]
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
  allowedEmails: SerialisedAllowedEmail[]
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
  users: SerialisedUserRow[]
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
                key={user._id}
                className="border-b border-border last:border-0"
              >
                <td className="px-4 py-2.5">
                  {user.name ?? <span className="text-muted-foreground">—</span>}
                </td>
                <td className="px-4 py-2.5 font-mono text-xs">{user.email}</td>
                <td className="px-4 py-2.5">
                  <UserRoleSelect
                    userId={user._id}
                    currentRole={user.role}
                    disabled={user._id === currentUserId}
                  />
                </td>
                <td className="px-4 py-2.5 text-right">
                  {user._id !== currentUserId && (
                    <RemoveUserButton
                      userId={user._id}
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
