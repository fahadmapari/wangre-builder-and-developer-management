/** Allowed "rows per page" choices, shared by the dropdown UI and URL parsing. */
export const PER_PAGE_OPTIONS = [25, 50, 100, 200] as const

/** Default page size when no (or an invalid) pageSize param is present. */
export const DEFAULT_PAGE_SIZE = 50

/**
 * Parse a page-size URL param, constrained to {@link PER_PAGE_OPTIONS}. Any value
 * outside the option set (or missing/garbage) falls back to {@link DEFAULT_PAGE_SIZE},
 * so the value always round-trips back into the dropdown.
 */
export function parsePageSize(raw: string | string[] | undefined): number {
  const v = Array.isArray(raw) ? raw[0] : raw
  if (!v) return DEFAULT_PAGE_SIZE
  const n = Number(v)
  return (PER_PAGE_OPTIONS as readonly number[]).includes(n)
    ? n
    : DEFAULT_PAGE_SIZE
}
