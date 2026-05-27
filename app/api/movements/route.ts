import { ObjectId } from "mongodb"
import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth/session"
import { listMovements } from "@/lib/materials/repository"

const DEFAULT_PAGE_SIZE = 50

function parsePage(raw: string | null): number {
  if (!raw) return 1
  const n = Number(raw)
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) return 1
  return n
}

function parsePageSize(raw: string | null): number {
  if (!raw) return DEFAULT_PAGE_SIZE
  const n = Number(raw)
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) return DEFAULT_PAGE_SIZE
  return Math.min(200, n)
}

export async function GET(req: Request) {
  const user = await requireAuth()
  const { searchParams } = new URL(req.url)
  const projectId = searchParams.get("projectId") ?? ""
  const materialId = searchParams.get("materialId") ?? ""
  if (!ObjectId.isValid(projectId) || !ObjectId.isValid(materialId)) {
    return NextResponse.json({ rows: [], total: 0 }, { status: 400 })
  }
  const page = parsePage(searchParams.get("page"))
  const pageSize = parsePageSize(searchParams.get("pageSize"))
  const { rows: movements, total } = await listMovements(
    new ObjectId(projectId),
    new ObjectId(materialId),
    page,
    pageSize,
  )
  const stripMoney = user.role !== "admin"
  const rows = movements.map((m) => ({
    _id: String(m._id),
    kind: m.kind,
    category: m.category,
    qty: m.qty,
    amount: stripMoney ? undefined : m.amount,
    purpose: m.purpose,
    notes: m.notes,
    occurredAt: m.occurredAt.toISOString(),
    voided: m.voided === true ? true : undefined,
  }))
  return NextResponse.json({ rows, total })
}
