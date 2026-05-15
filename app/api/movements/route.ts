import { ObjectId } from "mongodb"
import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth/session"
import { listMovementsForMaterial } from "@/lib/materials/repository"

export async function GET(req: Request) {
  const user = await requireAuth()
  const { searchParams } = new URL(req.url)
  const projectId = searchParams.get("projectId") ?? ""
  const materialId = searchParams.get("materialId") ?? ""
  if (!ObjectId.isValid(projectId) || !ObjectId.isValid(materialId)) {
    return NextResponse.json({ rows: [] }, { status: 400 })
  }
  const movements = await listMovementsForMaterial(
    new ObjectId(projectId),
    new ObjectId(materialId)
  )
  // Server-side strip for floor managers: omit `amount` from the FM payload.
  // `unitPriceAtMovement` is never serialized for either role — the sheet UI
  // does not have a column for it. The historical price is recorded on the
  // movement row in Mongo for audit purposes but is not exposed via this API.
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
  return NextResponse.json({ rows })
}
