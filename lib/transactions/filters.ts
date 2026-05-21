/**
 * Shared translator from URLSearchParams (or a plain { key: string | string[] | undefined })
 * into a parsed LedgerFilters object. Used by both the per-project financials
 * page and the /api/export/ledger Route Handler so they stay in lockstep.
 *
 * Date inputs are parsed as local-midnight (Y/M/D constructed manually) to match
 * the audit page's parseLocalDate fix from Phase 7 — `new Date("YYYY-MM-DD")` is
 * UTC midnight which shifts on the Mumbai server.
 */

import type { LedgerFilters } from "./schemas"
import {
  LedgerCategoryFilterSchema,
  LedgerKindFilterSchema,
  LedgerVoidedFilterSchema,
} from "./schemas"

export type ReadableSearchParams =
  | URLSearchParams
  | Record<string, string | string[] | undefined>

function getOne(sp: ReadableSearchParams, key: string): string | undefined {
  if (sp instanceof URLSearchParams) return sp.get(key) ?? undefined
  const v = sp[key]
  return Array.isArray(v) ? v[0] : v
}

function parseLocalDate(raw: string | undefined, fallback: Date): Date {
  if (!raw) return fallback
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw)
  if (!m) return fallback
  const [, y, mo, d] = m
  const out = new Date(Number(y), Number(mo) - 1, Number(d), 0, 0, 0, 0)
  return Number.isNaN(out.getTime()) ? fallback : out
}

export function defaultLedgerFrom(): Date {
  const d = new Date()
  d.setMonth(0, 1)
  d.setHours(0, 0, 0, 0)
  return d
}

export function defaultLedgerTo(): Date {
  const d = new Date()
  d.setMonth(11, 31)
  d.setHours(0, 0, 0, 0)
  return d
}

const MAX_SEARCH_LEN = 200

export function parseLedgerFilters(sp: ReadableSearchParams): LedgerFilters {
  const from = parseLocalDate(getOne(sp, "from"), defaultLedgerFrom())
  const to = parseLocalDate(getOne(sp, "to"), defaultLedgerTo())

  const kindParse = LedgerKindFilterSchema.safeParse(getOne(sp, "kind") ?? "all")
  const kind = kindParse.success ? kindParse.data : "all"

  const categoryParse = LedgerCategoryFilterSchema.safeParse(
    getOne(sp, "category") ?? "all",
  )
  const category = categoryParse.success ? categoryParse.data : "all"

  const voidedParse = LedgerVoidedFilterSchema.safeParse(
    getOne(sp, "voided") ?? "active",
  )
  const includeVoided = voidedParse.success && voidedParse.data === "all"

  const rawSearch = getOne(sp, "search")?.trim() ?? ""
  const search =
    rawSearch.length === 0 || rawSearch.length > MAX_SEARCH_LEN
      ? undefined
      : rawSearch

  return { from, to, kind, category, includeVoided, search }
}
