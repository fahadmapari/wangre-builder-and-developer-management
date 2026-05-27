import { requireAdmin } from "@/lib/auth/session"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import { listMoneyTransfers } from "@/lib/transactions/repository"
import { listMaterialTransfers, listCatalog } from "@/lib/materials/repository"
import { listProjects } from "@/lib/projects/repository"
import { GlobalFilters } from "@/app/(authed)/financials/global-filters"
import { MoneyTransfersTable } from "./money-transfers-table"
import { MaterialTransfersTable } from "./material-transfers-table"
import { MoneyTransferButton } from "./money-transfer-dialog"
import { MaterialTransferButton } from "./material-transfer-dialog"

const TRANSFERS_PAGE_SIZE = 50

function startOfYear(): Date {
  const d = new Date()
  return new Date(d.getFullYear(), 0, 1)
}

function parseDate(raw: string | undefined, fallback: Date): Date {
  if (!raw) return fallback
  const d = new Date(raw)
  return isNaN(d.getTime()) ? fallback : d
}

function isoDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

function parsePage(raw: string | undefined): number {
  if (!raw) return 1
  const n = Number(raw)
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) return 1
  return n
}

function formatUnit(unit: string, unitOther?: string): string {
  if (unit === "other") return unitOther || "—"
  if (unit === "m2") return "m²"
  if (unit === "m3") return "m³"
  return unit
}

export default async function TransfersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  await requireAdmin()
  const sp = await searchParams
  const defaultFrom = startOfYear()
  const defaultTo = new Date()
  const range = {
    from: parseDate(sp.from, defaultFrom),
    to: parseDate(sp.to, defaultTo),
  }
  const moneyPage = parsePage(sp.moneyPage)
  const materialPage = parsePage(sp.materialPage)

  const [moneyResult, materialResult, projects, catalog] = await Promise.all([
    listMoneyTransfers(range, moneyPage, TRANSFERS_PAGE_SIZE),
    listMaterialTransfers(range, materialPage, TRANSFERS_PAGE_SIZE),
    listProjects(),
    listCatalog(),
  ])

  const projectOptions = projects.map((p) => ({
    id: p._id.toHexString(),
    name: p.name,
  }))
  const materialOptions = catalog.map((m) => ({
    id: m._id.toHexString(),
    name: m.name,
    unitLabel: formatUnit(m.unit, m.unitOther),
  }))

  return (
    <div className="flex flex-col gap-4 p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Transfers</h1>
        <p className="text-sm text-muted-foreground">
          Inter-project money and material transfers, across all projects.
        </p>
      </header>
      <GlobalFilters defaultFrom={isoDate(defaultFrom)} defaultTo={isoDate(defaultTo)} />
      <Tabs defaultValue="money" className="w-full">
        <TabsList>
          <TabsTrigger value="money">Money</TabsTrigger>
          <TabsTrigger value="material">Material</TabsTrigger>
        </TabsList>
        <TabsContent value="money" className="flex flex-col gap-3">
          <div className="flex justify-end">
            <MoneyTransferButton projects={projectOptions} />
          </div>
          <MoneyTransfersTable
            rows={moneyResult.rows}
            page={moneyPage}
            pageSize={TRANSFERS_PAGE_SIZE}
            total={moneyResult.total}
            searchParams={sp}
          />
        </TabsContent>
        <TabsContent value="material" className="flex flex-col gap-3">
          <div className="flex justify-end">
            <MaterialTransferButton
              projects={projectOptions}
              materials={materialOptions}
            />
          </div>
          <MaterialTransfersTable
            rows={materialResult.rows}
            page={materialPage}
            pageSize={TRANSFERS_PAGE_SIZE}
            total={materialResult.total}
            searchParams={sp}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
