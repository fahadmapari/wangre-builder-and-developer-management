"use client"

import { useRouter } from "next/navigation"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { PER_PAGE_OPTIONS } from "@/lib/pagination"

/**
 * Shared pagination bar: a "rows per page" dropdown on the left and prev/next +
 * page indicator on the right. Prev/next are plain `<a>` links (full navigation,
 * preserving every other search param except `pageKey`); the dropdown navigates
 * client-side, writing `pageSizeKey` and dropping `pageKey` so the user lands
 * back on page 1.
 *
 * `pageKey`/`pageSizeKey` let a single page host several independent tables
 * (e.g. transfers' moneyPage/materialPage, project ledger vs. unitsPage).
 */
export function Pagination({
  current,
  total,
  pageSize,
  searchParams,
  pageKey = "page",
  pageSizeKey = "pageSize",
}: {
  current: number
  total: number
  pageSize: number
  searchParams: Record<string, string | string[] | undefined>
  pageKey?: string
  pageSizeKey?: string
}) {
  const router = useRouter()
  if (total === 0) return null
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  // base carries every param except the page cursor, so navigation preserves
  // filters (and the current pageSize) while resetting to page 1 where needed.
  const base = new URLSearchParams()
  for (const [k, v] of Object.entries(searchParams)) {
    if (k === pageKey) continue
    if (typeof v === "string") base.set(k, v)
  }
  const hrefFor = (p: number) => {
    const q = new URLSearchParams(base)
    q.set(pageKey, String(p))
    return `?${q.toString()}`
  }
  const onPageSizeChange = (value: string) => {
    const q = new URLSearchParams(base)
    q.set(pageSizeKey, value)
    router.push(`?${q.toString()}`)
  }

  return (
    <nav className="flex items-center justify-between gap-3 text-sm">
      <div className="flex items-center gap-2 text-muted-foreground">
        <span>Rows per page</span>
        <Select value={String(pageSize)} onValueChange={onPageSizeChange}>
          <SelectTrigger size="sm" aria-label="Rows per page">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PER_PAGE_OPTIONS.map((opt) => (
              <SelectItem key={opt} value={String(opt)}>
                {opt}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {totalPages > 1 ? (
        <div className="flex items-center gap-3">
          <PaginationLink
            href={hrefFor(current - 1)}
            disabled={current <= 1}
            label="← Prev"
          />
          <span className="text-muted-foreground">
            Page {current} of {totalPages}
          </span>
          <PaginationLink
            href={hrefFor(current + 1)}
            disabled={current >= totalPages}
            label="Next →"
          />
        </div>
      ) : null}
    </nav>
  )
}

function PaginationLink({
  href,
  disabled,
  label,
}: {
  href: string
  disabled: boolean
  label: string
}) {
  if (disabled) {
    return <span className="text-muted-foreground">{label}</span>
  }
  return (
    <a className="text-primary hover:underline" href={href}>
      {label}
    </a>
  )
}
