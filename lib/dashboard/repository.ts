import { ObjectId } from "mongodb"
import { getDb } from "@/lib/db/client"
import { monthRange } from "@/lib/dashboard/dates"

// IMPORTANT: do not import lib/transactions/repository.ts or
// lib/materials/repository.ts at the top level — they form a bidirectional
// value-import cycle. All pipelines here run directly against collections.

export type DashboardScope = {
  projectId: ObjectId | null // null = all projects (combined)
  from: Date
  to: Date
}

const TZ = "Asia/Kolkata"

function endOfDay(d: Date): Date {
  const e = new Date(d)
  e.setHours(23, 59, 59, 999)
  return e
}

/** Match on a date field within scope, plus projectId when scoped. */
function rangeMatch(scope: DashboardScope, dateField: string): Record<string, unknown> {
  const m: Record<string, unknown> = {
    [dateField]: { $gte: scope.from, $lte: endOfDay(scope.to) },
  }
  if (scope.projectId) m.projectId = scope.projectId
  return m
}

/** Month bucket expression on `occurredAt`, in IST. */
const MONTH_EXPR = {
  $dateToString: { format: "%Y-%m", date: "$occurredAt", timezone: TZ },
}

/** $sum that nets reversal rows (reversalOf set => subtract their amount). */
const NETTED_AMOUNT_SUM = {
  $sum: {
    $cond: [
      { $ifNull: ["$reversalOf", false] },
      { $multiply: [{ $ifNull: ["$amount", 0] }, -1] },
      { $ifNull: ["$amount", 0] },
    ],
  },
}

async function getJvRevenue(
  db: ReturnType<typeof getDb>,
  projectId: ObjectId,
): Promise<number> {
  const res = await db
    .collection("units")
    .aggregate<{ total: number }>([
      {
        $match: {
          projectId,
          isJointVentureUnit: true,
          type: "apartment",
          status: "sold",
        },
      },
      { $group: { _id: null, total: { $sum: { $ifNull: ["$soldPriceTotal", 0] } } } },
    ])
    .toArray()
  return res[0]?.total ?? 0
}

export type KpiSummary = {
  revenue: number
  expenses: number
  net: number
  capital: number
  availableFunds: number
  unitsSold: number
  unitsTotal: number
  sellThroughPct: number
  materialsSpend: number
  jvRevenue: number | null // null when not scoped to a single JV project
}

/**
 * Top-line KPIs. Financials, capital, and materials spend are range-bound;
 * unit counts (sold / total / sell-through) are a current snapshot and ignore
 * the date range. jvRevenue is computed only when scoped to a single project.
 */
export async function getKpiSummary(scope: DashboardScope): Promise<KpiSummary> {
  const db = getDb()
  const txnMatch = { ...rangeMatch(scope, "occurredAt"), voided: { $ne: true } }
  const capMatch = rangeMatch(scope, "occurredAt")
  const matMatch = {
    ...rangeMatch(scope, "occurredAt"),
    category: "purchase",
    voided: { $ne: true },
  }
  const unitMatch: Record<string, unknown> = {}
  if (scope.projectId) unitMatch.projectId = scope.projectId

  const [byKind, capAgg, unitRows, matAgg, jvRevenue] = await Promise.all([
    db
      .collection("transactions")
      .aggregate<{ _id: "income" | "expense"; total: number }>([
        { $match: txnMatch },
        { $group: { _id: "$kind", total: NETTED_AMOUNT_SUM } },
      ])
      .toArray(),
    db
      .collection("capitalInjections")
      .aggregate<{ total: number }>([
        { $match: capMatch },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ])
      .toArray(),
    db
      .collection("units")
      .aggregate<{ _id: "available" | "sold"; count: number }>([
        { $match: unitMatch },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ])
      .toArray(),
    db
      .collection("materialMovements")
      .aggregate<{ total: number }>([
        { $match: matMatch },
        { $group: { _id: null, total: NETTED_AMOUNT_SUM } },
      ])
      .toArray(),
    scope.projectId ? getJvRevenue(db, scope.projectId) : Promise.resolve(null),
  ])

  let revenue = 0
  let expenses = 0
  for (const r of byKind) {
    if (r._id === "income") revenue = r.total
    else if (r._id === "expense") expenses = r.total
  }
  let unitsSold = 0
  let unitsTotal = 0
  for (const r of unitRows) {
    unitsTotal += r.count
    if (r._id === "sold") unitsSold = r.count
  }
  const capital = capAgg[0]?.total ?? 0
  const materialsSpend = matAgg[0]?.total ?? 0

  return {
    revenue,
    expenses,
    net: revenue - expenses,
    capital,
    availableFunds: capital + revenue - expenses,
    unitsSold,
    unitsTotal,
    sellThroughPct: unitsTotal > 0 ? Math.round((unitsSold / unitsTotal) * 100) : 0,
    materialsSpend,
    jvRevenue,
  }
}

export type MonthlyFinancialPoint = {
  month: string
  revenue: number
  expenses: number
  capital: number
}

/** Monthly revenue / expenses / capital, gap-filled across the scope window. */
export async function getMonthlyFinancials(
  scope: DashboardScope,
): Promise<MonthlyFinancialPoint[]> {
  const db = getDb()
  const txnMatch = { ...rangeMatch(scope, "occurredAt"), voided: { $ne: true } }

  const [txnRows, capRows] = await Promise.all([
    db
      .collection("transactions")
      .aggregate<{ _id: { month: string; kind: "income" | "expense" }; total: number }>([
        { $match: txnMatch },
        { $group: { _id: { month: MONTH_EXPR, kind: "$kind" }, total: NETTED_AMOUNT_SUM } },
      ])
      .toArray(),
    db
      .collection("capitalInjections")
      .aggregate<{ _id: string; total: number }>([
        { $match: rangeMatch(scope, "occurredAt") },
        { $group: { _id: MONTH_EXPR, total: { $sum: "$amount" } } },
      ])
      .toArray(),
  ])

  const byMonth = new Map<string, { revenue: number; expenses: number; capital: number }>()
  const ensure = (m: string) => {
    let e = byMonth.get(m)
    if (!e) {
      e = { revenue: 0, expenses: 0, capital: 0 }
      byMonth.set(m, e)
    }
    return e
  }
  for (const r of txnRows) {
    const e = ensure(r._id.month)
    if (r._id.kind === "income") e.revenue = r.total
    else if (r._id.kind === "expense") e.expenses = r.total
  }
  for (const r of capRows) ensure(r._id).capital = r.total

  return monthRange(scope.from, scope.to).map((month) => ({
    month,
    revenue: byMonth.get(month)?.revenue ?? 0,
    expenses: byMonth.get(month)?.expenses ?? 0,
    capital: byMonth.get(month)?.capital ?? 0,
  }))
}

/**
 * Earliest activity date in scope (min of transaction / movement occurredAt),
 * used to bound the "All time" preset. Returns null when there is no activity.
 */
export async function getEarliestActivityDate(
  projectId: ObjectId | null,
): Promise<Date | null> {
  const db = getDb()
  const m: Record<string, unknown> = {}
  if (projectId) m.projectId = projectId
  const [t, mv] = await Promise.all([
    db
      .collection("transactions")
      .find(m)
      .sort({ occurredAt: 1 })
      .limit(1)
      .project<{ occurredAt: Date }>({ occurredAt: 1 })
      .toArray(),
    db
      .collection("materialMovements")
      .find(m)
      .sort({ occurredAt: 1 })
      .limit(1)
      .project<{ occurredAt: Date }>({ occurredAt: 1 })
      .toArray(),
  ])
  const dates = [t[0]?.occurredAt, mv[0]?.occurredAt].filter(
    (d): d is Date => d instanceof Date,
  )
  if (dates.length === 0) return null
  return new Date(Math.min(...dates.map((d) => d.getTime())))
}

export type InventoryBreakdown = {
  soldApartments: number
  availableApartments: number
  soldParkings: number
  availableParkings: number
}

/** Current inventory snapshot (ignores the date range). */
export async function getInventoryBreakdown(
  scope: DashboardScope,
): Promise<InventoryBreakdown> {
  const db = getDb()
  const match: Record<string, unknown> = {}
  if (scope.projectId) match.projectId = scope.projectId
  const rows = await db
    .collection("units")
    .aggregate<{ _id: { type: string; status: string }; count: number }>([
      { $match: match },
      { $group: { _id: { type: "$type", status: "$status" }, count: { $sum: 1 } } },
    ])
    .toArray()
  const out: InventoryBreakdown = {
    soldApartments: 0,
    availableApartments: 0,
    soldParkings: 0,
    availableParkings: 0,
  }
  for (const r of rows) {
    if (r._id.type === "apartment") {
      if (r._id.status === "sold") out.soldApartments = r.count
      else out.availableApartments = r.count
    } else if (r._id.type === "parking") {
      if (r._id.status === "sold") out.soldParkings = r.count
      else out.availableParkings = r.count
    }
  }
  return out
}

export type MonthlySalesPoint = { month: string; unitsSold: number; revenue: number }

/** Units sold per month (bucketed by soldAt) + sale revenue, gap-filled. */
export async function getMonthlySales(
  scope: DashboardScope,
): Promise<MonthlySalesPoint[]> {
  const db = getDb()
  const match: Record<string, unknown> = {
    status: "sold",
    soldAt: { $gte: scope.from, $lte: endOfDay(scope.to) },
  }
  if (scope.projectId) match.projectId = scope.projectId
  const rows = await db
    .collection("units")
    .aggregate<{ _id: string; unitsSold: number; revenue: number }>([
      { $match: match },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m", date: "$soldAt", timezone: TZ } },
          unitsSold: { $sum: 1 },
          revenue: { $sum: { $ifNull: ["$soldPriceTotal", 0] } },
        },
      },
    ])
    .toArray()
  const byMonth = new Map(rows.map((r) => [r._id, r]))
  return monthRange(scope.from, scope.to).map((month) => ({
    month,
    unitsSold: byMonth.get(month)?.unitsSold ?? 0,
    revenue: byMonth.get(month)?.revenue ?? 0,
  }))
}

export type ProjectRevenuePoint = {
  projectId: string
  projectName: string
  revenue: number
}

/**
 * Net income per project within the range (combined view only — always spans
 * all projects regardless of scope.projectId). Sorted descending.
 */
export async function getRevenueByProject(range: {
  from: Date
  to: Date
}): Promise<ProjectRevenuePoint[]> {
  const db = getDb()
  const rows = await db
    .collection("transactions")
    .aggregate<{ _id: ObjectId; revenue: number }>([
      {
        $match: {
          kind: "income",
          voided: { $ne: true },
          occurredAt: { $gte: range.from, $lte: endOfDay(range.to) },
        },
      },
      { $group: { _id: "$projectId", revenue: NETTED_AMOUNT_SUM } },
      { $match: { revenue: { $gt: 0 } } },
      { $sort: { revenue: -1 } },
    ])
    .toArray()
  if (rows.length === 0) return []
  const projects = await db
    .collection("projects")
    .find({ _id: { $in: rows.map((r) => r._id) } })
    .project<{ _id: ObjectId; name: string }>({ name: 1 })
    .toArray()
  const nameById = new Map(projects.map((p) => [p._id.toHexString(), p.name]))
  return rows.map((r) => ({
    projectId: r._id.toHexString(),
    projectName: nameById.get(r._id.toHexString()) ?? "(unknown project)",
    revenue: r.revenue,
  }))
}

export type MaterialSpendPoint = { materialId: string; name: string; spend: number }

/** Top materials by net purchase spend in the range. */
export async function getTopMaterialsBySpend(
  scope: DashboardScope,
  limit = 8,
): Promise<MaterialSpendPoint[]> {
  const db = getDb()
  const match = {
    ...rangeMatch(scope, "occurredAt"),
    category: "purchase",
    voided: { $ne: true },
  }
  const rows = await db
    .collection("materialMovements")
    .aggregate<{ _id: ObjectId; spend: number }>([
      { $match: match },
      { $group: { _id: "$materialId", spend: NETTED_AMOUNT_SUM } },
      { $match: { spend: { $gt: 0 } } },
      { $sort: { spend: -1 } },
      { $limit: limit },
    ])
    .toArray()
  if (rows.length === 0) return []
  const mats = await db
    .collection("materials")
    .find({ _id: { $in: rows.map((r) => r._id) } })
    .project<{ _id: ObjectId; name: string }>({ name: 1 })
    .toArray()
  const nameById = new Map(mats.map((m) => [m._id.toHexString(), m.name]))
  return rows.map((r) => ({
    materialId: r._id.toHexString(),
    name: nameById.get(r._id.toHexString()) ?? "(unknown)",
    spend: r.spend,
  }))
}

export type MaterialFlowPoint = { month: string; purchases: number; consumption: number }

/**
 * Monthly purchase vs consumption value (₹), gap-filled. Purchases use the
 * netted movement amount. Consumption uses the movement amount when present,
 * else qty × catalog unitPrice; a material with no price contributes 0.
 */
export async function getMonthlyMaterialFlow(
  scope: DashboardScope,
): Promise<MaterialFlowPoint[]> {
  const db = getDb()
  const match = {
    ...rangeMatch(scope, "occurredAt"),
    category: { $in: ["purchase", "consumption"] },
    voided: { $ne: true },
  }
  const rows = await db
    .collection("materialMovements")
    .aggregate<{ _id: { month: string; category: string }; value: number }>([
      { $match: match },
      {
        $lookup: {
          from: "materials",
          localField: "materialId",
          foreignField: "_id",
          as: "mat",
        },
      },
      { $addFields: { unitPrice: { $ifNull: [{ $arrayElemAt: ["$mat.unitPrice", 0] }, 0] } } },
      {
        $addFields: {
          value: {
            $cond: [
              { $eq: ["$category", "purchase"] },
              {
                $cond: [
                  { $ifNull: ["$reversalOf", false] },
                  { $multiply: [{ $ifNull: ["$amount", 0] }, -1] },
                  { $ifNull: ["$amount", 0] },
                ],
              },
              { $ifNull: ["$amount", { $multiply: ["$qty", "$unitPrice"] }] },
            ],
          },
        },
      },
      { $group: { _id: { month: MONTH_EXPR, category: "$category" }, value: { $sum: "$value" } } },
    ])
    .toArray()
  const byMonth = new Map<string, { purchases: number; consumption: number }>()
  for (const r of rows) {
    let e = byMonth.get(r._id.month)
    if (!e) {
      e = { purchases: 0, consumption: 0 }
      byMonth.set(r._id.month, e)
    }
    if (r._id.category === "purchase") e.purchases = r.value
    else if (r._id.category === "consumption") e.consumption = r.value
  }
  return monthRange(scope.from, scope.to).map((month) => ({
    month,
    purchases: byMonth.get(month)?.purchases ?? 0,
    consumption: byMonth.get(month)?.consumption ?? 0,
  }))
}

export type StockValue = {
  total: number
  byMaterial: { name: string; value: number }[]
  hasUnpriced: boolean
}

/** Current stock value on hand (snapshot): Σ stockOnHand × catalog unitPrice. */
export async function getStockValue(scope: DashboardScope): Promise<StockValue> {
  const db = getDb()
  const match: Record<string, unknown> = {}
  if (scope.projectId) match.projectId = scope.projectId
  const rows = await db
    .collection("projectMaterials")
    .aggregate<{ _id: ObjectId; name: string; stock: number; unitPrice: number | null }>([
      { $match: match },
      { $group: { _id: "$materialId", stock: { $sum: "$stockOnHand" } } },
      { $lookup: { from: "materials", localField: "_id", foreignField: "_id", as: "mat" } },
      {
        $addFields: {
          name: { $ifNull: [{ $arrayElemAt: ["$mat.name", 0] }, "(unknown)"] },
          unitPrice: { $arrayElemAt: ["$mat.unitPrice", 0] },
        },
      },
      { $project: { name: 1, stock: 1, unitPrice: 1 } },
    ])
    .toArray()
  let total = 0
  let hasUnpriced = false
  const byMaterial = rows
    .map((r) => {
      const price = r.unitPrice ?? 0
      if ((r.unitPrice == null) && r.stock > 0) hasUnpriced = true
      const value = r.stock * price
      total += value
      return { name: r.name, value }
    })
    .filter((x) => x.value > 0)
    .sort((a, b) => b.value - a.value)
  return { total, byMaterial, hasUnpriced }
}
