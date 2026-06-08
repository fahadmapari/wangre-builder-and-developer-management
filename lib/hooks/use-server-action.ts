"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import type { ActionResult } from "@/lib/projects/schemas"

export type UseServerActionOptions<TData> = {
  /** Called with the action's `data` on success, before the optional refresh. */
  onSuccess?: (data: TData) => void
  /** Call router.refresh() on success. Default true. Set false where the
   *  component relies solely on the action's revalidatePath. */
  refresh?: boolean
}

/**
 * Wraps the "call a server action inside a transition, surface its
 * {ok,error,field} result, refresh on success" pattern used by every dialog.
 *
 * `run(args)` clears prior errors, runs the action, and on failure sets
 * errorMsg/errorField. Components decide how to render those.
 */
export function useServerAction<TArgs, TData>(
  action: (args: TArgs) => Promise<ActionResult<TData>>,
  options: UseServerActionOptions<TData> = {},
) {
  const { onSuccess, refresh = true } = options
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [errorField, setErrorField] = useState<string | null>(null)

  function run(args: TArgs) {
    setErrorMsg(null)
    setErrorField(null)
    startTransition(async () => {
      const result = await action(args)
      if (!result.ok) {
        setErrorMsg(result.error)
        setErrorField(result.field ?? null)
        return
      }
      onSuccess?.(result.data)
      if (refresh) router.refresh()
    })
  }

  return { run, isPending, errorMsg, errorField, setErrorMsg, setErrorField }
}
