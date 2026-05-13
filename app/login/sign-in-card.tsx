"use client"

import { useState, useTransition } from "react"
import { signIn } from "next-auth/react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

export function SignInCard() {
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
        {error && (
          <p className="text-xs text-destructive" role="alert">
            {error}
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
