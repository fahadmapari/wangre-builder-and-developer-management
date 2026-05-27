"use server"

import { ObjectId } from "mongodb"
import { requireAdmin, requireAuth } from "@/lib/auth/session"
import { getDb } from "@/lib/db/client"
import type { ActionResult } from "@/lib/projects/schemas"
import type {
  DrilldownDetail,
  DrilldownEntityType,
} from "./schemas"
import { DrilldownEntityTypeSchema } from "./schemas"
import type { Transaction } from "@/lib/transactions/schemas"
import type {
  Material,
  MaterialMovement,
  MaterialUnit,
} from "@/lib/materials/schemas"
import type { Unit } from "@/lib/projects/schemas"

type LinkedMovementSale = {
  materialName: string
  qty: number
  unitLabel: string
}
type LinkedMovementPurchase = {
  materialName: string
  qty: number
  projectName: string
}

function formatUnit(unit: MaterialUnit, unitOther?: string): string {
  if (unit === "other") return unitOther || "unit"
  if (unit === "m2") return "m²"
  if (unit === "m3") return "m³"
  return unit
}

function unitLabel(u: { type: Unit["type"]; number: string }): string {
  return `${u.type === "apartment" ? "Apt" : "Parking"} ${u.number}`
}

export async function fetchDrilldownDetail(
  rawEntityType: string,
  entityId: string,
): Promise<ActionResult<DrilldownDetail>> {
  const parsed = DrilldownEntityTypeSchema.safeParse(rawEntityType)
  if (!parsed.success) {
    return { ok: false, error: "Invalid entity type." }
  }
  const entityType: DrilldownEntityType = parsed.data
  if (!ObjectId.isValid(entityId)) {
    return { ok: false, error: "Invalid entity id." }
  }
  const oid = new ObjectId(entityId)
  const db = getDb()

  try {
    switch (entityType) {
      case "transaction":
      case "money_transfer": {
        await requireAdmin()
        const tx = await db
          .collection<Transaction>("transactions")
          .findOne({ _id: oid })
        if (!tx) return { ok: false, error: "Transaction not found." }

        if (entityType === "money_transfer" || tx.category === "transfer_in" || tx.category === "transfer_out") {
          const peer = await db
            .collection<Transaction>("transactions")
            .findOne({
              transferGroupId: tx.transferGroupId,
              _id: { $ne: tx._id },
              reversalOf: { $exists: false },
            })
          const reversal = await db
            .collection<Transaction>("transactions")
            .findOne({ reversalOf: tx._id })
          const sourceLeg = tx.category === "transfer_out" ? tx : (peer ?? tx)
          const destLeg = tx.category === "transfer_in" ? tx : (peer ?? tx)
          const [sourceProj, destProj] = await Promise.all([
            db.collection<{ _id: ObjectId; name: string }>("projects").findOne({ _id: sourceLeg.projectId }, { projection: { name: 1 } }),
            db.collection<{ _id: ObjectId; name: string }>("projects").findOne({ _id: destLeg.projectId }, { projection: { name: 1 } }),
          ])
          return {
            ok: true,
            data: {
              entityType: "money_transfer",
              sourceProjectName: sourceProj?.name ?? "(unknown project)",
              destProjectName: destProj?.name ?? "(unknown project)",
              amount: sourceLeg.amount,
              occurredAt: sourceLeg.occurredAt,
              transferGroupId: tx.transferGroupId?.toHexString() ?? "",
              status: reversal ? "reversed" : "active",
              reversedAt: reversal?.createdAt ?? null,
            },
          }
        }

        const isReversal = tx.reversalOf != null
        const reversedBy = await db
          .collection<Transaction>("transactions")
          .findOne({ reversalOf: tx._id }, { projection: { _id: 1 } })
        const reversedById = reversedBy?._id.toHexString() ?? null

        if (tx.category === "sale") {
          let unitLbl: string | null = null
          if (tx.unitId) {
            const unit = await db
              .collection<Unit>("units")
              .findOne({ _id: tx.unitId }, { projection: { type: 1, number: 1 } })
            if (unit) unitLbl = unitLabel(unit)
          }
          const linkedMov = await db
            .collection<MaterialMovement>("materialMovements")
            .findOne({ transactionId: tx._id, category: "purchase" })
          let linkedMovement: LinkedMovementSale | null = null
          if (linkedMov) {
            const mat = await db
              .collection<Material>("materials")
              .findOne({ _id: linkedMov.materialId })
            if (mat) {
              linkedMovement = {
                materialName: mat.name,
                qty: linkedMov.qty,
                unitLabel: formatUnit(mat.unit, mat.unitOther),
              }
            }
          }
          return {
            ok: true,
            data: {
              entityType: "transaction",
              kind: "sale",
              occurredAt: tx.occurredAt,
              amount: tx.amount,
              buyerName: tx.buyerName ?? "",
              unitLabel: unitLbl,
              description: tx.description,
              voided: tx.voided === true,
              isReversal,
              reversedById,
              linkedMovement,
            },
          }
        }
        if (tx.category === "purchase") {
          const linkedMov = await db
            .collection<MaterialMovement>("materialMovements")
            .findOne({ transactionId: tx._id, category: "purchase" })
          let linkedMovement: LinkedMovementPurchase | null = null
          if (linkedMov) {
            const [mat, proj] = await Promise.all([
              db.collection<Material>("materials").findOne({ _id: linkedMov.materialId }),
              db
                .collection<{ _id: ObjectId; name: string }>("projects")
                .findOne({ _id: linkedMov.projectId }, { projection: { name: 1 } }),
            ])
            if (mat) {
              linkedMovement = {
                materialName: mat.name,
                qty: linkedMov.qty,
                projectName: proj?.name ?? "(unknown project)",
              }
            }
          }
          return {
            ok: true,
            data: {
              entityType: "transaction",
              kind: "purchase",
              occurredAt: tx.occurredAt,
              amount: tx.amount,
              description: tx.description,
              voided: tx.voided === true,
              isReversal,
              reversedById,
              linkedMovement,
            },
          }
        }
        // adhoc
        return {
          ok: true,
          data: {
            entityType: "transaction",
            kind: "adhoc",
            occurredAt: tx.occurredAt,
            amount: tx.amount,
            txKind: tx.kind,
            description: tx.description,
            notes: tx.notes ?? null,
            voided: tx.voided === true,
            isReversal,
            reversedById,
          },
        }
      }

      case "movement":
      case "material_transfer": {
        const user = await requireAuth()
        const mov = await db
          .collection<MaterialMovement>("materialMovements")
          .findOne({ _id: oid })
        if (!mov) return { ok: false, error: "Movement not found." }
        const mat = await db
          .collection<Material>("materials")
          .findOne({ _id: mov.materialId })
        if (!mat) return { ok: false, error: "Material not found." }
        const unitLbl = formatUnit(mat.unit, mat.unitOther)

        if (entityType === "material_transfer" || mov.category === "transfer_in" || mov.category === "transfer_out") {
          if (user.role !== "admin") {
            return { ok: false, error: "Not authorized." }
          }
          const peer = await db
            .collection<MaterialMovement>("materialMovements")
            .findOne({
              transferGroupId: mov.transferGroupId,
              _id: { $ne: mov._id },
              reversalOf: { $exists: false },
            })
          const reversal = await db
            .collection<MaterialMovement>("materialMovements")
            .findOne({ reversalOf: mov._id })
          const sourceLeg = mov.category === "transfer_out" ? mov : (peer ?? mov)
          const destLeg = mov.category === "transfer_in" ? mov : (peer ?? mov)
          const [sourceProj, destProj] = await Promise.all([
            db.collection<{ _id: ObjectId; name: string }>("projects").findOne({ _id: sourceLeg.projectId }, { projection: { name: 1 } }),
            db.collection<{ _id: ObjectId; name: string }>("projects").findOne({ _id: destLeg.projectId }, { projection: { name: 1 } }),
          ])
          return {
            ok: true,
            data: {
              entityType: "material_transfer",
              sourceProjectName: sourceProj?.name ?? "(unknown project)",
              destProjectName: destProj?.name ?? "(unknown project)",
              materialName: mat.name,
              qty: sourceLeg.qty,
              unitLabel: unitLbl,
              occurredAt: sourceLeg.occurredAt,
              transferGroupId: mov.transferGroupId?.toHexString() ?? "",
              status: reversal ? "reversed" : "active",
              reversedAt: reversal?.createdAt ?? null,
            },
          }
        }

        return {
          ok: true,
          data: {
            entityType: "movement",
            occurredAt: mov.occurredAt,
            materialName: mat.name,
            qty: mov.qty,
            unitLabel: unitLbl,
            category: mov.category,
            amount: user.role === "admin" ? (mov.amount ?? null) : null,
            purpose: mov.purpose ?? null,
            notes: mov.notes ?? null,
            voided: mov.voided === true,
            peerProjectName: null,
          },
        }
      }

      case "unit": {
        const user = await requireAuth()
        const u = await db.collection<Unit>("units").findOne({ _id: oid })
        if (!u) return { ok: false, error: "Unit not found." }
        return {
          ok: true,
          data: {
            entityType: "unit",
            type: u.type,
            number: u.number,
            floor: u.floor ?? null,
            status: u.status,
            soldPriceTotal:
              user.role === "admin" ? (u.soldPriceTotal ?? null) : null,
            buyerName: u.buyerName ?? null,
            soldAt: u.soldAt ?? null,
          },
        }
      }
    }
  } catch (err) {
    console.error("fetchDrilldownDetail failed", err)
    return { ok: false, error: "Could not load detail. Please try again." }
  }
}
