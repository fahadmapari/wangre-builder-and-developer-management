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
