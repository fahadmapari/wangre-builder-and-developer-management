"use client"

import { useState } from "react"

/**
 * Object-shaped form state with a typed field setter. Drop-in for the
 * `const [form, setForm] = useState<FormState>(...)` + generic `set<K>` helper
 * pasted across the dialogs. Returns a tuple: [values, set, setValues].
 */
export function useFormFields<T extends Record<string, unknown>>(initial: T) {
  const [values, setValues] = useState<T>(initial)
  function set<K extends keyof T>(key: K, value: T[K]) {
    setValues((prev) => ({ ...prev, [key]: value }))
  }
  return [values, set, setValues] as const
}
