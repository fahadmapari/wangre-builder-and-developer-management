import { ObjectId } from "mongodb"
import { requireAdmin } from "@/lib/auth/session"
import { listProjects } from "@/lib/projects/repository"
import {
  getKpiSummary,
  getMonthlyFinancials,
  getInventoryBreakdown,
  getMonthlySales,
  getRevenueByProject,
  getTopMaterialsBySpend,
  getMonthlyMaterialFlow,
  getStockValue,
  getEarliestActivityDate,
  type DashboardScope,
  type KpiSummary,
} from "@/lib/dashboard/repository"
import { startOfYear, endOfYear, isoDate, parseISODate } from "@/lib/dashboard/dates"
import { formatINR } from "@/lib/dashboard/format"
import { DashboardFilters } from "./dashboard-filters"
import { FinancialTrends } from "./financial-trends"
import { SalesInventory } from "./sales-inventory"
import { MaterialsProcurement } from "./materials-procurement"

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string; from?: string; to?: string }>
}) {
  await requireAdmin()
  const sp = await searchParams
  const projects = await listProjects()

  const projectId =
    sp.project && sp.project !== "all" && ObjectId.isValid(sp.project)
      ? new ObjectId(sp.project)
      : null

  const defaultFrom = startOfYear()
  const defaultTo = endOfYear()
  const from = parseISODate(sp.from, defaultFrom)
  const to = parseISODate(sp.to, defaultTo)
  const scope: DashboardScope = { projectId, from, to }

  const earliest = await getEarliestActivityDate(projectId)
  const allTimeFrom = isoDate(earliest ?? defaultFrom)

  const [
    kpis,
    monthly,
    inventory,
    monthlySales,
    revenueByProject,
    topMaterials,
    materialFlow,
    stockValue,
  ] = await Promise.all([
    getKpiSummary(scope),
    getMonthlyFinancials(scope),
    getInventoryBreakdown(scope),
    getMonthlySales(scope),
    projectId ? Promise.resolve([]) : getRevenueByProject({ from, to }),
    getTopMaterialsBySpend(scope),
    getMonthlyMaterialFlow(scope),
    getStockValue(scope),
  ])

  const selectedProject = projectId
    ? projects.find((p) => p._id.toHexString() === projectId.toHexString()) ?? null
    : null

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-10">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          {selectedProject
            ? `Insights for ${selectedProject.name}.`
            : "Combined insights across all projects."}
        </p>
      </header>

      <DashboardFilters
        projects={projects.map((p) => ({ id: p._id.toHexString(), name: p.name }))}
        defaultFrom={isoDate(defaultFrom)}
        defaultTo={isoDate(defaultTo)}
        allTimeFrom={allTimeFrom}
      />

      <KpiRow kpis={kpis} />

      <FinancialTrends monthly={monthly} />
      <SalesInventory
        inventory={inventory}
        monthlySales={monthlySales}
        revenueByProject={revenueByProject}
        scoped={projectId !== null}
      />
      <MaterialsProcurement
        topMaterials={topMaterials}
        monthlyFlow={materialFlow}
        stockValue={stockValue}
      />
    </div>
  )
}

function KpiRow({ kpis }: { kpis: KpiSummary }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Tile label="Revenue" value={formatINR(kpis.revenue)} />
      <Tile label="Expenses" value={formatINR(kpis.expenses)} />
      <Tile label="Net" value={formatINR(kpis.net)} negative={kpis.net < 0} />
      <Tile label="Capital deployed" value={formatINR(kpis.capital)} />
      <Tile
        label="Available funds"
        value={`${formatINR(Math.abs(kpis.availableFunds))}${
          kpis.availableFunds < 0 ? " (deficit)" : ""
        }`}
        negative={kpis.availableFunds < 0}
      />
      <Tile
        label="Units sold"
        value={`${kpis.unitsSold} / ${kpis.unitsTotal} (${kpis.sellThroughPct}%)`}
      />
      <Tile label="Materials spend" value={formatINR(kpis.materialsSpend)} />
      {kpis.jvRevenue !== null ? (
        <Tile label="JV revenue (excl. P&L)" value={formatINR(kpis.jvRevenue)} />
      ) : null}
    </div>
  )
}

function Tile({
  label,
  value,
  negative,
}: {
  label: string
  value: string
  negative?: boolean
}) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border bg-card p-3">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className={`font-mono text-xl${negative ? " text-destructive" : ""}`}>
        {value}
      </span>
    </div>
  )
}
