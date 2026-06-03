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
