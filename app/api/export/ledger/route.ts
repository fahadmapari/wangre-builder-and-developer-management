import { NextResponse } from "next/server"
import { ObjectId } from "mongodb"
import { requireAdmin } from "@/lib/auth/session"
import { getDb } from "@/lib/db/client"
import { listLedger } from "@/lib/transactions/repository"
import { parseLedgerFilters } from "@/lib/transactions/filters"
import { toCsvFile } from "@/lib/exports/csv"
import type { Transaction } from "@/lib/transactions/schemas"

export const dynamic = "force-dynamic"

const LEDGER_CSV_HEADERS = [
  "_id",
  "projectId",
  "projectName",
  "occurredAt",
  "kind",
  "category",
  "amount",
  "description",
  "buyerName",
  "notes",
  "voided",
  "reversalOf",
  "transferGroupId",
  "createdAt",
  "createdBy",
] as const

function isoDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

function projectSlug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "project"
  )
}

function rowToCsv(t: Transaction, projectName: string) {
  return [
    t._id.toHexString(),
    t.projectId.toHexString(),
    projectName,
    isoDate(t.occurredAt),
    t.kind,
    t.category,
    t.amount,
    t.description,
    t.buyerName ?? "",
    t.notes ?? "",
    t.voided === true,
    t.reversalOf ? t.reversalOf.toHexString() : "",
    t.transferGroupId ? t.transferGroupId.toHexString() : "",
    t.createdAt.toISOString(),
    t.createdBy.toHexString(),
  ]
}

export async function GET(req: Request) {
  await requireAdmin()

  const url = new URL(req.url)
  const projectIdParam = url.searchParams.get("projectId") ?? ""
  if (!ObjectId.isValid(projectIdParam)) {
    return NextResponse.json({ error: "invalid projectId" }, { status: 400 })
  }
  const projectId = new ObjectId(projectIdParam)

  const filters = parseLedgerFilters(url.searchParams)

  const db = getDb()
  const project = await db
    .collection<{ _id: ObjectId; name: string }>("projects")
    .findOne({ _id: projectId }, { projection: { name: 1 } })

  if (!project) {
    return NextResponse.json({ error: "project not found" }, { status: 404 })
  }

  const rows = await listLedger(projectId, filters)

  const csv = toCsvFile(
    [...LEDGER_CSV_HEADERS],
    rows.map((r) => rowToCsv(r, project.name)),
  )

  const filename = `ledger-${projectSlug(project.name)}-${isoDate(filters.from)}-${isoDate(filters.to)}.csv`

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  })
}
